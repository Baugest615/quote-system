-- =============================================================
-- Fix: update_remittance_settings RPC
-- 1. 新增 quotation_item_id JOIN（新流程項目匯費同步）
-- 2. 修正個人報帳命名：移除 '（個人報帳）' 後綴（前端已移除）
-- =============================================================

CREATE OR REPLACE FUNCTION "public"."update_remittance_settings"("p_confirmation_id" "uuid", "p_settings" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_result jsonb;
  v_key text;
  v_group_settings jsonb;
  v_has_fee boolean;
  v_fee_amount integer;
  v_target_expense_id uuid;
BEGIN
  -- ====== 儲存設定 ======
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
      OR (pci.quotation_item_id IS NOT NULL AND ae.quotation_item_id = pci.quotation_item_id)
    );

  -- ====== 刪除舊的獨立匯費記錄（若有） ======
  DELETE FROM accounting_expenses
  WHERE payment_confirmation_id = p_confirmation_id;

  -- ====== 分配匯費到各群組的第一筆記錄 ======
  FOR v_key, v_group_settings IN SELECT * FROM jsonb_each(p_settings)
  LOOP
    v_has_fee := COALESCE((v_group_settings->>'hasRemittanceFee')::boolean, false);
    v_fee_amount := COALESCE((v_group_settings->>'remittanceFeeAmount')::integer, 30);

    IF v_has_fee AND v_fee_amount > 0 THEN
      SELECT ae.id INTO v_target_expense_id
      FROM payment_confirmation_items pci
      LEFT JOIN payment_requests pr ON pci.payment_request_id = pr.id
      LEFT JOIN quotation_items qi ON pr.quotation_item_id = qi.id
      LEFT JOIN kols k ON qi.kol_id = k.id
      LEFT JOIN expense_claims ec ON pci.expense_claim_id = ec.id
      -- 新增：直接 quotation_item 的 JOIN（新流程項目）
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
            -- 個人報帳：區分外部廠商 vs 提交人本人
            WHEN pci.source_type = 'personal' OR pci.expense_claim_id IS NOT NULL THEN
              CASE
                -- 外部廠商：vendor_name 與提交人不同 → 直接用 vendor_name
                WHEN ec.vendor_name IS NOT NULL
                  AND ec.vendor_name != COALESCE(
                    (SELECT name FROM employees WHERE user_id = ec.submitted_by LIMIT 1),
                    ''
                  )
                THEN ec.vendor_name
                -- 提交人本人：提交人姓名（不加後綴，與前端一致）
                ELSE
                  COALESCE(
                    (SELECT name FROM employees WHERE user_id = ec.submitted_by LIMIT 1),
                    ec.vendor_name,
                    '個人報帳'
                  )
              END
            -- 報價單直接請款（新流程，quotation_item_id 直連）
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
            -- 專案請款（舊流程，透過 payment_request → quotation_item）
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

COMMENT ON FUNCTION "public"."update_remittance_settings"("p_confirmation_id" "uuid", "p_settings" "jsonb") IS '更新匯款設定並將匯費分配到對應的進項記錄（支援新流程 quotation_item_id + 外部廠商獨立分組）';
