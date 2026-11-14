const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Resolve database path safely for local, Docker, or Cloud deployments (Render, Railway, etc.)
function initDatabase() {
  const candidates = [];

  // Priority 1: User-specified DB_PATH if set
  if (process.env.DB_PATH) {
    const customPath = path.isAbsolute(process.env.DB_PATH)
      ? process.env.DB_PATH
      : path.resolve(__dirname, '..', '..', process.env.DB_PATH);
    candidates.push(customPath);
  }

  // Priority 2: Standard project local data directory
  candidates.push(path.resolve(__dirname, '..', '..', 'data', 'familytracker.db'));

  // Priority 3: OS temp directory (failsafe in restricted cloud containers)
  const os = require('os');
  candidates.push(path.resolve(os.tmpdir(), 'familytracker.db'));

  let lastError = null;
  for (const candidate of candidates) {
    try {
      const dataDir = path.dirname(candidate);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const instance = new Database(candidate);
      instance.dbPath = candidate;
      console.log(`[Database] SQLite connected successfully at: ${candidate}`);
      return instance;
    } catch (err) {
      console.warn(`[Database] Notice: Could not initialize database at "${candidate}": ${err.message}. Trying next fallback...`);
      lastError = err;
    }
  }

  throw new Error(`[Database] Failed to initialize SQLite storage in all candidate paths: ${lastError?.message}`);
}

const db = initDatabase();

// Enable WAL mode and foreign key constraints
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS families (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    phone TEXT,
    avatar_color TEXT DEFAULT '#4F46E5',
    family_id INTEGER,
    role TEXT DEFAULT 'user',
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_id) REFERENCES families(id)
  );

  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    family_id INTEGER,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    speed REAL DEFAULT 0,
    battery_level INTEGER,
    is_charging INTEGER DEFAULT 0,
    address TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (family_id) REFERENCES families(id)
  );

  CREATE TABLE IF NOT EXISTS geofences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    radius REAL NOT NULL DEFAULT 200,
    color TEXT DEFAULT '#4F46E5',
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_id) REFERENCES families(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS geofence_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    geofence_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN ('enter', 'exit')),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (geofence_id) REFERENCES geofences(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sos_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    latitude REAL,
    longitude REAL,
    is_active INTEGER DEFAULT 1,
    triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    cancelled_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_id) REFERENCES families(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS journeys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    family_id INTEGER NOT NULL,
    destination_name TEXT NOT NULL,
    destination_lat REAL NOT NULL,
    destination_lng REAL NOT NULL,
    start_lat REAL,
    start_lng REAL,
    status TEXT DEFAULT 'in_progress',
    estimated_duration_min INTEGER,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (family_id) REFERENCES families(id)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER,
    actor_role TEXT,
    action TEXT NOT NULL,
    target_id INTEGER,
    target_type TEXT,
    reason TEXT,
    metadata TEXT,
    ip_address TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS emergency_access_grants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    target_user_id INTEGER NOT NULL,
    case_type TEXT NOT NULL,
    justification TEXT NOT NULL,
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    is_revoked INTEGER DEFAULT 0,
    FOREIGN KEY (admin_id) REFERENCES users(id),
    FOREIGN KEY (target_user_id) REFERENCES users(id)
  );

  -- Multi-Group Architecture Tables (V3)
  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    group_type TEXT DEFAULT 'FAMILY',
    avatar_color TEXT DEFAULT '#4F46E5',
    icon TEXT DEFAULT 'Users',
    created_by INTEGER NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    invite_expiry DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active',
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT DEFAULT 'MEMBER',
    membership_status TEXT DEFAULT 'ACTIVE',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(group_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS group_location_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    sharing_enabled INTEGER DEFAULT 1,
    history_enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(group_id, user_id)
  );
`);

// Safe Migrations for existing databases
try {
  const userCols = db.prepare("PRAGMA table_info('users')").all();
  if (!userCols.some(c => c.name === 'role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
  }
  if (!userCols.some(c => c.name === 'status')) {
    db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'");
  }
} catch (migErr) {
  console.warn('Migration note (users):', migErr.message);
}

// Safe Migration: ensure sos_events allows nullable latitude/longitude without deleting user data
try {
  const sosTableInfo = db.prepare("PRAGMA table_info('sos_events')").all();
  const latCol = sosTableInfo.find(c => c.name === 'latitude');
  if (latCol && latCol.notnull === 1) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sos_events_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          latitude REAL,
          longitude REAL,
          is_active INTEGER DEFAULT 1,
          triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          cancelled_at DATETIME,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
        INSERT INTO sos_events_migrated SELECT * FROM sos_events;
        DROP TABLE sos_events;
        ALTER TABLE sos_events_migrated RENAME TO sos_events;
      `);
    })();
  }
} catch (migErr) {
  console.warn('Migration note (sos_events):', migErr.message);
}

// Safe Migration: ensure locations has family_id column for cross-family privacy isolation
try {
  const locCols = db.prepare("PRAGMA table_info('locations')").all();
  if (!locCols.some(c => c.name === 'family_id')) {
    db.exec("ALTER TABLE locations ADD COLUMN family_id INTEGER REFERENCES families(id)");
  }
  db.exec(`
    UPDATE locations
    SET family_id = (SELECT family_id FROM users WHERE users.id = locations.user_id)
    WHERE family_id IS NULL AND user_id IN (SELECT id FROM users WHERE family_id IS NOT NULL)
  `);
} catch (migErr) {
  console.warn('Migration note (locations):', migErr.message);
}

// Safe Migration: V3 Multi-Group Architecture Data Migration
try {
  const locCols = db.prepare("PRAGMA table_info('locations')").all();
  if (!locCols.some(c => c.name === 'group_id')) {
    db.exec("ALTER TABLE locations ADD COLUMN group_id INTEGER REFERENCES groups(id)");
  }

  const geoCols = db.prepare("PRAGMA table_info('geofences')").all();
  if (!geoCols.some(c => c.name === 'group_id')) {
    db.exec("ALTER TABLE geofences ADD COLUMN group_id INTEGER REFERENCES groups(id)");
  }

  const alertCols = db.prepare("PRAGMA table_info('alerts')").all();
  if (!alertCols.some(c => c.name === 'group_id')) {
    db.exec("ALTER TABLE alerts ADD COLUMN group_id INTEGER REFERENCES groups(id)");
  }

  const journeyCols = db.prepare("PRAGMA table_info('journeys')").all();
  if (!journeyCols.some(c => c.name === 'group_id')) {
    db.exec("ALTER TABLE journeys ADD COLUMN group_id INTEGER REFERENCES groups(id)");
  }

  const sosCols = db.prepare("PRAGMA table_info('sos_events')").all();
  if (!sosCols.some(c => c.name === 'group_ids')) {
    db.exec("ALTER TABLE sos_events ADD COLUMN group_ids TEXT");
  }

  // Atomically migrate existing families to groups and populate memberships
  db.transaction(() => {
    db.exec(`
      INSERT OR IGNORE INTO groups (id, name, group_type, avatar_color, icon, created_by, invite_code, created_at, status)
      SELECT id, name, 'FAMILY', '#4F46E5', 'Users', created_by, invite_code, created_at, 'active'
      FROM families;

      INSERT OR IGNORE INTO group_members (group_id, user_id, role, membership_status, joined_at)
      SELECT 
        u.family_id,
        u.id,
        CASE WHEN u.id = f.created_by THEN 'OWNER' ELSE 'MEMBER' END,
        'ACTIVE',
        u.created_at
      FROM users u
      JOIN families f ON u.family_id = f.id
      WHERE u.family_id IS NOT NULL;

      INSERT OR IGNORE INTO group_location_settings (group_id, user_id, sharing_enabled, history_enabled, created_at)
      SELECT group_id, user_id, 1, 1, joined_at
      FROM group_members;

      UPDATE locations SET group_id = family_id WHERE group_id IS NULL AND family_id IS NOT NULL;
      UPDATE geofences SET group_id = family_id WHERE group_id IS NULL AND family_id IS NOT NULL;
      UPDATE alerts SET group_id = family_id WHERE group_id IS NULL AND family_id IS NOT NULL;
      UPDATE journeys SET group_id = family_id WHERE group_id IS NULL AND family_id IS NOT NULL;
    `);
  })();
} catch (v3MigErr) {
  console.warn('Migration note (V3 Multi-Group):', v3MigErr.message);
}

// Performance indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_locations_user_timestamp ON locations(user_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_locations_family_id ON locations(family_id, user_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_users_family_id ON users(family_id);
  CREATE INDEX IF NOT EXISTS idx_alerts_family_created ON alerts(family_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_geofences_family ON geofences(family_id);
  CREATE INDEX IF NOT EXISTS idx_sos_events_active ON sos_events(is_active, user_id);
  CREATE INDEX IF NOT EXISTS idx_geofence_events_user_fence ON geofence_events(geofence_id, user_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_journeys_user_status ON journeys(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_journeys_family_status ON journeys(family_id, status);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, timestamp);
  CREATE INDEX IF NOT EXISTS idx_emergency_grants_admin ON emergency_access_grants(admin_id, expires_at);
  
  -- V3 Multi-Group Indexes
  CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
  CREATE INDEX IF NOT EXISTS idx_group_location_settings ON group_location_settings(group_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_groups_invite_code ON groups(invite_code);
  CREATE INDEX IF NOT EXISTS idx_locations_group_timestamp ON locations(group_id, user_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_geofences_group ON geofences(group_id);
  CREATE INDEX IF NOT EXISTS idx_alerts_group ON alerts(group_id, created_at);
`);

console.log('Database schema ready. SQLite database at:', db.dbPath);

module.exports = db;
