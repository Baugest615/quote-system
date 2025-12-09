-- Add contact_email and contact_phone to quotations table
ALTER TABLE quotations
ADD COLUMN contact_email text,
ADD COLUMN contact_phone text;

COMMENT ON COLUMN quotations.contact_email IS 'Snapshot of the contact email at the time of quote creation/update';
COMMENT ON COLUMN quotations.contact_phone IS 'Snapshot of the contact phone at the time of quote creation/update';
