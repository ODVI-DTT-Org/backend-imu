-- ============================================================
-- Migration 047: Extend Client Schema for Legacy Data
-- ============================================================

BEGIN;

-- Add ALL legacy fields to preserve old data
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ext_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS fullname TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS full_address TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS account_code TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS rank TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS monthly_pension_amount NUMERIC(14,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS monthly_pension_gross NUMERIC(14,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS atm_number TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS applicable_republic_act TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS unit_code TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pcni_acct_code TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS dob TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS g_company TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS g_status TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Add index for account_number lookups
CREATE INDEX IF NOT EXISTS idx_clients_account_number ON clients(account_number);

-- Add comments
COMMENT ON COLUMN clients.ext_name IS 'Extension name (Jr., Sr., III) - from old CMS';
COMMENT ON COLUMN clients.fullname IS 'Full name in format: LASTNAME, FIRSTNAME MIDDLENAME - from old CMS';
COMMENT ON COLUMN clients.account_number IS 'Legacy PCNI account number - from old CMS';
COMMENT ON COLUMN clients.dob IS 'Date of birth as TEXT (preserving legacy format) - from old CMS';

COMMIT;
