-- =====================================================
-- 權限漏洞修復 Migration
-- 修復 Member/Editor 無法正常操作的 RLS 政策問題
-- =====================================================

-- ============================================================
-- 1. payment_requests — 加入 created_by + 擴展 Member 權限
-- 根因: INSERT/UPDATE 限 Admin+Editor，但業務允許 Member 送出請款
-- ============================================================

-- 1.1 加入 created_by 欄位 + index + trigger
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_created_by ON payment_requests (created_by);

-- 複用已有的 set_created_by() trigger 函數
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_set_created_by_payment_requests'
  ) THEN
    CREATE TRIGGER trg_set_created_by_payment_requests
      BEFORE INSERT ON payment_requests
      FOR EACH ROW EXECUTE FUNCTION set_created_by();
  END IF;
END
$$;

-- 1.2 重建 INSERT 政策: 全員可新增
DROP POLICY IF EXISTS "payment_requests_insert" ON payment_requests;
CREATE POLICY "payment_requests_insert_authenticated_policy" ON payment_requests
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 1.3 重建 UPDATE 政策: Admin/Editor 改任何，Member 改自己的
DROP POLICY IF EXISTS "payment_requests_update" ON payment_requests;
CREATE POLICY "payment_requests_update_role_policy" ON payment_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role IN ('Admin', 'Editor')
    )
    OR created_by = (SELECT auth.uid())
  );

-- DELETE 維持 Admin+Editor 不變（不動）

-- ============================================================
-- 2. 歷史記錄 created_by IS NULL — 4 張核心表 UPDATE/DELETE 政策
-- 根因: created_by 欄位加入前的舊資料為 NULL，Member 無法修改
-- ============================================================

-- 2.1 kols
DROP POLICY IF EXISTS "kols_update_role_policy" ON kols;
CREATE POLICY "kols_update_role_policy" ON kols
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role IN ('Admin', 'Editor')
    )
    OR created_by = (SELECT auth.uid())
    OR created_by IS NULL
  );

DROP POLICY IF EXISTS "kols_delete_role_policy" ON kols;
CREATE POLICY "kols_delete_role_policy" ON kols
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role IN ('Admin', 'Editor')
    )
    OR (created_by IS NOT NULL AND created_by = (SELECT auth.uid()))
    OR created_by IS NULL
  );

-- 2.2 clients
DROP POLICY IF EXISTS "clients_update_role_policy" ON clients;
CREATE POLICY "clients_update_role_policy" ON clients
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role IN ('Admin', 'Editor')
    )
    OR created_by = (SELECT auth.uid())
    OR created_by IS NULL
  );

DROP POLICY IF EXISTS "clients_delete_role_policy" ON clients;
CREATE POLICY "clients_delete_role_policy" ON clients
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role IN ('Admin', 'Editor')
    )
    OR (created_by IS NOT NULL AND created_by = (SELECT auth.uid()))
    OR created_by IS NULL
  );

-- 2.3 quotations
DROP POLICY IF EXISTS "quotations_update_role_policy" ON quotations;
CREATE POLICY "quotations_update_role_policy" ON quotations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role IN ('Admin', 'Editor')
    )
    OR created_by = (SELECT auth.uid())
    OR created_by IS NULL
  );

DROP POLICY IF EXISTS "quotations_delete_role_policy" ON quotations;
CREATE POLICY "quotations_delete_role_policy" ON quotations
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role IN ('Admin', 'Editor')
    )
    OR (created_by IS NOT NULL AND created_by = (SELECT auth.uid()))
    OR created_by IS NULL
  );

-- 2.4 quotation_items（子記錄：額外檢查父 quotations 的 NULL 情況）
DROP POLICY IF EXISTS "quotation_items_update_role_policy" ON quotation_items;
CREATE POLICY "quotation_items_update_role_policy" ON quotation_items
  FOR UPDATE TO authenticated
  USING (
    -- Admin/Editor 可修改任何項目
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role IN ('Admin', 'Editor')
    )
    -- Member: 自己建的項目
    OR created_by = (SELECT auth.uid())
    -- Member: 歷史項目（created_by IS NULL）
    OR created_by IS NULL
    -- Member: 父報價單是自己建的（含歷史）
    OR EXISTS (
      SELECT 1 FROM quotations
      WHERE quotations.id = quotation_items.quotation_id
      AND (quotations.created_by = (SELECT auth.uid()) OR quotations.created_by IS NULL)
    )
  );

DROP POLICY IF EXISTS "quotation_items_delete_role_policy" ON quotation_items;
CREATE POLICY "quotation_items_delete_role_policy" ON quotation_items
  FOR DELETE TO authenticated
  USING (
    -- Admin/Editor 可刪除任何項目
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role IN ('Admin', 'Editor')
    )
    -- Member: 自己建的項目
    OR (created_by IS NOT NULL AND created_by = (SELECT auth.uid()))
    -- Member: 歷史項目
    OR created_by IS NULL
    -- Member: 父報價單是自己建的（含歷史）
    OR EXISTS (
      SELECT 1 FROM quotations
      WHERE quotations.id = quotation_items.quotation_id
      AND (
        (quotations.created_by IS NOT NULL AND quotations.created_by = (SELECT auth.uid()))
        OR quotations.created_by IS NULL
      )
    )
  );

-- ============================================================
-- 3. approve_expense_claim — 補回 SET search_path = ''
-- 根因: 20260222500000 覆蓋了安全修正版本，遺失 search_path
-- ============================================================

DROP FUNCTION IF EXISTS approve_expense_claim(uuid, uuid);

CREATE OR REPLACE FUNCTION approve_expense_claim(
  claim_id uuid,
  approver_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.expense_claims%ROWTYPE;
  v_confirmation_id uuid;
  v_confirmation_date date;
  v_existing_expense_id uuid;
  v_caller_role text;
  v_payment_target text;
  v_settlement_month text;
  v_actual_approver_id uuid;
BEGIN
  -- 強制使用 auth.uid() 防止偽造
  v_actual_approver_id := (SELECT auth.uid());

  -- ====== 角色驗證 ======
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_actual_approver_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('Admin', 'Editor') THEN
    RAISE EXCEPTION '權限不足：只有 Admin 或 Editor 可以核准個人報帳';
  END IF;

  -- 取得報帳記錄（加鎖防止並發核准）
  SELECT * INTO v_claim
  FROM public.expense_claims
  WHERE id = claim_id
  FOR UPDATE;

  IF v_claim.id IS NULL THEN
    RAISE EXCEPTION '找不到個人報帳記錄: %', claim_id;
  END IF;

  IF v_claim.status != 'submitted' THEN
    RAISE EXCEPTION '只能核准「已送出」的報帳記錄，目前狀態: %', v_claim.status;
  END IF;

  -- 推斷付款對象類型
  IF v_claim.expense_type = '員工代墊' THEN
    v_payment_target := 'employee';
  ELSIF v_claim.expense_type = '代扣代繳' THEN
    v_payment_target := 'employee';
  ELSIF v_claim.payment_target_type IS NOT NULL THEN
    v_payment_target := v_claim.payment_target_type;
  ELSIF v_claim.invoice_number IS NOT NULL AND v_claim.invoice_number != '' THEN
    v_payment_target := 'vendor';
  ELSE
    v_payment_target := 'other';
  END IF;

  -- ====== 更新報帳狀態 ======
  UPDATE public.expense_claims
  SET
    status = 'approved',
    approved_by = v_actual_approver_id,
    approved_at = NOW(),
    updated_at = NOW()
  WHERE id = claim_id;

  -- ====== 建立 / 更新確認記錄 ======
  v_confirmation_date := CURRENT_DATE;

  SELECT id INTO v_confirmation_id
  FROM public.payment_confirmations
  WHERE confirmation_date = v_confirmation_date
  LIMIT 1;

  IF v_confirmation_id IS NULL THEN
    INSERT INTO public.payment_confirmations (
      confirmation_date,
      total_amount,
      total_items,
      created_by,
      created_at
    ) VALUES (
      v_confirmation_date,
      v_claim.total_amount,
      1,
      v_actual_approver_id,
      NOW()
    )
    RETURNING id INTO v_confirmation_id;
  ELSE
    UPDATE public.payment_confirmations
    SET
      total_amount = total_amount + v_claim.total_amount,
      total_items = total_items + 1
    WHERE id = v_confirmation_id;
  END IF;

  -- 建立確認項目（快照 + 來源標記）
  INSERT INTO public.payment_confirmation_items (
    payment_confirmation_id,
    expense_claim_id,
    source_type,
    amount_at_confirmation,
    kol_name_at_confirmation,
    project_name_at_confirmation,
    service_at_confirmation,
    created_at
  ) VALUES (
    v_confirmation_id,
    claim_id,
    'personal',
    v_claim.total_amount,
    COALESCE(v_claim.vendor_name, '個人報帳'),
    COALESCE(v_claim.project_name, '無專案'),
    COALESCE(v_claim.expense_type || ' - ' || v_claim.accounting_subject, v_claim.expense_type),
    NOW()
  );

  -- ====== 代扣代繳特殊處理 ======
  IF v_claim.expense_type = '代扣代繳' THEN
    v_settlement_month := regexp_replace(v_claim.claim_month, '年.*', '') || '-' ||
      LPAD(regexp_replace(regexp_replace(v_claim.claim_month, '.*年', ''), '月', ''), 2, '0');

    -- 防止重複建立
    IF NOT EXISTS (
      SELECT 1 FROM public.withholding_settlements
      WHERE expense_claim_id = claim_id
    ) THEN
      INSERT INTO public.withholding_settlements (
        month,
        type,
        amount,
        settlement_method,
        expense_claim_id,
        note,
        settled_by,
        settled_at
      ) VALUES (
        v_settlement_month,
        CASE WHEN v_claim.accounting_subject = '二代健保' THEN 'nhi_supplement' ELSE 'income_tax' END,
        v_claim.total_amount,
        'employee_advance',
        claim_id,
        '員工代墊報帳自動建立',
        v_actual_approver_id,
        NOW()
      );
    END IF;

  ELSE
    -- ====== 原有邏輯：自動建立進項帳務記錄 ======
    SELECT id INTO v_existing_expense_id
    FROM public.accounting_expenses
    WHERE expense_claim_id = claim_id
    LIMIT 1;

    IF v_existing_expense_id IS NULL THEN
      INSERT INTO public.accounting_expenses (
        year,
        expense_month,
        expense_type,
        accounting_subject,
        amount,
        tax_amount,
        total_amount,
        vendor_name,
        project_name,
        invoice_number,
        invoice_date,
        expense_claim_id,
        payment_target_type,
        note,
        created_by
      ) VALUES (
        v_claim.year,
        v_claim.claim_month,
        v_claim.expense_type,
        v_claim.accounting_subject,
        v_claim.amount,
        v_claim.tax_amount,
        v_claim.total_amount,
        v_claim.vendor_name,
        v_claim.project_name,
        v_claim.invoice_number,
        v_claim.invoice_date,
        claim_id,
        v_payment_target,
        '系統自動建立 - 個人報帳核准',
        v_actual_approver_id
      );
    END IF;
  END IF;
END;
$$;

-- ============================================================
-- 4. accounting 三表 — 從 owner-only 改為 Admin CRUD
-- 根因: owner-only 導致 Admin A 無法修改 Admin B 建的記錄
-- ============================================================

-- 4.1 accounting_sales
DROP POLICY IF EXISTS "authenticated users can insert accounting_sales" ON accounting_sales;
DROP POLICY IF EXISTS "owner can update accounting_sales" ON accounting_sales;
DROP POLICY IF EXISTS "owner can delete accounting_sales" ON accounting_sales;

CREATE POLICY "accounting_sales_insert_admin_policy" ON accounting_sales
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND role = 'Admin')
  );

CREATE POLICY "accounting_sales_update_admin_policy" ON accounting_sales
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND role = 'Admin')
  );

CREATE POLICY "accounting_sales_delete_admin_policy" ON accounting_sales
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND role = 'Admin')
  );

-- 4.2 accounting_expenses
DROP POLICY IF EXISTS "authenticated users can insert accounting_expenses" ON accounting_expenses;
DROP POLICY IF EXISTS "owner can update accounting_expenses" ON accounting_expenses;
DROP POLICY IF EXISTS "owner can delete accounting_expenses" ON accounting_expenses;

CREATE POLICY "accounting_expenses_insert_admin_policy" ON accounting_expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND role = 'Admin')
  );

CREATE POLICY "accounting_expenses_update_admin_policy" ON accounting_expenses
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND role = 'Admin')
  );

CREATE POLICY "accounting_expenses_delete_admin_policy" ON accounting_expenses
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND role = 'Admin')
  );

-- 4.3 accounting_payroll
DROP POLICY IF EXISTS "authenticated users can insert accounting_payroll" ON accounting_payroll;
DROP POLICY IF EXISTS "owner can update accounting_payroll" ON accounting_payroll;
DROP POLICY IF EXISTS "owner can delete accounting_payroll" ON accounting_payroll;

CREATE POLICY "accounting_payroll_insert_admin_policy" ON accounting_payroll
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND role = 'Admin')
  );

CREATE POLICY "accounting_payroll_update_admin_policy" ON accounting_payroll
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND role = 'Admin')
  );

CREATE POLICY "accounting_payroll_delete_admin_policy" ON accounting_payroll
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND role = 'Admin')
  );

-- ============================================================
-- 5. 修復 is_admin() 函式 — 改為查 profiles 表
-- 根因: 原版查詢不存在的 user_roles 表，永遠返回 false
-- ============================================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid())
    AND role = 'Admin'
  );
$$;

-- ============================================================
-- 6. 同步修復 approve_expense_claim 中的 approver_id 使用
-- 注意：原函數使用外部傳入的 approver_id，安全版本改用 auth.uid()
-- 上方的 CREATE OR REPLACE 已統一使用 v_actual_approver_id
-- ============================================================

-- 完成
