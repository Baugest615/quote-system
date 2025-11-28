-- Force schema cache refresh by modifying the column comment and notifying pgrst
-- This is a more aggressive attempt to fix the PGRST204 error

-- 1. Ensure the column exists (idempotent)
ALTER TABLE payment_confirmations 
ADD COLUMN IF NOT EXISTS remittance_settings JSONB DEFAULT '{}'::jsonb;

-- 2. Update the comment to force a schema change event
COMMENT ON COLUMN payment_confirmations.remittance_settings IS 'Stores remittance group settings (Fee, Tax, Insurance). Force refresh.';

-- 3. Explicitly notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
