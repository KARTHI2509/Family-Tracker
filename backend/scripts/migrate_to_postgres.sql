-- PostgreSQL Schema Migration for FamilyTracker V2
-- Production Database Setup

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Families table
CREATE TABLE IF NOT EXISTS families (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    invite_code VARCHAR(20) UNIQUE NOT NULL,
    created_by INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    avatar_color VARCHAR(20) DEFAULT '#4F46E5',
    family_id INTEGER REFERENCES families(id) ON DELETE SET NULL,
    role VARCHAR(20) DEFAULT 'user' CHECK(role IN ('user', 'admin', 'super_admin')),
    status VARCHAR(20) DEFAULT 'active' CHECK(status IN ('active', 'suspended')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Locations table (with 7-day retention)
CREATE TABLE IF NOT EXISTS locations (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
    accuracy DOUBLE PRECISION,
    speed DOUBLE PRECISION DEFAULT 0,
    battery_level INTEGER CHECK (battery_level >= 0 AND battery_level <= 100),
    is_charging SMALLINT DEFAULT 0,
    address TEXT,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Geofences (Safe Zones)
CREATE TABLE IF NOT EXISTS geofences (
    id SERIAL PRIMARY KEY,
    family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    radius DOUBLE PRECISION NOT NULL DEFAULT 200,
    color VARCHAR(20) DEFAULT '#4F46E5',
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Geofence Events
CREATE TABLE IF NOT EXISTS geofence_events (
    id BIGSERIAL PRIMARY KEY,
    geofence_id INTEGER NOT NULL REFERENCES geofences(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(10) NOT NULL CHECK(event_type IN ('enter', 'exit')),
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- SOS Emergency Events
CREATE TABLE IF NOT EXISTS sos_events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    is_active SMALLINT DEFAULT 1,
    triggered_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMPTZ
);

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
    id BIGSERIAL PRIMARY KEY,
    family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read SMALLINT DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Journeys (Safe Arrival & Live Trip Tracking)
CREATE TABLE IF NOT EXISTS journeys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    destination_name VARCHAR(255) NOT NULL,
    destination_lat DOUBLE PRECISION NOT NULL,
    destination_lng DOUBLE PRECISION NOT NULL,
    start_lat DOUBLE PRECISION,
    start_lng DOUBLE PRECISION,
    status VARCHAR(20) DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'completed', 'cancelled')),
    estimated_duration_min INTEGER,
    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

-- Immutable Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_id INTEGER,
    actor_role VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    target_id INTEGER,
    target_type VARCHAR(50),
    reason TEXT,
    metadata JSONB,
    ip_address VARCHAR(45),
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Emergency Access Grants
CREATE TABLE IF NOT EXISTS emergency_access_grants (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES users(id),
    target_user_id INTEGER NOT NULL REFERENCES users(id),
    case_type VARCHAR(50) NOT NULL,
    justification TEXT NOT NULL,
    granted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    is_revoked SMALLINT DEFAULT 0
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_locations_user_timestamp ON locations(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_users_family_id ON users(family_id);
CREATE INDEX IF NOT EXISTS idx_alerts_family_created ON alerts(family_id, created_at);
CREATE INDEX IF NOT EXISTS idx_geofences_family ON geofences(family_id);
CREATE INDEX IF NOT EXISTS idx_sos_events_active ON sos_events(is_active, user_id);
CREATE INDEX IF NOT EXISTS idx_geofence_events_user_fence ON geofence_events(geofence_id, user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_journeys_user_status ON journeys(user_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, timestamp);

