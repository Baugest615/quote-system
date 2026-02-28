-- =====================================================
-- 回滾：移除安全加固的 RLS 政策與角色驗證
-- 對應：20260215000001 + 20260215000002
-- 用法：需要回滾時手動執行此檔案（不要放進自動 migration 流程）
-- 注意：此操作不會影響任何資料，僅移除存取控制規則
-- =====================================================

-- =====================================================
-- 1. 移除 kol_types RLS
-- =====================================================
DROP POLICY IF EXISTS "authenticated users can read kol_types" ON kol_types;
DROP POLICY IF EXISTS "admin or editor can insert kol_types" ON kol_types;
DROP POLICY IF EXISTS "admin or editor can update kol_types" ON kol_types;
DROP POLICY IF EXISTS "admin or editor can delete kol_types" ON kol_types;
ALTER TABLE kol_types DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- 2. 移除 service_types RLS
-- =====================================================
DROP POLICY IF EXISTS "authenticated users can read service_types" ON service_types;
DROP POLICY IF EXISTS "admin or editor can insert service_types" ON service_types;
DROP POLICY IF EXISTS "admin or editor can update service_types" ON service_types;
DROP POLICY IF EXISTS "admin or editor can delete service_types" ON service_types;
ALTER TABLE service_types DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- 3. 移除 quote_categories RLS
-- =====================================================
DROP POLICY IF EXISTS "authenticated users can read quote_categories" ON quote_categories;
DROP POLICY IF EXISTS "admin or editor can insert quote_categories" ON quote_categories;
DROP POLICY IF EXISTS "admin or editor can update quote_categories" ON quote_categories;
DROP POLICY IF EXISTS "admin or editor can delete quote_categories" ON quote_categories;
ALTER TABLE quote_categories DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. 移除 kol_services RLS
-- =====================================================
DROP POLICY IF EXISTS "authenticated users can read kol_services" ON kol_services;
DROP POLICY IF EXISTS "admin or editor can insert kol_services" ON kol_services;
DROP POLICY IF EXISTS "admin or editor can update kol_services" ON kol_services;
DROP POLICY IF EXISTS "admin or editor can delete kol_services" ON kol_services;
ALTER TABLE kol_services DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- 5. 移除 payment_confirmation_items RLS
-- =====================================================
DROP POLICY IF EXISTS "authenticated users can read payment_confirmation_items" ON payment_confirmation_items;
DROP POLICY IF EXISTS "admin can insert payment_confirmation_items" ON payment_confirmation_items;
DROP POLICY IF EXISTS "admin can update payment_confirmation_items" ON payment_confirmation_items;
DROP POLICY IF EXISTS "admin can delete payment_confirmation_items" ON payment_confirmation_items;
ALTER TABLE payment_confirmation_items DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- 6. 移除 page_permissions RLS
-- =====================================================
DROP POLICY IF EXISTS "authenticated users can read page_permissions" ON page_permissions;
DROP POLICY IF EXISTS "admin can insert page_permissions" ON page_permissions;
DROP POLICY IF EXISTS "admin can update page_permissions" ON page_permissions;
DROP POLICY IF EXISTS "admin can delete page_permissions" ON page_permissions;
ALTER TABLE page_permissions DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- 7. 移除輔助函數
-- =====================================================
DROP FUNCTION IF EXISTS is_admin_or_editor();

-- =====================================================
-- 8. 還原 approve_payment_request（移除角色驗證）
-- =====================================================
CREATE OR REPLACE FUNCTION approve_payment_request(
  request_id uuid,
  verifier_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_confirmation_id uuid;
  v_cost_amount numeric;
  v_confirmation_date date;
  v_kol_name text;
  v_project_name text;
  v_service text;
  v_invoice_number text;
  v_existing_expense_id uuid;
BEGIN
  -- 取得請款相關資訊（含發票號碼）
  SELECT
    pr.cost_amount,
    k.name,
    q.project_name,
    qi.service,
    pr.invoice_number
  INTO
    v_cost_amount,
    v_kol_name,
    v_project_name,
    v_service,
    v_invoice_number
  FROM payment_requests pr
  JOIN quotation_items qi ON pr.quotation_item_id = qi.id
  LEFT JOIN kols k ON qi.kol_id = k.id
  LEFT JOIN quotations q ON qi.quotation_id = q.id
  WHERE pr.id = request_id;

  -- 驗證
  IF v_cost_amount IS NULL THEN
    RAISE EXCEPTION 'Cost amount not found for payment request %', request_id;
  END IF;

  IF v_kol_name IS NULL THEN
     v_kol_name := 'Unknown KOL';
  END IF;

  IF v_project_name IS NULL THEN
     v_project_name := 'Unknown Project';
  END IF;

  IF v_service IS NULL THEN
     v_service := 'Unknown Service';
  END IF;

  v_confirmation_date := CURRENT_DATE;

  -- 檢查今日是否已有確認記錄
  SELECT id INTO v_confirmation_id
  FROM payment_confirmations
  WHERE confirmation_date = v_confirmation_date
  LIMIT 1;

  IF v_confirmation_id IS NULL THEN
    INSERT INTO payment_confirmations (
      confirmation_date,
      total_amount,
      total_items,
      created_by,
      created_at
    ) VALUES (
      v_confirmation_date,
      v_cost_amount,
      1,
      verifier_id,
      NOW()
    )
    RETURNING id INTO v_confirmation_id;
  ELSE
    UPDATE payment_confirmations
    SET
      total_amount = total_amount + v_cost_amount,
      total_items = total_items + 1
    WHERE id = v_confirmation_id;
  END IF;

  -- 建立確認項目（含快照）
  INSERT INTO payment_confirmation_items (
    payment_confirmation_id,
    payment_request_id,
    amount_at_confirmation,
    kol_name_at_confirmation,
    project_name_at_confirmation,
    service_at_confirmation,
    created_at
  ) VALUES (
    v_confirmation_id,
    request_id,
    v_cost_amount,
    v_kol_name,
    v_project_name,
    v_service,
    NOW()
  );

  -- 更新請款狀態
  UPDATE payment_requests
  SET
    verification_status = 'approved',
    approved_by = verifier_id,
    approved_at = NOW(),
    updated_at = NOW()
  WHERE id = request_id;

  -- 自動建立進項帳務記錄
  SELECT id INTO v_existing_expense_id
  FROM accounting_expenses
  WHERE payment_request_id = request_id
  LIMIT 1;

  IF v_existing_expense_id IS NULL THEN
    INSERT INTO accounting_expenses (
      year,
      expense_type,
      amount,
      tax_amount,
      total_amount,
      vendor_name,
      project_name,
      invoice_number,
      payment_request_id,
      note,
      created_by
    ) VALUES (
      EXTRACT(YEAR FROM NOW())::integer,
      '勞務報酬',
      v_cost_amount,
      0,
      v_cost_amount,
      v_kol_name,
      v_project_name,
      v_invoice_number,
      request_id,
      '系統自動建立 - 請款核准 (' || v_service || ')',
      verifier_id
    );
  END IF;
END;
$$;

NOTIFY pgrst, 'reload config';
