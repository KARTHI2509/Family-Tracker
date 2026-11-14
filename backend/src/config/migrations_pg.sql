-- FamilyTracker V3 Multi-Group Location Sharing - PostgreSQL Migration
-- Enables One User Account across Multiple Independent Groups

-- 1. Create GROUPS table
CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    group_type VARCHAR(50) DEFAULT 'FAMILY',
    avatar_color VARCHAR(50) DEFAULT '#4F46E5',
    icon VARCHAR(50) DEFAULT 'Users',
    created_by INTEGER NOT NULL REFERENCES users(id),
    invite_code VARCHAR(50) UNIQUE NOT NULL,
    invite_expiry TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'active'
);

-- 2. Create GROUP_MEMBERS table (Many-to-Many membership)
CREATE TABLE IF NOT EXISTS group_members (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'MEMBER',
    membership_status VARCHAR(50) DEFAULT 'ACTIVE',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id, user_id)
);

-- 3. Create GROUP_LOCATION_SETTINGS table (Per-Group sharing consent)
CREATE TABLE IF NOT EXISTS group_location_settings (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sharing_enabled SMALLINT DEFAULT 1,
    history_enabled SMALLINT DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id, user_id)
);

-- 4. Add group_id references to existing data tables if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='locations' AND column_name='group_id') THEN
        ALTER TABLE locations ADD COLUMN group_id INTEGER REFERENCES groups(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='geofences' AND column_name='group_id') THEN
        ALTER TABLE geofences ADD COLUMN group_id INTEGER REFERENCES groups(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='alerts' AND column_name='group_id') THEN
        ALTER TABLE alerts ADD COLUMN group_id INTEGER REFERENCES groups(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='journeys' AND column_name='group_id') THEN
        ALTER TABLE journeys ADD COLUMN group_id INTEGER REFERENCES groups(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sos_events' AND column_name='group_ids') THEN
        ALTER TABLE sos_events ADD COLUMN group_ids TEXT;
    END IF;
END $$;

-- 5. Safe Data Migration: Copy existing families into groups
INSERT INTO groups (id, name, group_type, avatar_color, icon, created_by, invite_code, created_at, status)
SELECT id, name, 'FAMILY', '#4F46E5', 'Users', created_by, invite_code, created_at, 'active'
FROM families
ON CONFLICT (id) DO NOTHING;

-- 6. Copy existing user-family memberships into group_members
INSERT INTO group_members (group_id, user_id, role, membership_status, joined_at)
SELECT 
    u.family_id,
    u.id,
    CASE WHEN u.id = f.created_by THEN 'OWNER' ELSE 'MEMBER' END,
    'ACTIVE',
    u.created_at
FROM users u
JOIN families f ON u.family_id = f.id
WHERE u.family_id IS NOT NULL
ON CONFLICT (group_id, user_id) DO NOTHING;

-- 7. Initialize group location settings
INSERT INTO group_location_settings (group_id, user_id, sharing_enabled, history_enabled, created_at)
SELECT group_id, user_id, 1, 1, joined_at
FROM group_members
ON CONFLICT (group_id, user_id) DO NOTHING;

-- 8. Backfill group_id on historical data
UPDATE locations SET group_id = family_id WHERE group_id IS NULL AND family_id IS NOT NULL;
UPDATE geofences SET group_id = family_id WHERE group_id IS NULL AND family_id IS NOT NULL;
UPDATE alerts SET group_id = family_id WHERE group_id IS NULL AND family_id IS NOT NULL;
UPDATE journeys SET group_id = family_id WHERE group_id IS NULL AND family_id IS NOT NULL;

-- 9. Create Performance Indexes
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_location_settings ON group_location_settings(group_id, user_id);
CREATE INDEX IF NOT EXISTS idx_groups_invite_code ON groups(invite_code);
CREATE INDEX IF NOT EXISTS idx_locations_group_timestamp ON locations(group_id, user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_geofences_group ON geofences(group_id);
CREATE INDEX IF NOT EXISTS idx_alerts_group ON alerts(group_id, created_at);

