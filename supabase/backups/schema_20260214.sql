

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


CREATE OR REPLACE FUNCTION "public"."approve_payment_request"("request_id" "uuid", "verifier_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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

  UPDATE payment_requests
  SET
    verification_status = 'approved',
    approved_by = verifier_id,
    approved_at = NOW(),
    updated_at = NOW()
  WHERE id = request_id;

  -- Auto-create expense record
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


ALTER FUNCTION "public"."approve_payment_request"("request_id" "uuid", "verifier_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."approve_payment_request"("request_id" "uuid", "verifier_id" "uuid") IS '核准請款申請並建立確認記錄與帳務記錄（包含完整快照資訊）';



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
    AS $$
DECLARE
  v_existing_sale_id uuid;
  v_new_sale_id uuid;
  v_project_name text;
  v_client_name text;
  v_has_discount boolean;
  v_discounted_price numeric;
  v_subtotal_untaxed numeric;
  v_sales_amount numeric;
  v_tax_amount numeric;
  v_total_amount numeric;
BEGIN
  SELECT id INTO v_existing_sale_id
  FROM accounting_sales
  WHERE quotation_id = p_quotation_id
  LIMIT 1;

  IF v_existing_sale_id IS NOT NULL THEN
    RETURN v_existing_sale_id;
  END IF;

  SELECT
    q.project_name,
    c.name,
    q.has_discount,
    q.discounted_price,
    q.subtotal_untaxed
  INTO
    v_project_name,
    v_client_name,
    v_has_discount,
    v_discounted_price,
    v_subtotal_untaxed
  FROM quotations q
  LEFT JOIN clients c ON q.client_id = c.id
  WHERE q.id = p_quotation_id;

  IF v_project_name IS NULL THEN
    RAISE EXCEPTION 'Quotation not found: %', p_quotation_id;
  END IF;

  IF v_has_discount AND v_discounted_price IS NOT NULL THEN
    v_sales_amount := v_discounted_price;
  ELSE
    v_sales_amount := COALESCE(v_subtotal_untaxed, 0);
  END IF;

  v_tax_amount := ROUND(v_sales_amount * 0.05, 2);
  v_total_amount := v_sales_amount + v_tax_amount;

  INSERT INTO accounting_sales (
    year,
    project_name,
    client_name,
    sales_amount,
    tax_amount,
    total_amount,
    quotation_id,
    note,
    created_by
  ) VALUES (
    EXTRACT(YEAR FROM NOW())::integer,
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


COMMENT ON FUNCTION "public"."create_accounting_sale_from_quotation"("p_quotation_id" "uuid", "p_user_id" "uuid") IS '報價單簽約時自動建立銷項帳務記錄';



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


CREATE OR REPLACE FUNCTION "public"."get_available_pending_payments"() RETURNS TABLE("id" "text", "quotation_id" "text", "category" "text", "kol_id" "text", "service" "text", "quantity" integer, "price" numeric, "cost" numeric, "remittance_name" "text", "remark" "text", "created_at" timestamp with time zone, "quotations" "jsonb", "kols" "jsonb")
    LANGUAGE "plpgsql"
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
    qi.remittance_name,
    qi.remark,
    qi.created_at,
    -- Combine quotation data with client data
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


COMMENT ON FUNCTION "public"."get_available_pending_payments"() IS '取得可用於請款的報價項目（已簽約且未請款的項目），包含客戶資訊、成本與匯款戶名';



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


CREATE OR REPLACE FUNCTION "public"."get_my_role"() RETURNS "public"."user_role"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid()
$$;


ALTER FUNCTION "public"."get_my_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"("user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    user_role_val user_role;
BEGIN
    SELECT role INTO user_role_val 
    FROM profiles 
    WHERE id = user_id;
    
    RETURN user_role_val::text;
END;
$$;


ALTER FUNCTION "public"."get_user_role"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- 在 public.profiles 表中插入一筆新紀錄
  -- id 和 email 來自於剛剛在 auth.users 中建立的新使用者
  -- 預設給予 'Member' 角色
  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, 'Member');
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


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
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_accounting_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_remittance_settings"("p_confirmation_id" "uuid", "p_settings" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  UPDATE payment_confirmations
  SET remittance_settings = p_settings,
      updated_at = NOW()
  WHERE id = p_confirmation_id
  RETURNING remittance_settings INTO v_result;
  
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."update_remittance_settings"("p_confirmation_id" "uuid", "p_settings" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_remittance_settings"("p_confirmation_id" "uuid", "p_settings" "jsonb") IS 'Update remittance settings for a confirmation record (bypassing RLS)';



CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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
    "payment_request_id" "uuid"
);


ALTER TABLE "public"."accounting_expenses" OWNER TO "postgres";


COMMENT ON TABLE "public"."accounting_expenses" IS '進項支出記錄 - 對應 Excel「年度進項總覽」及各明細工作表';



COMMENT ON COLUMN "public"."accounting_expenses"."expense_type" IS '支出種類：專案支出、勞務報酬、其他支出、公司相關、人事薪資、沖帳免付';



COMMENT ON COLUMN "public"."accounting_expenses"."accounting_subject" IS '會計科目：進貨、薪資支出、租金支出、旅費支出等';



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
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."accounting_payroll" OWNER TO "postgres";


COMMENT ON TABLE "public"."accounting_payroll" IS '人事薪資記錄 - 對應 Excel「人事薪資與勞健保」工作表';



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
 SELECT "year",
    COALESCE(( SELECT "sum"("s"."sales_amount") AS "sum"
           FROM "public"."accounting_sales" "s"
          WHERE ("s"."year" = "y"."year")), (0)::numeric) AS "total_sales",
    COALESCE(( SELECT "sum"("s"."tax_amount") AS "sum"
           FROM "public"."accounting_sales" "s"
          WHERE ("s"."year" = "y"."year")), (0)::numeric) AS "total_sales_tax",
    COALESCE(( SELECT "sum"("s"."total_amount") AS "sum"
           FROM "public"."accounting_sales" "s"
          WHERE ("s"."year" = "y"."year")), (0)::numeric) AS "total_sales_with_tax",
    COALESCE(( SELECT "sum"("e"."amount") AS "sum"
           FROM "public"."accounting_expenses" "e"
          WHERE (("e"."year" = "y"."year") AND ("e"."expense_type" = '專案支出'::"text"))), (0)::numeric) AS "total_project_expenses",
    COALESCE(( SELECT "sum"("e"."amount") AS "sum"
           FROM "public"."accounting_expenses" "e"
          WHERE (("e"."year" = "y"."year") AND ("e"."expense_type" = '勞務報酬'::"text"))), (0)::numeric) AS "total_labor_expenses",
    COALESCE(( SELECT "sum"("e"."amount") AS "sum"
           FROM "public"."accounting_expenses" "e"
          WHERE (("e"."year" = "y"."year") AND ("e"."expense_type" = '其他支出'::"text"))), (0)::numeric) AS "total_other_expenses",
    COALESCE(( SELECT "sum"("e"."amount") AS "sum"
           FROM "public"."accounting_expenses" "e"
          WHERE (("e"."year" = "y"."year") AND ("e"."expense_type" = '公司相關'::"text"))), (0)::numeric) AS "total_company_expenses",
    COALESCE(( SELECT "sum"(("p"."net_salary" + "p"."company_total")) AS "sum"
           FROM "public"."accounting_payroll" "p"
          WHERE ("p"."year" = "y"."year")), (0)::numeric) AS "total_payroll",
    ((COALESCE(( SELECT "sum"("s"."sales_amount") AS "sum"
           FROM "public"."accounting_sales" "s"
          WHERE ("s"."year" = "y"."year")), (0)::numeric) - COALESCE(( SELECT "sum"("e"."amount") AS "sum"
           FROM "public"."accounting_expenses" "e"
          WHERE ("e"."year" = "y"."year")), (0)::numeric)) - COALESCE(( SELECT "sum"("p"."net_salary") AS "sum"
           FROM "public"."accounting_payroll" "p"
          WHERE ("p"."year" = "y"."year")), (0)::numeric)) AS "annual_profit"
   FROM ( SELECT DISTINCT "accounting_sales"."year"
           FROM "public"."accounting_sales"
        UNION
         SELECT DISTINCT "accounting_expenses"."year"
           FROM "public"."accounting_expenses"
        UNION
         SELECT DISTINCT "accounting_payroll"."year"
           FROM "public"."accounting_payroll") "y"
  ORDER BY "year" DESC;


ALTER VIEW "public"."accounting_annual_summary" OWNER TO "postgres";


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
    CONSTRAINT "chk_contacts_format" CHECK (("jsonb_typeof"("contacts") = 'array'::"text"))
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clients"."contacts" IS '聯絡人資訊陣列，格式: [{"name": "姓名", "email": "信箱"}]';



CREATE TABLE IF NOT EXISTS "public"."kol_services" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "kol_id" "uuid",
    "service_type_id" "uuid",
    "price" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."kol_services" OWNER TO "postgres";


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
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."kols" OWNER TO "postgres";


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
    "payment_request_id" "uuid" NOT NULL,
    "amount_at_confirmation" numeric(12,2) NOT NULL,
    "kol_name_at_confirmation" "text" NOT NULL,
    "project_name_at_confirmation" "text" NOT NULL,
    "service_at_confirmation" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payment_confirmation_items" OWNER TO "postgres";


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
    CONSTRAINT "payment_requests_merge_type_check" CHECK (("merge_type" = ANY (ARRAY['company'::"text", 'account'::"text"]))),
    CONSTRAINT "payment_requests_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'confirmed'::"text"])))
);


ALTER TABLE "public"."payment_requests" OWNER TO "postgres";


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
    "remittance_name" "text"
);


ALTER TABLE "public"."quotation_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."quotation_items"."cost" IS '成本金額';



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
    "contact_phone" "text"
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


ALTER TABLE ONLY "public"."accounting_expenses"
    ADD CONSTRAINT "accounting_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounting_payroll"
    ADD CONSTRAINT "accounting_payroll_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounting_sales"
    ADD CONSTRAINT "accounting_sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."quotation_items"
    ADD CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quote_categories"
    ADD CONSTRAINT "quote_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_types"
    ADD CONSTRAINT "service_types_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_accounting_expenses_created_by" ON "public"."accounting_expenses" USING "btree" ("created_by");



CREATE UNIQUE INDEX "idx_accounting_expenses_payment_request_id" ON "public"."accounting_expenses" USING "btree" ("payment_request_id") WHERE ("payment_request_id" IS NOT NULL);



CREATE INDEX "idx_accounting_expenses_project" ON "public"."accounting_expenses" USING "btree" ("project_name");



CREATE INDEX "idx_accounting_expenses_type" ON "public"."accounting_expenses" USING "btree" ("expense_type");



CREATE INDEX "idx_accounting_expenses_year" ON "public"."accounting_expenses" USING "btree" ("year");



CREATE INDEX "idx_accounting_payroll_created_by" ON "public"."accounting_payroll" USING "btree" ("created_by");



CREATE INDEX "idx_accounting_payroll_employee" ON "public"."accounting_payroll" USING "btree" ("employee_name");



CREATE INDEX "idx_accounting_payroll_year" ON "public"."accounting_payroll" USING "btree" ("year");



CREATE INDEX "idx_accounting_sales_created_by" ON "public"."accounting_sales" USING "btree" ("created_by");



CREATE INDEX "idx_accounting_sales_project" ON "public"."accounting_sales" USING "btree" ("project_name");



CREATE UNIQUE INDEX "idx_accounting_sales_quotation_id" ON "public"."accounting_sales" USING "btree" ("quotation_id") WHERE ("quotation_id" IS NOT NULL);



CREATE INDEX "idx_accounting_sales_year" ON "public"."accounting_sales" USING "btree" ("year");



CREATE INDEX "idx_clients_contacts_gin" ON "public"."clients" USING "gin" ("contacts");



CREATE INDEX "idx_clients_email" ON "public"."clients" USING "btree" ("email");



CREATE INDEX "idx_clients_name" ON "public"."clients" USING "btree" ("name");



CREATE INDEX "idx_kol_services_kol_id" ON "public"."kol_services" USING "btree" ("kol_id");



CREATE INDEX "idx_kol_services_service_type_id" ON "public"."kol_services" USING "btree" ("service_type_id");



CREATE INDEX "idx_kols_name" ON "public"."kols" USING "btree" ("name");



CREATE INDEX "idx_kols_type_id" ON "public"."kols" USING "btree" ("type_id");



CREATE INDEX "idx_page_permissions_page_key" ON "public"."page_permissions" USING "btree" ("page_key");



CREATE INDEX "idx_payment_confirmation_items_payment_confirmation_id" ON "public"."payment_confirmation_items" USING "btree" ("payment_confirmation_id");



CREATE INDEX "idx_payment_confirmations_confirmation_date" ON "public"."payment_confirmations" USING "btree" ("confirmation_date");



CREATE INDEX "idx_payment_requests_merge_group_id" ON "public"."payment_requests" USING "btree" ("merge_group_id");



CREATE INDEX "idx_payment_requests_quotation_item_id" ON "public"."payment_requests" USING "btree" ("quotation_item_id");



CREATE INDEX "idx_payment_requests_request_date" ON "public"."payment_requests" USING "btree" ("request_date");



CREATE INDEX "idx_payment_requests_verification_status" ON "public"."payment_requests" USING "btree" ("verification_status");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_quotation_items_kol_id" ON "public"."quotation_items" USING "btree" ("kol_id");



CREATE INDEX "idx_quotation_items_quotation_id" ON "public"."quotation_items" USING "btree" ("quotation_id");



CREATE INDEX "idx_quotations_client_id" ON "public"."quotations" USING "btree" ("client_id");



CREATE INDEX "idx_quotations_created_at" ON "public"."quotations" USING "btree" ("created_at");



CREATE INDEX "idx_quotations_status" ON "public"."quotations" USING "btree" ("status");



CREATE INDEX "idx_users_email" ON "public"."profiles" USING "btree" ("email");



CREATE OR REPLACE TRIGGER "accounting_expenses_updated_at" BEFORE UPDATE ON "public"."accounting_expenses" FOR EACH ROW EXECUTE FUNCTION "public"."update_accounting_updated_at"();



CREATE OR REPLACE TRIGGER "accounting_payroll_updated_at" BEFORE UPDATE ON "public"."accounting_payroll" FOR EACH ROW EXECUTE FUNCTION "public"."update_accounting_updated_at"();



CREATE OR REPLACE TRIGGER "accounting_sales_updated_at" BEFORE UPDATE ON "public"."accounting_sales" FOR EACH ROW EXECUTE FUNCTION "public"."update_accounting_updated_at"();



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
    ADD CONSTRAINT "accounting_expenses_payment_request_id_fkey" FOREIGN KEY ("payment_request_id") REFERENCES "public"."payment_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."accounting_payroll"
    ADD CONSTRAINT "accounting_payroll_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."accounting_sales"
    ADD CONSTRAINT "accounting_sales_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."accounting_sales"
    ADD CONSTRAINT "accounting_sales_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."kol_services"
    ADD CONSTRAINT "kol_services_kol_id_fkey" FOREIGN KEY ("kol_id") REFERENCES "public"."kols"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kol_services"
    ADD CONSTRAINT "kol_services_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kols"
    ADD CONSTRAINT "kols_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "public"."kol_types"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_confirmation_items"
    ADD CONSTRAINT "payment_confirmation_items_payment_confirmation_id_fkey" FOREIGN KEY ("payment_confirmation_id") REFERENCES "public"."payment_confirmations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_confirmation_items"
    ADD CONSTRAINT "payment_confirmation_items_payment_request_id_fkey" FOREIGN KEY ("payment_request_id") REFERENCES "public"."payment_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_confirmations"
    ADD CONSTRAINT "payment_confirmations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payment_requests"
    ADD CONSTRAINT "payment_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payment_requests"
    ADD CONSTRAINT "payment_requests_quotation_item_id_fkey" FOREIGN KEY ("quotation_item_id") REFERENCES "public"."quotation_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_requests"
    ADD CONSTRAINT "payment_requests_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quotation_items"
    ADD CONSTRAINT "quotation_items_kol_id_fkey" FOREIGN KEY ("kol_id") REFERENCES "public"."kols"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quotation_items"
    ADD CONSTRAINT "quotation_items_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quotations"
    ADD CONSTRAINT "quotations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



CREATE POLICY "Admins can delete kols" ON "public"."kols" FOR DELETE USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"text"));



CREATE POLICY "Admins can delete quotations" ON "public"."quotations" FOR DELETE USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"text"));



CREATE POLICY "Admins can manage all clients" ON "public"."clients" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"text"));



CREATE POLICY "Admins can manage kol_services" ON "public"."kol_services" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"text"));



CREATE POLICY "Admins can manage kol_types" ON "public"."kol_types" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"text"));



CREATE POLICY "Admins can manage kols" ON "public"."kols" FOR INSERT WITH CHECK (("public"."get_user_role"("auth"."uid"()) = 'admin'::"text"));



CREATE POLICY "Admins can manage quote_categories" ON "public"."quote_categories" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"text"));



CREATE POLICY "Admins can manage service_types" ON "public"."service_types" USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"text"));



CREATE POLICY "Admins can update kols" ON "public"."kols" FOR UPDATE USING (("public"."get_user_role"("auth"."uid"()) = 'admin'::"text"));



CREATE POLICY "All authenticated users can create quotations" ON "public"."quotations" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "All authenticated users can manage quotation_items" ON "public"."quotation_items" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "All authenticated users can update quotations" ON "public"."quotations" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "All authenticated users can view kol_services" ON "public"."kol_services" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "All authenticated users can view kol_types" ON "public"."kol_types" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "All authenticated users can view kols" ON "public"."kols" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "All authenticated users can view quotation_items" ON "public"."quotation_items" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "All authenticated users can view quotations" ON "public"."quotations" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "All authenticated users can view quote_categories" ON "public"."quote_categories" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "All authenticated users can view service_types" ON "public"."service_types" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow access for finance team only on payment_confirmation_item" ON "public"."payment_confirmation_items" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



CREATE POLICY "Allow access for finance team only on payment_confirmations" ON "public"."payment_confirmations" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



CREATE POLICY "Allow access for finance team only on payment_requests" ON "public"."payment_requests" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



CREATE POLICY "Allow admin full access" ON "public"."profiles" USING (("public"."get_my_role"() = 'Admin'::"public"."user_role")) WITH CHECK (("public"."get_my_role"() = 'Admin'::"public"."user_role"));



CREATE POLICY "Allow admins to modify kol_types" ON "public"."kol_types" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



CREATE POLICY "Allow admins to modify quote_categories" ON "public"."quote_categories" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



CREATE POLICY "Allow admins to modify service_types" ON "public"."service_types" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])));



CREATE POLICY "Allow all users to read kol_types" ON "public"."kol_types" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow all users to read quote_categories" ON "public"."quote_categories" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow all users to read service_types" ON "public"."service_types" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow individual read access" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Allow read access on clients" ON "public"."clients" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow read access on kol_services" ON "public"."kol_services" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow read access on kols" ON "public"."kols" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow read access on quotation_items" ON "public"."quotation_items" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow read access on quotations" ON "public"."quotations" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow write access for active users on kol_services" ON "public"."kol_services" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role", 'Member'::"public"."user_role"])));



CREATE POLICY "Allow write access for active users on kols" ON "public"."kols" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role", 'Member'::"public"."user_role"])));



CREATE POLICY "Allow write access for active users on quotation_items" ON "public"."quotation_items" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role", 'Member'::"public"."user_role"])));



CREATE POLICY "Allow write access for active users on quotations" ON "public"."quotations" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role", 'Member'::"public"."user_role"])));



CREATE POLICY "Enable all for authenticated users" ON "public"."payment_confirmation_items" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable all for authenticated users" ON "public"."payment_confirmations" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable select for authenticated users" ON "public"."payment_confirmations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable update for authenticated users" ON "public"."payment_confirmations" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Members can view clients for quotations" ON "public"."clients" FOR SELECT USING ((("public"."get_user_role"("auth"."uid"()) = 'member'::"text") OR ("public"."get_user_role"("auth"."uid"()) = 'admin'::"text")));



CREATE POLICY "RLS: Allow authenticated users to read clients" ON "public"."clients" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "RLS: Allow specific roles to write to clients" ON "public"."clients" USING (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role", 'Member'::"public"."user_role"]))) WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role", 'Member'::"public"."user_role"])));



ALTER TABLE "public"."accounting_expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."accounting_payroll" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."accounting_sales" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated users can delete accounting_expenses" ON "public"."accounting_expenses" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "authenticated users can delete accounting_payroll" ON "public"."accounting_payroll" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "authenticated users can delete accounting_sales" ON "public"."accounting_sales" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "authenticated users can insert accounting_expenses" ON "public"."accounting_expenses" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "authenticated users can insert accounting_payroll" ON "public"."accounting_payroll" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "authenticated users can insert accounting_sales" ON "public"."accounting_sales" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "authenticated users can read accounting_expenses" ON "public"."accounting_expenses" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated users can read accounting_payroll" ON "public"."accounting_payroll" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated users can read accounting_sales" ON "public"."accounting_sales" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated users can update accounting_expenses" ON "public"."accounting_expenses" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "authenticated users can update accounting_payroll" ON "public"."accounting_payroll" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "authenticated users can update accounting_sales" ON "public"."accounting_sales" FOR UPDATE TO "authenticated" USING (true);



ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clients_basic_policy" ON "public"."clients" USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."kol_services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kol_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kols" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kols_basic_policy" ON "public"."kols" USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."page_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "page_permissions_admin_only_policy" ON "public"."page_permissions" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'Admin'::"public"."user_role"))
 LIMIT 1)));



ALTER TABLE "public"."payment_confirmation_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_confirmation_items_auth_policy" ON "public"."payment_confirmation_items" USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."payment_confirmations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_confirmations_auth_policy" ON "public"."payment_confirmations" USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."payment_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_requests_auth_policy" ON "public"."payment_requests" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "payment_requests_restricted_policy" ON "public"."payment_requests" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['Admin'::"public"."user_role", 'Editor'::"public"."user_role"])))
 LIMIT 1)));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quotation_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quotations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quotations_basic_policy" ON "public"."quotations" USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."quote_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_types" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."approve_payment_request"("request_id" "uuid", "verifier_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_payment_request"("request_id" "uuid", "verifier_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_payment_request"("request_id" "uuid", "verifier_id" "uuid") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."get_my_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_payment_confirmation"("p_user_id" "uuid", "p_approved_request_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."process_payment_confirmation"("p_user_id" "uuid", "p_approved_request_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_payment_confirmation"("p_user_id" "uuid", "p_approved_request_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_accounting_sale_for_quotation"("p_quotation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_accounting_sale_for_quotation"("p_quotation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_accounting_sale_for_quotation"("p_quotation_id" "uuid") TO "service_role";



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



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



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



GRANT ALL ON TABLE "public"."quote_categories" TO "anon";
GRANT ALL ON TABLE "public"."quote_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."quote_categories" TO "service_role";



GRANT ALL ON TABLE "public"."service_types" TO "anon";
GRANT ALL ON TABLE "public"."service_types" TO "authenticated";
GRANT ALL ON TABLE "public"."service_types" TO "service_role";



GRANT ALL ON TABLE "public"."user_permissions" TO "anon";
GRANT ALL ON TABLE "public"."user_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_permissions" TO "service_role";









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






























