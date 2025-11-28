-- Final fix for approve_payment_request function
CREATE OR REPLACE FUNCTION approve_payment_request(
  request_id uuid,
  verifier_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_confirmation_id uuid;
  v_cost_amount numeric;
  v_confirmation_date date;
BEGIN
  -- Get the cost amount from the request
  SELECT cost_amount INTO v_cost_amount
  FROM payment_requests
  WHERE id = request_id;

  -- Check if cost_amount is null
  IF v_cost_amount IS NULL THEN
    RAISE EXCEPTION 'Cost amount not found for payment request %', request_id;
  END IF;

  -- Set confirmation date to today
  v_confirmation_date := CURRENT_DATE;

  -- Check if a confirmation record exists for today
  SELECT id INTO v_confirmation_id
  FROM payment_confirmations
  WHERE confirmation_date = v_confirmation_date
  LIMIT 1;

  -- If no confirmation exists for today, create one
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
    -- Update existing confirmation totals
    UPDATE payment_confirmations
    SET 
      total_amount = total_amount + v_cost_amount,
      total_items = total_items + 1
    WHERE id = v_confirmation_id;
  END IF;

  -- Create confirmation item with amount_at_confirmation
  INSERT INTO payment_confirmation_items (
    payment_confirmation_id,
    payment_request_id,
    amount_at_confirmation,
    created_at
  ) VALUES (
    v_confirmation_id,
    request_id,
    v_cost_amount,
    NOW()
  );

  -- Update payment request status
  UPDATE payment_requests
  SET 
    verification_status = 'approved',
    approved_by = verifier_id,
    approved_at = NOW(),
    updated_at = NOW()
  WHERE id = request_id;
END;
$$;

COMMENT ON FUNCTION approve_payment_request IS '核准請款申請並建立確認記錄';
