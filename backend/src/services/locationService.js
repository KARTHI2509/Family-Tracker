const db = require('../config/database');

/**
 * Calculate distance between two coordinates using Haversine formula.
 * @returns {number} Distance in meters
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return Infinity;
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate speed in km/h from two points and time difference.
 * @returns {number} Speed in km/h
 */
function calculateSpeed(lat1, lon1, lat2, lon2, timeDiffSeconds) {
  if (!timeDiffSeconds || timeDiffSeconds <= 0) return 0;
  const distanceMeters = haversineDistance(lat1, lon1, lat2, lon2);
  const distanceKm = distanceMeters / 1000;
  const timeHours = timeDiffSeconds / 3600;
  return distanceKm / timeHours;
}

/**
 * Validate latitude and longitude.
 */
function isValidCoordinate(lat, lon) {
  if (lat == null || lon == null) return false;
  const numLat = Number(lat);
  const numLon = Number(lon);
  if (isNaN(numLat) || isNaN(numLon)) return false;
  return numLat >= -90 && numLat <= 90 && numLon >= -180 && numLon <= 180;
}

/**
 * Save a new location record for a user with family privacy context.
 */
function saveLocation(userId, locationData, familyId = null) {
  const { latitude, longitude, accuracy, speed, battery_level, is_charging, address } = locationData;

  const nowIso = new Date().toISOString();

  // Resolve familyId if not directly provided
  let activeFamilyId = familyId;
  if (!activeFamilyId) {
    try {
      const u = db.prepare('SELECT family_id FROM users WHERE id = ?').get(userId);
      activeFamilyId = u?.family_id || null;
    } catch (_) {}
  }

  const stmt = db.prepare(`
    INSERT INTO locations (user_id, family_id, latitude, longitude, accuracy, speed, battery_level, is_charging, address, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    userId,
    activeFamilyId,
    Number(latitude),
    Number(longitude),
    accuracy != null ? Number(accuracy) : null,
    speed != null ? Math.max(0, Number(speed)) : 0,
    battery_level != null ? Math.max(0, Math.min(100, Math.round(battery_level))) : null,
    is_charging ? 1 : 0,
    address || null,
    nowIso
  );

  return {
    id: result.lastInsertRowid,
    user_id: userId,
    family_id: activeFamilyId,
    latitude: Number(latitude),
    longitude: Number(longitude),
    accuracy,
    speed: speed || 0,
    battery_level,
    is_charging: is_charging ? 1 : 0,
    address,
    timestamp: nowIso
  };
}

/**
 * Get the latest location for each member in a family.
 * Strictly scoped by family_id to prevent cross-family location leakage.
 */
function getLatestLocations(familyId) {
  const stmt = db.prepare(`
    SELECT l.*, u.name as user_name, u.avatar_color, u.email
    FROM locations l
    INNER JOIN users u ON l.user_id = u.id
    INNER JOIN (
      SELECT user_id, MAX(id) as max_id
      FROM locations
      WHERE family_id = ?
      GROUP BY user_id
    ) latest ON l.id = latest.max_id
    WHERE u.family_id = ? AND l.family_id = ?
  `);

  return stmt.all(familyId, familyId, familyId);
}

/**
 * Get location history for a specific user within a date range with sensible limits.
 * Optional familyId enforcement to prevent past family location leakage into new families.
 */
function getLocationHistory(userId, from, to, limit = 500, familyId = null) {
  let query = 'SELECT * FROM locations WHERE user_id = ?';
  const params = [userId];

  if (familyId != null) {
    query += ' AND family_id = ?';
    params.push(familyId);
  }

  if (from) {
    query += ' AND timestamp >= ?';
    params.push(from);
  }

  if (to) {
    query += ' AND timestamp <= ?';
    params.push(to);
  }

  query += ' ORDER BY timestamp ASC LIMIT ?';
  params.push(Math.min(limit, 1000));

  return db.prepare(query).all(...params);
}

/**
 * Get the previous (penultimate) location for a user.
 */
function getPreviousLocation(userId) {
  const stmt = db.prepare(`
    SELECT * FROM locations
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 1 OFFSET 1
  `);
  return stmt.get(userId);
}

/**
 * Get the most recent location for a user.
 */
function getLatestLocation(userId) {
  const stmt = db.prepare(`
    SELECT * FROM locations
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 1
  `);
  return stmt.get(userId);
}

/**
 * Clean up location records older than RETENTION_DAYS (default 7 days).
 * Preserves audit logs, users, families, and critical safety records.
 */
function cleanupExpiredLocations(retentionDays = 7) {
  try {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const result = db.prepare('DELETE FROM locations WHERE timestamp < ?').run(cutoffDate);
    if (result.changes > 0) {
      console.log(`🧹 Location retention: purged ${result.changes} locations older than ${retentionDays} days.`);
    }
    return result.changes;
  } catch (err) {
    console.error('Failed to purge expired locations:', err.message);
    return 0;
  }
}

module.exports = {
  haversineDistance,
  calculateSpeed,
  isValidCoordinate,
  saveLocation,
  getLatestLocations,
  getLocationHistory,
  getPreviousLocation,
  getLatestLocation,
  cleanupExpiredLocations
};
