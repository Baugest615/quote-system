-- Force creation of missing RPCs
-- This migration ensures that ungroup_payment_requests and update_remittance_settings exist
-- even if previous migrations were skipped or partially applied.

-- 1. ungroup_payment_requests
CREATE OR REPLACE FUNCTION ungroup_payment_requests(
  p_group_id uuid
) RETURNS void AS $$
DECLARE
  v_req record;
BEGIN
  FOR v_req IN SELECT * FROM payment_requests WHERE merge_group_id = p_group_id
  LOOP
    IF v_req.rejection_reason IS NOT NULL THEN
       -- If it has rejection history, revert to rejected state and ungroup
       UPDATE payment_requests
       SET merge_group_id = NULL,
           merge_type = NULL,
           is_merge_leader = false,
           verification_status = 'rejected',
           request_date = v_req.created_at::date::text, -- Restore date logic
           updated_at = NOW()
       WHERE id = v_req.id;
    ELSE
       -- If it was a fresh draft, delete it
       DELETE FROM payment_requests WHERE id = v_req.id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 2. update_remittance_settings
CREATE OR REPLACE FUNCTION update_remittance_settings(
  p_confirmation_id uuid,
  p_settings jsonb
) RETURNS jsonb AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions just in case
GRANT EXECUTE ON FUNCTION ungroup_payment_requests(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION ungroup_payment_requests(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION update_remittance_settings(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION update_remittance_settings(uuid, jsonb) TO service_role;
