-- Migration to sync remittance_name from KOL bank info to quotation_items
-- Only for items where remittance_name is currently NULL or empty
-- And ONLY for Company accounts where companyAccountName is present
-- We do NOT auto-populate for Individual accounts or if companyAccountName is missing

UPDATE quotation_items qi
SET remittance_name = k.bank_info->>'companyAccountName'
FROM kols k
WHERE qi.kol_id = k.id
  AND (qi.remittance_name IS NULL OR qi.remittance_name = '')
  AND (k.bank_info->>'bankType') = 'company'
  AND k.bank_info->>'companyAccountName' IS NOT NULL
  AND k.bank_info->>'companyAccountName' <> ''
  AND k.bank_info->>'bankName' IS NOT NULL
  AND k.bank_info->>'bankName' <> '';

UPDATE quotation_items qi
SET remittance_name = k.bank_info->>'personalAccountName'
FROM kols k
WHERE qi.kol_id = k.id
  AND (qi.remittance_name IS NULL OR qi.remittance_name = '')
  AND (k.bank_info->>'bankType') = 'individual'
  AND k.bank_info->>'personalAccountName' IS NOT NULL
  AND k.bank_info->>'personalAccountName' <> ''
  AND k.bank_info->>'bankName' IS NOT NULL
  AND k.bank_info->>'bankName' <> '';
