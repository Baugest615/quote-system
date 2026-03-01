

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."payment_method" AS ENUM (
    '電匯',
    'ATM轉帳'
);


ALTER TYPE "public"."payment_method" OWNER TO "postgres";


CREATE TYPE "public"."quotation_status" AS ENUM (
    '草稿',
    '待簽約',
    '已簽約',
    '已歸檔'
);


ALTER TYPE "public"."quotation_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'member',
    'Admin',
    'Editor',
    'Member',
    'Reader'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_expense_claim"("claim_id" "uuid", "approver_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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

  -- ====== 更新報帳狀態 + 清除駁回資訊 ======
  UPDATE public.expense_claims
  SET
    status = 'approved',
    approved_by = v_actual_approver_id,
    approved_at = NOW(),
    rejection_reason = NULL,
    rejected_by = NULL,
    rejected_at = NULL,
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
        '個人報帳核准' || CASE
          WHEN v_claim.note IS NOT NULL AND v_claim.note != ''
          THEN ' (' || v_claim.note || ')'
          ELSE ''
        END,
        v_actual_approver_id
      );
    END IF;
  END IF;
END;
$$;


ALTER FUNCTION "public"."approve_expense_claim"("claim_id" "uuid", "approver_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_payment_request"("request_id" "uuid", "verifier_id" "uuid", "p_expense_type" "text" DEFAULT NULL::"text", "p_accounting_subject" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_request       RECORD;
  v_kol_name      text;
  v_project_name  text;
  v_service       text;
  v_cost_amount   numeric;
  v_confirmation_id uuid;
  v_confirmation_date date;
  v_caller_role   text;
  v_actual_verifier_id uuid;
  v_expense_type  text;
  v_accounting_subject text;
  v_quotation_created_at timestamptz;
  v_expense_year  integer;
  v_expense_month text;
BEGIN
  -- 強制使用 auth.uid()
  v_actual_verifier_id := (SELECT auth.uid());

  -- ====== 角色驗證 ======
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_actual_verifier_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('Admin', 'Editor') THEN
    RAISE EXCEPTION '權限不足：只有 Admin 或 Editor 可以核准請款';
  END IF;

  -- ====== 取得請款記錄（含報價單建立日期）======
  SELECT
    pr.*,
    qi.kol_id,
    qi.service,
    qi.cost,
    qi.quotation_id,
    k.name as kol_name,
    q.project_name,
    q.created_at as quotation_created_at
  INTO v_request
  FROM public.payment_requests pr
  JOIN public.quotation_items qi ON qi.id = pr.quotation_item_id
  LEFT JOIN public.kols k ON k.id = qi.kol_id
  LEFT JOIN public.quotations q ON q.id = qi.quotation_id
  WHERE pr.id = request_id
  FOR UPDATE OF pr;

  IF v_request IS NULL THEN
    RAISE EXCEPTION '找不到請款記錄: %', request_id;
  END IF;

  IF v_request.verification_status != 'pending' THEN
    RAISE EXCEPTION '只能核准待審核的請款，目前狀態: %', v_request.verification_status;
  END IF;

  -- ====== 取值 ======
  v_kol_name     := v_request.kol_name;
  v_project_name := v_request.project_name;
  v_service      := v_request.service;
  v_cost_amount  := COALESCE(v_request.cost_amount, v_request.cost, 0);

  v_kol_name     := COALESCE(v_kol_name, 'Unknown KOL');
  v_project_name := COALESCE(v_project_name, 'Unknown Project');
  v_service      := COALESCE(v_service, 'Unknown Service');
  v_confirmation_date := CURRENT_DATE;

  -- ====== 計算年月：優先使用報價單建立日期 ======
  v_quotation_created_at := v_request.quotation_created_at;
  IF v_quotation_created_at IS NOT NULL THEN
    v_expense_year := EXTRACT(YEAR FROM v_quotation_created_at)::integer;
    v_expense_month := TO_CHAR(v_quotation_created_at, 'YYYY') || '年' || EXTRACT(MONTH FROM v_quotation_created_at)::integer || '月';
  ELSE
    -- fallback：無報價單時用核准日期
    v_expense_year := EXTRACT(YEAR FROM v_confirmation_date)::integer;
    v_expense_month := TO_CHAR(v_confirmation_date, 'YYYY年MM月');
  END IF;

  -- ====== 核准者覆蓋時，先更新 payment_requests ======
  IF p_expense_type IS NOT NULL OR p_accounting_subject IS NOT NULL THEN
    UPDATE public.payment_requests
    SET
      expense_type       = COALESCE(p_expense_type, expense_type),
      accounting_subject = COALESCE(p_accounting_subject, accounting_subject),
      updated_at         = NOW()
    WHERE id = request_id;
  END IF;

  -- ====== 建立或更新 payment_confirmations ======
  SELECT id INTO v_confirmation_id
  FROM public.payment_confirmations
  WHERE confirmation_date = v_confirmation_date
  LIMIT 1;

  IF v_confirmation_id IS NULL THEN
    INSERT INTO public.payment_confirmations (
      confirmation_date, total_amount, total_items, created_by, created_at
    ) VALUES (
      v_confirmation_date, v_cost_amount, 1, v_actual_verifier_id, NOW()
    )
    RETURNING id INTO v_confirmation_id;
  ELSE
    UPDATE public.payment_confirmations
    SET total_amount = total_amount + v_cost_amount,
        total_items  = total_items + 1
    WHERE id = v_confirmation_id;
  END IF;

  -- ====== 建立 payment_confirmation_items ======
  INSERT INTO public.payment_confirmation_items (
    payment_confirmation_id, payment_request_id,
    amount_at_confirmation, kol_name_at_confirmation,
    project_name_at_confirmation, service_at_confirmation, created_at
  ) VALUES (
    v_confirmation_id, request_id,
    v_cost_amount, v_kol_name,
    v_project_name, v_service, NOW()
  );

  -- ====== 更新請款狀態 + 清除駁回資訊 ======
  UPDATE public.payment_requests
  SET
    verification_status = 'approved',
    approved_by         = v_actual_verifier_id,
    approved_at         = NOW(),
    rejection_reason    = NULL,
    rejected_by         = NULL,
    rejected_at         = NULL,
    updated_at          = NOW()
  WHERE id = request_id;

  -- ====== 自動建立進項帳務記錄（含 accounting_subject）======
  v_expense_type := COALESCE(p_expense_type, v_request.expense_type);
  v_accounting_subject := COALESCE(
    p_accounting_subject,
    v_request.accounting_subject,
    CASE v_expense_type
      WHEN '勞務報酬' THEN '勞務成本'
      WHEN '外包服務' THEN '外包費用'
      WHEN '專案費用' THEN '廣告費用'
      WHEN '員工代墊' THEN '其他費用'
      WHEN '營運費用' THEN '租金支出'
      WHEN '其他支出' THEN '其他費用'
      ELSE '其他費用'
    END
  );

  IF v_expense_type IS NOT NULL AND v_expense_type != '沖帳免付' THEN
    INSERT INTO public.accounting_expenses (
      year,
      expense_month,
      expense_type,
      accounting_subject,
      amount,
      total_amount,
      vendor_name,
      project_name,
      payment_request_id,
      payment_target_type,
      note,
      created_by
    ) VALUES (
      v_expense_year,
      v_expense_month,
      v_expense_type,
      v_accounting_subject,
      v_cost_amount,
      v_cost_amount,
      v_kol_name,
      v_project_name,
      request_id,
      'kol',
      '請款核准 (' || v_service || ')',
      v_actual_verifier_id
    );
  END IF;
END;
$$;


ALTER FUNCTION "public"."approve_payment_request"("request_id" "uuid", "verifier_id" "uuid", "p_expense_type" "text", "p_accounting_subject" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_quotation_item"("p_item_id" "uuid", "p_expense_type" "text" DEFAULT NULL::"text", "p_accounting_subject" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_item          RECORD;
  v_kol_name      text;
  v_project_name  text;
  v_service       text;
  v_amount        numeric;
  v_confirmation_id uuid;
  v_confirmation_date date;
  v_expense_id    uuid;
  v_caller_id     uuid;
  v_caller_role   text;
  v_expense_type  text;
  v_accounting_subject text;
  v_expense_year  integer;
  v_expense_month text;
  v_quotation_created_at timestamptz;
BEGIN
  -- ====== 取得呼叫者 ======
  v_caller_id := (SELECT auth.uid());

  -- ====== 角色驗證（需 Editor+）======
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('Admin', 'Editor') THEN
    RAISE EXCEPTION '權限不足：只有 Admin 或 Editor 可以審核請款';
  END IF;

  -- ====== 取得報價項目（含報價單 + KOL 資訊）======
  SELECT
    qi.*,
    k.name AS kol_name,
    q.project_name,
    q.created_at AS quotation_created_at
  INTO v_item
  FROM public.quotation_items qi
  LEFT JOIN public.kols k ON k.id = qi.kol_id
  LEFT JOIN public.quotations q ON q.id = qi.quotation_id
  WHERE qi.id = p_item_id
  FOR UPDATE OF qi;

  IF v_item IS NULL THEN
    RAISE EXCEPTION '找不到報價項目: %', p_item_id;
  END IF;

  IF v_item.approved_at IS NOT NULL THEN
    RAISE EXCEPTION '此項目已審核通過';
  END IF;

  IF v_item.requested_at IS NULL THEN
    RAISE EXCEPTION '此項目尚未送出請款';
  END IF;

  -- ====== 取值 ======
  v_kol_name     := COALESCE(v_item.kol_name, '自訂項目');
  v_project_name := COALESCE(v_item.project_name, '未命名專案');
  v_service      := COALESCE(v_item.service, '未知服務');
  v_amount       := COALESCE(v_item.cost_amount, v_item.cost, 0);
  v_confirmation_date := CURRENT_DATE;

  -- ====== 計算年月：優先使用 expected_payment_month，其次報價單日期 ======
  IF v_item.expected_payment_month IS NOT NULL THEN
    v_expense_month := v_item.expected_payment_month;
    v_expense_year := EXTRACT(YEAR FROM NOW())::integer;
  ELSE
    v_quotation_created_at := v_item.quotation_created_at;
    IF v_quotation_created_at IS NOT NULL THEN
      v_expense_year := EXTRACT(YEAR FROM v_quotation_created_at)::integer;
      v_expense_month := TO_CHAR(v_quotation_created_at, 'YYYY') || '年' || EXTRACT(MONTH FROM v_quotation_created_at)::integer || '月';
    ELSE
      v_expense_year := EXTRACT(YEAR FROM v_confirmation_date)::integer;
      v_expense_month := TO_CHAR(v_confirmation_date, 'YYYY年MM月');
    END IF;
  END IF;

  -- ====== 決定最終 expense_type / accounting_subject ======
  v_expense_type := COALESCE(p_expense_type, v_item.expense_type, '勞務報酬');
  v_accounting_subject := COALESCE(
    p_accounting_subject,
    v_item.accounting_subject,
    CASE v_expense_type
      WHEN '勞務報酬' THEN '勞務成本'
      WHEN '外包服務' THEN '外包費用'
      WHEN '專案費用' THEN '廣告費用'
      WHEN '員工代墊' THEN '其他費用'
      WHEN '營運費用' THEN '租金支出'
      WHEN '其他支出' THEN '其他費用'
      ELSE '其他費用'
    END
  );

  -- ====== 更新 quotation_items ======
  UPDATE public.quotation_items SET
    approved_at        = NOW(),
    approved_by        = v_caller_id,
    expense_type       = v_expense_type,
    accounting_subject = v_accounting_subject,
    expected_payment_month = v_expense_month,
    rejection_reason   = NULL,
    rejected_at        = NULL,
    rejected_by        = NULL
  WHERE id = p_item_id;

  -- ====== 建立或更新 payment_confirmations（按日期）======
  SELECT id INTO v_confirmation_id
  FROM public.payment_confirmations
  WHERE confirmation_date = v_confirmation_date
  LIMIT 1;

  IF v_confirmation_id IS NULL THEN
    INSERT INTO public.payment_confirmations (
      confirmation_date, total_amount, total_items, created_by, created_at
    ) VALUES (
      v_confirmation_date, v_amount, 1, v_caller_id, NOW()
    )
    RETURNING id INTO v_confirmation_id;
  ELSE
    UPDATE public.payment_confirmations
    SET total_amount = total_amount + v_amount,
        total_items  = total_items + 1
    WHERE id = v_confirmation_id;
  END IF;

  -- ====== 建立 payment_confirmation_items ======
  INSERT INTO public.payment_confirmation_items (
    payment_confirmation_id, quotation_item_id, source_type,
    amount_at_confirmation, kol_name_at_confirmation,
    project_name_at_confirmation, service_at_confirmation, created_at
  ) VALUES (
    v_confirmation_id, p_item_id, 'quotation',
    v_amount, v_kol_name,
    v_project_name, v_service, NOW()
  );

  -- ====== 建立 accounting_expenses（沖帳免付不建立）======
  IF v_expense_type != '沖帳免付' THEN
    INSERT INTO public.accounting_expenses (
      year,
      expense_month,
      expense_type,
      accounting_subject,
      amount,
      total_amount,
      vendor_name,
      project_name,
      invoice_number,
      quotation_item_id,
      payment_target_type,
      note,
      created_by
    ) VALUES (
      v_expense_year,
      v_expense_month,
      v_expense_type,
      v_accounting_subject,
      v_amount,
      v_amount,
      v_kol_name,
      v_project_name,
      v_item.invoice_number,
      p_item_id,
      'kol',
      '報價單請款核准 (' || v_service || ')',
      v_caller_id
    )
    RETURNING id INTO v_expense_id;
  END IF;

  RETURN v_expense_id;
END;
$$;


ALTER FUNCTION "public"."approve_quotation_item"("p_item_id" "uuid", "p_expense_type" "text", "p_accounting_subject" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."approve_quotation_item"("p_item_id" "uuid", "p_expense_type" "text", "p_accounting_subject" "text") IS '從報價單審核通過項目：更新狀態 + 建立確認記錄 + 建立進項記錄';



CREATE OR REPLACE FUNCTION "public"."auto_close_projects"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  UPDATE projects p
  SET status = '關案', updated_at = NOW()
  WHERE p.status = '結案中'
  AND EXISTS (
    SELECT 1 FROM accounting_sales s
    WHERE s.project_name = p.project_name
  )
  AND NOT EXISTS (
    SELECT 1 FROM accounting_sales s
    WHERE s.project_name = p.project_name
    AND s.actual_receipt_date IS NULL
  );
$$;


ALTER FUNCTION "public"."auto_close_projects"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_page_permission"("user_id" "uuid", "page_key" character varying, "required_function" character varying DEFAULT NULL::character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    user_role_val user_role;
    page_permissions_record RECORD;
BEGIN
    -- 取得用戶角色
    SELECT role INTO user_role_val 
    FROM profiles 
    WHERE id = user_id;
    
    IF user_role_val IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- 取得頁面權限設定
    SELECT * INTO page_permissions_record 
    FROM page_permissions 
    WHERE page_permissions.page_key = check_page_permission.page_key;
    
    IF page_permissions_record IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- 檢查角色是否有存取權限
    IF user_role_val = ANY(page_permissions_record.allowed_roles) THEN
        -- 如果有指定功能檢查，則檢查功能權限
        IF required_function IS NOT NULL THEN
            RETURN required_function = ANY(page_permissions_record.allowed_functions);
        ELSE
            RETURN TRUE;
        END IF;
    END IF;
    
    RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."check_page_permission"("user_id" "uuid", "page_key" character varying, "required_function" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_accounting_sale_from_quotation"("p_quotation_id" "uuid", "p_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_existing_sale_id uuid;
  v_existing_amount numeric;
  v_new_sale_id uuid;
  v_project_name text;
  v_client_name text;
  v_has_discount boolean;
  v_discounted_price numeric;
  v_subtotal_untaxed numeric;
  v_created_at timestamptz;
  v_sales_amount numeric;
  v_tax_amount numeric;
  v_total_amount numeric;
  v_year integer;
  v_invoice_month text;
BEGIN
  -- 檢查是否已有連結記錄
  SELECT id, sales_amount INTO v_existing_sale_id, v_existing_amount
  FROM public.accounting_sales
  WHERE quotation_id = p_quotation_id
  LIMIT 1;

  -- 如果已有記錄且金額 > 0，直接返回（避免重複）
  IF v_existing_sale_id IS NOT NULL AND v_existing_amount > 0 THEN
    RETURN v_existing_sale_id;
  END IF;

  -- 取得報價單資訊（含客戶名稱 + 建立日期）
  SELECT
    q.project_name,
    c.name,
    q.has_discount,
    q.discounted_price,
    q.subtotal_untaxed,
    q.created_at
  INTO
    v_project_name,
    v_client_name,
    v_has_discount,
    v_discounted_price,
    v_subtotal_untaxed,
    v_created_at
  FROM public.quotations q
  LEFT JOIN public.clients c ON q.client_id = c.id
  WHERE q.id = p_quotation_id;

  IF v_project_name IS NULL THEN
    RAISE EXCEPTION '找不到報價單: %', p_quotation_id;
  END IF;

  -- 使用報價單建立日期的年月
  v_year := EXTRACT(YEAR FROM v_created_at)::integer;
  v_invoice_month := TO_CHAR(v_created_at, 'YYYY') || '年' || EXTRACT(MONTH FROM v_created_at)::integer || '月';

  -- 計算金額（優先使用折扣價）
  IF v_has_discount AND v_discounted_price IS NOT NULL THEN
    v_sales_amount := v_discounted_price;
  ELSE
    v_sales_amount := COALESCE(v_subtotal_untaxed, 0);
  END IF;

  v_tax_amount := ROUND(v_sales_amount * 0.05, 2);
  v_total_amount := v_sales_amount + v_tax_amount;

  -- 如果已有記錄但金額為 0，UPDATE 重新計算
  IF v_existing_sale_id IS NOT NULL THEN
    UPDATE public.accounting_sales
    SET
      year = v_year,
      invoice_month = v_invoice_month,
      sales_amount = v_sales_amount,
      tax_amount = v_tax_amount,
      total_amount = v_total_amount,
      project_name = v_project_name,
      client_name = v_client_name,
      note = '系統自動建立 - 報價單簽約（金額已更新）'
    WHERE id = v_existing_sale_id;

    RETURN v_existing_sale_id;
  END IF;

  -- 新增銷項記錄
  INSERT INTO public.accounting_sales (
    year,
    invoice_month,
    project_name,
    client_name,
    sales_amount,
    tax_amount,
    total_amount,
    quotation_id,
    note,
    created_by
  ) VALUES (
    v_year,
    v_invoice_month,
    v_project_name,
    v_client_name,
    v_sales_amount,
    v_tax_amount,
    v_total_amount,
    p_quotation_id,
    '系統自動建立 - 報價單簽約',
    p_user_id
  )
  RETURNING id INTO v_new_sale_id;

  RETURN v_new_sale_id;
END;
$$;


ALTER FUNCTION "public"."create_accounting_sale_from_quotation"("p_quotation_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_accounting_sale_from_quotation"("p_quotation_id" "uuid", "p_user_id" "uuid") IS '報價單簽約時自動建立銷項帳務記錄（年月取自報價單建立日期）';



CREATE OR REPLACE FUNCTION "public"."create_payment_confirmation"("p_confirmation_date" "date", "p_total_amount" numeric, "p_total_items" integer, "p_created_by" "uuid", "p_items" json) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_confirmation_id UUID;
    item_record RECORD;
    v_result JSON;
    v_inserted_count INTEGER := 0;
BEGIN
    -- 1. 創建請款確認主記錄
    INSERT INTO payment_confirmations (
        confirmation_date,
        total_amount,
        total_items,
        created_by
    ) VALUES (
        p_confirmation_date,
        p_total_amount,
        p_total_items,
        p_created_by
    ) RETURNING id INTO v_confirmation_id;
    
    -- 2. 處理JSON項目並插入
    FOR item_record IN 
        SELECT 
            (value->>'payment_request_id')::UUID as payment_request_id,
            (value->>'amount_at_confirmation')::DECIMAL(12,2) as amount_at_confirmation,
            value->>'kol_name_at_confirmation' as kol_name_at_confirmation,
            value->>'project_name_at_confirmation' as project_name_at_confirmation,
            value->>'service_at_confirmation' as service_at_confirmation
        FROM json_array_elements(p_items)
    LOOP
        INSERT INTO payment_confirmation_items (
            payment_confirmation_id,
            payment_request_id,
            amount_at_confirmation,
            kol_name_at_confirmation,
            project_name_at_confirmation,
            service_at_confirmation
        ) VALUES (
            v_confirmation_id,
            item_record.payment_request_id,
            item_record.amount_at_confirmation,
            item_record.kol_name_at_confirmation,
            item_record.project_name_at_confirmation,
            item_record.service_at_confirmation
        );
        
        v_inserted_count := v_inserted_count + 1;
    END LOOP;
    
    -- 3. 驗證數量
    IF v_inserted_count != p_total_items THEN
        RAISE EXCEPTION '插入項目數量不符: 預期 %, 實際 %', p_total_items, v_inserted_count;
    END IF;
    
    -- 4. 刪除已確認的請款申請
    DELETE FROM payment_requests 
    WHERE id IN (
        SELECT (value->>'payment_request_id')::UUID
        FROM json_array_elements(p_items)
    );
    
    -- 5. 返回結果
    v_result := json_build_object(
        'success', true,
        'confirmation_id', v_confirmation_id,
        'inserted_items', v_inserted_count,
        'message', '請款確認成功'
    );
    
    RETURN v_result;
    
EXCEPTION WHEN others THEN
    RAISE EXCEPTION '請款確認失敗: %', SQLERRM;
END;
$$;


ALTER FUNCTION "public"."create_payment_confirmation"("p_confirmation_date" "date", "p_total_amount" numeric, "p_total_items" integer, "p_created_by" "uuid", "p_items" json) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_payment_request_group"("p_quotation_item_ids" "uuid"[], "p_merge_type" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_group_id uuid;
  v_item_id uuid;
  v_is_first boolean := true;
BEGIN
  v_group_id := gen_random_uuid();
  
  FOREACH v_item_id IN ARRAY p_quotation_item_ids
  LOOP
    -- Check if request exists
    IF EXISTS (SELECT 1 FROM payment_requests WHERE quotation_item_id = v_item_id) THEN
       UPDATE payment_requests
       SET merge_group_id = v_group_id,
           merge_type = p_merge_type,
           is_merge_leader = v_is_first,
           verification_status = 'pending', -- Ensure it's pending (draft if request_date is null)
           request_date = NULL, -- Reset request date to make it draft
           updated_at = NOW()
       WHERE quotation_item_id = v_item_id;
    ELSE
       INSERT INTO payment_requests (
         quotation_item_id,
         merge_group_id,
         merge_type,
         is_merge_leader,
         verification_status,
         request_date -- Default is null, but explicit is better
       ) VALUES (
         v_item_id,
         v_group_id,
         p_merge_type,
         v_is_first,
         'pending',
         NULL
       );
    END IF;
    
    v_is_first := false;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."create_payment_request_group"("p_quotation_item_ids" "uuid"[], "p_merge_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_available_pending_payments"() RETURNS TABLE("id" "text", "quotation_id" "text", "category" "text", "kol_id" "text", "service" "text", "quantity" integer, "price" numeric, "cost" numeric, "remark" "text", "created_at" timestamp with time zone, "quotations" "jsonb", "kols" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    qi.id::text,
    qi.quotation_id::text,
    qi.category,
    qi.kol_id::text,
    qi.service,
    qi.quantity,
    qi.price,
    qi.cost,
    qi.remark,
    qi.created_at,
    -- 合併 quotation 與 client 資料
    (to_jsonb(q.*) || jsonb_build_object('clients', to_jsonb(c.*))) as quotations,
    to_jsonb(k.*) as kols
  FROM quotation_items qi
  LEFT JOIN quotations q ON qi.quotation_id = q.id
  LEFT JOIN clients c ON q.client_id = c.id
  LEFT JOIN kols k ON qi.kol_id = k.id
  WHERE q.status = '已簽約'
    AND NOT EXISTS (
      SELECT 1
      FROM payment_requests pr
      WHERE pr.quotation_item_id = qi.id
        AND pr.verification_status IN ('pending', 'approved', 'confirmed')
    );
END;
$$;


ALTER FUNCTION "public"."get_available_pending_payments"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_available_pending_payments"() IS '取得可請款的報價項目（已簽約但尚未請款），包含客戶資訊';



CREATE OR REPLACE FUNCTION "public"."get_merge_group_items"("group_id" "text") RETURNS TABLE("payment_request_id" "text", "quotation_item_id" "text", "kol_name" "text", "project_name" "text", "service" "text", "total_amount" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pr.id::TEXT as payment_request_id,
        pr.quotation_item_id::TEXT,
        COALESCE(k.name, '未知KOL')::TEXT as kol_name,
        COALESCE(q.project_name, '未知專案')::TEXT as project_name,
        COALESCE(qi.service, '未知服務')::TEXT as service,
        (qi.price * qi.quantity)::NUMERIC as total_amount
    FROM payment_requests pr
    LEFT JOIN quotation_items qi ON pr.quotation_item_id = qi.id
    LEFT JOIN quotations q ON qi.quotation_id = q.id
    LEFT JOIN kols k ON qi.kol_id = k.id
    WHERE pr.merge_group_id = get_merge_group_items.group_id;
END;
$$;


ALTER FUNCTION "public"."get_merge_group_items"("group_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_profile"() RETURNS TABLE("role" "public"."user_role", "user_id" "uuid")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT p.role, p.id
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid())
$$;


ALTER FUNCTION "public"."get_my_profile"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_my_profile"() IS '取得當前使用者的角色和 ID，繞過 profiles RLS 避免遞迴';



CREATE OR REPLACE FUNCTION "public"."get_my_role"() RETURNS "public"."user_role"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT
    CASE public.profiles.role
      WHEN 'admin' THEN 'Admin'::public.user_role
      WHEN 'member' THEN 'Member'::public.user_role
      ELSE public.profiles.role
    END
  FROM public.profiles
  WHERE id = (SELECT auth.uid())
$$;


ALTER FUNCTION "public"."get_my_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_project_notes"("p_project_id" "uuid") RETURNS TABLE("id" "uuid", "project_id" "uuid", "content" "text", "created_by" "uuid", "author_email" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT
    pn.id,
    pn.project_id,
    pn.content,
    pn.created_by,
    COALESCE(pr.email, '未知使用者') AS author_email,
    pn.created_at
  FROM project_notes pn
  LEFT JOIN profiles pr ON pr.id = pn.created_by
  WHERE pn.project_id = p_project_id
  ORDER BY pn.created_at DESC;
$$;


ALTER FUNCTION "public"."get_project_notes"("p_project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_project_notes_count"() RETURNS TABLE("project_id" "uuid", "notes_count" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT
    pn.project_id,
    COUNT(*) AS notes_count
  FROM project_notes pn
  GROUP BY pn.project_id;
$$;


ALTER FUNCTION "public"."get_project_notes_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"("user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    role_val public.user_role;
BEGIN
    SELECT role INTO role_val
    FROM public.profiles
    WHERE id = user_id;

    -- 正規化大小寫
    IF role_val = 'admin' THEN RETURN 'Admin';
    ELSIF role_val = 'member' THEN RETURN 'Member';
    ELSE RETURN role_val::text;
    END IF;
END;
$$;


ALTER FUNCTION "public"."get_user_role"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'Member')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid())
    AND role = 'Admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.audit_log (table_name, record_id, action, old_data, performed_by)
  VALUES (
    TG_TABLE_NAME,
    OLD.id,
    'DELETE',
    to_jsonb(OLD),
    (SELECT auth.uid())
  );
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."log_delete"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_delete"() IS '通用刪除審計觸發器，記錄完整被刪除列供恢復';



CREATE OR REPLACE FUNCTION "public"."process_payment_confirmation"("p_user_id" "uuid", "p_approved_request_ids" "uuid"[]) RETURNS TABLE("success" boolean, "confirmation_id" "uuid", "message" "text", "items_processed" integer)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_confirmation_id UUID;
    v_total_amount NUMERIC := 0;
    v_total_items INTEGER := 0;
    v_items_inserted INTEGER := 0;
    v_request_record RECORD;
    v_error_message TEXT;
BEGIN
    -- 開始事務性處理
    BEGIN
        -- 步驟1: 計算總金額和項目數
        SELECT 
            COUNT(*),
            SUM((qi.price * qi.quantity))
        INTO v_total_items, v_total_amount
        FROM payment_requests pr
        JOIN quotation_items qi ON pr.quotation_item_id = qi.id
        WHERE pr.id = ANY(p_approved_request_ids)
        AND pr.verification_status = 'approved';
        
        -- 檢查是否有有效項目
        IF v_total_items = 0 THEN
            RETURN QUERY SELECT FALSE, NULL::UUID, 'No approved items found', 0;
            RETURN;
        END IF;
        
        -- 步驟2: 創建確認記錄
        INSERT INTO payment_confirmations (
            confirmation_date,
            total_amount,
            total_items,
            created_by
        ) VALUES (
            CURRENT_DATE,
            v_total_amount,
            v_total_items,
            p_user_id
        ) RETURNING id INTO v_confirmation_id;
        
        -- 步驟3: 逐一插入確認項目
        FOR v_request_record IN
            SELECT 
                pr.id as request_id,
                (qi.price * qi.quantity) as amount,
                COALESCE(k.name, '未知KOL') as kol_name,
                COALESCE(q.project_name, '未知專案') as project_name,
                COALESCE(qi.service, '未知服務') as service
            FROM payment_requests pr
            JOIN quotation_items qi ON pr.quotation_item_id = qi.id
            JOIN quotations q ON qi.quotation_id = q.id
            LEFT JOIN kols k ON qi.kol_id = k.id
            WHERE pr.id = ANY(p_approved_request_ids)
            AND pr.verification_status = 'approved'
        LOOP
            -- 插入確認項目
            INSERT INTO payment_confirmation_items (
                payment_confirmation_id,
                payment_request_id,
                amount_at_confirmation,
                kol_name_at_confirmation,
                project_name_at_confirmation,
                service_at_confirmation
            ) VALUES (
                v_confirmation_id,
                v_request_record.request_id,
                v_request_record.amount,
                v_request_record.kol_name,
                v_request_record.project_name,
                v_request_record.service
            );
            
            v_items_inserted := v_items_inserted + 1;
        END LOOP;
        
        -- 步驟4: 驗證插入數量
        IF v_items_inserted != v_total_items THEN
            RAISE EXCEPTION 'Items insertion count mismatch: expected %, got %', v_total_items, v_items_inserted;
        END IF;
        
        -- 步驟5: 刪除已確認的請款申請
        DELETE FROM payment_requests WHERE id = ANY(p_approved_request_ids);
        
        -- 返回成功結果
        RETURN QUERY SELECT TRUE, v_confirmation_id, 'Payment confirmation processed successfully', v_items_inserted;
        
    EXCEPTION WHEN OTHERS THEN
        -- 發生錯誤時，事務會自動回滾
        GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
        RETURN QUERY SELECT FALSE, NULL::UUID, 'Error: ' || v_error_message, 0;
    END;
END;
$$;


ALTER FUNCTION "public"."process_payment_confirmation"("p_user_id" "uuid", "p_approved_request_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_expense_claim"("claim_id" "uuid", "rejector_id" "uuid" DEFAULT NULL::"uuid", "reason" "text" DEFAULT ''::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_status text;
  v_caller_role text;
  v_actual_rejector_id uuid;
BEGIN
  v_actual_rejector_id := (SELECT auth.uid());

  -- 角色驗證
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_actual_rejector_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('Admin', 'Editor') THEN
    RAISE EXCEPTION '權限不足：只有 Admin 或 Editor 可以駁回個人報帳';
  END IF;

  -- 確認狀態（加鎖防止並發）
  SELECT status INTO v_status
  FROM public.expense_claims
  WHERE id = claim_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION '找不到個人報帳記錄: %', claim_id;
  END IF;

  IF v_status != 'submitted' THEN
    RAISE EXCEPTION '只能駁回「已送出」的報帳記錄，目前狀態: %', v_status;
  END IF;

  -- 更新狀態
  UPDATE public.expense_claims
  SET
    status = 'rejected',
    rejected_by = v_actual_rejector_id,
    rejected_at = NOW(),
    rejection_reason = reason,
    updated_at = NOW()
  WHERE id = claim_id;
END;
$$;


ALTER FUNCTION "public"."reject_expense_claim"("claim_id" "uuid", "rejector_id" "uuid", "reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reject_expense_claim"("claim_id" "uuid", "rejector_id" "uuid", "reason" "text") IS '駁回個人報帳（含角色驗證：僅 Admin/Editor，使用 auth.uid() 防止偽造）';



CREATE OR REPLACE FUNCTION "public"."remove_accounting_sale_for_quotation"("p_quotation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM accounting_sales
  WHERE quotation_id = p_quotation_id;
END;
$$;


ALTER FUNCTION "public"."remove_accounting_sale_for_quotation"("p_quotation_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."remove_accounting_sale_for_quotation"("p_quotation_id" "uuid") IS '報價單取消簽約時刪除對應銷項帳務記錄';



CREATE OR REPLACE FUNCTION "public"."revert_quotation_item"("p_item_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_item          RECORD;
  v_pci_record    RECORD;
  v_caller_id     uuid;
  v_caller_role   text;
BEGIN
  -- ====== 取得呼叫者 ======
  v_caller_id := (SELECT auth.uid());

  -- ====== 角色驗證（需 Editor+）======
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('Admin', 'Editor') THEN
    RAISE EXCEPTION '權限不足：只有 Admin 或 Editor 可以駁回請款';
  END IF;

  -- ====== 驗證項目存在且已審核 ======
  SELECT * INTO v_item
  FROM public.quotation_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF v_item IS NULL THEN
    RAISE EXCEPTION '找不到報價項目: %', p_item_id;
  END IF;

  IF v_item.approved_at IS NULL THEN
    RAISE EXCEPTION '此項目尚未審核通過，無法駁回';
  END IF;

  -- ====== 刪除 accounting_expenses ======
  DELETE FROM public.accounting_expenses
  WHERE quotation_item_id = p_item_id;

  -- ====== 刪除 payment_confirmation_items 並更新 confirmation 合計 ======
  FOR v_pci_record IN
    SELECT id, payment_confirmation_id, amount_at_confirmation
    FROM public.payment_confirmation_items
    WHERE quotation_item_id = p_item_id
  LOOP
    DELETE FROM public.payment_confirmation_items
    WHERE id = v_pci_record.id;

    -- 檢查 confirmation 是否還有其他 items
    IF NOT EXISTS (
      SELECT 1 FROM public.payment_confirmation_items
      WHERE payment_confirmation_id = v_pci_record.payment_confirmation_id
    ) THEN
      -- 沒有其他項目，刪除整個 confirmation
      DELETE FROM public.payment_confirmations
      WHERE id = v_pci_record.payment_confirmation_id;
    ELSE
      -- 還有其他項目，更新合計
      UPDATE public.payment_confirmations
      SET total_amount = total_amount - COALESCE(v_pci_record.amount_at_confirmation, 0),
          total_items  = total_items - 1
      WHERE id = v_pci_record.payment_confirmation_id;
    END IF;
  END LOOP;

  -- ====== 重設 quotation_items 狀態 ======
  UPDATE public.quotation_items SET
    requested_at     = NULL,
    requested_by     = NULL,
    approved_at      = NULL,
    approved_by      = NULL,
    rejection_reason = p_reason,
    rejected_at      = CASE WHEN p_reason IS NOT NULL THEN NOW() ELSE NULL END,
    rejected_by      = CASE WHEN p_reason IS NOT NULL THEN v_caller_id ELSE NULL END
  WHERE id = p_item_id;
END;
$$;


ALTER FUNCTION "public"."revert_quotation_item"("p_item_id" "uuid", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."revert_quotation_item"("p_item_id" "uuid", "p_reason" "text") IS '駁回報價單已審核項目：刪除進項+確認記錄、重設項目狀態';



CREATE OR REPLACE FUNCTION "public"."set_created_by"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := (SELECT auth.uid());
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_created_by"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_created_by"() IS '自動填入 created_by 為當前使用者 ID';



CREATE OR REPLACE FUNCTION "public"."sync_kol_service_prices_from_quotation"("p_quotation_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_updated_count integer := 0;
  v_project_name text;
  v_quote_date text;
  rec record;
BEGIN
  -- 取得報價單資訊
  SELECT
    q.project_name,
    TO_CHAR(q.created_at, 'YYYY-MM-DD')
  INTO v_project_name, v_quote_date
  FROM quotations q
  WHERE q.id = p_quotation_id;

  IF v_project_name IS NULL THEN
    RAISE EXCEPTION '找不到報價單: %', p_quotation_id;
  END IF;

  -- 遍歷報價項目，比對服務類型後 UPSERT（含 cost）
  FOR rec IN
    SELECT
      qi.kol_id,
      st.id AS service_type_id,
      qi.price,
      COALESCE(qi.cost, 0) AS cost
    FROM quotation_items qi
    JOIN service_types st ON qi.service = st.name
    WHERE qi.quotation_id = p_quotation_id
      AND qi.kol_id IS NOT NULL
      AND qi.price > 0
  LOOP
    INSERT INTO kol_services (kol_id, service_type_id, price, cost, last_quote_info, updated_at)
    VALUES (
      rec.kol_id,
      rec.service_type_id,
      rec.price,
      rec.cost,
      v_project_name || ' (' || v_quote_date || ')',
      NOW()
    )
    ON CONFLICT (kol_id, service_type_id)
    DO UPDATE SET
      price = EXCLUDED.price,
      cost = EXCLUDED.cost,
      last_quote_info = EXCLUDED.last_quote_info,
      updated_at = NOW();

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN json_build_object(
    'updated', v_updated_count,
    'project_name', v_project_name,
    'message', v_project_name || ' 同步 ' || v_updated_count || ' 項服務價格與成本'
  );
END;
$$;


ALTER FUNCTION "public"."sync_kol_service_prices_from_quotation"("p_quotation_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_kol_service_prices_from_quotation"("p_quotation_id" "uuid") IS '報價單簽約時自動同步 KOL 服務定價（使用最新價格）';



CREATE OR REPLACE FUNCTION "public"."sync_kol_service_prices_initial"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_updated_count integer := 0;
  rec record;
BEGIN
  FOR rec IN
    SELECT
      qi.kol_id,
      st.id AS service_type_id,
      st.name AS service_name,
      ROUND(AVG(qi.price), 2) AS avg_price,
      ROUND(AVG(COALESCE(qi.cost, 0)), 2) AS avg_cost,
      COUNT(*) AS item_count,
      (
        SELECT q2.project_name || ' (' || TO_CHAR(q2.created_at, 'YYYY-MM-DD') || ')'
        FROM quotation_items qi2
        JOIN quotations q2 ON qi2.quotation_id = q2.id
        WHERE qi2.kol_id = qi.kol_id
          AND qi2.service = st.name
          AND qi2.price > 0
        ORDER BY q2.created_at DESC
        LIMIT 1
      ) AS latest_quote_info
    FROM quotation_items qi
    JOIN service_types st ON qi.service = st.name
    WHERE qi.kol_id IS NOT NULL
      AND qi.price > 0
    GROUP BY qi.kol_id, st.id, st.name
  LOOP
    INSERT INTO kol_services (kol_id, service_type_id, price, cost, last_quote_info, updated_at)
    VALUES (
      rec.kol_id,
      rec.service_type_id,
      rec.avg_price,
      rec.avg_cost,
      '初始同步平均 (' || rec.item_count || '筆) - ' || COALESCE(rec.latest_quote_info, ''),
      NOW()
    )
    ON CONFLICT (kol_id, service_type_id)
    DO UPDATE SET
      price = EXCLUDED.price,
      cost = EXCLUDED.cost,
      last_quote_info = EXCLUDED.last_quote_info,
      updated_at = NOW();

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN json_build_object(
    'updated', v_updated_count,
    'message', '初始同步完成，已更新 ' || v_updated_count || ' 項服務價格與成本'
  );
END;
$$;


ALTER FUNCTION "public"."sync_kol_service_prices_initial"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_kol_service_prices_initial"() IS '一次性初始同步：從所有報價單計算平均價格更新 KOL 服務定價';



CREATE OR REPLACE FUNCTION "public"."sync_payment_status_from_date"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- 填入匯款日期 → 自動標記為已付
  IF NEW.payment_date IS NOT NULL AND OLD.payment_date IS DISTINCT FROM NEW.payment_date THEN
    NEW.payment_status := 'paid';
    NEW.paid_at := COALESCE(NEW.paid_at, NOW());
  -- 清除匯款日期 → 自動標記為未付
  ELSIF NEW.payment_date IS NULL AND OLD.payment_date IS NOT NULL THEN
    NEW.payment_status := 'unpaid';
    NEW.paid_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_payment_status_from_date"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ungroup_payment_requests"("p_group_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_req record;
BEGIN
  -- Cast p_group_id to text to match the column type
  FOR v_req IN SELECT * FROM payment_requests WHERE merge_group_id = p_group_id::text
  LOOP
    IF v_req.rejection_reason IS NOT NULL THEN
       -- If it has rejection history, revert to rejected state and ungroup
       UPDATE payment_requests
       SET merge_group_id = NULL,
           merge_type = NULL,
           is_merge_leader = false,
           verification_status = 'rejected',
           request_date = v_req.created_at::date::text,
           updated_at = NOW()
       WHERE id = v_req.id;
    ELSE
       -- If it was a fresh draft, delete it
       DELETE FROM payment_requests WHERE id = v_req.id;
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."ungroup_payment_requests"("p_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_accounting_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_accounting_updated_at"() OWNER TO "postgres";


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
      JOIN accounting_expenses ae ON (
        (pci.payment_request_id IS NOT NULL AND ae.payment_request_id = pci.payment_request_id)
        OR (pci.expense_claim_id IS NOT NULL AND ae.expense_claim_id = pci.expense_claim_id)
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
                -- 提交人本人：提交人姓名 + '（個人報帳）'
                ELSE
                  COALESCE(
                    (SELECT name FROM employees WHERE user_id = ec.submitted_by LIMIT 1),
                    ec.vendor_name,
                    '個人報帳'
                  ) || '（個人報帳）'
              END
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


ALTER FUNCTION "public"."update_remittance_settings"("p_confirmation_id" "uuid", "p_settings" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_remittance_settings"("p_confirmation_id" "uuid", "p_settings" "jsonb") IS '更新匯款設定並將匯費分配到對應的勞務報酬記錄（支援外部廠商獨立分組）';



CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."accounting_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "year" integer DEFAULT EXTRACT(year FROM "now"()) NOT NULL,
    "expense_month" "text",
    "expense_type" "text" NOT NULL,
    "accounting_subject" "text",
    "amount" numeric(15,2) DEFAULT 0,
    "tax_amount" numeric(15,2) DEFAULT 0,
    "total_amount" numeric(15,2) DEFAULT 0,
    "vendor_name" "text",
    "payment_date" "date",
    "invoice_date" "date",
    "invoice_number" "text",
    "project_name" "text",
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "payment_request_id" "uuid",
    "expense_claim_id" "uuid",
    "payment_target_type" "text",
    "payment_status" "text" DEFAULT 'unpaid'::"text",
    "paid_at" timestamp with time zone,
    "submitted_by" "uuid",
    "payment_confirmation_id" "uuid",
    "remittance_fee" numeric(15,2) DEFAULT 0,
    "quotation_item_id" "uuid",
    CONSTRAINT "accounting_expenses_expense_type_check" CHECK (("expense_type" = ANY (ARRAY['勞務報酬'::"text", '外包服務'::"text", '專案費用'::"text", '員工代墊'::"text", '營運費用'::"text", '其他支出'::"text", '沖帳免付'::"text", '代扣代繳'::"text"]))),
    CONSTRAINT "accounting_expenses_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['unpaid'::"text", 'paid'::"text"]))),
    CONSTRAINT "accounting_expenses_payment_target_type_check" CHECK (("payment_target_type" = ANY (ARRAY['kol'::"text", 'vendor'::"text", 'employee'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."accounting_expenses" OWNER TO "postgres";


COMMENT ON TABLE "public"."accounting_expenses" IS '進項支出記錄 - 對應 Excel「年度進項總覽」及各明細工作表';



COMMENT ON COLUMN "public"."accounting_expenses"."expense_type" IS '支出種類：勞務報酬、外包服務、專案費用、員工代墊、營運費用、其他支出、沖帳免付';



COMMENT ON COLUMN "public"."accounting_expenses"."accounting_subject" IS '會計科目：進貨、薪資支出、租金支出、旅費支出等';



COMMENT ON COLUMN "public"."accounting_expenses"."payment_target_type" IS '付款對象類型：kol（KOL/自由工作者）、vendor（廠商）、employee（員工代墊）、other（其他）';



COMMENT ON COLUMN "public"."accounting_expenses"."payment_confirmation_id" IS '關聯的確認清單 ID — 用於匯費自動同步記錄';



COMMENT ON COLUMN "public"."accounting_expenses"."remittance_fee" IS '分配到此筆記錄的匯費金額（從 KOL 實付金額中扣除）';



COMMENT ON COLUMN "public"."accounting_expenses"."quotation_item_id" IS '關聯的報價項目 ID（新流程直接連結）';



CREATE TABLE IF NOT EXISTS "public"."accounting_payroll" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "year" integer DEFAULT EXTRACT(year FROM "now"()) NOT NULL,
    "payment_date" "date",
    "salary_month" "text",
    "employee_name" "text" NOT NULL,
    "base_salary" numeric(12,2) DEFAULT 0,
    "meal_allowance" numeric(12,2) DEFAULT 0,
    "bonus" numeric(12,2) DEFAULT 0,
    "deduction" numeric(12,2) DEFAULT 0,
    "labor_insurance_personal" numeric(12,2) DEFAULT 0,
    "health_insurance_personal" numeric(12,2) DEFAULT 0,
    "personal_total" numeric(12,2) DEFAULT 0,
    "net_salary" numeric(12,2) DEFAULT 0,
    "labor_insurance_company" numeric(12,2) DEFAULT 0,
    "health_insurance_company" numeric(12,2) DEFAULT 0,
    "severance_fund" numeric(12,2) DEFAULT 0,
    "retirement_fund" numeric(12,2) DEFAULT 0,
    "company_total" numeric(12,2) DEFAULT 0,
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "employee_id" "uuid",
    "insurance_grade" integer,
    "insurance_salary" integer,
    "labor_rate" numeric(6,4),
    "health_rate" numeric(6,4),
    "pension_rate" numeric(6,4),
    "payment_status" "text" DEFAULT 'unpaid'::"text",
    "paid_at" timestamp with time zone,
    "is_employer" boolean DEFAULT false,
    "dependents_count" numeric(4,2) DEFAULT NULL::numeric,
    "employment_insurance_rate" numeric(6,4) DEFAULT NULL::numeric,
    CONSTRAINT "accounting_payroll_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['unpaid'::"text", 'paid'::"text"])))
);


ALTER TABLE "public"."accounting_payroll" OWNER TO "postgres";


COMMENT ON TABLE "public"."accounting_payroll" IS '人事薪資記錄 - 對應 Excel「人事薪資與勞健保」工作表';



COMMENT ON COLUMN "public"."accounting_payroll"."employee_name" IS '員工姓名（快照，避免員工離職後找不到資料）';



COMMENT ON COLUMN "public"."accounting_payroll"."employee_id" IS '員工 ID（關聯到 employees 表）';



COMMENT ON COLUMN "public"."accounting_payroll"."insurance_grade" IS '當月投保級距（快照）';



COMMENT ON COLUMN "public"."accounting_payroll"."insurance_salary" IS '投保薪資（快照）';



COMMENT ON COLUMN "public"."accounting_payroll"."labor_rate" IS '勞保費率（快照，記錄當時的費率）';



COMMENT ON COLUMN "public"."accounting_payroll"."health_rate" IS '健保費率（快照，記錄當時的費率）';



COMMENT ON COLUMN "public"."accounting_payroll"."pension_rate" IS '勞退費率（快照，記錄當時的費率）';



COMMENT ON COLUMN "public"."accounting_payroll"."is_employer" IS '當月是否為雇主身份（快照）';



COMMENT ON COLUMN "public"."accounting_payroll"."dependents_count" IS '當月眷屬口數（快照，僅雇主適用）';



COMMENT ON COLUMN "public"."accounting_payroll"."employment_insurance_rate" IS '就業保險費率（快照）';



CREATE TABLE IF NOT EXISTS "public"."accounting_sales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "year" integer DEFAULT EXTRACT(year FROM "now"()) NOT NULL,
    "invoice_month" "text",
    "project_name" "text" NOT NULL,
    "client_name" "text",
    "sales_amount" numeric(15,2) DEFAULT 0,
    "tax_amount" numeric(15,2) DEFAULT 0,
    "total_amount" numeric(15,2) DEFAULT 0,
    "invoice_number" "text",
    "invoice_date" "date",
    "actual_receipt_date" "date",
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "quotation_id" "uuid"
);


ALTER TABLE "public"."accounting_sales" OWNER TO "postgres";


COMMENT ON TABLE "public"."accounting_sales" IS '銷項發票記錄 - 對應 Excel「年度銷項開立統計」工作表';



COMMENT ON COLUMN "public"."accounting_sales"."sales_amount" IS '銷售額（未稅）';



COMMENT ON COLUMN "public"."accounting_sales"."tax_amount" IS '營業稅額（5%）';



COMMENT ON COLUMN "public"."accounting_sales"."total_amount" IS '發票總金額（含稅）';



CREATE OR REPLACE VIEW "public"."accounting_annual_summary" AS
 WITH "all_years" AS (
         SELECT DISTINCT "accounting_sales"."year"
           FROM "public"."accounting_sales"
        UNION
         SELECT DISTINCT "accounting_expenses"."year"
           FROM "public"."accounting_expenses"
        UNION
         SELECT DISTINCT "accounting_payroll"."year"
           FROM "public"."accounting_payroll"
        ), "sales_agg" AS (
         SELECT "accounting_sales"."year",
            "sum"("accounting_sales"."sales_amount") AS "total_sales",
            "sum"("accounting_sales"."tax_amount") AS "total_sales_tax",
            "sum"("accounting_sales"."total_amount") AS "total_sales_with_tax"
           FROM "public"."accounting_sales"
          GROUP BY "accounting_sales"."year"
        ), "expenses_agg" AS (
         SELECT "accounting_expenses"."year",
            "sum"("accounting_expenses"."amount") AS "total_expenses",
            "sum"(
                CASE
                    WHEN ("accounting_expenses"."expense_type" = '勞務報酬'::"text") THEN "accounting_expenses"."amount"
                    ELSE (0)::numeric
                END) AS "total_labor_expenses",
            "sum"(
                CASE
                    WHEN ("accounting_expenses"."expense_type" = '外包服務'::"text") THEN "accounting_expenses"."amount"
                    ELSE (0)::numeric
                END) AS "total_outsource_expenses",
            "sum"(
                CASE
                    WHEN ("accounting_expenses"."expense_type" = '專案費用'::"text") THEN "accounting_expenses"."amount"
                    ELSE (0)::numeric
                END) AS "total_project_expenses",
            "sum"(
                CASE
                    WHEN ("accounting_expenses"."expense_type" = '員工代墊'::"text") THEN "accounting_expenses"."amount"
                    ELSE (0)::numeric
                END) AS "total_reimbursement_expenses",
            "sum"(
                CASE
                    WHEN ("accounting_expenses"."expense_type" = '營運費用'::"text") THEN "accounting_expenses"."amount"
                    ELSE (0)::numeric
                END) AS "total_operation_expenses",
            "sum"(
                CASE
                    WHEN ("accounting_expenses"."expense_type" = '其他支出'::"text") THEN "accounting_expenses"."amount"
                    ELSE (0)::numeric
                END) AS "total_other_expenses",
            "sum"(
                CASE
                    WHEN ("accounting_expenses"."expense_type" = '沖帳免付'::"text") THEN "accounting_expenses"."amount"
                    ELSE (0)::numeric
                END) AS "total_writeoff_expenses"
           FROM "public"."accounting_expenses"
          GROUP BY "accounting_expenses"."year"
        ), "payroll_agg" AS (
         SELECT "accounting_payroll"."year",
            "sum"(("accounting_payroll"."net_salary" + "accounting_payroll"."company_total")) AS "total_payroll",
            "sum"("accounting_payroll"."net_salary") AS "total_net_salary"
           FROM "public"."accounting_payroll"
          GROUP BY "accounting_payroll"."year"
        )
 SELECT "y"."year",
    COALESCE("s"."total_sales", (0)::numeric) AS "total_sales",
    COALESCE("s"."total_sales_tax", (0)::numeric) AS "total_sales_tax",
    COALESCE("s"."total_sales_with_tax", (0)::numeric) AS "total_sales_with_tax",
    COALESCE("e"."total_labor_expenses", (0)::numeric) AS "total_labor_expenses",
    COALESCE("e"."total_outsource_expenses", (0)::numeric) AS "total_outsource_expenses",
    COALESCE("e"."total_project_expenses", (0)::numeric) AS "total_project_expenses",
    COALESCE("e"."total_reimbursement_expenses", (0)::numeric) AS "total_reimbursement_expenses",
    COALESCE("e"."total_operation_expenses", (0)::numeric) AS "total_operation_expenses",
    COALESCE("e"."total_other_expenses", (0)::numeric) AS "total_other_expenses",
    COALESCE("e"."total_writeoff_expenses", (0)::numeric) AS "total_writeoff_expenses",
    COALESCE("p"."total_payroll", (0)::numeric) AS "total_payroll",
    ((COALESCE("s"."total_sales", (0)::numeric) - COALESCE("e"."total_expenses", (0)::numeric)) - COALESCE("p"."total_net_salary", (0)::numeric)) AS "annual_profit"
   FROM ((("all_years" "y"
     LEFT JOIN "sales_agg" "s" ON (("s"."year" = "y"."year")))
     LEFT JOIN "expenses_agg" "e" ON (("e"."year" = "y"."year")))
     LEFT JOIN "payroll_agg" "p" ON (("p"."year" = "y"."year")))
  ORDER BY "y"."year" DESC;


ALTER VIEW "public"."accounting_annual_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."accounting_reconciliation" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "year" integer NOT NULL,
    "month" "text" NOT NULL,
    "bank_balance" numeric(15,2) DEFAULT 0,
    "income_total" numeric(15,2) DEFAULT 0,
    "expense_total" numeric(15,2) DEFAULT 0,
    "difference" numeric(15,2) DEFAULT 0,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "note" "text",
    "reconciled_by" "uuid",
    "reconciled_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "prev_bank_balance" numeric(15,2) DEFAULT 0,
    CONSTRAINT "accounting_reconciliation_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'reconciled'::"text"])))
);


ALTER TABLE "public"."accounting_reconciliation" OWNER TO "postgres";


COMMENT ON COLUMN "public"."accounting_reconciliation"."bank_balance" IS '本月存款餘額（使用者手動輸入）';



COMMENT ON COLUMN "public"."accounting_reconciliation"."prev_bank_balance" IS '上月存款餘額（使用者手動輸入）';



CREATE TABLE IF NOT EXISTS "public"."accounting_subjects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."accounting_subjects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" bigint NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "uuid" NOT NULL,
    "action" "text" DEFAULT 'DELETE'::"text" NOT NULL,
    "old_data" "jsonb" NOT NULL,
    "performed_by" "uuid",
    "performed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."audit_log" IS '刪除操作審計日誌，用於誤刪恢復';



COMMENT ON COLUMN "public"."audit_log"."old_data" IS '被刪除列的完整 JSONB 快照';



ALTER TABLE "public"."audit_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "tin" "text",
    "invoice_title" "text",
    "contact_person" "text",
    "phone" "text",
    "address" "text",
    "bank_info" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "email" character varying(255),
    "contacts" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "chk_contacts_format" CHECK (("jsonb_typeof"("contacts") = 'array'::"text"))
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clients"."contacts" IS '聯絡人資訊陣列，格式: [{"name": "姓名", "email": "信箱"}]';



CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "id_number" "text",
    "birth_date" "date",
    "gender" "text",
    "phone" "text",
    "email" "text",
    "address" "text",
    "emergency_contact" "text",
    "emergency_phone" "text",
    "employee_number" "text",
    "hire_date" "date" NOT NULL,
    "resignation_date" "date",
    "position" "text",
    "department" "text",
    "employment_type" "text" DEFAULT '全職'::"text",
    "status" "text" DEFAULT '在職'::"text",
    "base_salary" numeric(12,2) DEFAULT 0,
    "meal_allowance" numeric(12,2) DEFAULT 0,
    "insurance_grade" integer,
    "bank_name" "text",
    "bank_branch" "text",
    "bank_account" "text",
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "has_labor_insurance" boolean DEFAULT true,
    "has_health_insurance" boolean DEFAULT true,
    "user_id" "uuid",
    "is_employer" boolean DEFAULT false,
    "dependents_count" numeric(4,2) DEFAULT NULL::numeric,
    CONSTRAINT "employees_employment_type_check" CHECK (("employment_type" = ANY (ARRAY['全職'::"text", '兼職'::"text", '約聘'::"text", '實習'::"text"]))),
    CONSTRAINT "employees_gender_check" CHECK (("gender" = ANY (ARRAY['男'::"text", '女'::"text", '其他'::"text"]))),
    CONSTRAINT "employees_status_check" CHECK (("status" = ANY (ARRAY['在職'::"text", '留停'::"text", '離職'::"text"])))
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


COMMENT ON TABLE "public"."employees" IS '員工主檔 - 管理員工基本資料、薪資結構、勞健保級距';



COMMENT ON COLUMN "public"."employees"."name" IS '員工姓名';



COMMENT ON COLUMN "public"."employees"."id_number" IS '身分證字號（敏感資料）';



COMMENT ON COLUMN "public"."employees"."employee_number" IS '員工編號（如 EMP001）';



COMMENT ON COLUMN "public"."employees"."status" IS '狀態：在職、留停、離職';



COMMENT ON COLUMN "public"."employees"."base_salary" IS '月薪本薪';



COMMENT ON COLUMN "public"."employees"."meal_allowance" IS '每月伙食津貼';



COMMENT ON COLUMN "public"."employees"."insurance_grade" IS '勞健保投保級距（1-60）';



COMMENT ON COLUMN "public"."employees"."has_labor_insurance" IS '是否投保勞保（預設：是）';



COMMENT ON COLUMN "public"."employees"."has_health_insurance" IS '是否投保健保（預設：是）';



COMMENT ON COLUMN "public"."employees"."user_id" IS '綁定的系統帳號 ID（1:1 對應）';



COMMENT ON COLUMN "public"."employees"."is_employer" IS '是否為雇主/負責人 — 影響勞健保計算規則（勞保全額自付、健保依眷屬口數、不適用勞退）';



COMMENT ON COLUMN "public"."employees"."dependents_count" IS '健保眷屬口數（僅雇主適用）— 用於計算雇主健保 = 投保薪資 × 健保費率 × (1 + 眷屬口數)';



CREATE TABLE IF NOT EXISTS "public"."expense_claims" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "year" integer DEFAULT EXTRACT(year FROM "now"()) NOT NULL,
    "claim_month" "text",
    "expense_type" "text" DEFAULT '其他支出'::"text" NOT NULL,
    "accounting_subject" "text",
    "amount" numeric(15,2) DEFAULT 0 NOT NULL,
    "tax_amount" numeric(15,2) DEFAULT 0,
    "total_amount" numeric(15,2) DEFAULT 0,
    "vendor_name" "text",
    "project_name" "text",
    "invoice_number" "text",
    "invoice_date" "date",
    "note" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "submitted_by" "uuid",
    "submitted_at" timestamp with time zone,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "rejected_by" "uuid",
    "rejected_at" timestamp with time zone,
    "rejection_reason" "text",
    "attachment_file_path" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "payment_target_type" "text",
    "withholding_month" "text",
    "payment_status" "text" DEFAULT 'unpaid'::"text",
    "paid_at" timestamp with time zone,
    "vendor_bank_type" "text",
    CONSTRAINT "expense_claims_expense_type_check" CHECK (("expense_type" = ANY (ARRAY['勞務報酬'::"text", '外包服務'::"text", '專案費用'::"text", '員工代墊'::"text", '營運費用'::"text", '其他支出'::"text", '沖帳免付'::"text", '代扣代繳'::"text"]))),
    CONSTRAINT "expense_claims_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['unpaid'::"text", 'paid'::"text"]))),
    CONSTRAINT "expense_claims_payment_target_type_check" CHECK (("payment_target_type" = ANY (ARRAY['kol'::"text", 'vendor'::"text", 'employee'::"text", 'other'::"text"]))),
    CONSTRAINT "expense_claims_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'submitted'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."expense_claims" OWNER TO "postgres";


COMMENT ON TABLE "public"."expense_claims" IS '個人請款申請 - 員工報帳用，核准後自動建立進項記錄';



COMMENT ON COLUMN "public"."expense_claims"."tax_amount" IS '稅額：有發票號碼時自動計算 amount × 5%，無發票時為 0';



COMMENT ON COLUMN "public"."expense_claims"."status" IS '狀態：draft（草稿）、submitted（已送出）、approved（已核准）、rejected（已駁回）';



COMMENT ON COLUMN "public"."expense_claims"."payment_target_type" IS '付款對象類型：kol、vendor、employee、other';



COMMENT ON COLUMN "public"."expense_claims"."withholding_month" IS '代扣代繳所屬月份 (格式同 claim_month: YYYY年M月)，僅 expense_type=代扣代繳 時使用';



COMMENT ON COLUMN "public"."expense_claims"."payment_status" IS '付款狀態：unpaid=未付, paid=已付（用於月結總覽追蹤代扣代繳代墊款）';



COMMENT ON COLUMN "public"."expense_claims"."paid_at" IS '實際付款時間';



COMMENT ON COLUMN "public"."expense_claims"."vendor_bank_type" IS '廠商帳戶類型：individual（個人戶）或 company（公司戶），用於代扣代繳判斷';



CREATE TABLE IF NOT EXISTS "public"."expense_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "default_subject" "text",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."expense_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."insurance_rate_tables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "grade" integer NOT NULL,
    "monthly_salary" integer NOT NULL,
    "labor_rate_total" numeric(6,4) DEFAULT 0.1150,
    "labor_rate_employee" numeric(6,4) DEFAULT 0.0230,
    "labor_rate_company" numeric(6,4) DEFAULT 0.0805,
    "labor_rate_government" numeric(6,4) DEFAULT 0.0115,
    "health_rate_total" numeric(6,4) DEFAULT 0.0517,
    "health_rate_employee" numeric(6,4) DEFAULT 0.0155,
    "health_rate_company" numeric(6,4) DEFAULT 0.0310,
    "health_rate_government" numeric(6,4) DEFAULT 0.0052,
    "supplementary_rate" numeric(6,4) DEFAULT 0.0217,
    "pension_rate_company" numeric(6,4) DEFAULT 0.0600,
    "pension_rate_employee" numeric(6,4) DEFAULT 0.0000,
    "occupational_injury_rate" numeric(6,4) DEFAULT 0.0021,
    "employment_stabilization_rate" numeric(6,4) DEFAULT 0.0010,
    "effective_date" "date" NOT NULL,
    "expiry_date" "date",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "employment_insurance_rate" numeric(6,4) DEFAULT 0.0100
);


ALTER TABLE "public"."insurance_rate_tables" OWNER TO "postgres";


COMMENT ON TABLE "public"."insurance_rate_tables" IS '勞健保費率表 - 管理台灣勞保、健保、勞退的投保級距與費率';



COMMENT ON COLUMN "public"."insurance_rate_tables"."grade" IS '投保級距（1-60）';



COMMENT ON COLUMN "public"."insurance_rate_tables"."monthly_salary" IS '月投保金額（元）';



COMMENT ON COLUMN "public"."insurance_rate_tables"."labor_rate_total" IS '勞保總費率（12%）';



COMMENT ON COLUMN "public"."insurance_rate_tables"."labor_rate_employee" IS '勞保個人負擔（2.4% = 20% of 12%）';



COMMENT ON COLUMN "public"."insurance_rate_tables"."labor_rate_company" IS '勞保公司負擔（8.4% = 70% of 12%）';



COMMENT ON COLUMN "public"."insurance_rate_tables"."health_rate_total" IS '健保總費率（5.17%）';



COMMENT ON COLUMN "public"."insurance_rate_tables"."health_rate_employee" IS '健保個人負擔（1.55% = 30% of 5.17%）';



COMMENT ON COLUMN "public"."insurance_rate_tables"."health_rate_company" IS '健保公司負擔（3.10% = 60% of 5.17%）';



COMMENT ON COLUMN "public"."insurance_rate_tables"."pension_rate_company" IS '勞退公司提繳率（6%）';



COMMENT ON COLUMN "public"."insurance_rate_tables"."effective_date" IS '生效日期';



COMMENT ON COLUMN "public"."insurance_rate_tables"."expiry_date" IS '失效日期（NULL = 目前有效）';



COMMENT ON COLUMN "public"."insurance_rate_tables"."employment_insurance_rate" IS '就業保險費率（預設 1%）— 被保險人 20%/投保單位 70%/政府 10%，雇主不適用';



CREATE TABLE IF NOT EXISTS "public"."insurance_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "default_dependents" numeric(4,2) DEFAULT 0.58 NOT NULL,
    "note" "text",
    "effective_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "expiry_date" "date",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid"
);


ALTER TABLE "public"."insurance_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."insurance_settings" IS '保險設定 — 管理公司級保險參數（預設眷屬口數等）';



COMMENT ON COLUMN "public"."insurance_settings"."default_dependents" IS '預設平均眷屬口數（政府公告值）— 雇主未設定個人眷屬口數時使用此值';



CREATE TABLE IF NOT EXISTS "public"."kol_services" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "kol_id" "uuid",
    "service_type_id" "uuid",
    "price" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_quote_info" "text",
    "cost" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."kol_services" OWNER TO "postgres";


COMMENT ON COLUMN "public"."kol_services"."last_quote_info" IS '最後更新價格的報價單資訊（專案名稱 + 日期）';



COMMENT ON COLUMN "public"."kol_services"."cost" IS 'KOL 服務成本（來自報價單項目的 cost 欄位）';



CREATE TABLE IF NOT EXISTS "public"."kol_types" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."kol_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kols" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "real_name" "text",
    "type_id" "uuid",
    "social_links" "jsonb",
    "bank_info" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "withholding_exempt" boolean DEFAULT false,
    "withholding_exempt_reason" "text",
    "created_by" "uuid"
);


ALTER TABLE "public"."kols" OWNER TO "postgres";


COMMENT ON COLUMN "public"."kols"."withholding_exempt" IS '是否免扣代繳（如已加入職業公會）';



COMMENT ON COLUMN "public"."kols"."withholding_exempt_reason" IS '免扣原因說明';



CREATE TABLE IF NOT EXISTS "public"."page_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "page_key" character varying(50) NOT NULL,
    "page_name" character varying(100) NOT NULL,
    "allowed_roles" "public"."user_role"[] NOT NULL,
    "allowed_functions" "text"[] DEFAULT ARRAY[]::"text"[],
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."page_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_confirmation_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_confirmation_id" "uuid" NOT NULL,
    "payment_request_id" "uuid",
    "amount_at_confirmation" numeric(12,2) NOT NULL,
    "kol_name_at_confirmation" "text" NOT NULL,
    "project_name_at_confirmation" "text" NOT NULL,
    "service_at_confirmation" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expense_claim_id" "uuid",
    "source_type" "text" DEFAULT 'project'::"text",
    "quotation_item_id" "uuid",
    CONSTRAINT "payment_confirmation_items_source_type_check" CHECK (("source_type" = ANY (ARRAY['project'::"text", 'personal'::"text", 'quotation'::"text"])))
);


ALTER TABLE "public"."payment_confirmation_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."payment_confirmation_items"."quotation_item_id" IS '關聯的報價項目 ID（新流程直接連結）';



CREATE TABLE IF NOT EXISTS "public"."payment_confirmations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "confirmation_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_items" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "remittance_settings" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."payment_confirmations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."payment_confirmations"."remittance_settings" IS 'Stores remittance group settings (Fee, Tax, Insurance). Force refresh.';



CREATE TABLE IF NOT EXISTS "public"."payment_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quotation_item_id" "uuid" NOT NULL,
    "request_date" timestamp with time zone DEFAULT "now"(),
    "verification_status" "text" DEFAULT 'pending'::"text",
    "merge_type" "text",
    "merge_group_id" "text",
    "is_merge_leader" boolean DEFAULT false,
    "merge_color" "text",
    "attachment_file_path" "text",
    "invoice_number" "text",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "rejected_by" "uuid",
    "rejected_at" timestamp with time zone,
    "rejection_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "cost_amount" numeric,
    "expense_type" "text" DEFAULT '勞務報酬'::"text",
    "expected_payment_month" "text",
    "accounting_subject" "text",
    "created_by" "uuid",
    CONSTRAINT "payment_requests_expense_type_check" CHECK (("expense_type" = ANY (ARRAY['勞務報酬'::"text", '外包服務'::"text", '專案費用'::"text", '員工代墊'::"text", '營運費用'::"text", '其他支出'::"text", '沖帳免付'::"text", '代扣代繳'::"text"]))),
    CONSTRAINT "payment_requests_merge_type_check" CHECK (("merge_type" = ANY (ARRAY['company'::"text", 'account'::"text"]))),
    CONSTRAINT "payment_requests_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'confirmed'::"text"])))
);


ALTER TABLE "public"."payment_requests" OWNER TO "postgres";


COMMENT ON COLUMN "public"."payment_requests"."expense_type" IS '支出種類（由申請人選擇，預設勞務報酬）';



COMMENT ON COLUMN "public"."payment_requests"."accounting_subject" IS '會計科目（申請人預設值，核准者可覆蓋；NULL 表示由系統依 expense_type 推斷）';



CREATE TABLE IF NOT EXISTS "public"."quotation_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "quotation_id" "uuid",
    "category" "text",
    "kol_id" "uuid",
    "service" "text" NOT NULL,
    "quantity" integer DEFAULT 1,
    "price" numeric(10,2) DEFAULT 0 NOT NULL,
    "remark" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "cost" numeric DEFAULT 0,
    "remittance_name" "text",
    "created_by" "uuid",
    "cost_amount" numeric(12,2),
    "invoice_number" "text",
    "attachments" "jsonb" DEFAULT '[]'::"jsonb",
    "expense_type" "text" DEFAULT '勞務報酬'::"text",
    "accounting_subject" "text",
    "expected_payment_month" "text",
    "requested_at" timestamp with time zone,
    "requested_by" "uuid",
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "rejection_reason" "text",
    "rejected_at" timestamp with time zone,
    "rejected_by" "uuid",
    "merge_group_id" "uuid",
    "is_merge_leader" boolean DEFAULT false,
    "merge_color" "text"
);


ALTER TABLE "public"."quotation_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."quotation_items"."cost" IS '成本金額';



COMMENT ON COLUMN "public"."quotation_items"."cost_amount" IS '請款金額（預設等於 cost，可獨立修改）';



COMMENT ON COLUMN "public"."quotation_items"."invoice_number" IS '發票號碼（格式: XX-12345678）';



COMMENT ON COLUMN "public"."quotation_items"."attachments" IS '附件列表 JSON array';



COMMENT ON COLUMN "public"."quotation_items"."expense_type" IS '支出種類（勞務報酬、外包服務等）';



COMMENT ON COLUMN "public"."quotation_items"."accounting_subject" IS '會計科目';



COMMENT ON COLUMN "public"."quotation_items"."expected_payment_month" IS '預計支付月份（如 2026年3月）';



COMMENT ON COLUMN "public"."quotation_items"."requested_at" IS '請款送出時間（Member+ 勾選）';



COMMENT ON COLUMN "public"."quotation_items"."approved_at" IS '審核通過時間（Editor+ 勾選）';



COMMENT ON COLUMN "public"."quotation_items"."rejection_reason" IS '駁回原因';



COMMENT ON COLUMN "public"."quotation_items"."merge_group_id" IS '合併群組 ID';



COMMENT ON COLUMN "public"."quotation_items"."is_merge_leader" IS '是否為合併群組主項目';



CREATE TABLE IF NOT EXISTS "public"."quotations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_name" "text" NOT NULL,
    "client_id" "uuid",
    "client_contact" "text",
    "payment_method" "public"."payment_method" DEFAULT '電匯'::"public"."payment_method",
    "subtotal_untaxed" numeric(10,2) DEFAULT 0,
    "tax" numeric(10,2) DEFAULT 0,
    "grand_total_taxed" numeric(10,2) DEFAULT 0,
    "has_discount" boolean DEFAULT false,
    "discounted_price" numeric(10,2),
    "status" "public"."quotation_status" DEFAULT '草稿'::"public"."quotation_status",
    "terms" "text",
    "remarks" "text",
    "attachments" "jsonb"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "contact_email" "text",
    "contact_phone" "text",
    "created_by" "uuid"
);


ALTER TABLE "public"."quotations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."quotations"."contact_email" IS 'Snapshot of the contact email at the time of quote creation/update';



COMMENT ON COLUMN "public"."quotations"."contact_phone" IS 'Snapshot of the contact phone at the time of quote creation/update';



CREATE OR REPLACE VIEW "public"."payment_requests_with_details" AS
 SELECT "pr"."id",
    "pr"."quotation_item_id",
    "pr"."request_date",
    "pr"."verification_status",
    "pr"."merge_type",
    "pr"."merge_group_id",
    "pr"."is_merge_leader",
    "pr"."merge_color",
    "pr"."attachment_file_path",
    "pr"."invoice_number",
    "pr"."approved_by",
    "pr"."approved_at",
    "pr"."rejected_by",
    "pr"."rejected_at",
    "pr"."rejection_reason",
    "pr"."created_at",
    "pr"."updated_at",
    "pr"."cost_amount",
    "qi"."service",
    "qi"."quantity",
    "qi"."price",
    "qi"."category",
    "qi"."remark",
    "q"."project_name",
    "q"."status" AS "quotation_status",
    "k"."name" AS "kol_name",
    "k"."real_name" AS "kol_real_name",
    "k"."bank_info" AS "kol_bank_info",
    "c"."name" AS "client_name"
   FROM (((("public"."payment_requests" "pr"
     LEFT JOIN "public"."quotation_items" "qi" ON (("pr"."quotation_item_id" = "qi"."id")))
     LEFT JOIN "public"."quotations" "q" ON (("qi"."quotation_id" = "q"."id")))
     LEFT JOIN "public"."kols" "k" ON (("qi"."kol_id" = "k"."id")))
     LEFT JOIN "public"."clients" "c" ON (("q"."client_id" = "c"."id")));


ALTER VIEW "public"."payment_requests_with_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "email" "text" NOT NULL,
    "role" "public"."user_role" DEFAULT 'Member'::"public"."user_role",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."project_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "client_name" "text" NOT NULL,
    "project_name" "text" NOT NULL,
    "project_type" "text" DEFAULT '專案'::"text" NOT NULL,
    "budget_with_tax" numeric(15,2) DEFAULT 0,
    "notes" "text",
    "status" "text" DEFAULT '洽談中'::"text" NOT NULL,
    "quotation_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "projects_project_type_check" CHECK (("project_type" = ANY (ARRAY['專案'::"text", '經紀'::"text"]))),
    CONSTRAINT "projects_status_check" CHECK (("status" = ANY (ARRAY['洽談中'::"text", '執行中'::"text", '結案中'::"text", '關案'::"text"])))
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


COMMENT ON TABLE "public"."projects" IS '專案進度管理 - 追蹤專案從洽談到結案的完整生命週期';



COMMENT ON COLUMN "public"."projects"."client_id" IS '客戶 FK，搜尋選取現有客戶時連結';



COMMENT ON COLUMN "public"."projects"."client_name" IS '廠商名稱（文字快照，保留建立時名稱）';



COMMENT ON COLUMN "public"."projects"."project_name" IS '專案名稱';



COMMENT ON COLUMN "public"."projects"."project_type" IS '案件類型：專案、經紀';



COMMENT ON COLUMN "public"."projects"."budget_with_tax" IS '專案預算（含稅）';



COMMENT ON COLUMN "public"."projects"."status" IS '專案進度：洽談中、執行中、結案中、關案';



COMMENT ON COLUMN "public"."projects"."quotation_id" IS '關聯報價單 ID（洽談中為 NULL，建立報價單後填入）';



CREATE TABLE IF NOT EXISTS "public"."quote_categories" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."quote_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_types" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."service_types" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_permissions" AS
 SELECT "p"."id",
    "p"."email",
    "p"."role",
    "pp"."page_key",
    "pp"."page_name",
    "pp"."allowed_functions"
   FROM ("public"."profiles" "p"
     CROSS JOIN "public"."page_permissions" "pp")
  WHERE ("p"."role" = ANY ("pp"."allowed_roles"));


ALTER VIEW "public"."user_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."withholding_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "income_tax_rate" numeric(6,4) DEFAULT 0.10 NOT NULL,
    "nhi_supplement_rate" numeric(6,4) DEFAULT 0.0211 NOT NULL,
    "income_tax_threshold" integer DEFAULT 20010 NOT NULL,
    "nhi_threshold" integer DEFAULT 20000 NOT NULL,
    "remittance_fee_default" integer DEFAULT 30 NOT NULL,
    "effective_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "expiry_date" "date",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid"
);


ALTER TABLE "public"."withholding_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."withholding_settings" IS '代扣代繳費率設定（所得稅、二代健保補充保費）';



COMMENT ON COLUMN "public"."withholding_settings"."income_tax_rate" IS '所得稅扣繳率（如 0.10 = 10%）';



COMMENT ON COLUMN "public"."withholding_settings"."nhi_supplement_rate" IS '二代健保補充保費率（如 0.0211 = 2.11%）';



COMMENT ON COLUMN "public"."withholding_settings"."income_tax_threshold" IS '所得稅起扣門檻（單次給付金額）';



COMMENT ON COLUMN "public"."withholding_settings"."nhi_threshold" IS '二代健保起扣門檻（單次給付金額）';



COMMENT ON COLUMN "public"."withholding_settings"."remittance_fee_default" IS '匯費預設金額';



CREATE TABLE IF NOT EXISTS "public"."withholding_settlements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "month" "text" NOT NULL,
    "type" "text" NOT NULL,
    "amount" integer NOT NULL,
    "settlement_method" "text" DEFAULT 'company_direct'::"text" NOT NULL,
    "expense_claim_id" "uuid",
    "note" "text",
    "settled_by" "uuid",
    "settled_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "withholding_settlements_settlement_method_check" CHECK (("settlement_method" = ANY (ARRAY['company_direct'::"text", 'employee_advance'::"text"]))),
    CONSTRAINT "withholding_settlements_type_check" CHECK (("type" = ANY (ARRAY['income_tax'::"text", 'nhi_supplement'::"text"])))
);


ALTER TABLE "public"."withholding_settlements" OWNER TO "postgres";


COMMENT ON TABLE "public"."withholding_settlements" IS '代扣代繳繳納記錄（所得稅/二代健保 繳納給政府的紀錄）';



COMMENT ON COLUMN "public"."withholding_settlements"."month" IS '代扣所屬月份，格式 YYYY-MM';



COMMENT ON COLUMN "public"."withholding_settlements"."type" IS 'income_tax=所得稅, nhi_supplement=二代健保補充保費';



COMMENT ON COLUMN "public"."withholding_settlements"."settlement_method" IS 'company_direct=公司直接繳, employee_advance=員工代墊';



ALTER TABLE ONLY "public"."accounting_expenses"
    ADD CONSTRAINT "accounting_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounting_payroll"
    ADD CONSTRAINT "accounting_payroll_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounting_reconciliation"
    ADD CONSTRAINT "accounting_reconciliation_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounting_sales"
    ADD CONSTRAINT "accounting_sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounting_subjects"
    ADD CONSTRAINT "accounting_subjects_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."accounting_subjects"
    ADD CONSTRAINT "accounting_subjects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_employee_number_key" UNIQUE ("employee_number");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_id_number_key" UNIQUE ("id_number");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."expense_claims"
    ADD CONSTRAINT "expense_claims_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_types"
    ADD CONSTRAINT "expense_types_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."expense_types"
    ADD CONSTRAINT "expense_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."insurance_rate_tables"
    ADD CONSTRAINT "insurance_rate_tables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."insurance_settings"
    ADD CONSTRAINT "insurance_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kol_services"
    ADD CONSTRAINT "kol_services_kol_id_service_type_id_key" UNIQUE ("kol_id", "service_type_id");



ALTER TABLE ONLY "public"."kol_services"
    ADD CONSTRAINT "kol_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kol_types"
    ADD CONSTRAINT "kol_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kols"
    ADD CONSTRAINT "kols_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page_permissions"
    ADD CONSTRAINT "page_permissions_page_key_key" UNIQUE ("page_key");



ALTER TABLE ONLY "public"."page_permissions"
    ADD CONSTRAINT "page_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_confirmation_items"
    ADD CONSTRAINT "payment_confirmation_items_payment_confirmation_id_payment__key" UNIQUE ("payment_confirmation_id", "payment_request_id");



ALTER TABLE ONLY "public"."payment_confirmation_items"
    ADD CONSTRAINT "payment_confirmation_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_confirmations"
    ADD CONSTRAINT "payment_confirmations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_requests"
    ADD CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_notes"
    ADD CONSTRAINT "project_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotation_items"
    ADD CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quote_categories"
    ADD CONSTRAINT "quote_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounting_reconciliation"
    ADD CONSTRAINT "reconciliation_year_month_unique" UNIQUE ("year", "month");



ALTER TABLE ONLY "public"."service_types"
    ADD CONSTRAINT "service_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."withholding_settings"
    ADD CONSTRAINT "withholding_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."withholding_settlements"
    ADD CONSTRAINT "withholding_settlements_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_accounting_expenses_created_by" ON "public"."accounting_expenses" USING "btree" ("created_by");



CREATE UNIQUE INDEX "idx_accounting_expenses_expense_claim_id" ON "public"."accounting_expenses" USING "btree" ("expense_claim_id") WHERE ("expense_claim_id" IS NOT NULL);



CREATE INDEX "idx_accounting_expenses_expense_month_status" ON "public"."accounting_expenses" USING "btree" ("expense_month", "payment_status");



CREATE UNIQUE INDEX "idx_accounting_expenses_payment_request_id" ON "public"."accounting_expenses" USING "btree" ("payment_request_id") WHERE ("payment_request_id" IS NOT NULL);



CREATE INDEX "idx_accounting_expenses_payment_status" ON "public"."accounting_expenses" USING "btree" ("payment_status");



CREATE INDEX "idx_accounting_expenses_payment_target" ON "public"."accounting_expenses" USING "btree" ("payment_target_type");



CREATE INDEX "idx_accounting_expenses_project" ON "public"."accounting_expenses" USING "btree" ("project_name");



CREATE INDEX "idx_accounting_expenses_submitted_by" ON "public"."accounting_expenses" USING "btree" ("submitted_by") WHERE ("submitted_by" IS NOT NULL);



CREATE INDEX "idx_accounting_expenses_type" ON "public"."accounting_expenses" USING "btree" ("expense_type");



CREATE INDEX "idx_accounting_expenses_year" ON "public"."accounting_expenses" USING "btree" ("year");



CREATE INDEX "idx_accounting_payroll_created_by" ON "public"."accounting_payroll" USING "btree" ("created_by");



CREATE INDEX "idx_accounting_payroll_employee" ON "public"."accounting_payroll" USING "btree" ("employee_name");



CREATE INDEX "idx_accounting_payroll_employee_id" ON "public"."accounting_payroll" USING "btree" ("employee_id");



CREATE INDEX "idx_accounting_payroll_employee_year" ON "public"."accounting_payroll" USING "btree" ("employee_id", "year");



CREATE INDEX "idx_accounting_payroll_payment_status" ON "public"."accounting_payroll" USING "btree" ("payment_status");



CREATE INDEX "idx_accounting_payroll_salary_month" ON "public"."accounting_payroll" USING "btree" ("salary_month");



CREATE INDEX "idx_accounting_payroll_salary_month_status" ON "public"."accounting_payroll" USING "btree" ("salary_month", "payment_status");



CREATE INDEX "idx_accounting_payroll_year" ON "public"."accounting_payroll" USING "btree" ("year");



CREATE INDEX "idx_accounting_sales_created_by" ON "public"."accounting_sales" USING "btree" ("created_by");



CREATE INDEX "idx_accounting_sales_project" ON "public"."accounting_sales" USING "btree" ("project_name");



CREATE UNIQUE INDEX "idx_accounting_sales_quotation_id" ON "public"."accounting_sales" USING "btree" ("quotation_id") WHERE ("quotation_id" IS NOT NULL);



CREATE INDEX "idx_accounting_sales_year" ON "public"."accounting_sales" USING "btree" ("year");



CREATE INDEX "idx_ae_quotation_item_id" ON "public"."accounting_expenses" USING "btree" ("quotation_item_id") WHERE ("quotation_item_id" IS NOT NULL);



CREATE INDEX "idx_audit_log_performed_at" ON "public"."audit_log" USING "btree" ("performed_at" DESC);



CREATE INDEX "idx_audit_log_performed_by" ON "public"."audit_log" USING "btree" ("performed_by");



CREATE INDEX "idx_audit_log_table_record" ON "public"."audit_log" USING "btree" ("table_name", "record_id");



CREATE INDEX "idx_clients_contacts_gin" ON "public"."clients" USING "gin" ("contacts");



CREATE INDEX "idx_clients_created_by" ON "public"."clients" USING "btree" ("created_by");



CREATE INDEX "idx_clients_email" ON "public"."clients" USING "btree" ("email");



CREATE INDEX "idx_clients_name" ON "public"."clients" USING "btree" ("name");



CREATE INDEX "idx_employees_created_by" ON "public"."employees" USING "btree" ("created_by");



CREATE INDEX "idx_employees_employee_number" ON "public"."employees" USING "btree" ("employee_number");



CREATE INDEX "idx_employees_name" ON "public"."employees" USING "btree" ("name");



CREATE INDEX "idx_employees_status" ON "public"."employees" USING "btree" ("status");



CREATE INDEX "idx_employees_user_id" ON "public"."employees" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_expense_claims_created_by" ON "public"."expense_claims" USING "btree" ("created_by");



CREATE INDEX "idx_expense_claims_month_type_status" ON "public"."expense_claims" USING "btree" ("claim_month", "expense_type", "status");



CREATE INDEX "idx_expense_claims_payment_status" ON "public"."expense_claims" USING "btree" ("payment_status");



CREATE INDEX "idx_expense_claims_status" ON "public"."expense_claims" USING "btree" ("status");



CREATE INDEX "idx_expense_claims_submitted_by" ON "public"."expense_claims" USING "btree" ("submitted_by");



CREATE INDEX "idx_expense_claims_year_project" ON "public"."expense_claims" USING "btree" ("year", "project_name");



CREATE INDEX "idx_expense_claims_year_status" ON "public"."expense_claims" USING "btree" ("year", "status");



CREATE INDEX "idx_insurance_effective_date" ON "public"."insurance_rate_tables" USING "btree" ("effective_date");



CREATE INDEX "idx_insurance_grade" ON "public"."insurance_rate_tables" USING "btree" ("grade");



CREATE INDEX "idx_insurance_grade_date" ON "public"."insurance_rate_tables" USING "btree" ("grade", "effective_date");



CREATE INDEX "idx_insurance_rates_active" ON "public"."insurance_rate_tables" USING "btree" ("grade") WHERE ("expiry_date" IS NULL);



CREATE INDEX "idx_insurance_settings_effective_date" ON "public"."insurance_settings" USING "btree" ("effective_date" DESC);



CREATE INDEX "idx_kol_services_kol_id" ON "public"."kol_services" USING "btree" ("kol_id");



CREATE INDEX "idx_kol_services_service_type_id" ON "public"."kol_services" USING "btree" ("service_type_id");



CREATE INDEX "idx_kols_created_by" ON "public"."kols" USING "btree" ("created_by");



CREATE INDEX "idx_kols_name" ON "public"."kols" USING "btree" ("name");



CREATE INDEX "idx_kols_type_id" ON "public"."kols" USING "btree" ("type_id");



CREATE INDEX "idx_page_permissions_page_key" ON "public"."page_permissions" USING "btree" ("page_key");



CREATE INDEX "idx_payment_confirmation_items_expense_claim_id" ON "public"."payment_confirmation_items" USING "btree" ("expense_claim_id") WHERE ("expense_claim_id" IS NOT NULL);



CREATE INDEX "idx_payment_confirmation_items_payment_confirmation_id" ON "public"."payment_confirmation_items" USING "btree" ("payment_confirmation_id");



CREATE UNIQUE INDEX "idx_payment_confirmation_items_unique_claim" ON "public"."payment_confirmation_items" USING "btree" ("payment_confirmation_id", "expense_claim_id") WHERE ("expense_claim_id" IS NOT NULL);



CREATE INDEX "idx_payment_confirmations_confirmation_date" ON "public"."payment_confirmations" USING "btree" ("confirmation_date");



CREATE INDEX "idx_payment_confirmations_created_by" ON "public"."payment_confirmations" USING "btree" ("created_by");



CREATE INDEX "idx_payment_requests_approved_by" ON "public"."payment_requests" USING "btree" ("approved_by");



CREATE INDEX "idx_payment_requests_created_by" ON "public"."payment_requests" USING "btree" ("created_by");



CREATE INDEX "idx_payment_requests_merge_group_id" ON "public"."payment_requests" USING "btree" ("merge_group_id");



CREATE INDEX "idx_payment_requests_quotation_item_id" ON "public"."payment_requests" USING "btree" ("quotation_item_id");



CREATE INDEX "idx_payment_requests_rejected_by" ON "public"."payment_requests" USING "btree" ("rejected_by");



CREATE INDEX "idx_payment_requests_request_date" ON "public"."payment_requests" USING "btree" ("request_date");



CREATE INDEX "idx_payment_requests_status_date" ON "public"."payment_requests" USING "btree" ("verification_status", "request_date");



CREATE INDEX "idx_payment_requests_verification_status" ON "public"."payment_requests" USING "btree" ("verification_status");



CREATE INDEX "idx_pci_quotation_item_id" ON "public"."payment_confirmation_items" USING "btree" ("quotation_item_id") WHERE ("quotation_item_id" IS NOT NULL);



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_project_notes_created_at" ON "public"."project_notes" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_project_notes_project_id" ON "public"."project_notes" USING "btree" ("project_id");



CREATE INDEX "idx_projects_client_id" ON "public"."projects" USING "btree" ("client_id");



CREATE INDEX "idx_projects_created_at" ON "public"."projects" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_projects_quotation_id" ON "public"."projects" USING "btree" ("quotation_id");



CREATE INDEX "idx_projects_status" ON "public"."projects" USING "btree" ("status");



CREATE INDEX "idx_qi_approved_at" ON "public"."quotation_items" USING "btree" ("approved_at") WHERE ("approved_at" IS NOT NULL);



CREATE INDEX "idx_qi_merge_group_id" ON "public"."quotation_items" USING "btree" ("merge_group_id") WHERE ("merge_group_id" IS NOT NULL);



CREATE INDEX "idx_qi_requested_at" ON "public"."quotation_items" USING "btree" ("requested_at") WHERE ("requested_at" IS NOT NULL);



CREATE INDEX "idx_quotation_items_created_by" ON "public"."quotation_items" USING "btree" ("created_by");



CREATE INDEX "idx_quotation_items_kol_id" ON "public"."quotation_items" USING "btree" ("kol_id");



CREATE INDEX "idx_quotation_items_quotation_id" ON "public"."quotation_items" USING "btree" ("quotation_id");



CREATE INDEX "idx_quotation_items_service" ON "public"."quotation_items" USING "btree" ("service");



CREATE INDEX "idx_quotations_client_id" ON "public"."quotations" USING "btree" ("client_id");



CREATE INDEX "idx_quotations_created_at" ON "public"."quotations" USING "btree" ("created_at");



CREATE INDEX "idx_quotations_created_by" ON "public"."quotations" USING "btree" ("created_by");



CREATE INDEX "idx_quotations_status" ON "public"."quotations" USING "btree" ("status");



CREATE INDEX "idx_reconciliation_year_month" ON "public"."accounting_reconciliation" USING "btree" ("year", "month");



CREATE INDEX "idx_users_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_withholding_settings_effective_date" ON "public"."withholding_settings" USING "btree" ("effective_date" DESC);



CREATE INDEX "idx_withholding_settlements_expense_claim" ON "public"."withholding_settlements" USING "btree" ("expense_claim_id") WHERE ("expense_claim_id" IS NOT NULL);



CREATE INDEX "idx_withholding_settlements_month_type" ON "public"."withholding_settlements" USING "btree" ("month", "type");



CREATE UNIQUE INDEX "idx_withholding_settlements_unique_claim" ON "public"."withholding_settlements" USING "btree" ("expense_claim_id") WHERE ("expense_claim_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "accounting_expenses_updated_at" BEFORE UPDATE ON "public"."accounting_expenses" FOR EACH ROW EXECUTE FUNCTION "public"."update_accounting_updated_at"();



CREATE OR REPLACE TRIGGER "accounting_payroll_updated_at" BEFORE UPDATE ON "public"."accounting_payroll" FOR EACH ROW EXECUTE FUNCTION "public"."update_accounting_updated_at"();



CREATE OR REPLACE TRIGGER "accounting_sales_updated_at" BEFORE UPDATE ON "public"."accounting_sales" FOR EACH ROW EXECUTE FUNCTION "public"."update_accounting_updated_at"();



CREATE OR REPLACE TRIGGER "employees_updated_at" BEFORE UPDATE ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."update_accounting_updated_at"();



CREATE OR REPLACE TRIGGER "expense_claims_updated_at" BEFORE UPDATE ON "public"."expense_claims" FOR EACH ROW EXECUTE FUNCTION "public"."update_accounting_updated_at"();



CREATE OR REPLACE TRIGGER "insurance_rate_tables_updated_at" BEFORE UPDATE ON "public"."insurance_rate_tables" FOR EACH ROW EXECUTE FUNCTION "public"."update_accounting_updated_at"();



CREATE OR REPLACE TRIGGER "insurance_settings_updated_at" BEFORE UPDATE ON "public"."insurance_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_accounting_updated_at"();



CREATE OR REPLACE TRIGGER "projects_updated_at" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."update_accounting_updated_at"();



CREATE OR REPLACE TRIGGER "reconciliation_updated_at" BEFORE UPDATE ON "public"."accounting_reconciliation" FOR EACH ROW EXECUTE FUNCTION "public"."update_accounting_updated_at"();



CREATE OR REPLACE TRIGGER "trg_audit_delete_clients" BEFORE DELETE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."log_delete"();



CREATE OR REPLACE TRIGGER "trg_audit_delete_kols" BEFORE DELETE ON "public"."kols" FOR EACH ROW EXECUTE FUNCTION "public"."log_delete"();



CREATE OR REPLACE TRIGGER "trg_audit_delete_quotation_items" BEFORE DELETE ON "public"."quotation_items" FOR EACH ROW EXECUTE FUNCTION "public"."log_delete"();



CREATE OR REPLACE TRIGGER "trg_audit_delete_quotations" BEFORE DELETE ON "public"."quotations" FOR EACH ROW EXECUTE FUNCTION "public"."log_delete"();



CREATE OR REPLACE TRIGGER "trg_expenses_sync_payment_status" BEFORE UPDATE ON "public"."accounting_expenses" FOR EACH ROW EXECUTE FUNCTION "public"."sync_payment_status_from_date"();



CREATE OR REPLACE TRIGGER "trg_payroll_sync_payment_status" BEFORE UPDATE ON "public"."accounting_payroll" FOR EACH ROW EXECUTE FUNCTION "public"."sync_payment_status_from_date"();



CREATE OR REPLACE TRIGGER "trg_set_created_by_clients" BEFORE INSERT ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."set_created_by"();



CREATE OR REPLACE TRIGGER "trg_set_created_by_kols" BEFORE INSERT ON "public"."kols" FOR EACH ROW EXECUTE FUNCTION "public"."set_created_by"();



CREATE OR REPLACE TRIGGER "trg_set_created_by_payment_requests" BEFORE INSERT ON "public"."payment_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_created_by"();



CREATE OR REPLACE TRIGGER "trg_set_created_by_quotation_items" BEFORE INSERT ON "public"."quotation_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_created_by"();



CREATE OR REPLACE TRIGGER "trg_set_created_by_quotations" BEFORE INSERT ON "public"."quotations" FOR EACH ROW EXECUTE FUNCTION "public"."set_created_by"();



CREATE OR REPLACE TRIGGER "update_clients_updated_at" BEFORE UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_kol_services_updated_at" BEFORE UPDATE ON "public"."kol_services" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_kols_updated_at" BEFORE UPDATE ON "public"."kols" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_page_permissions_updated_at" BEFORE UPDATE ON "public"."page_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_payment_confirmations_updated_at" BEFORE UPDATE ON "public"."payment_confirmations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_payment_requests_updated_at" BEFORE UPDATE ON "public"."payment_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_quotations_updated_at" BEFORE UPDATE ON "public"."quotations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_users_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."accounting_expenses"
    ADD CONSTRAINT "accounting_expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."accounting_expenses"
    ADD CONSTRAINT "accounting_expenses_expense_claim_id_fkey" FOREIGN KEY ("expense_claim_id") REFERENCES "public"."expense_claims"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."accounting_expenses"
    ADD CONSTRAINT "accounting_expenses_payment_confirmation_id_fkey" FOREIGN KEY ("payment_confirmation_id") REFERENCES "public"."payment_confirmations"("id");



ALTER TABLE ONLY "public"."accounting_expenses"
    ADD CONSTRAINT "accounting_expenses_payment_request_id_fkey" FOREIGN KEY ("payment_request_id") REFERENCES "public"."payment_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."accounting_expenses"
    ADD CONSTRAINT "accounting_expenses_quotation_item_id_fkey" FOREIGN KEY ("quotation_item_id") REFERENCES "public"."quotation_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."accounting_expenses"
    ADD CONSTRAINT "accounting_expenses_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."accounting_payroll"
    ADD CONSTRAINT "accounting_payroll_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."accounting_payroll"
    ADD CONSTRAINT "accounting_payroll_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."accounting_reconciliation"
    ADD CONSTRAINT "accounting_reconciliation_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."accounting_reconciliation"
    ADD CONSTRAINT "accounting_reconciliation_reconciled_by_fkey" FOREIGN KEY ("reconciled_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."accounting_sales"
    ADD CONSTRAINT "accounting_sales_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."accounting_sales"
    ADD CONSTRAINT "accounting_sales_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expense_claims"
    ADD CONSTRAINT "expense_claims_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."expense_claims"
    ADD CONSTRAINT "expense_claims_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."expense_claims"
    ADD CONSTRAINT "expense_claims_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."expense_claims"
    ADD CONSTRAINT "expense_claims_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."expense_claims"
    ADD CONSTRAINT "expense_claims_submitted_by_profiles_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."insurance_settings"
    ADD CONSTRAINT "insurance_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."kol_services"
    ADD CONSTRAINT "kol_services_kol_id_fkey" FOREIGN KEY ("kol_id") REFERENCES "public"."kols"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kol_services"
    ADD CONSTRAINT "kol_services_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kols"
    ADD CONSTRAINT "kols_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."kols"
    ADD CONSTRAINT "kols_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "public"."kol_types"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_confirmation_items"
    ADD CONSTRAINT "payment_confirmation_items_expense_claim_id_fkey" FOREIGN KEY ("expense_claim_id") REFERENCES "public"."expense_claims"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_confirmation_items"
    ADD CONSTRAINT "payment_confirmation_items_payment_confirmation_id_fkey" FOREIGN KEY ("payment_confirmation_id") REFERENCES "public"."payment_confirmations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_confirmation_items"
    ADD CONSTRAINT "payment_confirmation_items_payment_request_id_fkey" FOREIGN KEY ("payment_request_id") REFERENCES "public"."payment_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_confirmation_items"
    ADD CONSTRAINT "payment_confirmation_items_quotation_item_id_fkey" FOREIGN KEY ("quotation_item_id") REFERENCES "public"."quotation_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_confirmations"
    ADD CONSTRAINT "payment_confirmations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payment_requests"
    ADD CONSTRAINT "payment_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payment_requests"
    ADD CONSTRAINT "payment_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."payment_requests"
    ADD CONSTRAINT "payment_requests_quotation_item_id_fkey" FOREIGN KEY ("quotation_item_id") REFERENCES "public"."quotation_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_requests"
    ADD CONSTRAINT "payment_requests_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_notes"
    ADD CONSTRAINT "project_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."project_notes"
    ADD CONSTRAINT "project_notes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quotation_items"
    ADD CONSTRAINT "quotation_items_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."quotation_items"
    ADD CONSTRAINT "quotation_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."quotation_items"
    ADD CONSTRAINT "quotation_items_kol_id_fkey" FOREIGN KEY ("kol_id") REFERENCES "public"."kols"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quotation_items"
    ADD CONSTRAINT "quotation_items_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quotation_items"
    ADD CONSTRAINT "quotation_items_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."quotation_items"
    ADD CONSTRAINT "quotation_items_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."withholding_settings"
    ADD CONSTRAINT "withholding_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."withholding_settlements"
    ADD CONSTRAINT "withholding_settlements_expense_claim_id_fkey" FOREIGN KEY ("expense_claim_id") REFERENCES "public"."expense_claims"("id");



ALTER TABLE ONLY "public"."withholding_settlements"
    ADD CONSTRAINT "withholding_settlements_settled_by_fkey" FOREIGN KEY ("settled_by") REFERENCES "auth"."users"("id");



ALTER TABLE "public"."accounting_expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "accounting_expenses_delete_admin_policy" ON "public"."accounting_expenses" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'Admin'::"public"."user_role")))));



CREATE POLICY "accounting_expenses_delete_authenticated_policy" ON "public"."accounting_expenses" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "accounting_expenses_delete_policy" ON "public"."accounting_expenses" FOR DELETE TO "authenticated" USING ((( SELECT ("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))) OR (( SELECT "auth"."uid"() AS "uid") = "created_by")));



CREATE POLICY "accounting_expenses_insert_admin_policy" ON "public"."accounting_expenses" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'Admin'::"public"."user_role")))));



CREATE POLICY "accounting_expenses_insert_authenticated_policy" ON "public"."accounting_expenses" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "accounting_expenses_select_authenticated_policy" ON "public"."accounting_expenses" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "accounting_expenses_update_admin_policy" ON "public"."accounting_expenses" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'Admin'::"public"."user_role")))));



CREATE POLICY "accounting_expenses_update_authenticated_policy" ON "public"."accounting_expenses" FOR UPDATE TO "authenticated" USING (true);



ALTER TABLE "public"."accounting_payroll" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "accounting_payroll_delete_admin_policy" ON "public"."accounting_payroll" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'Admin'::"public"."user_role")))));



CREATE POLICY "accounting_payroll_delete_authenticated_policy" ON "public"."accounting_payroll" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "accounting_payroll_delete_policy" ON "public"."accounting_payroll" FOR DELETE TO "authenticated" USING ((( SELECT ("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))) OR (( SELECT "auth"."uid"() AS "uid") = "created_by")));



CREATE POLICY "accounting_payroll_insert_admin_policy" ON "public"."accounting_payroll" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'Admin'::"public"."user_role")))));



CREATE POLICY "accounting_payroll_insert_authenticated_policy" ON "public"."accounting_payroll" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "accounting_payroll_select_authenticated_policy" ON "public"."accounting_payroll" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "accounting_payroll_update_admin_policy" ON "public"."accounting_payroll" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'Admin'::"public"."user_role")))));



CREATE POLICY "accounting_payroll_update_authenticated_policy" ON "public"."accounting_payroll" FOR UPDATE TO "authenticated" USING (true);



ALTER TABLE "public"."accounting_reconciliation" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."accounting_sales" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "accounting_sales_delete_admin_policy" ON "public"."accounting_sales" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'Admin'::"public"."user_role")))));



CREATE POLICY "accounting_sales_delete_authenticated_policy" ON "public"."accounting_sales" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "accounting_sales_delete_policy" ON "public"."accounting_sales" FOR DELETE TO "authenticated" USING ((( SELECT ("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))) OR (( SELECT "auth"."uid"() AS "uid") = "created_by")));



CREATE POLICY "accounting_sales_insert_admin_policy" ON "public"."accounting_sales" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'Admin'::"public"."user_role")))));



CREATE POLICY "accounting_sales_insert_authenticated_policy" ON "public"."accounting_sales" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "accounting_sales_select_authenticated_policy" ON "public"."accounting_sales" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "accounting_sales_update_admin_policy" ON "public"."accounting_sales" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'Admin'::"public"."user_role")))));



CREATE POLICY "accounting_sales_update_authenticated_policy" ON "public"."accounting_sales" FOR UPDATE TO "authenticated" USING (true);



ALTER TABLE "public"."accounting_subjects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "accounting_subjects_delete" ON "public"."accounting_subjects" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "accounting_subjects_insert" ON "public"."accounting_subjects" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "accounting_subjects_select" ON "public"."accounting_subjects" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "accounting_subjects_update" ON "public"."accounting_subjects" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "admin can update accounting_expenses" ON "public"."accounting_expenses" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'Admin'::"public"."user_role")))));



CREATE POLICY "admin can update accounting_payroll" ON "public"."accounting_payroll" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'Admin'::"public"."user_role")))));



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_log_insert_trigger_policy" ON "public"."audit_log" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "audit_log_select_admin_policy" ON "public"."audit_log" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "authenticated users can delete accounting_reconciliation" ON "public"."accounting_reconciliation" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "authenticated users can insert accounting_reconciliation" ON "public"."accounting_reconciliation" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "authenticated users can read accounting_reconciliation" ON "public"."accounting_reconciliation" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated users can update accounting_reconciliation" ON "public"."accounting_reconciliation" FOR UPDATE TO "authenticated" USING (true);



ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clients_delete_admin_policy" ON "public"."clients" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = 'Admin'::"public"."user_role"));



CREATE POLICY "clients_delete_role_policy" ON "public"."clients" FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))) OR (("created_by" IS NOT NULL) AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))) OR ("created_by" IS NULL)));



CREATE POLICY "clients_insert_authenticated_policy" ON "public"."clients" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "clients_insert_authorized_policy" ON "public"."clients" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role", 'Member'::"public"."user_role"])));



CREATE POLICY "clients_select_all_policy" ON "public"."clients" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "clients_select_authenticated_policy" ON "public"."clients" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "clients_update_authorized_policy" ON "public"."clients" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role", 'Member'::"public"."user_role"])));



CREATE POLICY "clients_update_role_policy" ON "public"."clients" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR ("created_by" IS NULL)));



ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employees_admin_select_all" ON "public"."employees" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "employees_delete" ON "public"."employees" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'Admin'::"public"."user_role")))));



CREATE POLICY "employees_delete_admin_policy" ON "public"."employees" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = 'Admin'::"public"."user_role"));



CREATE POLICY "employees_insert" ON "public"."employees" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "employees_insert_admin_policy" ON "public"."employees" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = 'Admin'::"public"."user_role"));



CREATE POLICY "employees_select_active" ON "public"."employees" FOR SELECT TO "authenticated" USING (("status" = '在職'::"text"));



CREATE POLICY "employees_select_active_authenticated_policy" ON "public"."employees" FOR SELECT TO "authenticated" USING (("status" = '在職'::"text"));



CREATE POLICY "employees_select_all_admin_policy" ON "public"."employees" FOR SELECT TO "authenticated" USING (("public"."get_my_role"() = 'Admin'::"public"."user_role"));



CREATE POLICY "employees_select_own" ON "public"."employees" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "employees_update" ON "public"."employees" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "employees_update_admin_policy" ON "public"."employees" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = 'Admin'::"public"."user_role"));



ALTER TABLE "public"."expense_claims" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_claims_delete_own_draft_or_admin_policy" ON "public"."expense_claims" FOR DELETE TO "authenticated" USING ((((( SELECT "auth"."uid"() AS "uid") = "created_by") AND ("status" = 'draft'::"text")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'Admin'::"public"."user_role"))))));



CREATE POLICY "expense_claims_insert_own_policy" ON "public"."expense_claims" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "created_by"));



CREATE POLICY "expense_claims_select_authenticated_policy" ON "public"."expense_claims" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "expense_claims_update_own_or_reviewer_policy" ON "public"."expense_claims" FOR UPDATE TO "authenticated" USING ((((( SELECT "auth"."uid"() AS "uid") = "created_by") AND ("status" = ANY (ARRAY['draft'::"text", 'rejected'::"text"]))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])))))));



ALTER TABLE "public"."expense_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_types_delete" ON "public"."expense_types" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "expense_types_insert" ON "public"."expense_types" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "expense_types_select" ON "public"."expense_types" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "expense_types_update" ON "public"."expense_types" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



ALTER TABLE "public"."insurance_rate_tables" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insurance_rate_tables_delete_admin_policy" ON "public"."insurance_rate_tables" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "insurance_rate_tables_insert_admin_policy" ON "public"."insurance_rate_tables" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "insurance_rate_tables_select_authenticated_policy" ON "public"."insurance_rate_tables" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "insurance_rate_tables_update_admin_policy" ON "public"."insurance_rate_tables" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."insurance_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insurance_settings_delete_policy" ON "public"."insurance_settings" FOR DELETE TO "authenticated" USING ((( SELECT "public"."get_my_role"() AS "get_my_role") = 'Admin'::"public"."user_role"));



CREATE POLICY "insurance_settings_insert_policy" ON "public"."insurance_settings" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."get_my_role"() AS "get_my_role") = 'Admin'::"public"."user_role"));



CREATE POLICY "insurance_settings_select_policy" ON "public"."insurance_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "insurance_settings_update_policy" ON "public"."insurance_settings" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."get_my_role"() AS "get_my_role") = 'Admin'::"public"."user_role"));



ALTER TABLE "public"."kol_services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kol_services_all" ON "public"."kol_services" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "kol_services_delete_admin_policy" ON "public"."kol_services" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = 'Admin'::"public"."user_role"));



CREATE POLICY "kol_services_insert_editors_policy" ON "public"."kol_services" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



CREATE POLICY "kol_services_select" ON "public"."kol_services" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "kol_services_select_authenticated_policy" ON "public"."kol_services" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "kol_services_update_editors_policy" ON "public"."kol_services" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



ALTER TABLE "public"."kol_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kol_types_delete" ON "public"."kol_types" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "kol_types_delete_admin_policy" ON "public"."kol_types" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = 'Admin'::"public"."user_role"));



CREATE POLICY "kol_types_insert" ON "public"."kol_types" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "kol_types_insert_editors_policy" ON "public"."kol_types" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



CREATE POLICY "kol_types_select" ON "public"."kol_types" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "kol_types_select_authenticated_policy" ON "public"."kol_types" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "kol_types_update" ON "public"."kol_types" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "kol_types_update_editors_policy" ON "public"."kol_types" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



ALTER TABLE "public"."kols" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kols_delete_admin_policy" ON "public"."kols" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = 'Admin'::"public"."user_role"));



CREATE POLICY "kols_delete_role_policy" ON "public"."kols" FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))) OR (("created_by" IS NOT NULL) AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))) OR ("created_by" IS NULL)));



CREATE POLICY "kols_insert_authenticated_policy" ON "public"."kols" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "kols_insert_authorized_policy" ON "public"."kols" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role", 'Member'::"public"."user_role"])));



CREATE POLICY "kols_select_all_policy" ON "public"."kols" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "kols_select_authenticated_policy" ON "public"."kols" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "kols_update_authorized_policy" ON "public"."kols" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role", 'Member'::"public"."user_role"])));



CREATE POLICY "kols_update_role_policy" ON "public"."kols" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR ("created_by" IS NULL)));



ALTER TABLE "public"."page_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "page_permissions_delete" ON "public"."page_permissions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'Admin'::"public"."user_role")))));



CREATE POLICY "page_permissions_insert" ON "public"."page_permissions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'Admin'::"public"."user_role")))));



CREATE POLICY "page_permissions_select" ON "public"."page_permissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "page_permissions_update" ON "public"."page_permissions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'Admin'::"public"."user_role")))));



ALTER TABLE "public"."payment_confirmation_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_confirmation_items_delete" ON "public"."payment_confirmation_items" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "payment_confirmation_items_delete_finance_policy" ON "public"."payment_confirmation_items" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



CREATE POLICY "payment_confirmation_items_insert" ON "public"."payment_confirmation_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "payment_confirmation_items_insert_finance_policy" ON "public"."payment_confirmation_items" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



CREATE POLICY "payment_confirmation_items_select" ON "public"."payment_confirmation_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "payment_confirmation_items_select_authenticated_policy" ON "public"."payment_confirmation_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "payment_confirmation_items_update" ON "public"."payment_confirmation_items" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "payment_confirmation_items_update_finance_policy" ON "public"."payment_confirmation_items" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



ALTER TABLE "public"."payment_confirmations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_confirmations_delete" ON "public"."payment_confirmations" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "payment_confirmations_delete_finance_policy" ON "public"."payment_confirmations" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



CREATE POLICY "payment_confirmations_insert" ON "public"."payment_confirmations" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "payment_confirmations_insert_finance_policy" ON "public"."payment_confirmations" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



CREATE POLICY "payment_confirmations_select" ON "public"."payment_confirmations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "payment_confirmations_select_authenticated_policy" ON "public"."payment_confirmations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "payment_confirmations_update" ON "public"."payment_confirmations" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "payment_confirmations_update_finance_policy" ON "public"."payment_confirmations" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



ALTER TABLE "public"."payment_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_requests_delete" ON "public"."payment_requests" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "payment_requests_delete_finance_policy" ON "public"."payment_requests" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



CREATE POLICY "payment_requests_insert_authenticated_policy" ON "public"."payment_requests" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "payment_requests_insert_finance_policy" ON "public"."payment_requests" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



CREATE POLICY "payment_requests_select" ON "public"."payment_requests" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "payment_requests_select_authenticated_policy" ON "public"."payment_requests" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "payment_requests_update_finance_policy" ON "public"."payment_requests" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



CREATE POLICY "payment_requests_update_role_policy" ON "public"."payment_requests" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_admin_full" ON "public"."profiles" TO "authenticated" USING (("public"."get_my_role"() = 'Admin'::"public"."user_role")) WITH CHECK (("public"."get_my_role"() = 'Admin'::"public"."user_role"));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."project_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_notes_delete_own_or_admin_policy" ON "public"."project_notes" FOR DELETE TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'Admin'::"public"."user_role"))))));



CREATE POLICY "project_notes_insert_authenticated_policy" ON "public"."project_notes" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "project_notes_select_authenticated_policy" ON "public"."project_notes" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "projects_delete_admin_policy" ON "public"."projects" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'Admin'::"public"."user_role")))));



CREATE POLICY "projects_insert_all_policy" ON "public"."projects" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "projects_select_all_policy" ON "public"."projects" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "projects_update_all_policy" ON "public"."projects" FOR UPDATE TO "authenticated" USING (true);



ALTER TABLE "public"."quotation_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quotation_items_delete_admin_policy" ON "public"."quotation_items" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = 'Admin'::"public"."user_role"));



CREATE POLICY "quotation_items_delete_role_policy" ON "public"."quotation_items" FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))) OR (("created_by" IS NOT NULL) AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))) OR ("created_by" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."quotations"
  WHERE (("quotations"."id" = "quotation_items"."quotation_id") AND ((("quotations"."created_by" IS NOT NULL) AND ("quotations"."created_by" = ( SELECT "auth"."uid"() AS "uid"))) OR ("quotations"."created_by" IS NULL)))))));



CREATE POLICY "quotation_items_insert_authenticated_policy" ON "public"."quotation_items" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "quotation_items_insert_authorized_policy" ON "public"."quotation_items" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role", 'Member'::"public"."user_role"])));



CREATE POLICY "quotation_items_select_all_policy" ON "public"."quotation_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "quotation_items_select_authenticated_policy" ON "public"."quotation_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "quotation_items_update_authorized_policy" ON "public"."quotation_items" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role", 'Member'::"public"."user_role"])));



CREATE POLICY "quotation_items_update_role_policy" ON "public"."quotation_items" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR ("created_by" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."quotations"
  WHERE (("quotations"."id" = "quotation_items"."quotation_id") AND (("quotations"."created_by" = ( SELECT "auth"."uid"() AS "uid")) OR ("quotations"."created_by" IS NULL)))))));



ALTER TABLE "public"."quotations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quotations_delete_admin_policy" ON "public"."quotations" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = 'Admin'::"public"."user_role"));



CREATE POLICY "quotations_delete_role_policy" ON "public"."quotations" FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))) OR (("created_by" IS NOT NULL) AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))) OR ("created_by" IS NULL)));



CREATE POLICY "quotations_insert_authenticated_policy" ON "public"."quotations" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "quotations_insert_authorized_policy" ON "public"."quotations" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role", 'Member'::"public"."user_role"])));



CREATE POLICY "quotations_select_all_policy" ON "public"."quotations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "quotations_select_authenticated_policy" ON "public"."quotations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "quotations_update_authorized_policy" ON "public"."quotations" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role", 'Member'::"public"."user_role"])));



CREATE POLICY "quotations_update_role_policy" ON "public"."quotations" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR ("created_by" IS NULL)));



ALTER TABLE "public"."quote_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quote_categories_delete" ON "public"."quote_categories" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "quote_categories_delete_admin_policy" ON "public"."quote_categories" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = 'Admin'::"public"."user_role"));



CREATE POLICY "quote_categories_insert" ON "public"."quote_categories" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "quote_categories_insert_editors_policy" ON "public"."quote_categories" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



CREATE POLICY "quote_categories_select" ON "public"."quote_categories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "quote_categories_select_authenticated_policy" ON "public"."quote_categories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "quote_categories_update" ON "public"."quote_categories" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "quote_categories_update_editors_policy" ON "public"."quote_categories" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



ALTER TABLE "public"."service_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_types_delete" ON "public"."service_types" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "service_types_delete_admin_policy" ON "public"."service_types" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = 'Admin'::"public"."user_role"));



CREATE POLICY "service_types_insert" ON "public"."service_types" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "service_types_insert_editors_policy" ON "public"."service_types" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



CREATE POLICY "service_types_select" ON "public"."service_types" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "service_types_select_authenticated_policy" ON "public"."service_types" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "service_types_update" ON "public"."service_types" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "service_types_update_editors_policy" ON "public"."service_types" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



ALTER TABLE "public"."withholding_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "withholding_settings_delete_admin_policy" ON "public"."withholding_settings" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'Admin'::"public"."user_role")))));



CREATE POLICY "withholding_settings_insert_admin_policy" ON "public"."withholding_settings" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'Admin'::"public"."user_role")))));



CREATE POLICY "withholding_settings_select_authenticated_policy" ON "public"."withholding_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "withholding_settings_update_admin_policy" ON "public"."withholding_settings" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'Admin'::"public"."user_role")))));



ALTER TABLE "public"."withholding_settlements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "withholding_settlements_delete_admin_policy" ON "public"."withholding_settlements" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'Admin'::"public"."user_role")))));



CREATE POLICY "withholding_settlements_insert_admin_editor_policy" ON "public"."withholding_settlements" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));



CREATE POLICY "withholding_settlements_select_authenticated_policy" ON "public"."withholding_settlements" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "withholding_settlements_update_admin_editor_policy" ON "public"."withholding_settlements" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"]))))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."approve_expense_claim"("claim_id" "uuid", "approver_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_expense_claim"("claim_id" "uuid", "approver_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_expense_claim"("claim_id" "uuid", "approver_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_payment_request"("request_id" "uuid", "verifier_id" "uuid", "p_expense_type" "text", "p_accounting_subject" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_payment_request"("request_id" "uuid", "verifier_id" "uuid", "p_expense_type" "text", "p_accounting_subject" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_payment_request"("request_id" "uuid", "verifier_id" "uuid", "p_expense_type" "text", "p_accounting_subject" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_quotation_item"("p_item_id" "uuid", "p_expense_type" "text", "p_accounting_subject" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_quotation_item"("p_item_id" "uuid", "p_expense_type" "text", "p_accounting_subject" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_quotation_item"("p_item_id" "uuid", "p_expense_type" "text", "p_accounting_subject" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_close_projects"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_close_projects"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_close_projects"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_page_permission"("user_id" "uuid", "page_key" character varying, "required_function" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."check_page_permission"("user_id" "uuid", "page_key" character varying, "required_function" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_page_permission"("user_id" "uuid", "page_key" character varying, "required_function" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_accounting_sale_from_quotation"("p_quotation_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_accounting_sale_from_quotation"("p_quotation_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_accounting_sale_from_quotation"("p_quotation_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_payment_confirmation"("p_confirmation_date" "date", "p_total_amount" numeric, "p_total_items" integer, "p_created_by" "uuid", "p_items" json) TO "anon";
GRANT ALL ON FUNCTION "public"."create_payment_confirmation"("p_confirmation_date" "date", "p_total_amount" numeric, "p_total_items" integer, "p_created_by" "uuid", "p_items" json) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_payment_confirmation"("p_confirmation_date" "date", "p_total_amount" numeric, "p_total_items" integer, "p_created_by" "uuid", "p_items" json) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_payment_request_group"("p_quotation_item_ids" "uuid"[], "p_merge_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_payment_request_group"("p_quotation_item_ids" "uuid"[], "p_merge_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_payment_request_group"("p_quotation_item_ids" "uuid"[], "p_merge_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_available_pending_payments"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_pending_payments"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_pending_payments"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_merge_group_items"("group_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_merge_group_items"("group_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_merge_group_items"("group_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_profile"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_project_notes"("p_project_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_project_notes"("p_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_project_notes"("p_project_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_project_notes_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_project_notes_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_project_notes_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_payment_confirmation"("p_user_id" "uuid", "p_approved_request_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."process_payment_confirmation"("p_user_id" "uuid", "p_approved_request_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_payment_confirmation"("p_user_id" "uuid", "p_approved_request_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_expense_claim"("claim_id" "uuid", "rejector_id" "uuid", "reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_expense_claim"("claim_id" "uuid", "rejector_id" "uuid", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_expense_claim"("claim_id" "uuid", "rejector_id" "uuid", "reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_accounting_sale_for_quotation"("p_quotation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_accounting_sale_for_quotation"("p_quotation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_accounting_sale_for_quotation"("p_quotation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."revert_quotation_item"("p_item_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."revert_quotation_item"("p_item_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revert_quotation_item"("p_item_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_created_by"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_created_by"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_created_by"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_kol_service_prices_from_quotation"("p_quotation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_kol_service_prices_from_quotation"("p_quotation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_kol_service_prices_from_quotation"("p_quotation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_kol_service_prices_initial"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_kol_service_prices_initial"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_kol_service_prices_initial"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_payment_status_from_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_payment_status_from_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_payment_status_from_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ungroup_payment_requests"("p_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ungroup_payment_requests"("p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ungroup_payment_requests"("p_group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_accounting_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_accounting_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_accounting_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_remittance_settings"("p_confirmation_id" "uuid", "p_settings" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_remittance_settings"("p_confirmation_id" "uuid", "p_settings" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_remittance_settings"("p_confirmation_id" "uuid", "p_settings" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."accounting_expenses" TO "anon";
GRANT ALL ON TABLE "public"."accounting_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."accounting_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."accounting_payroll" TO "anon";
GRANT ALL ON TABLE "public"."accounting_payroll" TO "authenticated";
GRANT ALL ON TABLE "public"."accounting_payroll" TO "service_role";



GRANT ALL ON TABLE "public"."accounting_sales" TO "anon";
GRANT ALL ON TABLE "public"."accounting_sales" TO "authenticated";
GRANT ALL ON TABLE "public"."accounting_sales" TO "service_role";



GRANT ALL ON TABLE "public"."accounting_annual_summary" TO "anon";
GRANT ALL ON TABLE "public"."accounting_annual_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."accounting_annual_summary" TO "service_role";



GRANT ALL ON TABLE "public"."accounting_reconciliation" TO "anon";
GRANT ALL ON TABLE "public"."accounting_reconciliation" TO "authenticated";
GRANT ALL ON TABLE "public"."accounting_reconciliation" TO "service_role";



GRANT ALL ON TABLE "public"."accounting_subjects" TO "anon";
GRANT ALL ON TABLE "public"."accounting_subjects" TO "authenticated";
GRANT ALL ON TABLE "public"."accounting_subjects" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "anon";
GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON TABLE "public"."expense_claims" TO "anon";
GRANT ALL ON TABLE "public"."expense_claims" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_claims" TO "service_role";



GRANT ALL ON TABLE "public"."expense_types" TO "anon";
GRANT ALL ON TABLE "public"."expense_types" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_types" TO "service_role";



GRANT ALL ON TABLE "public"."insurance_rate_tables" TO "anon";
GRANT ALL ON TABLE "public"."insurance_rate_tables" TO "authenticated";
GRANT ALL ON TABLE "public"."insurance_rate_tables" TO "service_role";



GRANT ALL ON TABLE "public"."insurance_settings" TO "anon";
GRANT ALL ON TABLE "public"."insurance_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."insurance_settings" TO "service_role";



GRANT ALL ON TABLE "public"."kol_services" TO "anon";
GRANT ALL ON TABLE "public"."kol_services" TO "authenticated";
GRANT ALL ON TABLE "public"."kol_services" TO "service_role";



GRANT ALL ON TABLE "public"."kol_types" TO "anon";
GRANT ALL ON TABLE "public"."kol_types" TO "authenticated";
GRANT ALL ON TABLE "public"."kol_types" TO "service_role";



GRANT ALL ON TABLE "public"."kols" TO "anon";
GRANT ALL ON TABLE "public"."kols" TO "authenticated";
GRANT ALL ON TABLE "public"."kols" TO "service_role";



GRANT ALL ON TABLE "public"."page_permissions" TO "anon";
GRANT ALL ON TABLE "public"."page_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."page_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."payment_confirmation_items" TO "anon";
GRANT ALL ON TABLE "public"."payment_confirmation_items" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_confirmation_items" TO "service_role";



GRANT ALL ON TABLE "public"."payment_confirmations" TO "anon";
GRANT ALL ON TABLE "public"."payment_confirmations" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_confirmations" TO "service_role";



GRANT ALL ON TABLE "public"."payment_requests" TO "anon";
GRANT ALL ON TABLE "public"."payment_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_requests" TO "service_role";



GRANT ALL ON TABLE "public"."quotation_items" TO "anon";
GRANT ALL ON TABLE "public"."quotation_items" TO "authenticated";
GRANT ALL ON TABLE "public"."quotation_items" TO "service_role";



GRANT ALL ON TABLE "public"."quotations" TO "anon";
GRANT ALL ON TABLE "public"."quotations" TO "authenticated";
GRANT ALL ON TABLE "public"."quotations" TO "service_role";



GRANT ALL ON TABLE "public"."payment_requests_with_details" TO "anon";
GRANT ALL ON TABLE "public"."payment_requests_with_details" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_requests_with_details" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."project_notes" TO "anon";
GRANT ALL ON TABLE "public"."project_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."project_notes" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."quote_categories" TO "anon";
GRANT ALL ON TABLE "public"."quote_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."quote_categories" TO "service_role";



GRANT ALL ON TABLE "public"."service_types" TO "anon";
GRANT ALL ON TABLE "public"."service_types" TO "authenticated";
GRANT ALL ON TABLE "public"."service_types" TO "service_role";



GRANT ALL ON TABLE "public"."user_permissions" TO "anon";
GRANT ALL ON TABLE "public"."user_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."withholding_settings" TO "anon";
GRANT ALL ON TABLE "public"."withholding_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."withholding_settings" TO "service_role";



GRANT ALL ON TABLE "public"."withholding_settlements" TO "anon";
GRANT ALL ON TABLE "public"."withholding_settlements" TO "authenticated";
GRANT ALL ON TABLE "public"."withholding_settlements" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






























