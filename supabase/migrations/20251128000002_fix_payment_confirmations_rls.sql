-- Enable RLS on payment_confirmations table
ALTER TABLE payment_confirmations ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to update payment_confirmations
-- We use a DO block to avoid errors if the policy already exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'payment_confirmations'
        AND policyname = 'Enable update for authenticated users'
    ) THEN
        CREATE POLICY "Enable update for authenticated users"
        ON payment_confirmations
        FOR UPDATE
        TO authenticated
        USING (true)
        WITH CHECK (true);
    END IF;
END
$$;

-- Create policy to allow authenticated users to select payment_confirmations
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'payment_confirmations'
        AND policyname = 'Enable select for authenticated users'
    ) THEN
        CREATE POLICY "Enable select for authenticated users"
        ON payment_confirmations
        FOR SELECT
        TO authenticated
        USING (true);
    END IF;
END
$$;

-- Notify PostgREST to reload schema cache (just in case)
NOTIFY pgrst, 'reload schema';
