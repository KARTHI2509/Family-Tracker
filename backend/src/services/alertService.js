const db = require('../config/database');

const SPEED_THRESHOLD_KMH = 80;
const BATTERY_LOW_THRESHOLD = 15;
const GHOST_MODE_THRESHOLD_MINUTES = 15;

/**
 * Create an alert in the database with UTC ISO timestamp.
 * Supports both positional arguments and options object.
 */
function createAlert(familyIdOrObj, userId, type, title, message, metadata = null) {
  let fId, uId, aType, aTitle, aMsg, aMeta;

  if (typeof familyIdOrObj === 'object' && familyIdOrObj !== null) {
    fId = familyIdOrObj.familyId || familyIdOrObj.family_id;
    uId = familyIdOrObj.userId || familyIdOrObj.user_id;
    aType = familyIdOrObj.type;
    aTitle = familyIdOrObj.title;
    aMsg = familyIdOrObj.message;
    aMeta = familyIdOrObj.metadata ? (typeof familyIdOrObj.metadata === 'string' ? familyIdOrObj.metadata : JSON.stringify(familyIdOrObj.metadata)) : null;
  } else {
    fId = familyIdOrObj;
    uId = userId;
    aType = type;
    aTitle = title;
    aMsg = message;
    aMeta = metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null;
  }

  const nowIso = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO alerts (family_id, user_id, type, title, message, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(fId, uId, aType, aTitle, aMsg, aMeta, nowIso);

  return {
    id: result.lastInsertRowid,
    family_id: fId,
    familyId: fId,
    user_id: uId,
    userId: uId,
    type: aType,
    title: aTitle,
    message: aMsg,
    is_read: 0,
    isRead: 0,
    metadata: aMeta,
    created_at: nowIso,
    createdAt: nowIso
  };
}

/**
 * Get paginated alerts for a family.
 */
function getAlerts(familyId, limit = 50, offset = 0) {
  const safeLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

  const alerts = db.prepare(`
    SELECT a.*, u.name as user_name, u.avatar_color
    FROM alerts a
    JOIN users u ON a.user_id = u.id
    WHERE a.family_id = ?
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `).all(familyId, safeLimit, safeOffset);

  const total = db.prepare('SELECT COUNT(*) as count FROM alerts WHERE family_id = ?').get(familyId);
  const unreadCount = db.prepare('SELECT COUNT(*) as count FROM alerts WHERE family_id = ? AND is_read = 0').get(familyId);

  const formattedAlerts = alerts.map(a => ({
    id: a.id,
    familyId: a.family_id,
    family_id: a.family_id,
    userId: a.user_id,
    user_id: a.user_id,
    userName: a.user_name,
    user_name: a.user_name,
    avatarColor: a.avatar_color,
    avatar_color: a.avatar_color,
    type: a.type,
    title: a.title,
    message: a.message,
    isRead: a.is_read === 1,
    is_read: a.is_read,
    metadata: a.metadata,
    createdAt: a.created_at,
    created_at: a.created_at
  }));

  return {
    alerts: formattedAlerts,
    total: total.count,
    unreadCount: unreadCount.count,
    limit: safeLimit,
    offset: safeOffset
  };
}

/**
 * Check battery level and create alert if below threshold (with 30-min cooldown).
 */
function checkBatteryLevel(userId, batteryLevel, familyId) {
  if (batteryLevel == null || batteryLevel >= BATTERY_LOW_THRESHOLD) return null;

  // Check recent battery alert within 30 minutes
  const recentAlert = db.prepare(`
    SELECT id FROM alerts
    WHERE user_id = ? AND type = 'battery_low' AND family_id = ?
    AND created_at > datetime('now', '-30 minutes')
  `).get(userId, familyId);

  if (recentAlert) return null;

  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);
  const userName = user ? user.name : 'Family member';

  return createAlert(
    familyId,
    userId,
    'battery_low',
    `🔋 ${userName}'s battery is low`,
    `${userName}'s phone battery has dropped to ${batteryLevel}%.`,
    JSON.stringify({ battery_level: batteryLevel })
  );
}

/**
 * Check speed and create alert if above threshold (with 5-min cooldown).
 */
function checkSpeed(userId, speed, familyId) {
  if (speed == null || speed <= SPEED_THRESHOLD_KMH) return null;

  // Check recent speed alert within 5 minutes
  const recentAlert = db.prepare(`
    SELECT id FROM alerts
    WHERE user_id = ? AND type = 'speed' AND family_id = ?
    AND created_at > datetime('now', '-5 minutes')
  `).get(userId, familyId);

  if (recentAlert) return null;

  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);
  const userName = user ? user.name : 'Family member';

  return createAlert(
    familyId,
    userId,
    'speed',
    `⚡ High Speed: ${userName}`,
    `${userName} is traveling at ${Math.round(speed)} km/h (speed limit: ${SPEED_THRESHOLD_KMH} km/h).`,
    JSON.stringify({ speed: Math.round(speed) })
  );
}

/**
 * Detect ghost mode: alert if no location update for threshold minutes.
 */
function detectGhostMode(userId, familyId) {
  const latestLocation = db.prepare(`
    SELECT timestamp FROM locations
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(userId);

  if (!latestLocation) return null;

  const lastUpdateTime = new Date(latestLocation.timestamp).getTime();
  const minutesSinceUpdate = (Date.now() - lastUpdateTime) / (1000 * 60);

  if (minutesSinceUpdate < GHOST_MODE_THRESHOLD_MINUTES) return null;

  // Check recent ghost mode alert within 30 minutes
  const recentAlert = db.prepare(`
    SELECT id FROM alerts
    WHERE user_id = ? AND type = 'ghost_mode' AND family_id = ?
    AND created_at > datetime('now', '-30 minutes')
  `).get(userId, familyId);

  if (recentAlert) return null;

  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);
  const userName = user ? user.name : 'Family member';

  return createAlert(
    familyId,
    userId,
    'ghost_mode',
    `📴 Inactive Device: ${userName}`,
    `No location updates received from ${userName} for over ${Math.round(minutesSinceUpdate)} minutes.`,
    JSON.stringify({ minutes_inactive: Math.round(minutesSinceUpdate) })
  );
}

module.exports = {
  createAlert,
  getAlerts,
  checkBatteryLevel,
  checkSpeed,
  detectGhostMode,
  SPEED_THRESHOLD_KMH,
  BATTERY_LOW_THRESHOLD,
  GHOST_MODE_THRESHOLD_MINUTES
};
