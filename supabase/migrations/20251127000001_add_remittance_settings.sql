-- Add remittance_settings column to payment_confirmations table
ALTER TABLE payment_confirmations 
ADD COLUMN IF NOT EXISTS remittance_settings JSONB DEFAULT '{}'::jsonb;

-- Add comment to explain the structure
COMMENT ON COLUMN payment_confirmations.remittance_settings IS 'Stores remittance group settings. Key: Remittance Name, Value: { hasRemittanceFee: boolean, remittanceFeeAmount: number, hasTax: boolean, hasInsurance: boolean }';
