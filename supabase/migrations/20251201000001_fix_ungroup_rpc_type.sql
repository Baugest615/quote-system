-- Fix type mismatch in ungroup_payment_requests
-- The column merge_group_id is text, but p_group_id is uuid.
-- We need to cast p_group_id to text for the comparison.

CREATE OR REPLACE FUNCTION ungroup_payment_requests(
  p_group_id uuid
) RETURNS void AS $$
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
$$ LANGUAGE plpgsql;

-- Ensure permissions are still correct
GRANT EXECUTE ON FUNCTION ungroup_payment_requests(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION ungroup_payment_requests(uuid) TO service_role;

-- Reload schema cache
NOTIFY pgrst, 'reload config';
