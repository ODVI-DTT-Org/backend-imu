-- Migration: Add touchpoint_reasons table
-- Stores the standard touchpoint reason codes

CREATE TABLE IF NOT EXISTS touchpoint_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    color TEXT DEFAULT '#6B7280',
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_touchpoint_reasons_code ON touchpoint_reasons(code);
CREATE INDEX IF NOT EXISTS idx_touchpoint_reasons_sort ON touchpoint_reasons(sort_order);

-- Insert standard touchpoint reasons
INSERT INTO touchpoint_reasons (code, label, color, sort_order) VALUES
    ('ABROAD', 'Abroad', '#546E7A', 1),
    ('APPLY_MEMBERSHIP', 'Apply for PUSU Membership / LIKA Membership', '#66BB6A', 2),
    ('BACKED_OUT', 'Backed Out', '#EF5350', 3),
    ('CI_BI', 'CI/BI', '#42A5F5', 4),
    ('DECEASED', 'Deceased', '#424242', 5),
    ('DISAPPROVED', 'Disapproved', '#E53935', 6),
    ('FOR_ADA_COMPLIANCE', 'For ADA Compliance', '#26C6DA', 7),
    ('FOR_PROCESSING', 'For Processing / Approval / Request / Buy-Out', '#5C6BC0', 8),
    ('FOR_UPDATE', 'For Update', '#AB47BC', 9),
    ('FOR_VERIFICATION', 'For Verification', '#26A69A', 10),
    ('INACCESSIBLE_AREA', 'Inaccessible / Critical Area', '#78909C', 11),
    ('INTERESTED', 'Interested', '#4CAF50', 12),
    ('LOAN_INQUIRY', 'Loan Inquiry', '#2196F3', 13),
    ('MOVED_OUT', 'Moved Out', '#9E9E9E', 14),
    ('NOT_AMENABLE', 'Not Amenable to Our Product Criteria', '#8D6E63', 15),
    ('NOT_AROUND', 'Not Around', '#BDBDBD', 16),
    ('NOT_IN_LIST', 'Not In the List', '#9E9E9E', 17),
    ('NOT_INTERESTED', 'Not Interested', '#F44336', 18),
    ('OVERAGE', 'Overage', '#FFA726', 19),
    ('POOR_HEALTH', 'Poor Health Condition', '#FF7043', 20),
    ('RETURNED_ATM', 'Returned ATM / Pick-up ATM', '#EC407A', 21),
    ('UNDECIDED', 'Undecided', '#FF9800', 22),
    ('UNLOCATED', 'Unlocated', '#BDBDBD', 23),
    ('WITH_OTHER_LENDING', 'With Other Lending', '#7E57C2', 24),
    ('INTERESTED_FAMILY_DECLINED', 'Interested, But Declined Due to Family''s Decision', '#FFB300', 25),
    ('TELEMARKETING', 'Telemarketing', '#29B6F6', 26)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    color = EXCLUDED.color,
    sort_order = EXCLUDED.sort_order;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_touchpoint_reasons_updated_at ON touchpoint_reasons;
CREATE TRIGGER update_touchpoint_reasons_updated_at
    BEFORE UPDATE ON touchpoint_reasons
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
