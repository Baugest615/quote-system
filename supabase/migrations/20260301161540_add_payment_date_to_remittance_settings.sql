-- 擴充 update_remittance_settings RPC：
-- 1. 修正 DELETE 條件 — 只刪獨立匯費記錄，不刪核准流程產生的進項紀錄
-- 2. 補齊 quotation_item_id 匹配路徑（原版只有 payment_request_id + expense_claim_id）
-- 3. 新增 paymentDate 批次設定匯款日期 → trigger 自動同步 payment_status

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
  v_payment_date date;
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
  -- 只刪「無源頭 FK」的記錄，保護核准流程產生的進項紀錄
  DELETE FROM accounting_expenses
  WHERE payment_confirmation_id = p_confirmation_id
    AND expense_claim_id IS NULL
    AND payment_request_id IS NULL
    AND quotation_item_id IS NULL;

  -- ====== 分配匯費 + 匯款日期到各群組 ======
  FOR v_key, v_group_settings IN SELECT * FROM jsonb_each(p_settings)
  LOOP
    v_has_fee := COALESCE((v_group_settings->>'hasRemittanceFee')::boolean, false);
    v_fee_amount := COALESCE((v_group_settings->>'remittanceFeeAmount')::integer, 30);

    -- ====== 匯費分配（僅第一筆） ======
    IF v_has_fee AND v_fee_amount > 0 THEN
      SELECT ae.id INTO v_target_expense_id
      FROM payment_confirmation_items pci
      LEFT JOIN payment_requests pr ON pci.payment_request_id = pr.id
      LEFT JOIN quotation_items qi ON COALESCE(pr.quotation_item_id, pci.quotation_item_id) = qi.id
      LEFT JOIN kols k ON qi.kol_id = k.id
      LEFT JOIN expense_claims ec ON pci.expense_claim_id = ec.id
      JOIN accounting_expenses ae ON (
        (pci.payment_request_id IS NOT NULL AND ae.payment_request_id = pci.payment_request_id)
        OR (pci.expense_claim_id IS NOT NULL AND ae.expense_claim_id = pci.expense_claim_id)
        OR (pci.quotation_item_id IS NOT NULL AND ae.quotation_item_id = pci.quotation_item_id)
      )
      WHERE pci.payment_confirmation_id = p_confirmation_id
        AND (
          CASE
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

    -- ====== 批次設定匯款日期（所有匹配的 expenses） ======
    IF v_group_settings ? 'paymentDate' THEN
      v_payment_date := NULLIF(v_group_settings->>'paymentDate', '')::date;

      UPDATE accounting_expenses ae
      SET payment_date = v_payment_date
      FROM payment_confirmation_items pci
      LEFT JOIN payment_requests pr ON pci.payment_request_id = pr.id
      LEFT JOIN quotation_items qi ON COALESCE(pr.quotation_item_id, pci.quotation_item_id) = qi.id
      LEFT JOIN kols k ON qi.kol_id = k.id
      LEFT JOIN expense_claims ec ON pci.expense_claim_id = ec.id
      WHERE pci.payment_confirmation_id = p_confirmation_id
        AND (
          (pci.payment_request_id IS NOT NULL AND ae.payment_request_id = pci.payment_request_id)
          OR (pci.expense_claim_id IS NOT NULL AND ae.expense_claim_id = pci.expense_claim_id)
          OR (pci.quotation_item_id IS NOT NULL AND ae.quotation_item_id = pci.quotation_item_id)
        )
        AND (
          CASE
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
        ) = v_key;
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION "public"."update_remittance_settings"("p_confirmation_id" "uuid", "p_settings" "jsonb")
  IS '更新匯款設定：匯費分配 + 批次匯款日期（含 quotation_item_id 路徑，保護核准記錄不被 DELETE）';
