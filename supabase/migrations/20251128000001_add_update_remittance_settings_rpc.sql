-- Create a function to update remittance settings that bypasses RLS
CREATE OR REPLACE FUNCTION update_remittance_settings(
  p_confirmation_id uuid,
  p_settings jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  UPDATE payment_confirmations
  SET 
    remittance_settings = p_settings,
    updated_at = NOW()
  WHERE id = p_confirmation_id
  RETURNING remittance_settings INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION update_remittance_settings IS 'Update remittance settings for a confirmation record (bypassing RLS)';

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
