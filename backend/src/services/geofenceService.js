const db = require('../config/database');
const { haversineDistance } = require('./locationService');
const alertService = require('./alertService');

/**
 * Check if a user has entered or exited any geofence.
 * Uses the last recorded geofence event to strictly prevent false or duplicate transitions.
 * 
 * @param {number} userId
 * @param {number} latitude - Current latitude
 * @param {number} longitude - Current longitude
 * @param {number} familyId
 * @returns {Array} List of triggered geofence events
 */
function checkGeofences(userId, latitude, longitude, familyId) {
  const triggeredEvents = [];

  const geofences = db.prepare('SELECT * FROM geofences WHERE family_id = ?').all(familyId);
  if (!geofences || geofences.length === 0) return triggeredEvents;

  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);
  const userName = user ? user.name : 'Family member';

  for (const geofence of geofences) {
    const currentDistance = haversineDistance(latitude, longitude, geofence.latitude, geofence.longitude);
    const isInsideNow = currentDistance <= geofence.radius;

    // Check last event recorded for this user and geofence
    const lastEvent = db.prepare(`
      SELECT event_type FROM geofence_events
      WHERE geofence_id = ? AND user_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(geofence.id, userId);

    if (isInsideNow) {
      // If user is inside now and previous event wasn't 'enter'
      if (!lastEvent || lastEvent.event_type !== 'enter') {
        const event = createGeofenceEvent(geofence.id, userId, 'enter');
        triggeredEvents.push({
          ...event,
          geofence_name: geofence.name,
          event_type: 'enter'
        });

        alertService.createAlert(
          familyId,
          userId,
          'geofence_enter',
          `${userName} arrived at ${geofence.name}`,
          `${userName} entered the "${geofence.name}" safe zone.`,
          JSON.stringify({ geofence_id: geofence.id, geofence_name: geofence.name, radius: geofence.radius })
        );
      }
    } else {
      // If user is outside now and previous event was 'enter'
      if (lastEvent && lastEvent.event_type === 'enter') {
        const event = createGeofenceEvent(geofence.id, userId, 'exit');
        triggeredEvents.push({
          ...event,
          geofence_name: geofence.name,
          event_type: 'exit'
        });

        alertService.createAlert(
          familyId,
          userId,
          'geofence_exit',
          `${userName} left ${geofence.name}`,
          `${userName} exited the "${geofence.name}" safe zone.`,
          JSON.stringify({ geofence_id: geofence.id, geofence_name: geofence.name, radius: geofence.radius })
        );
      }
    }
  }

  return triggeredEvents;
}

/**
 * Create a geofence event record.
 */
function createGeofenceEvent(geofenceId, userId, eventType) {
  const nowIso = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO geofence_events (geofence_id, user_id, event_type, timestamp)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(geofenceId, userId, eventType, nowIso);
  return {
    id: result.lastInsertRowid,
    geofence_id: geofenceId,
    user_id: userId,
    event_type: eventType,
    timestamp: nowIso
  };
}

module.exports = {
  checkGeofences,
  createGeofenceEvent
};
