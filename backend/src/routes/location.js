const express = require('express');
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');
const locationService = require('../services/locationService');
const geofenceService = require('../services/geofenceService');
const alertService = require('../services/alertService');

const router = express.Router();

// All location routes require authentication
router.use(authMiddleware);

/**
 * POST /api/location/update
 * Store a new location update for the current user.
 */
router.post('/update', (req, res) => {
  try {
    const { latitude, longitude, accuracy, speed, battery_level, is_charging, address } = req.body;

    if (!locationService.isValidCoordinate(latitude, longitude)) {
      return res.status(400).json({ error: 'Valid latitude (-90 to 90) and longitude (-180 to 180) are required.' });
    }

    // 1. Query all groups the user belongs to and check granular sharing settings
    const userGroups = db.prepare(`
      SELECT 
        gm.group_id,
        COALESCE(gls.sharing_enabled, 1) as sharing_enabled,
        COALESCE(gls.history_enabled, 1) as history_enabled
      FROM group_members gm
      LEFT JOIN group_location_settings gls ON gm.group_id = gls.group_id AND gm.user_id = gls.user_id
      WHERE gm.user_id = ? AND gm.membership_status = 'ACTIVE'
    `).all(req.user.id);

    const activeSharingGroups = userGroups.filter(g => g.sharing_enabled === 1);
    const primaryGroupId = req.user.family_id || (activeSharingGroups.length > 0 ? activeSharingGroups[0].group_id : null);

    // Save location record with group and family context
    const savedLocation = locationService.saveLocation(req.user.id, {
      latitude: Number(latitude),
      longitude: Number(longitude),
      accuracy,
      speed,
      battery_level,
      is_charging,
      address
    }, primaryGroupId);

    // Tag location for all other groups where user has enabled sharing and history
    for (const g of activeSharingGroups) {
      if (g.history_enabled === 1 && g.group_id !== primaryGroupId) {
        try {
          db.prepare(`
            INSERT INTO locations (user_id, group_id, family_id, latitude, longitude, accuracy, speed, battery_level, is_charging, address, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            req.user.id,
            g.group_id,
            g.group_id,
            Number(latitude),
            Number(longitude),
            accuracy != null ? Number(accuracy) : null,
            speed != null ? Math.max(0, Number(speed)) : 0,
            battery_level != null ? Math.max(0, Math.min(100, Math.round(battery_level))) : null,
            is_charging ? 1 : 0,
            address || null,
            savedLocation.timestamp
          );
        } catch (_) {}
      }
    }

    const newAlerts = [];
    let geofenceEvents = [];

    // Check geofences and safety triggers for all active groups
    const alertTargetGroups = activeSharingGroups.length > 0 ? activeSharingGroups : (req.user.family_id ? [{ group_id: req.user.family_id }] : []);
    for (const g of alertTargetGroups) {
      const events = geofenceService.checkGeofences(
        req.user.id,
        Number(latitude),
        Number(longitude),
        g.group_id
      );
      geofenceEvents.push(...events);

      const batteryAlert = alertService.checkBatteryLevel(req.user.id, battery_level, g.group_id);
      if (batteryAlert) newAlerts.push({ ...batteryAlert, groupId: g.group_id });

      const speedAlert = alertService.checkSpeed(req.user.id, speed, g.group_id);
      if (speedAlert) newAlerts.push({ ...speedAlert, groupId: g.group_id });
    }

    // Broadcast location update via Socket.IO strictly to authorized groups
    const io = req.app.get('io');
    if (io) {
      const locationPayload = {
        userId: req.user.id,
        user_id: req.user.id,
        userName: req.user.name,
        user_name: req.user.name,
        avatarColor: req.user.avatar_color,
        avatar_color: req.user.avatar_color,
        latitude: Number(latitude),
        longitude: Number(longitude),
        accuracy: accuracy != null ? Number(accuracy) : null,
        speed: speed != null ? Number(speed) : 0,
        batteryLevel: battery_level != null ? Number(battery_level) : null,
        battery_level: battery_level != null ? Number(battery_level) : null,
        isCharging: is_charging ? 1 : 0,
        is_charging: is_charging ? 1 : 0,
        address: address || null,
        timestamp: savedLocation.timestamp
      };

      // Emit ONLY to groups where user has explicitly enabled sharing
      for (const g of activeSharingGroups) {
        io.to(`group:${g.group_id}`).emit('location:update', {
          ...locationPayload,
          groupId: g.group_id,
          group_id: g.group_id
        });
      }

      // Backward compatibility: emit to family room if sharing is allowed
      if (req.user.family_id) {
        const familyPref = userGroups.find(g => g.group_id === req.user.family_id);
        if (!familyPref || familyPref.sharing_enabled === 1) {
          io.to(`family:${req.user.family_id}`).emit('location:update', locationPayload);
        }
      }

      // Emit alerts to groups
      for (const alert of newAlerts) {
        const targetRoom = alert.groupId ? `group:${alert.groupId}` : `family:${req.user.family_id}`;
        io.to(targetRoom).emit('alert:new', {
          ...alert,
          userId: req.user.id,
          userName: req.user.name
        });
        if (req.user.family_id && targetRoom !== `family:${req.user.family_id}`) {
          io.to(`family:${req.user.family_id}`).emit('alert:new', {
            ...alert,
            userId: req.user.id,
            userName: req.user.name
          });
        }
      }

      // Emit geofence events as alerts
      for (const event of geofenceEvents) {
        const alertType = event.event_type === 'enter' ? 'geofence_enter' : 'geofence_exit';
        io.to(`family:${req.user.family_id}`).emit('alert:new', {
          type: alertType,
          familyId: req.user.family_id,
          family_id: req.user.family_id,
          userId: req.user.id,
          user_id: req.user.id,
          userName: req.user.name,
          user_name: req.user.name,
          geofenceName: event.geofence_name,
          geofence_name: event.geofence_name,
          eventType: event.event_type,
          event_type: event.event_type,
          title: event.event_type === 'enter' ? `${req.user.name} entered ${event.geofence_name}` : `${req.user.name} left ${event.geofence_name}`,
          message: `${req.user.name} has ${event.event_type === 'enter' ? 'entered' : 'exited'} ${event.geofence_name}`,
          timestamp: event.timestamp,
          createdAt: event.timestamp,
          createdAt: event.timestamp
        });
      }
    }

    res.json({
      message: 'Location updated successfully.',
      location: savedLocation,
      geofence_events: geofenceEvents,
      alerts: newAlerts
    });
  } catch (err) {
    console.error('Location update error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/location/latest
 * Get the latest location for all family members.
 */
router.get('/latest', (req, res) => {
  try {
    if (!req.user.family_id) {
      return res.status(400).json({ error: 'You are not a member of any family.' });
    }

    const locations = locationService.getLatestLocations(req.user.family_id);

    res.json({ locations });
  } catch (err) {
    console.error('Get latest locations error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/location/history/:userId
 * Get location history for a family member.
 * Query params: from, to, limit.
 */
router.get('/history/:userId', (req, res) => {
  try {
    const targetUserId = parseInt(req.params.userId, 10);

    if (isNaN(targetUserId)) {
      return res.status(400).json({ error: 'Invalid user ID.' });
    }

    if (!req.user.family_id) {
      return res.status(400).json({ error: 'You are not in a family.' });
    }

    // Verify target user is in the caller's family
    const targetUser = db.prepare('SELECT id, family_id FROM users WHERE id = ?').get(targetUserId);

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (targetUser.family_id !== req.user.family_id) {
      return res.status(403).json({ error: 'You can only view location history of family members.' });
    }

    const { from, to, limit } = req.query;
    const history = locationService.getLocationHistory(
      targetUserId,
      from || null,
      to || null,
      parseInt(limit, 10) || 500,
      req.user.family_id
    );

    // Provide both history and locations keys to guarantee agreement with any frontend consumer
    res.json({
      history,
      locations: history
    });
  } catch (err) {
    console.error('Get location history error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
