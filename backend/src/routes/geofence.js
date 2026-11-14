const express = require('express');
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { isValidCoordinate } = require('../services/locationService');

const router = express.Router();

// All geofence routes require authentication
router.use(authMiddleware);

/**
 * POST /api/geofence/create
 * Create a new geofence for the user's family.
 */
router.post('/create', (req, res) => {
  try {
    if (!req.user.family_id) {
      return res.status(400).json({ error: 'You must be a member of a family to create safe zones.' });
    }

    const { name, latitude, longitude, radius, color } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Safe zone name is required.' });
    }

    if (!isValidCoordinate(latitude, longitude)) {
      return res.status(400).json({ error: 'Valid latitude (-90 to 90) and longitude (-180 to 180) are required.' });
    }

    const cleanRadius = Math.max(50, Math.min(10000, Number(radius) || 200));
    const cleanColor = color && /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#4F46E5';

    const stmt = db.prepare(`
      INSERT INTO geofences (family_id, name, latitude, longitude, radius, color, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      req.user.family_id,
      name.trim(),
      Number(latitude),
      Number(longitude),
      cleanRadius,
      cleanColor,
      req.user.id
    );

    const geofence = db.prepare('SELECT * FROM geofences WHERE id = ?').get(result.lastInsertRowid);

    // Notify family via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`family:${req.user.family_id}`).emit('geofence:created', {
        id: geofence.id,
        familyId: geofence.family_id,
        family_id: geofence.family_id,
        name: geofence.name,
        latitude: geofence.latitude,
        longitude: geofence.longitude,
        radius: geofence.radius,
        color: geofence.color,
        createdBy: geofence.created_by,
        created_by: geofence.created_by,
        createdAt: geofence.created_at,
        created_at: geofence.created_at
      });
    }

    res.status(201).json({
      message: 'Safe zone created successfully.',
      geofence
    });
  } catch (err) {
    console.error('Create geofence error:', err);
    res.status(500).json({ error: 'Internal server error while creating safe zone.' });
  }
});

/**
 * GET /api/geofence/list
 * List all geofences for the user's family.
 */
router.get('/list', (req, res) => {
  try {
    if (!req.user.family_id) {
      return res.status(400).json({ error: 'You must be a member of a family to view safe zones.' });
    }

    const geofences = db.prepare(`
      SELECT g.*, u.name as created_by_name
      FROM geofences g
      JOIN users u ON g.created_by = u.id
      WHERE g.family_id = ?
      ORDER BY g.created_at DESC
    `).all(req.user.family_id);

    res.json({ geofences });
  } catch (err) {
    console.error('List geofences error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * DELETE /api/geofence/:id
 * Delete a geofence with family authorization and transaction.
 */
router.delete('/:id', (req, res) => {
  try {
    const geofenceId = parseInt(req.params.id, 10);

    if (isNaN(geofenceId)) {
      return res.status(400).json({ error: 'Invalid safe zone ID.' });
    }

    if (!req.user.family_id) {
      return res.status(400).json({ error: 'You must be in a family.' });
    }

    const geofence = db.prepare('SELECT * FROM geofences WHERE id = ?').get(geofenceId);

    if (!geofence) {
      return res.status(404).json({ error: 'Safe zone not found.' });
    }

    if (geofence.family_id !== req.user.family_id) {
      return res.status(403).json({ error: 'You can only delete safe zones belonging to your family.' });
    }

    db.transaction(() => {
      db.prepare('DELETE FROM geofence_events WHERE geofence_id = ?').run(geofenceId);
      db.prepare('DELETE FROM geofences WHERE id = ?').run(geofenceId);
    })();

    // Notify family via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`family:${req.user.family_id}`).emit('geofence:deleted', {
        id: geofenceId
      });
    }

    res.json({ message: 'Safe zone deleted successfully.' });
  } catch (err) {
    console.error('Delete geofence error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
