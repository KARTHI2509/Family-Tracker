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

    // Save location with family context for strict privacy boundaries
    const savedLocation = locationService.saveLocation(req.user.id, {
      latitude: Number(latitude),
      longitude: Number(longitude),
      accuracy,
      speed,
      battery_level,
      is_charging,
      address
    }, req.user.family_id);

    const newAlerts = [];
    let geofenceEvents = [];

    // Check geofences and status if user belongs to a family
    if (req.user.family_id) {
      geofenceEvents = geofenceService.checkGeofences(
        req.user.id,
        Number(latitude),
        Number(longitude),
        req.user.family_id
      );

      // Check battery level
      const batteryAlert = alertService.checkBatteryLevel(req.user.id, battery_level, req.user.family_id);
      if (batteryAlert) newAlerts.push(batteryAlert);

      // Check speed
      const speedAlert = alertService.checkSpeed(req.user.id, speed, req.user.family_id);
      if (speedAlert) newAlerts.push(speedAlert);

      // Emit real-time location update to family room via Socket.IO
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

        io.to(`family:${req.user.family_id}`).emit('location:update', locationPayload);

        // Emit alerts
        for (const alert of newAlerts) {
          io.to(`family:${req.user.family_id}`).emit('alert:new', {
            id: alert.id,
            familyId: req.user.family_id,
            family_id: req.user.family_id,
            userId: req.user.id,
            user_id: req.user.id,
            userName: req.user.name,
            user_name: req.user.name,
            type: alert.type,
            title: alert.title,
            message: alert.message,
            isRead: 0,
            is_read: 0,
            createdAt: alert.created_at,
            created_at: alert.created_at
          });
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
            created_at: event.timestamp
          });
        }
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
