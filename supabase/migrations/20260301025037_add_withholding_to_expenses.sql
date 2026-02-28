-- =============================================================
-- 進項管理加入代扣代繳欄位 + RPC 同步
-- 1. accounting_expenses 加 withholding_tax / withholding_nhi
-- 2. update_remittance_settings RPC 增加代扣分配邏輯
-- =============================================================

-- ====== 1. 加入欄位 ======
ALTER TABLE "public"."accounting_expenses"
  ADD COLUMN IF NOT EXISTS "withholding_tax" numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "withholding_nhi" numeric(15,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN "public"."accounting_expenses"."withholding_tax" IS '代扣所得稅（由匯款設定自動分配）';
COMMENT ON COLUMN "public"."accounting_expenses"."withholding_nhi" IS '代扣二代健保（由匯款設定自動分配）';

-- ====== 2. 更新 RPC：增加代扣分配 ======
CREATE OR REPLACE FUNCTION "public"."update_remittance_settings"("p_confirmation_id" "uuid", "p_settings" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_result jsonb;
  v_key text;
  v_group_settings jsonb;
  v_has_fee boolean;
  v_fee_amount integer;
  v_has_tax boolean;
  v_has_insurance boolean;
  v_tax_rate numeric;
  v_nhi_rate numeric;
  v_target_expense_id uuid;
  v_group_subtotal numeric;
  v_actual_fee integer;
  v_actual_tax integer;
  v_actual_nhi integer;
BEGIN
  -- ====== 讀取代扣費率 ======
  SELECT
    COALESCE(ws.income_tax_rate, 0.10),
    COALESCE(ws.nhi_supplement_rate, 0.0211)
  INTO v_tax_rate, v_nhi_rate
  FROM withholding_settings ws
  WHERE ws.effective_date <= CURRENT_DATE
    AND (ws.expiry_date IS NULL OR ws.expiry_date >= CURRENT_DATE)
  ORDER BY ws.effective_date DESC
  LIMIT 1;

  -- Fallback 預設值
  IF v_tax_rate IS NULL THEN
    v_tax_rate := 0.10;
    v_nhi_rate := 0.0211;
  END IF;

  -- ====== 儲存設定 ======
  UPDATE payment_confirmations
  SET
    remittance_settings = p_settings,
    updated_at = NOW()
  WHERE id = p_confirmation_id
  RETURNING remittance_settings INTO v_result;

  -- ====== 重置此確認清單所有項目的匯費與代扣 ======
  UPDATE accounting_expenses ae
  SET
    remittance_fee = 0,
    withholding_tax = 0,
    withholding_nhi = 0,
    total_amount = ae.amount + ae.tax_amount,
    updated_at = NOW()
  FROM payment_confirmation_items pci
  WHERE pci.payment_confirmation_id = p_confirmation_id
    AND (ae.remittance_fee > 0 OR ae.withholding_tax > 0 OR ae.withholding_nhi > 0)
    AND (
      (pci.payment_request_id IS NOT NULL AND ae.payment_request_id = pci.payment_request_id)
      OR (pci.expense_claim_id IS NOT NULL AND ae.expense_claim_id = pci.expense_claim_id)
      OR (pci.quotation_item_id IS NOT NULL AND ae.quotation_item_id = pci.quotation_item_id)
    );

  -- ====== 刪除舊的獨立匯費記錄（若有） ======
  DELETE FROM accounting_expenses
  WHERE payment_confirmation_id = p_confirmation_id;

  -- ====== 分配匯費與代扣到各群組的第一筆記錄 ======
  FOR v_key, v_group_settings IN SELECT * FROM jsonb_each(p_settings)
  LOOP
    v_has_fee := COALESCE((v_group_settings->>'hasRemittanceFee')::boolean, false);
    v_fee_amount := COALESCE((v_group_settings->>'remittanceFeeAmount')::integer, 30);
    v_has_tax := COALESCE((v_group_settings->>'hasTax')::boolean, false);
    v_has_insurance := COALESCE((v_group_settings->>'hasInsurance')::boolean, false);

    -- 計算實際匯費
    v_actual_fee := CASE WHEN v_has_fee AND v_fee_amount > 0 THEN v_fee_amount ELSE 0 END;

    -- 跳過無任何扣除的群組
    IF v_actual_fee = 0 AND NOT v_has_tax AND NOT v_has_insurance THEN
      CONTINUE;
    END IF;

    -- 找到第一筆 expense 和群組小計（window function 在 LIMIT 前計算）
    SELECT ae.id, SUM(ae.amount) OVER () AS subtotal
    INTO v_target_expense_id, v_group_subtotal
    FROM payment_confirmation_items pci
    LEFT JOIN payment_requests pr ON pci.payment_request_id = pr.id
    LEFT JOIN quotation_items qi ON pr.quotation_item_id = qi.id
    LEFT JOIN kols k ON qi.kol_id = k.id
    LEFT JOIN expense_claims ec ON pci.expense_claim_id = ec.id
    LEFT JOIN quotation_items qi_direct ON pci.quotation_item_id = qi_direct.id
    LEFT JOIN kols k_direct ON qi_direct.kol_id = k_direct.id
    JOIN accounting_expenses ae ON (
      (pci.payment_request_id IS NOT NULL AND ae.payment_request_id = pci.payment_request_id)
      OR (pci.expense_claim_id IS NOT NULL AND ae.expense_claim_id = pci.expense_claim_id)
      OR (pci.quotation_item_id IS NOT NULL AND ae.quotation_item_id = pci.quotation_item_id)
    )
    WHERE pci.payment_confirmation_id = p_confirmation_id
      AND (
        CASE
          -- 個人報帳
          WHEN pci.source_type = 'personal' OR pci.expense_claim_id IS NOT NULL THEN
            CASE
              WHEN ec.vendor_name IS NOT NULL
                AND ec.vendor_name != COALESCE(
                  (SELECT name FROM employees WHERE user_id = ec.submitted_by LIMIT 1),
                  ''
                )
              THEN ec.vendor_name
              ELSE
                COALESCE(
                  (SELECT name FROM employees WHERE user_id = ec.submitted_by LIMIT 1),
                  ec.vendor_name,
                  '個人報帳'
                )
            END
          -- 報價單直接請款（新流程）
          WHEN pci.source_type = 'quotation' OR (pci.quotation_item_id IS NOT NULL AND pci.payment_request_id IS NULL) THEN
            COALESCE(
              NULLIF(NULLIF(NULLIF(TRIM(COALESCE(qi_direct.remittance_name, '')), ''), '未知匯款戶名'), 'Unknown Remittance Name'),
              CASE
                WHEN (k_direct.bank_info->>'bankType') = 'company'
                THEN COALESCE(k_direct.bank_info->>'companyAccountName', k_direct.name)
                ELSE COALESCE(k_direct.bank_info->>'personalAccountName', k_direct.real_name, k_direct.name)
              END,
              '未知匯款戶名'
            )
          -- 專案請款（舊流程）
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
      -- 計算代扣金額（基於此確認清單內該群組的小計）
      v_actual_tax := CASE WHEN v_has_tax THEN FLOOR(COALESCE(v_group_subtotal, 0) * v_tax_rate) ELSE 0 END;
      v_actual_nhi := CASE WHEN v_has_insurance THEN FLOOR(COALESCE(v_group_subtotal, 0) * v_nhi_rate) ELSE 0 END;

      UPDATE accounting_expenses
      SET
        remittance_fee = v_actual_fee,
        withholding_tax = v_actual_tax,
        withholding_nhi = v_actual_nhi,
        total_amount = amount + tax_amount - v_actual_fee - v_actual_tax - v_actual_nhi,
        updated_at = NOW()
      WHERE id = v_target_expense_id;
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION "public"."update_remittance_settings"("p_confirmation_id" "uuid", "p_settings" "jsonb") IS '更新匯款設定並將匯費與代扣分配到對應的進項記錄';
