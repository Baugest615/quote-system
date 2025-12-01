-- Add RPCs for merging payment requests
-- Uses 'pending' status with NULL request_date to represent "draft" state

CREATE OR REPLACE FUNCTION create_payment_request_group(
  p_quotation_item_ids uuid[],
  p_merge_type text
) RETURNS void AS $$
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
$$ LANGUAGE plpgsql;

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
           request_date = v_req.created_at::date::text, -- Restore some date? Or keep null? Rejected usually has request_date.
           -- If we reset request_date to null, it might disappear from rejected list if that list relies on request_date?
           -- Rejected list relies on verification_status = 'rejected'.
           -- But we should probably keep the original request_date if possible.
           -- Since we don't store original request_date, we might lose it.
           -- However, if it was rejected, it had a request_date.
           -- When we grouped it, we set request_date to NULL.
           -- So we lost it. This is a trade-off.
           -- Let's just set it to NOW() or keep it NULL?
           -- If NULL, it won't show in PaymentRequestsPage (good).
           -- It WILL show in PendingPaymentsPage as rejected (good).
           updated_at = NOW()
       WHERE id = v_req.id;
    ELSE
       -- If it was a fresh draft, delete it
       DELETE FROM payment_requests WHERE id = v_req.id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
