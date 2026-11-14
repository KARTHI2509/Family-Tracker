const express = require('express');
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');
const alertService = require('../services/alertService');
const { isValidCoordinate } = require('../services/locationService');

const router = express.Router();

// All SOS routes require authentication
router.use(authMiddleware);

/**
 * GET /api/sos/active
 * Retrieve any currently active SOS events for the user's family.
 */
router.get('/active', (req, res) => {
  try {
    if (!req.user.family_id) {
      return res.status(400).json({ error: 'You must be a member of a family.' });
    }

    const activeEvents = db.prepare(`
      SELECT s.*, u.name as user_name, u.avatar_color, u.email
      FROM sos_events s
      JOIN users u ON s.user_id = u.id
      WHERE s.is_active = 1 AND u.family_id = ?
      ORDER BY s.triggered_at DESC
    `).all(req.user.family_id);

    const formattedEvents = activeEvents.map(e => ({
      id: e.id,
      userId: e.user_id,
      user_id: e.user_id,
      userName: e.user_name,
      user_name: e.user_name,
      avatarColor: e.avatar_color,
      avatar_color: e.avatar_color,
      latitude: e.latitude,
      longitude: e.longitude,
      isActive: 1,
      is_active: 1,
      triggeredAt: e.triggered_at,
      triggered_at: e.triggered_at
    }));

    res.json({ activeSOSEvents: formattedEvents, sosEvents: formattedEvents });
  } catch (err) {
    console.error('Get active SOS error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/sos/trigger
 * Trigger an SOS event. Allows null coordinates if GPS was denied or unavailable.
 */
router.post('/trigger', (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (!req.user.family_id) {
      return res.status(400).json({ error: 'You must be a member of a family to trigger SOS.' });
    }

    // Check if there is already an active SOS for this user
    const existingActive = db.prepare(`
      SELECT id FROM sos_events
      WHERE user_id = ? AND is_active = 1
    `).get(req.user.id);

    if (existingActive) {
      return res.status(400).json({ error: 'You already have an active SOS broadcast in progress.' });
    }

    const hasValidCoords = isValidCoordinate(latitude, longitude);
    const cleanLat = hasValidCoords ? Number(latitude) : null;
    const cleanLon = hasValidCoords ? Number(longitude) : null;
    const nowIso = new Date().toISOString();

    const sosStmt = db.prepare(`
      INSERT INTO sos_events (user_id, latitude, longitude, is_active, triggered_at)
      VALUES (?, ?, ?, 1, ?)
    `);
    const sosResult = sosStmt.run(req.user.id, cleanLat, cleanLon, nowIso);

    const sosPayload = {
      id: sosResult.lastInsertRowid,
      userId: req.user.id,
      user_id: req.user.id,
      userName: req.user.name,
      user_name: req.user.name,
      avatarColor: req.user.avatar_color,
      avatar_color: req.user.avatar_color,
      latitude: cleanLat,
      longitude: cleanLon,
      isActive: 1,
      is_active: 1,
      triggeredAt: nowIso,
      triggered_at: nowIso
    };

    // Create persistent alert
    const locationNote = hasValidCoords
      ? `Location: ${cleanLat.toFixed(4)}, ${cleanLon.toFixed(4)}`
      : 'Location unavailable';

    const alert = alertService.createAlert(
      req.user.family_id,
      req.user.id,
      'sos',
      `🚨 EMERGENCY: SOS from ${req.user.name}!`,
      `${req.user.name} has triggered an emergency SOS! ${locationNote}.`,
      JSON.stringify({ latitude: cleanLat, longitude: cleanLon, sos_id: sosResult.lastInsertRowid })
    );

    // Broadcast to family room
    const io = req.app.get('io');
    if (io) {
      io.to(`family:${req.user.family_id}`).emit('sos:triggered', sosPayload);
      io.to(`family:${req.user.family_id}`).emit('alert:new', {
        id: alert.id,
        familyId: req.user.family_id,
        family_id: req.user.family_id,
        userId: req.user.id,
        user_id: req.user.id,
        userName: req.user.name,
        user_name: req.user.name,
        type: 'sos',
        title: alert.title,
        message: alert.message,
        isRead: 0,
        is_read: 0,
        createdAt: alert.created_at,
        created_at: alert.created_at
      });
    }

    res.status(201).json({
      message: 'SOS triggered successfully.',
      sos: sosPayload
    });
  } catch (err) {
    console.error('SOS trigger error:', err);
    res.status(500).json({ error: 'Internal server error while broadcasting SOS.' });
  }
});

/**
 * POST /api/sos/cancel
 * Cancel the active SOS event.
 */
router.post('/cancel', (req, res) => {
  try {
    if (!req.user.family_id) {
      return res.status(400).json({ error: 'You must be a member of a family.' });
    }

    const activeSOS = db.prepare(`
      SELECT * FROM sos_events
      WHERE user_id = ? AND is_active = 1
    `).get(req.user.id);

    if (!activeSOS) {
      return res.status(404).json({ error: 'No active SOS event found to cancel.' });
    }

    const nowIso = new Date().toISOString();

    db.prepare(`
      UPDATE sos_events
      SET is_active = 0, cancelled_at = ?
      WHERE id = ?
    `).run(nowIso, activeSOS.id);

    const cancelPayload = {
      id: activeSOS.id,
      userId: req.user.id,
      user_id: req.user.id,
      userName: req.user.name,
      user_name: req.user.name,
      cancelledAt: nowIso,
      cancelled_at: nowIso
    };

    const io = req.app.get('io');
    if (io) {
      io.to(`family:${req.user.family_id}`).emit('sos:cancelled', cancelPayload);
    }

    res.json({
      message: 'SOS cancelled successfully.',
      sos: cancelPayload
    });
  } catch (err) {
    console.error('SOS cancel error:', err);
    res.status(500).json({ error: 'Internal server error while cancelling SOS.' });
  }
});

module.exports = router;
