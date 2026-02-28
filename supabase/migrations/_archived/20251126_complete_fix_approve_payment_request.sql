-- Complete fix for approve_payment_request function with all snapshot fields
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
  v_kol_name text;
  v_project_name text;
  v_service text;
BEGIN
  -- Get all necessary details for snapshotting
  SELECT 
    pr.cost_amount,
    k.name,
    q.project_name,
    qi.service
  INTO 
    v_cost_amount,
    v_kol_name,
    v_project_name,
    v_service
  FROM payment_requests pr
  JOIN quotation_items qi ON pr.quotation_item_id = qi.id
  LEFT JOIN kols k ON qi.kol_id = k.id
  LEFT JOIN quotations q ON qi.quotation_id = q.id
  WHERE pr.id = request_id;

  -- Validation checks
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

  -- Create confirmation item with all snapshot fields
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

COMMENT ON FUNCTION approve_payment_request IS '核准請款申請並建立確認記錄（包含完整快照資訊）';
