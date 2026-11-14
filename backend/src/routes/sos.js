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
 * Retrieve any currently active SOS events for the user's groups.
 */
router.get('/active', (req, res) => {
  try {
    // Find all groups the user belongs to
    const myGroups = db.prepare(`
      SELECT group_id FROM group_members WHERE user_id = ? AND membership_status = 'ACTIVE'
    `).all(req.user.id).map(g => g.group_id);

    if (myGroups.length === 0 && !req.user.family_id) {
      return res.json({ activeSOSEvents: [], sosEvents: [] });
    }

    const groupIdsToQuery = [...myGroups];
    if (req.user.family_id && !groupIdsToQuery.includes(req.user.family_id)) {
      groupIdsToQuery.push(req.user.family_id);
    }

    const placeholders = groupIdsToQuery.map(() => '?').join(',');

    const activeEvents = db.prepare(`
      SELECT DISTINCT s.*, u.name as user_name, u.avatar_color, u.email
      FROM sos_events s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN group_members gm ON gm.user_id = u.id AND gm.membership_status = 'ACTIVE'
      WHERE s.is_active = 1 AND (gm.group_id IN (${placeholders}) OR u.family_id IN (${placeholders}))
      ORDER BY s.triggered_at DESC
    `).all(...groupIdsToQuery, ...groupIdsToQuery);

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
      triggered_at: e.triggered_at,
      groupIds: e.group_ids ? JSON.parse(e.group_ids) : []
    }));

    res.json({ activeSOSEvents: formattedEvents, sosEvents: formattedEvents });
  } catch (err) {
    console.error('Get active SOS error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/sos/trigger
 * Trigger an SOS event. Supports multi-group broadcasting.
 */
router.post('/trigger', (req, res) => {
  try {
    const { latitude, longitude, groupIds, targetGroupIds } = req.body;

    // Check if there is already an active SOS for this user
    const existingActive = db.prepare(`
      SELECT id FROM sos_events
      WHERE user_id = ? AND is_active = 1
    `).get(req.user.id);

    if (existingActive) {
      return res.status(400).json({ error: 'You already have an active SOS broadcast in progress.' });
    }

    // Find all active groups the user belongs to
    const myGroups = db.prepare(`
      SELECT g.id, g.name
      FROM group_members gm
      JOIN groups g ON gm.group_id = g.id
      WHERE gm.user_id = ? AND gm.membership_status = 'ACTIVE' AND g.status = 'active'
    `).all(req.user.id);

    if (myGroups.length === 0 && !req.user.family_id) {
      return res.status(400).json({ error: 'You must belong to at least one group to trigger SOS.' });
    }

    // Determine target groups (allow user selection or default to all active groups)
    let selectedGroupIds = [];
    const requested = groupIds || targetGroupIds;
    if (Array.isArray(requested) && requested.length > 0) {
      const allowedSet = new Set(myGroups.map(g => g.id));
      if (req.user.family_id) allowedSet.add(req.user.family_id);
      selectedGroupIds = requested.filter(id => allowedSet.has(Number(id)));
    }

    if (selectedGroupIds.length === 0) {
      selectedGroupIds = myGroups.map(g => g.id);
      if (req.user.family_id && !selectedGroupIds.includes(req.user.family_id)) {
        selectedGroupIds.push(req.user.family_id);
      }
    }

    const hasValidCoords = isValidCoordinate(latitude, longitude);
    const cleanLat = hasValidCoords ? Number(latitude) : null;
    const cleanLon = hasValidCoords ? Number(longitude) : null;
    const nowIso = new Date().toISOString();

    const sosStmt = db.prepare(`
      INSERT INTO sos_events (user_id, latitude, longitude, is_active, group_ids, triggered_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `);
    const sosResult = sosStmt.run(req.user.id, cleanLat, cleanLon, JSON.stringify(selectedGroupIds), nowIso);

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
      triggered_at: nowIso,
      groupIds: selectedGroupIds
    };

    const locationNote = hasValidCoords
      ? `Location: ${cleanLat.toFixed(4)}, ${cleanLon.toFixed(4)}`
      : 'Location unavailable';

    // Broadcast only to selected groups
    const io = req.app.get('io');
    for (const gid of selectedGroupIds) {
      const alert = alertService.createAlert(
        gid,
        req.user.id,
        'sos',
        `🚨 EMERGENCY: SOS from ${req.user.name}!`,
        `${req.user.name} has triggered an emergency SOS! ${locationNote}.`,
        JSON.stringify({ latitude: cleanLat, longitude: cleanLon, sos_id: sosResult.lastInsertRowid, group_id: gid })
      );

      if (io) {
        io.to(`group:${gid}`).emit('sos:triggered', { ...sosPayload, groupId: gid });
        io.to(`group:${gid}`).emit('alert:new', {
          id: alert.id,
          groupId: gid,
          userId: req.user.id,
          userName: req.user.name,
          type: 'sos',
          title: alert.title,
          message: alert.message
        });

        if (req.user.family_id && gid === req.user.family_id) {
          io.to(`family:${req.user.family_id}`).emit('sos:triggered', sosPayload);
          io.to(`family:${req.user.family_id}`).emit('alert:new', alert);
        }
      }
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

    // Find all target groups of this SOS
    let targetGids = [];
    if (activeSOS.group_ids) {
      try { targetGids = JSON.parse(activeSOS.group_ids); } catch (_) {}
    }

    const io = req.app.get('io');
    if (io) {
      for (const gid of targetGids) {
        io.to(`group:${gid}`).emit('sos:cancelled', { ...cancelPayload, groupId: gid });
      }
      if (req.user.family_id) {
        io.to(`family:${req.user.family_id}`).emit('sos:cancelled', cancelPayload);
      }
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
