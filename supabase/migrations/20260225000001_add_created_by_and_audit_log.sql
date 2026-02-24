-- =====================================================
-- Phase 1 安全加固 (A)：新增 created_by 欄位 + 審計日誌
-- 目的：追蹤記錄建立者、記錄所有刪除操作供誤刪恢復
-- =====================================================

-- 1. 建立審計日誌表
CREATE TABLE IF NOT EXISTS audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL DEFAULT 'DELETE',
  old_data jsonb NOT NULL,
  performed_by uuid REFERENCES auth.users(id),
  performed_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit_log IS '刪除操作審計日誌，用於誤刪恢復';
COMMENT ON COLUMN audit_log.old_data IS '被刪除列的完整 JSONB 快照';

CREATE INDEX idx_audit_log_table_record ON audit_log (table_name, record_id);
CREATE INDEX idx_audit_log_performed_at ON audit_log (performed_at DESC);
CREATE INDEX idx_audit_log_performed_by ON audit_log (performed_by);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- 只有 Admin 可查看審計日誌
CREATE POLICY "audit_log_select_admin_policy" ON audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role IN ('Admin', 'admin')
    )
  );

-- trigger 以 SECURITY DEFINER 身份寫入，需允許 INSERT
CREATE POLICY "audit_log_insert_trigger_policy" ON audit_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 2. 通用刪除日誌觸發器函數（BEFORE DELETE）
CREATE OR REPLACE FUNCTION log_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

COMMENT ON FUNCTION log_delete IS '通用刪除審計觸發器，記錄完整被刪除列供恢復';

-- 3. 通用自動填入 created_by 觸發器函數（BEFORE INSERT）
CREATE OR REPLACE FUNCTION set_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := (SELECT auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_created_by IS '自動填入 created_by 為當前使用者 ID';

-- 4. 為四張核心表新增 created_by 欄位
ALTER TABLE kols ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- 5. 建立索引（RLS 查詢效能）
CREATE INDEX IF NOT EXISTS idx_kols_created_by ON kols (created_by);
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON clients (created_by);
CREATE INDEX IF NOT EXISTS idx_quotations_created_by ON quotations (created_by);
CREATE INDEX IF NOT EXISTS idx_quotation_items_created_by ON quotation_items (created_by);

-- 6. 掛載 BEFORE INSERT 觸發器（自動填入 created_by）
CREATE TRIGGER trg_set_created_by_kols
  BEFORE INSERT ON kols
  FOR EACH ROW EXECUTE FUNCTION set_created_by();

CREATE TRIGGER trg_set_created_by_clients
  BEFORE INSERT ON clients
  FOR EACH ROW EXECUTE FUNCTION set_created_by();

CREATE TRIGGER trg_set_created_by_quotations
  BEFORE INSERT ON quotations
  FOR EACH ROW EXECUTE FUNCTION set_created_by();

CREATE TRIGGER trg_set_created_by_quotation_items
  BEFORE INSERT ON quotation_items
  FOR EACH ROW EXECUTE FUNCTION set_created_by();

-- 7. 掛載 BEFORE DELETE 審計觸發器
CREATE TRIGGER trg_audit_delete_kols
  BEFORE DELETE ON kols
  FOR EACH ROW EXECUTE FUNCTION log_delete();

CREATE TRIGGER trg_audit_delete_clients
  BEFORE DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION log_delete();

CREATE TRIGGER trg_audit_delete_quotations
  BEFORE DELETE ON quotations
  FOR EACH ROW EXECUTE FUNCTION log_delete();

CREATE TRIGGER trg_audit_delete_quotation_items
  BEFORE DELETE ON quotation_items
  FOR EACH ROW EXECUTE FUNCTION log_delete();

NOTIFY pgrst, 'reload schema';
