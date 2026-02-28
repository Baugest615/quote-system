-- =====================================================
-- 付款狀態自動同步 Trigger
--
-- 問題：使用者在進項管理填入 payment_date 後，
--       payment_status 仍顯示 'unpaid'
--
-- 修復：
--   1. 建立共用 trigger function
--   2. 掛在 accounting_expenses 和 accounting_payroll
--   3. 回填現有不一致記錄
-- =====================================================

-- ============================================================
-- 1. 共用 trigger function
-- ============================================================

CREATE OR REPLACE FUNCTION sync_payment_status_from_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

-- ============================================================
-- 2. 掛在 accounting_expenses
-- ============================================================

DROP TRIGGER IF EXISTS trg_expenses_sync_payment_status ON accounting_expenses;

CREATE TRIGGER trg_expenses_sync_payment_status
  BEFORE UPDATE ON accounting_expenses
  FOR EACH ROW
  EXECUTE FUNCTION sync_payment_status_from_date();

-- ============================================================
-- 3. 掛在 accounting_payroll
-- ============================================================

DROP TRIGGER IF EXISTS trg_payroll_sync_payment_status ON accounting_payroll;

CREATE TRIGGER trg_payroll_sync_payment_status
  BEFORE UPDATE ON accounting_payroll
  FOR EACH ROW
  EXECUTE FUNCTION sync_payment_status_from_date();

-- ============================================================
-- 4. 回填：payment_date 有值但 payment_status 仍為 unpaid
-- ============================================================

UPDATE accounting_expenses
SET payment_status = 'paid',
    paid_at = COALESCE(paid_at, NOW())
WHERE payment_date IS NOT NULL
  AND payment_status = 'unpaid';

UPDATE accounting_payroll
SET payment_status = 'paid',
    paid_at = COALESCE(paid_at, NOW())
WHERE payment_date IS NOT NULL
  AND payment_status = 'unpaid';

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
