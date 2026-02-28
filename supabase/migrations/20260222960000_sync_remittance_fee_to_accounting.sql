-- =====================================================
-- 修復：匯費自付未同步到進項管理
-- 原因：remittance_settings 中的匯費設定只存在 JSONB，
--       從未寫入 accounting_expenses，導致進項管理看不到匯費支出
--
-- 修復內容：
-- 1. accounting_expenses 新增 payment_confirmation_id 欄位
-- 2. 建立 UNIQUE partial index（用於 upsert）
-- 3. 更新 update_remittance_settings RPC：自動同步匯費到 accounting_expenses
-- 4. 回填既有確認清單的匯費記錄
-- =====================================================

-- ============================================================
-- 1. 新增欄位：讓 accounting_expenses 可關聯到確認清單
-- ============================================================

ALTER TABLE accounting_expenses
  ADD COLUMN IF NOT EXISTS payment_confirmation_id uuid REFERENCES payment_confirmations(id);

COMMENT ON COLUMN accounting_expenses.payment_confirmation_id IS
  '關聯的確認清單 ID — 用於匯費自動同步記錄';

-- ============================================================
-- 2. UNIQUE partial index — 每個確認清單只能有一筆匯費記錄
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_expenses_confirmation_fee
  ON accounting_expenses (payment_confirmation_id)
  WHERE payment_confirmation_id IS NOT NULL;

-- ============================================================
-- 3. 更新 update_remittance_settings RPC
--    新增邏輯：計算該確認清單所有群組的匯費總額，
--    upsert 一筆 accounting_expenses（expense_type=營運費用, accounting_subject=銀行手續費）
-- ============================================================

DROP FUNCTION IF EXISTS update_remittance_settings(uuid, jsonb);

CREATE OR REPLACE FUNCTION update_remittance_settings(
  p_confirmation_id uuid,
  p_settings jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_total_fee integer := 0;
  v_key text;
  v_group_settings jsonb;
  v_confirmation_date date;
  v_year integer;
  v_expense_month text;
BEGIN
  -- ====== 儲存設定（原有邏輯） ======
  UPDATE payment_confirmations
  SET
    remittance_settings = p_settings,
    updated_at = NOW()
  WHERE id = p_confirmation_id
  RETURNING remittance_settings INTO v_result;

  -- ====== 計算匯費總額 ======
  FOR v_key, v_group_settings IN SELECT * FROM jsonb_each(p_settings)
  LOOP
    IF (v_group_settings->>'hasRemittanceFee')::boolean = true THEN
      v_total_fee := v_total_fee + COALESCE((v_group_settings->>'remittanceFeeAmount')::integer, 30);
    END IF;
  END LOOP;

  -- ====== 同步到 accounting_expenses ======
  -- 取得確認清單日期（用於年份/月份）
  SELECT confirmation_date INTO v_confirmation_date
  FROM payment_confirmations
  WHERE id = p_confirmation_id;

  v_year := EXTRACT(YEAR FROM v_confirmation_date);
  v_expense_month := EXTRACT(YEAR FROM v_confirmation_date) || '年' ||
                     EXTRACT(MONTH FROM v_confirmation_date) || '月';

  IF v_total_fee > 0 THEN
    -- Upsert：有匯費 → 新增或更新
    INSERT INTO accounting_expenses (
      year,
      expense_month,
      expense_type,
      accounting_subject,
      amount,
      tax_amount,
      total_amount,
      vendor_name,
      payment_confirmation_id,
      note,
      created_by
    ) VALUES (
      v_year,
      v_expense_month,
      '營運費用',
      '銀行手續費',
      v_total_fee,
      0,
      v_total_fee,
      '銀行匯款手續費',
      p_confirmation_id,
      '確認清單匯費自動同步（' || v_confirmation_date::text || '）',
      (SELECT auth.uid())
    )
    ON CONFLICT (payment_confirmation_id)
      WHERE payment_confirmation_id IS NOT NULL
    DO UPDATE SET
      amount = EXCLUDED.amount,
      total_amount = EXCLUDED.total_amount,
      expense_month = EXCLUDED.expense_month,
      note = EXCLUDED.note,
      updated_at = NOW();
  ELSE
    -- 匯費為 0 → 刪除既有記錄
    DELETE FROM accounting_expenses
    WHERE payment_confirmation_id = p_confirmation_id;
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION update_remittance_settings IS
  'Update remittance settings for a confirmation record and sync fee to accounting_expenses';

-- ============================================================
-- 4. 回填：為既有確認清單補建匯費 accounting_expenses
-- ============================================================

INSERT INTO accounting_expenses (
  year,
  expense_month,
  expense_type,
  accounting_subject,
  amount,
  tax_amount,
  total_amount,
  vendor_name,
  payment_confirmation_id,
  note,
  created_by
)
SELECT
  EXTRACT(YEAR FROM pc.confirmation_date)::integer,
  EXTRACT(YEAR FROM pc.confirmation_date) || '年' || EXTRACT(MONTH FROM pc.confirmation_date) || '月',
  '營運費用',
  '銀行手續費',
  fee_totals.total_fee,
  0,
  fee_totals.total_fee,
  '銀行匯款手續費',
  pc.id,
  '回填匯費記錄（' || pc.confirmation_date::text || '）',
  pc.created_by
FROM payment_confirmations pc
INNER JOIN (
  -- 計算每個確認清單的匯費總額
  SELECT
    pc2.id AS confirmation_id,
    SUM(
      CASE WHEN (gs.value->>'hasRemittanceFee')::boolean = true
        THEN COALESCE((gs.value->>'remittanceFeeAmount')::integer, 30)
        ELSE 0
      END
    ) AS total_fee
  FROM payment_confirmations pc2,
    jsonb_each(COALESCE(pc2.remittance_settings, '{}'::jsonb)) AS gs
  GROUP BY pc2.id
  HAVING SUM(
    CASE WHEN (gs.value->>'hasRemittanceFee')::boolean = true
      THEN COALESCE((gs.value->>'remittanceFeeAmount')::integer, 30)
      ELSE 0
    END
  ) > 0
) fee_totals ON fee_totals.confirmation_id = pc.id
WHERE NOT EXISTS (
  SELECT 1 FROM accounting_expenses ae
  WHERE ae.payment_confirmation_id = pc.id
);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
