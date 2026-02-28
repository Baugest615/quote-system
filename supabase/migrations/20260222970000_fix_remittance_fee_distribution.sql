-- =====================================================
-- 修復：匯費應分配到對應勞務報酬記錄，而非獨立記錄
--
-- 問題：
--   原方案將匯費建立為獨立的「營運費用/銀行手續費」記錄，
--   導致進項管理中重複計算（勞務報酬 NT$20,000 + 匯費 NT$30 = NT$20,030）
--   但公司實際支出只有 NT$20,000（匯費從 KOL 款項中扣除）
--
-- 修復：
--   1. 新增 remittance_fee 欄位到 accounting_expenses
--   2. 改寫 update_remittance_settings RPC：
--      - 將匯費分配到對應群組的第一筆勞務記錄
--      - total_amount = amount + tax_amount - remittance_fee
--      - 不再建立獨立的匯費記錄
--   3. 回填既有資料
-- =====================================================

-- ============================================================
-- 1. 新增 remittance_fee 欄位
-- ============================================================

ALTER TABLE accounting_expenses
  ADD COLUMN IF NOT EXISTS remittance_fee numeric(15,2) DEFAULT 0;

COMMENT ON COLUMN accounting_expenses.remittance_fee IS
  '分配到此筆記錄的匯費金額（從 KOL 實付金額中扣除）';

-- ============================================================
-- 2. 改寫 update_remittance_settings RPC
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
  v_key text;
  v_group_settings jsonb;
  v_has_fee boolean;
  v_fee_amount integer;
  v_target_expense_id uuid;
BEGIN
  -- ====== 儲存設定（原有邏輯） ======
  UPDATE payment_confirmations
  SET
    remittance_settings = p_settings,
    updated_at = NOW()
  WHERE id = p_confirmation_id
  RETURNING remittance_settings INTO v_result;

  -- ====== 重置此確認清單所有項目的匯費 ======
  UPDATE accounting_expenses ae
  SET
    remittance_fee = 0,
    total_amount = ae.amount + ae.tax_amount,
    updated_at = NOW()
  FROM payment_confirmation_items pci
  WHERE pci.payment_confirmation_id = p_confirmation_id
    AND ae.remittance_fee > 0
    AND (
      (pci.payment_request_id IS NOT NULL AND ae.payment_request_id = pci.payment_request_id)
      OR (pci.expense_claim_id IS NOT NULL AND ae.expense_claim_id = pci.expense_claim_id)
    );

  -- ====== 刪除舊的獨立匯費記錄（若有） ======
  DELETE FROM accounting_expenses
  WHERE payment_confirmation_id = p_confirmation_id;

  -- ====== 分配匯費到各群組的第一筆勞務記錄 ======
  FOR v_key, v_group_settings IN SELECT * FROM jsonb_each(p_settings)
  LOOP
    v_has_fee := COALESCE((v_group_settings->>'hasRemittanceFee')::boolean, false);
    v_fee_amount := COALESCE((v_group_settings->>'remittanceFeeAmount')::integer, 30);

    IF v_has_fee AND v_fee_amount > 0 THEN
      -- 找到此匯款群組中的第一筆 accounting_expense
      -- 匯款群組名稱邏輯需與前端 groupItemsByRemittance() 一致
      SELECT ae.id INTO v_target_expense_id
      FROM payment_confirmation_items pci
      LEFT JOIN payment_requests pr ON pci.payment_request_id = pr.id
      LEFT JOIN quotation_items qi ON pr.quotation_item_id = qi.id
      LEFT JOIN kols k ON qi.kol_id = k.id
      LEFT JOIN expense_claims ec ON pci.expense_claim_id = ec.id
      JOIN accounting_expenses ae ON (
        (pci.payment_request_id IS NOT NULL AND ae.payment_request_id = pci.payment_request_id)
        OR (pci.expense_claim_id IS NOT NULL AND ae.expense_claim_id = pci.expense_claim_id)
      )
      WHERE pci.payment_confirmation_id = p_confirmation_id
        AND (
          CASE
            -- 個人報帳：提交人姓名 + '（個人報帳）'
            WHEN pci.source_type = 'personal' OR pci.expense_claim_id IS NOT NULL THEN
              COALESCE(
                (SELECT name FROM employees WHERE user_id = ec.submitted_by LIMIT 1),
                ec.vendor_name,
                '個人報帳'
              ) || '（個人報帳）'
            -- 專案請款：匯款戶名 fallback 鏈
            ELSE
              COALESCE(
                NULLIF(NULLIF(NULLIF(TRIM(COALESCE(qi.remittance_name, '')), ''), '未知匯款戶名'), 'Unknown Remittance Name'),
                CASE
                  WHEN (k.bank_info->>'bankType') = 'company'
                  THEN COALESCE(k.bank_info->>'companyAccountName', k.name)
                  ELSE COALESCE(k.bank_info->>'personalAccountName', k.real_name, k.name)
                END,
                '未知匯款戶名'
              )
          END
        ) = v_key
      ORDER BY ae.created_at
      LIMIT 1;

      IF v_target_expense_id IS NOT NULL THEN
        UPDATE accounting_expenses
        SET
          remittance_fee = v_fee_amount,
          total_amount = amount + tax_amount - v_fee_amount,
          updated_at = NOW()
        WHERE id = v_target_expense_id;
      END IF;
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION update_remittance_settings IS
  '更新匯款設定並將匯費分配到對應的勞務報酬記錄';

-- ============================================================
-- 3. 回填：將既有的獨立匯費記錄分配到對應勞務記錄
-- ============================================================

DO $$
DECLARE
  v_fee_record RECORD;
  v_key text;
  v_group_settings jsonb;
  v_has_fee boolean;
  v_fee_amount integer;
  v_target_expense_id uuid;
  v_remittance_settings jsonb;
BEGIN
  FOR v_fee_record IN
    SELECT ae.id, ae.payment_confirmation_id, ae.amount AS fee_amount
    FROM accounting_expenses ae
    WHERE ae.payment_confirmation_id IS NOT NULL
      AND ae.expense_type = '營運費用'
      AND ae.accounting_subject = '銀行手續費'
  LOOP
    -- 取得確認清單的匯款設定
    SELECT remittance_settings INTO v_remittance_settings
    FROM payment_confirmations WHERE id = v_fee_record.payment_confirmation_id;

    IF v_remittance_settings IS NOT NULL AND v_remittance_settings != '{}'::jsonb THEN
      FOR v_key, v_group_settings IN
        SELECT * FROM jsonb_each(v_remittance_settings)
      LOOP
        v_has_fee := COALESCE((v_group_settings->>'hasRemittanceFee')::boolean, false);
        v_fee_amount := COALESCE((v_group_settings->>'remittanceFeeAmount')::integer, 30);

        IF v_has_fee AND v_fee_amount > 0 THEN
          -- 找到匹配的第一筆勞務記錄
          SELECT ae.id INTO v_target_expense_id
          FROM payment_confirmation_items pci
          LEFT JOIN payment_requests pr ON pci.payment_request_id = pr.id
          LEFT JOIN quotation_items qi ON pr.quotation_item_id = qi.id
          LEFT JOIN kols k ON qi.kol_id = k.id
          LEFT JOIN expense_claims ec ON pci.expense_claim_id = ec.id
          JOIN accounting_expenses ae ON (
            (pci.payment_request_id IS NOT NULL AND ae.payment_request_id = pci.payment_request_id)
            OR (pci.expense_claim_id IS NOT NULL AND ae.expense_claim_id = pci.expense_claim_id)
          )
          WHERE pci.payment_confirmation_id = v_fee_record.payment_confirmation_id
            AND ae.remittance_fee = 0
            AND (
              CASE
                WHEN pci.source_type = 'personal' OR pci.expense_claim_id IS NOT NULL THEN
                  COALESCE(
                    (SELECT name FROM employees WHERE user_id = ec.submitted_by LIMIT 1),
                    ec.vendor_name,
                    '個人報帳'
                  ) || '（個人報帳）'
                ELSE
                  COALESCE(
                    NULLIF(NULLIF(NULLIF(TRIM(COALESCE(qi.remittance_name, '')), ''), '未知匯款戶名'), 'Unknown Remittance Name'),
                    CASE
                      WHEN (k.bank_info->>'bankType') = 'company'
                      THEN COALESCE(k.bank_info->>'companyAccountName', k.name)
                      ELSE COALESCE(k.bank_info->>'personalAccountName', k.real_name, k.name)
                    END,
                    '未知匯款戶名'
                  )
              END
            ) = v_key
          ORDER BY ae.created_at
          LIMIT 1;

          IF v_target_expense_id IS NOT NULL THEN
            UPDATE accounting_expenses
            SET
              remittance_fee = v_fee_amount,
              total_amount = amount + tax_amount - v_fee_amount,
              updated_at = NOW()
            WHERE id = v_target_expense_id;
          END IF;
        END IF;
      END LOOP;
    END IF;

    -- 刪除舊的獨立匯費記錄
    DELETE FROM accounting_expenses WHERE id = v_fee_record.id;
  END LOOP;
END;
$$;

-- ============================================================
-- 4. 清理：移除不再需要的 UNIQUE partial index
--    （原用於 payment_confirmation_id 的 upsert）
-- ============================================================

DROP INDEX IF EXISTS idx_accounting_expenses_confirmation_fee;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
