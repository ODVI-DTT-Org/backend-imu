-- Migration: Add fields for 5000 client data import
-- This migration adds new columns to support the 5000 client data from CSV source

-- ============================================
-- STEP 1: Add new columns to clients table
-- ============================================

DO $$
BEGIN
    -- Extension name (Jr, Sr, III, etc.)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'ext_name'
    ) THEN
        ALTER TABLE clients ADD COLUMN ext_name TEXT;
    END IF;

    -- Formatted full name "LAST, FIRST MIDDLE"
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'fullname'
    ) THEN
        ALTER TABLE clients ADD COLUMN fullname TEXT;
    END IF;

    -- Complete address string
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'full_address'
    ) THEN
        ALTER TABLE clients ADD COLUMN full_address TEXT;
    END IF;

    -- Account code
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'account_code'
    ) THEN
        ALTER TABLE clients ADD COLUMN account_code TEXT;
    END IF;

    -- Account number
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'account_number'
    ) THEN
        ALTER TABLE clients ADD COLUMN account_number TEXT;
    END IF;

    -- Military/police rank
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'rank'
    ) THEN
        ALTER TABLE clients ADD COLUMN rank TEXT;
    END IF;

    -- Monthly pension amount
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'monthly_pension_amount'
    ) THEN
        ALTER TABLE clients ADD COLUMN monthly_pension_amount NUMERIC(12, 2);
    END IF;

    -- Monthly pension gross amount
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'monthly_pension_gross'
    ) THEN
        ALTER TABLE clients ADD COLUMN monthly_pension_gross NUMERIC(12, 2);
    END IF;

    -- ATM number
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'atm_number'
    ) THEN
        ALTER TABLE clients ADD COLUMN atm_number TEXT;
    END IF;

    -- Applicable republic act
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'applicable_republic_act'
    ) THEN
        ALTER TABLE clients ADD COLUMN applicable_republic_act TEXT;
    END IF;

    -- Unit code
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'unit_code'
    ) THEN
        ALTER TABLE clients ADD COLUMN unit_code TEXT;
    END IF;

    -- PCNI account code
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'pcni_acct_code'
    ) THEN
        ALTER TABLE clients ADD COLUMN pcni_acct_code TEXT;
    END IF;

    -- 3G company
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = '3g_company'
    ) THEN
        ALTER TABLE clients ADD COLUMN "3g_company" TEXT;
    END IF;

    -- 3G status
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = '3g_status'
    ) THEN
        ALTER TABLE clients ADD COLUMN "3g_status" TEXT;
    END IF;

    -- DMVAL code
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'DMVAL_code'
    ) THEN
        ALTER TABLE clients ADD COLUMN "DMVAL_code" TEXT;
    END IF;

    -- DMVAL name
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'DMVAL_name'
    ) THEN
        ALTER TABLE clients ADD COLUMN "DMVAL_name" TEXT;
    END IF;

    -- DMVAL amount
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'DMVAL_amount'
    ) THEN
        ALTER TABLE clients ADD COLUMN "DMVAL_amount" NUMERIC(12, 2);
    END IF;

    -- Next visit date
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'next_visit'
    ) THEN
        ALTER TABLE clients ADD COLUMN next_visit DATE;
    END IF;

    -- Last visit date
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'last_visit'
    ) THEN
        ALTER TABLE clients ADD COLUMN last_visit DATE;
    END IF;

    -- Client status (active/inactive)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'client_status'
    ) THEN
        ALTER TABLE clients ADD COLUMN client_status TEXT
        CHECK (client_status IN ('active', 'inactive'));
    END IF;

    -- Created by (text field, no foreign key)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'legacy_created_by'
    ) THEN
        ALTER TABLE clients ADD COLUMN legacy_created_by TEXT;
    END IF;

    -- Secondary municipality
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'secondary_municipality'
    ) THEN
        ALTER TABLE clients ADD COLUMN secondary_municipality TEXT;
    END IF;

    -- Secondary province
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'secondary_province'
    ) THEN
        ALTER TABLE clients ADD COLUMN secondary_province TEXT;
    END IF;

    -- Secondary full address
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'secondary_full_address'
    ) THEN
        ALTER TABLE clients ADD COLUMN secondary_full_address TEXT;
    END IF;
END $$;

-- ============================================
-- STEP 2: Create indexes for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_clients_fullname ON clients(fullname);
CREATE INDEX IF NOT EXISTS idx_clients_account_code ON clients(account_code);
CREATE INDEX IF NOT EXISTS idx_clients_account_number ON clients(account_number);
CREATE INDEX IF NOT EXISTS idx_clients_rank ON clients(rank);
CREATE INDEX IF NOT EXISTS idx_clients_atm_number ON clients(atm_number);
CREATE INDEX IF NOT EXISTS idx_clients_unit_code ON clients(unit_code);
CREATE INDEX IF NOT EXISTS idx_clients_pcni_acct_code ON clients(pcni_acct_code);
CREATE INDEX IF NOT EXISTS idx_clients_client_status ON clients(client_status);
CREATE INDEX IF NOT EXISTS idx_clients_next_visit ON clients(next_visit);
CREATE INDEX IF NOT EXISTS idx_clients_last_visit ON clients(last_visit);
CREATE INDEX IF NOT EXISTS idx_clients_legacy_created_by ON clients(legacy_created_by);

-- ============================================
-- STEP 3: Add comments for documentation
-- ============================================

COMMENT ON COLUMN clients.ext_name IS 'Extension name (Jr, Sr, III, etc.)';
COMMENT ON COLUMN clients.fullname IS 'Formatted full name "LAST, FIRST MIDDLE"';
COMMENT ON COLUMN clients.full_address IS 'Complete address string';
COMMENT ON COLUMN clients.account_code IS 'Account code';
COMMENT ON COLUMN clients.account_number IS 'Account number';
COMMENT ON COLUMN clients.rank IS 'Military/police rank';
COMMENT ON COLUMN clients.monthly_pension_amount IS 'Monthly pension amount';
COMMENT ON COLUMN clients.monthly_pension_gross IS 'Monthly pension gross amount';
COMMENT ON COLUMN clients.atm_number IS 'ATM number';
COMMENT ON COLUMN clients.applicable_republic_act IS 'Applicable Republic Act';
COMMENT ON COLUMN clients.unit_code IS 'Unit code';
COMMENT ON COLUMN clients.pcni_acct_code IS 'PCNI account code';
COMMENT ON COLUMN clients."3g_company" IS '3G company';
COMMENT ON COLUMN clients."3g_status" IS '3G status';
COMMENT ON COLUMN clients."DMVAL_code" IS 'DMVAL code';
COMMENT ON COLUMN clients."DMVAL_name" IS 'DMVAL name';
COMMENT ON COLUMN clients."DMVAL_amount" IS 'DMVAL amount';
COMMENT ON COLUMN clients.next_visit IS 'Next visit date';
COMMENT ON COLUMN clients.last_visit IS 'Last visit date';
COMMENT ON COLUMN clients.client_status IS 'Client status (active/inactive)';
COMMENT ON COLUMN clients.legacy_created_by IS 'Legacy created_by identifier from CSV import (no FK)';
COMMENT ON COLUMN clients.secondary_municipality IS 'Secondary municipality/city';
COMMENT ON COLUMN clients.secondary_province IS 'Secondary province';
COMMENT ON COLUMN clients.secondary_full_address IS 'Secondary full address';

-- ============================================
-- STEP 4: Verification query
-- ============================================

SELECT
    'Migration 038 completed!' as result,
    NOW() as completed_at;
