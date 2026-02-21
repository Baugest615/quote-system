-- =====================================================
-- Migration: 個人請款申請（Expense Claims）
-- Created: 2026-02-20
--
-- 1. 建立 expense_claims 資料表
-- 2. 擴展 accounting_expenses（新增 expense_claim_id）
-- 3. 擴展 payment_confirmation_items（新增 expense_claim_id + source_type）
-- 4. 索引、RLS、Trigger
-- 5. RPC：approve_expense_claim / reject_expense_claim
-- =====================================================

-- ============================================================
-- 1. 建立 expense_claims 資料表
-- ============================================================

CREATE TABLE IF NOT EXISTS expense_claims (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  year integer NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
  claim_month text,                               -- 報帳月份（如 "2026年2月"）
  expense_type text NOT NULL DEFAULT '其他支出'    -- 支出種類（同 accounting_expenses）
    CHECK (expense_type IN ('專案支出', '勞務報酬', '其他支出', '公司相關', '沖帳免付')),
  accounting_subject text,                        -- 會計科目
  amount numeric(15,2) NOT NULL DEFAULT 0,        -- 未稅金額
  tax_amount numeric(15,2) DEFAULT 0,             -- 稅額（有發票時 = amount × 5%）
  total_amount numeric(15,2) DEFAULT 0,           -- 含稅總額
  vendor_name text,                               -- 廠商/對象
  project_name text,                              -- 專案名稱
  invoice_number text,                            -- 發票號碼
  invoice_date date,                              -- 發票日期
  note text,                                      -- 備註

  -- 審核流程
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  submitted_by uuid REFERENCES auth.users(id),
  submitted_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  rejected_by uuid REFERENCES auth.users(id),
  rejected_at timestamptz,
  rejection_reason text,

  -- 附件
  attachment_file_path text,                      -- JSON 格式附件列表

  -- 標準欄位
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

COMMENT ON TABLE expense_claims IS '個人請款申請 - 員工報帳用，核准後自動建立進項記錄';
COMMENT ON COLUMN expense_claims.status IS '狀態：draft（草稿）、submitted（已送出）、approved（已核准）、rejected（已駁回）';
COMMENT ON COLUMN expense_claims.tax_amount IS '稅額：有發票號碼時自動計算 amount × 5%，無發票時為 0';

-- ============================================================
-- 2. 擴展 accounting_expenses（新增 expense_claim_id 關聯）
-- ============================================================

ALTER TABLE accounting_expenses
  ADD COLUMN IF NOT EXISTS expense_claim_id uuid REFERENCES expense_claims(id) ON DELETE SET NULL;

-- 唯一部分索引：每筆個人報帳最多對應一筆進項記錄
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_expenses_expense_claim_id
  ON accounting_expenses(expense_claim_id)
  WHERE expense_claim_id IS NOT NULL;

-- ============================================================
-- 3. 擴展 payment_confirmation_items（支援個人報帳來源）
-- ============================================================

-- 新增欄位：個人報帳關聯
ALTER TABLE payment_confirmation_items
  ADD COLUMN IF NOT EXISTS expense_claim_id uuid REFERENCES expense_claims(id) ON DELETE SET NULL;

-- 新增欄位：來源類型（區分專案請款 vs 個人報帳）
ALTER TABLE payment_confirmation_items
  ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'project'
    CHECK (source_type IN ('project', 'personal'));

-- 放寬 payment_request_id 限制（個人報帳不需要 payment_request_id）
ALTER TABLE payment_confirmation_items
  ALTER COLUMN payment_request_id DROP NOT NULL;

-- ============================================================
-- 4. 索引
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_expense_claims_year_status
  ON expense_claims(year, status);

CREATE INDEX IF NOT EXISTS idx_expense_claims_submitted_by
  ON expense_claims(submitted_by);

CREATE INDEX IF NOT EXISTS idx_expense_claims_status
  ON expense_claims(status);

CREATE INDEX IF NOT EXISTS idx_expense_claims_created_by
  ON expense_claims(created_by);

CREATE INDEX IF NOT EXISTS idx_expense_claims_year_project
  ON expense_claims(year, project_name);

-- ============================================================
-- 5. RLS 政策
-- ============================================================

ALTER TABLE expense_claims ENABLE ROW LEVEL SECURITY;

-- 清除可能已存在的政策（支援重新執行）
DROP POLICY IF EXISTS "expense_claims_select_authenticated" ON expense_claims;
DROP POLICY IF EXISTS "expense_claims_insert_authenticated" ON expense_claims;
DROP POLICY IF EXISTS "expense_claims_update_own_or_reviewer" ON expense_claims;
DROP POLICY IF EXISTS "expense_claims_delete_own_draft_or_admin" ON expense_claims;

-- SELECT：所有已認證使用者可讀取
CREATE POLICY "expense_claims_select_authenticated"
  ON expense_claims FOR SELECT
  TO authenticated
  USING (true);

-- INSERT：所有已認證使用者可新增（created_by 必須是自己）
CREATE POLICY "expense_claims_insert_authenticated"
  ON expense_claims FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = created_by);

-- UPDATE：自己的 draft/rejected 記錄可修改 + Admin/Editor 可更新審核狀態
CREATE POLICY "expense_claims_update_own_or_reviewer"
  ON expense_claims FOR UPDATE
  TO authenticated
  USING (
    -- 自己的 draft/rejected 記錄
    ((SELECT auth.uid()) = created_by AND status IN ('draft', 'rejected'))
    OR
    -- Admin/Editor 可審核任何記錄
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role IN ('Admin', 'Editor')
    )
  );

-- DELETE：自己的 draft 記錄 + Admin
CREATE POLICY "expense_claims_delete_own_draft_or_admin"
  ON expense_claims FOR DELETE
  TO authenticated
  USING (
    ((SELECT auth.uid()) = created_by AND status = 'draft')
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role = 'Admin'
    )
  );

-- ============================================================
-- 6. updated_at 自動更新 Trigger
-- ============================================================

DROP TRIGGER IF EXISTS expense_claims_updated_at ON expense_claims;
CREATE TRIGGER expense_claims_updated_at
  BEFORE UPDATE ON expense_claims
  FOR EACH ROW EXECUTE FUNCTION update_accounting_updated_at();

-- ============================================================
-- 7. RPC：核准個人報帳
-- ============================================================

CREATE OR REPLACE FUNCTION approve_expense_claim(
  claim_id uuid,
  approver_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_claim expense_claims%ROWTYPE;
  v_confirmation_id uuid;
  v_confirmation_date date;
  v_existing_expense_id uuid;
  v_caller_role text;
BEGIN
  -- ====== 角色驗證 ======
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = (SELECT auth.uid());

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('Admin', 'Editor') THEN
    RAISE EXCEPTION '權限不足：只有 Admin 或 Editor 可以核准個人報帳';
  END IF;

  -- 取得報帳記錄
  SELECT * INTO v_claim
  FROM expense_claims
  WHERE id = claim_id;

  IF v_claim.id IS NULL THEN
    RAISE EXCEPTION '找不到個人報帳記錄: %', claim_id;
  END IF;

  IF v_claim.status != 'submitted' THEN
    RAISE EXCEPTION '只能核准「已送出」的報帳記錄，目前狀態: %', v_claim.status;
  END IF;

  -- ====== 更新報帳狀態 ======
  UPDATE expense_claims
  SET
    status = 'approved',
    approved_by = approver_id,
    approved_at = NOW(),
    updated_at = NOW()
  WHERE id = claim_id;

  -- ====== 建立 / 更新確認記錄（同 approve_payment_request 邏輯） ======
  v_confirmation_date := CURRENT_DATE;

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
      v_claim.total_amount,
      1,
      approver_id,
      NOW()
    )
    RETURNING id INTO v_confirmation_id;
  ELSE
    UPDATE payment_confirmations
    SET
      total_amount = total_amount + v_claim.total_amount,
      total_items = total_items + 1
    WHERE id = v_confirmation_id;
  END IF;

  -- 建立確認項目（快照 + 來源標記）
  INSERT INTO payment_confirmation_items (
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

  -- ====== 自動建立進項帳務記錄 ======
  SELECT id INTO v_existing_expense_id
  FROM accounting_expenses
  WHERE expense_claim_id = claim_id
  LIMIT 1;

  IF v_existing_expense_id IS NULL THEN
    INSERT INTO accounting_expenses (
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
      '系統自動建立 - 個人報帳核准',
      approver_id
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION approve_expense_claim IS '核准個人報帳並自動建立確認記錄與進項帳務記錄（含角色驗證：僅 Admin/Editor）';

-- ============================================================
-- 8. RPC：駁回個人報帳
-- ============================================================

CREATE OR REPLACE FUNCTION reject_expense_claim(
  claim_id uuid,
  rejector_id uuid,
  reason text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
  v_caller_role text;
BEGIN
  -- 角色驗證
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = (SELECT auth.uid());

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('Admin', 'Editor') THEN
    RAISE EXCEPTION '權限不足：只有 Admin 或 Editor 可以駁回個人報帳';
  END IF;

  -- 確認狀態
  SELECT status INTO v_status
  FROM expense_claims
  WHERE id = claim_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION '找不到個人報帳記錄: %', claim_id;
  END IF;

  IF v_status != 'submitted' THEN
    RAISE EXCEPTION '只能駁回「已送出」的報帳記錄，目前狀態: %', v_status;
  END IF;

  -- 更新狀態
  UPDATE expense_claims
  SET
    status = 'rejected',
    rejected_by = rejector_id,
    rejected_at = NOW(),
    rejection_reason = reason,
    updated_at = NOW()
  WHERE id = claim_id;
END;
$$;

COMMENT ON FUNCTION reject_expense_claim IS '駁回個人報帳（含角色驗證：僅 Admin/Editor）';

-- ============================================================
-- 9. 重新整理 PostgREST 快取
-- ============================================================

NOTIFY pgrst, 'reload config';
