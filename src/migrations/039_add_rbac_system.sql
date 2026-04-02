-- Migration 033: Add Robust RBAC System with Permissions
-- This migration creates a proper role-based access control system
-- with fine-grained permissions while maintaining backward compatibility

-- ============================================
-- PREREQUISITE VALIDATION
-- ============================================

DO $$
DECLARE
    users_table_exists BOOLEAN;
    users_role_column_exists BOOLEAN;
    uuid_extension_exists BOOLEAN;
    update_function_exists BOOLEAN;
    error_message TEXT;
BEGIN
    -- Check if users table exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'users'
    ) INTO users_table_exists;

    IF NOT users_table_exists THEN
        RAISE EXCEPTION 'Prerequisite failed: users table does not exist. Please run previous migrations first.';
    END IF;

    -- Check if users.role column exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'role'
    ) INTO users_role_column_exists;

    IF NOT users_role_column_exists THEN
        RAISE EXCEPTION 'Prerequisite failed: users.role column does not exist. Please run migration that adds role column first.';
    END IF;

    -- Check if uuid-ossp extension exists
    SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp'
    ) INTO uuid_extension_exists;

    IF NOT uuid_extension_exists THEN
        RAISE EXCEPTION 'Prerequisite failed: uuid-ossp extension is not installed. Run: CREATE EXTENSION IF NOT EXISTS "uuid-ossp";';
    END IF;

    -- Check if update_updated_at_column function exists
    SELECT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column'
    ) INTO update_function_exists;

    IF NOT update_function_exists THEN
        RAISE NOTICE 'Warning: update_updated_at_column function does not exist. Trigger will not be created.';
    END IF;

    RAISE NOTICE 'Prerequisite validation passed: All required dependencies are installed.';
END $$;

BEGIN;

-- ============================================
-- NEW RBAC TABLES
-- ============================================

-- Roles table (replaces hardcoded role values)
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    level INTEGER DEFAULT 0, -- For hierarchy (admin=100, area_manager=50, etc.)
    is_system BOOLEAN DEFAULT FALSE, -- System roles cannot be deleted
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permissions table
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource TEXT NOT NULL, -- e.g., 'clients', 'users', 'reports', 'touchpoints'
    action TEXT NOT NULL,   -- e.g., 'create', 'read', 'update', 'delete', 'export'
    description TEXT,
    constraint_name TEXT,   -- Optional: e.g., 'own_only', 'assigned_area'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(resource, action, constraint_name)
);

-- Role permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    granted_by UUID REFERENCES users(id),
    UNIQUE(role_id, permission_id)
);

-- User roles junction table (supports multiple roles per user)
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id),
    expires_at TIMESTAMPTZ, -- For temporary role assignments
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, role_id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON user_roles(user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_permissions_resource_action ON permissions(resource, action);

-- ============================================
-- TRIGGERS
-- ============================================

-- Updated at trigger for roles (only if function exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        CREATE TRIGGER update_roles_updated_at
            BEFORE UPDATE ON roles
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        RAISE NOTICE 'Created update_roles_updated_at trigger';
    ELSE
        RAISE NOTICE 'Skipped update_roles_updated_at trigger (update_updated_at_column function not found)';
    END IF;
END $$;

-- ============================================
-- SEED SYSTEM ROLES
-- ============================================

INSERT INTO roles (name, slug, description, level, is_system) VALUES
    ('System Administrator', 'admin', 'Full system access with no restrictions', 100, TRUE),
    ('Area Manager', 'area_manager', 'Regional oversight with full access to assigned areas', 50, TRUE),
    ('Assistant Area Manager', 'assistant_area_manager', 'Area management support with limited permissions', 40, TRUE),
    ('Caravan (Field Agent)', 'caravan', 'Field agents who conduct in-person client visits', 20, TRUE),
    ('Telemarketer', 'tele', 'Telemarketers who conduct phone-based outreach', 15, TRUE)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- SEED PERMISSIONS
-- ============================================

-- User management permissions
INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('users', 'create', NULL, 'Create new users'),
    ('users', 'read', NULL, 'View user information'),
    ('users', 'update', NULL, 'Edit user information'),
    ('users', 'delete', NULL, 'Delete users'),
    ('users', 'assign_role', NULL, 'Assign roles to users'),
    ('users', 'assign_area', NULL, 'Assign municipalities to users')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- Client management permissions
INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('clients', 'create', NULL, 'Create new clients'),
    ('clients', 'read', 'own', 'View own assigned clients'),
    ('clients', 'read', 'area', 'View all clients in assigned area'),
    ('clients', 'read', 'all', 'View all clients'),
    ('clients', 'update', 'own', 'Edit own assigned clients'),
    ('clients', 'update', 'area', 'Edit any client in assigned area'),
    ('clients', 'update', 'all', 'Edit any client'),
    ('clients', 'delete', 'all', 'Delete clients'),
    ('clients', 'assign', 'own', 'Assign clients to self'),
    ('clients', 'assign', 'area', 'Assign clients to users in area')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- Touchpoint permissions
INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('touchpoints', 'create', 'visit', 'Create Visit touchpoints (1, 4, 7)'),
    ('touchpoints', 'create', 'call', 'Create Call touchpoints (2, 3, 5, 6)'),
    ('touchpoints', 'create', 'any', 'Create any touchpoint type'),
    ('touchpoints', 'read', 'own', 'View own touchpoints'),
    ('touchpoints', 'read', 'area', 'View touchpoints in assigned area'),
    ('touchpoints', 'update', 'own', 'Edit own touchpoints'),
    ('touchpoints', 'update', 'area', 'Edit any touchpoint in area'),
    ('touchpoints', 'delete', 'all', 'Delete touchpoints')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- Itinerary permissions
INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('itineraries', 'create', NULL, 'Create itineraries'),
    ('itineraries', 'read', 'own', 'View own itineraries'),
    ('itineraries', 'read', 'area', 'View itineraries in assigned area'),
    ('itineraries', 'update', 'own', 'Edit own itineraries'),
    ('itineraries', 'update', 'area', 'Edit any itinerary in area'),
    ('itineraries', 'delete', 'all', 'Delete itineraries')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- Report permissions
INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('reports', 'read', 'own', 'View own reports'),
    ('reports', 'read', 'area', 'View reports for assigned area'),
    ('reports', 'read', 'all', 'View all reports'),
    ('reports', 'export', 'area', 'Export reports for assigned area'),
    ('reports', 'export', 'all', 'Export any reports')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- Agency permissions
INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('agencies', 'read', NULL, 'View agency information'),
    ('agencies', 'create', NULL, 'Create new agencies'),
    ('agencies', 'update', NULL, 'Edit agency information'),
    ('agencies', 'delete', NULL, 'Delete agencies')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- Group permissions
INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('groups', 'read', NULL, 'View group information'),
    ('groups', 'create', NULL, 'Create new groups'),
    ('groups', 'update', NULL, 'Edit group information'),
    ('groups', 'delete', NULL, 'Delete groups'),
    ('groups', 'manage_members', NULL, 'Add/remove group members')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- Target permissions
INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('targets', 'read', 'own', 'View own targets'),
    ('targets', 'read', 'area', 'View targets for users in area'),
    ('targets', 'set', 'area', 'Set targets for users in area')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- Attendance permissions
INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('attendance', 'create', 'own', 'Mark own attendance'),
    ('attendance', 'read', 'area', 'View attendance for area'),
    ('attendance', 'read', 'all', 'View all attendance')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- System permissions
INSERT INTO permissions (resource, action, constraint_name, description) VALUES
    ('system', 'configure', NULL, 'Configure system settings'),
    ('audit_logs', 'read', 'own', 'View own audit logs'),
    ('audit_logs', 'read', 'area', 'View audit logs for area'),
    ('audit_logs', 'read', 'all', 'View all audit logs')
ON CONFLICT (resource, action, constraint_name) DO NOTHING;

-- ============================================
-- ASSIGN PERMISSIONS TO ROLES
-- ============================================

-- Admin: All permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.slug = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Area Manager: Full area access, no system config
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
    p.resource IN ('users', 'clients', 'touchpoints', 'itineraries', 'reports', 'groups', 'targets', 'attendance', 'audit_logs')
    AND (p.constraint_name IS NULL OR p.constraint_name IN ('area', 'all'))
    AND p.action NOT IN ('delete', 'configure', 'system')
)
WHERE r.slug = 'area_manager'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Assistant Area Manager: Limited area access
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
    p.resource IN ('clients', 'touchpoints', 'itineraries', 'reports', 'targets', 'attendance')
    AND (p.constraint_name IN ('area', 'own') OR p.action = 'read')
    AND p.action NOT IN ('delete')
)
WHERE r.slug = 'assistant_area_manager'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Caravan: Client and touchpoint management (own data only, Visit touchpoints only)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
    (p.resource = 'clients' AND p.action IN ('create', 'read', 'update') AND p.constraint_name = 'own')
    OR (p.resource = 'touchpoints' AND p.action = 'create' AND p.constraint_name = 'visit')
    OR (p.resource = 'touchpoints' AND p.action IN ('read', 'update') AND p.constraint_name = 'own')
    OR (p.resource = 'itineraries' AND p.action IN ('create', 'read', 'update') AND p.constraint_name = 'own')
    OR (p.resource = 'attendance' AND p.action = 'create' AND p.constraint_name = 'own')
    OR (p.resource = 'targets' AND p.action = 'read' AND p.constraint_name = 'own')
)
WHERE r.slug = 'caravan'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Tele: Touchpoint management (Call touchpoints only), read-only clients
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
    (p.resource = 'clients' AND p.action = 'read' AND p.constraint_name = 'own')
    OR (p.resource = 'touchpoints' AND p.action = 'create' AND p.constraint_name = 'call')
    OR (p.resource = 'touchpoints' AND p.action IN ('read', 'update') AND p.constraint_name = 'own')
    OR (p.resource = 'itineraries' AND p.action = 'read' AND p.constraint_name = 'assigned')
    OR (p.resource = 'targets' AND p.action = 'read' AND p.constraint_name = 'own')
)
WHERE r.slug = 'tele'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================
-- MIGRATE EXISTING USERS TO NEW RBAC SYSTEM
-- ============================================

-- Map existing user roles to new role-based system
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT
    u.id,
    r.id,
    u.id -- Self-assigned during migration
FROM users u
JOIN roles r ON r.slug = u.role
LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.role_id = r.id
WHERE ur.id IS NULL
ON CONFLICT (user_id, role_id) DO NOTHING;

-- ============================================
-- CREATE VIEWS FOR EASY PERMISSION CHECKING
-- ============================================

-- View: User permissions (flattened for easy querying)
CREATE OR REPLACE VIEW user_permissions_view AS
SELECT
    ur.user_id,
    r.slug AS role_slug,
    r.name AS role_name,
    p.resource,
    p.action,
    p.constraint_name,
    r.level AS role_level
FROM user_roles ur
JOIN roles r ON ur.role_id = r.id
JOIN role_permissions rp ON rp.role_id = r.id
JOIN permissions p ON rp.permission_id = p.id
WHERE ur.is_active = TRUE
  AND (ur.expires_at IS NULL OR ur.expires_at > NOW());

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function: Check if user has specific permission
CREATE OR REPLACE FUNCTION has_permission(
    p_user_id UUID,
    p_resource TEXT,
    p_action TEXT,
    p_constraint TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1
        FROM user_permissions_view
        WHERE user_id = p_user_id
          AND resource = p_resource
          AND action = p_action
          AND (constraint_name = p_constraint OR constraint_name IS NULL OR p_constraint IS NULL)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get user permissions
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id UUID)
RETURNS TABLE (
    resource TEXT,
    action TEXT,
    constraint_name TEXT,
    role_slug TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        upv.resource,
        upv.action,
        upv.constraint_name,
        upv.role_slug
    FROM user_permissions_view upv
    WHERE upv.user_id = p_user_id
    ORDER BY upv.resource, upv.action;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Check if user has any role (for backward compatibility)
CREATE OR REPLACE FUNCTION has_role(p_user_id UUID, p_role_slug TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = p_user_id
          AND r.slug = p_role_slug
          AND ur.is_active = TRUE
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- BACKWARD COMPATIBILITY VIEWS
-- ============================================

-- View: Users with their primary role (for backward compatibility)
CREATE OR REPLACE VIEW users_with_roles AS
SELECT
    u.id, u.email, u.password_hash, u.first_name, u.last_name, u.middle_name,
    u.phone, u.avatar_url, u.is_active, u.last_login_at,
    u.created_at, u.updated_at,
    r.slug AS role,
    r.name AS role_name
FROM users u
LEFT JOIN LATERAL (
    SELECT r.slug, r.name
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = u.id
      AND ur.is_active = TRUE
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    ORDER BY r.level DESC
    LIMIT 1
) r ON TRUE;

COMMIT;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify roles created
SELECT 'Roles created:' as info, COUNT(*) as count FROM roles;

-- Verify permissions created
SELECT 'Permissions created:' as info, COUNT(*) as count FROM permissions;

-- Verify role permissions assigned
SELECT 'Role permissions assigned:' as info, COUNT(*) as count FROM role_permissions;

-- Verify users migrated
SELECT 'Users migrated to RBAC:' as info, COUNT(*) as count FROM user_roles WHERE is_active = TRUE;

SELECT 'Migration 033: RBAC system installed successfully!' as result;
