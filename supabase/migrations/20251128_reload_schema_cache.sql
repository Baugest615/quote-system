-- Reload PostgREST schema cache to ensure new columns are picked up
NOTIFY pgrst, 'reload schema';
