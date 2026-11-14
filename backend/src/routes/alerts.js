const express = require('express');
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');
const alertService = require('../services/alertService');

const router = express.Router();

// All alert routes require authentication
router.use(authMiddleware);

/**
 * GET /api/alerts
 * Get alerts for the caller's family, sorted by newest first.
 */
router.get('/', (req, res) => {
  try {
    if (!req.user.family_id) {
      return res.status(400).json({ error: 'You must be a member of a family to view alerts.' });
    }

    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;

    const result = alertService.getAlerts(req.user.family_id, limit, offset);

    res.json(result);
  } catch (err) {
    console.error('Get alerts error:', err);
    res.status(500).json({ error: 'Internal server error while fetching alerts.' });
  }
});

/**
 * PUT /api/alerts/:id/read
 * Mark a single alert as read.
 */
router.put('/:id/read', (req, res) => {
  try {
    const alertId = parseInt(req.params.id, 10);

    if (isNaN(alertId)) {
      return res.status(400).json({ error: 'Invalid alert ID.' });
    }

    if (!req.user.family_id) {
      return res.status(400).json({ error: 'You must be in a family.' });
    }

    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId);

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found.' });
    }

    if (alert.family_id !== req.user.family_id) {
      return res.status(403).json({ error: 'You can only manage alerts for your own family.' });
    }

    db.prepare('UPDATE alerts SET is_read = 1 WHERE id = ?').run(alertId);

    res.json({ message: 'Alert marked as read.', alertId });
  } catch (err) {
    console.error('Mark alert read error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * PUT /api/alerts/read-all
 * Mark all alerts for the user's family as read.
 */
router.put('/read-all', (req, res) => {
  try {
    if (!req.user.family_id) {
      return res.status(400).json({ error: 'You must be a member of a family.' });
    }

    const result = db.prepare('UPDATE alerts SET is_read = 1 WHERE family_id = ? AND is_read = 0').run(req.user.family_id);

    res.json({
      message: 'All alerts marked as read.',
      updated: result.changes
    });
  } catch (err) {
    console.error('Mark all alerts read error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
