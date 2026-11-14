const express = require('express');
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');
const alertService = require('../services/alertService');

const router = express.Router();

router.use(authMiddleware);

/**
 * POST /api/journey/start
 * Start a tracked journey with destination and ETA.
 */
router.post('/start', (req, res) => {
  try {
    const { destinationName, destinationLat, destinationLng, estimatedDurationMin, startLat, startLng } = req.body;

    if (!req.user.family_id) {
      return res.status(400).json({ error: 'You must belong to a family circle to start a shared journey.' });
    }

    if (!destinationName || destinationLat == null || destinationLng == null) {
      return res.status(400).json({ error: 'Destination name and valid coordinates are required.' });
    }

    const dLat = Number(destinationLat);
    const dLng = Number(destinationLng);

    if (isNaN(dLat) || dLat < -90 || dLat > 90 || isNaN(dLng) || dLng < -180 || dLng > 180) {
      return res.status(400).json({ error: 'Invalid destination coordinates.' });
    }

    // Cancel any previous in-progress journey for this user
    db.prepare(`
      UPDATE journeys SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND status = 'in_progress'
    `).run(req.user.id);

    // Insert new journey
    const stmt = db.prepare(`
      INSERT INTO journeys (user_id, family_id, destination_name, destination_lat, destination_lng, start_lat, start_lng, estimated_duration_min, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_progress')
    `);

    const result = stmt.run(
      req.user.id,
      req.user.family_id,
      destinationName.trim(),
      dLat,
      dLng,
      startLat != null ? Number(startLat) : null,
      startLng != null ? Number(startLng) : null,
      estimatedDurationMin ? Number(estimatedDurationMin) : 30
    );

    const journey = db.prepare('SELECT * FROM journeys WHERE id = ?').get(result.lastInsertRowid);

    // Create safety alert for family
    const alert = alertService.createAlert({
      familyId: req.user.family_id,
      userId: req.user.id,
      type: 'journey_start',
      title: 'Journey Started',
      message: `${req.user.name} is on the way to ${destinationName.trim()} (ETA ~${journey.estimated_duration_min} min).`,
      metadata: { journeyId: journey.id, destinationName, dLat, dLng }
    });

    // Broadcast via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`family:${req.user.family_id}`).emit('journey:started', {
        journey,
        user: { id: req.user.id, name: req.user.name, avatar_color: req.user.avatar_color },
        alert
      });
      if (alert) {
        io.to(`family:${req.user.family_id}`).emit('alert:new', alert);
      }
    }

    res.status(201).json({
      message: 'Journey started successfully.',
      journey
    });
  } catch (err) {
    console.error('Start journey error:', err);
    res.status(500).json({ error: 'Failed to start journey.' });
  }
});

/**
 * POST /api/journey/arrival
 * Confirm safe arrival at destination.
 */
router.post('/arrival', (req, res) => {
  try {
    const { journeyId } = req.body;

    let journey;
    if (journeyId) {
      journey = db.prepare('SELECT * FROM journeys WHERE id = ? AND user_id = ?').get(journeyId, req.user.id);
    } else {
      journey = db.prepare(`
        SELECT * FROM journeys 
        WHERE user_id = ? AND status = 'in_progress' 
        ORDER BY id DESC LIMIT 1
      `).get(req.user.id);
    }

    if (!journey) {
      return res.status(404).json({ error: 'No active journey found to complete.' });
    }

    db.prepare(`
      UPDATE journeys 
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(journey.id);

    const completedJourney = db.prepare('SELECT * FROM journeys WHERE id = ?').get(journey.id);

    // Create safe arrival alert
    const alert = alertService.createAlert({
      familyId: journey.family_id,
      userId: req.user.id,
      type: 'journey_arrived',
      title: 'Safe Arrival Confirmed',
      message: `🎉 ${req.user.name} has arrived safely at ${journey.destination_name}!`,
      metadata: { journeyId: journey.id, destinationName: journey.destination_name }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`family:${journey.family_id}`).emit('journey:completed', {
        journey: completedJourney,
        user: { id: req.user.id, name: req.user.name },
        alert
      });
      if (alert) {
        io.to(`family:${journey.family_id}`).emit('alert:new', alert);
      }
    }

    res.json({
      message: 'Safe arrival recorded!',
      journey: completedJourney
    });
  } catch (err) {
    console.error('Journey arrival error:', err);
    res.status(500).json({ error: 'Failed to record safe arrival.' });
  }
});

/**
 * POST /api/journey/checkin
 * Emergency Check-in: "Please check on me"
 */
router.post('/checkin', (req, res) => {
  try {
    if (!req.user.family_id) {
      return res.status(400).json({ error: 'Family membership required for check-in.' });
    }

    const { message = 'Please check on me' } = req.body;

    // Get user's latest location
    const latestLoc = db.prepare(`
      SELECT latitude, longitude, timestamp FROM locations 
      WHERE user_id = ? ORDER BY id DESC LIMIT 1
    `).get(req.user.id);

    const alert = alertService.createAlert({
      familyId: req.user.family_id,
      userId: req.user.id,
      type: 'emergency_checkin',
      title: '⚠️ Check-In Requested',
      message: `${req.user.name} sent a check-in request: "${message.trim()}"`,
      metadata: {
        latitude: latestLoc ? latestLoc.latitude : null,
        longitude: latestLoc ? latestLoc.longitude : null,
        customMessage: message.trim()
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`family:${req.user.family_id}`).emit('journey:checkin', {
        userId: req.user.id,
        userName: req.user.name,
        message: message.trim(),
        location: latestLoc,
        alert
      });
      if (alert) {
        io.to(`family:${req.user.family_id}`).emit('alert:new', alert);
      }
    }

    res.json({
      message: 'Check-in request sent to your family circle.',
      alert
    });
  } catch (err) {
    console.error('Checkin error:', err);
    res.status(500).json({ error: 'Failed to send check-in.' });
  }
});

/**
 * GET /api/journey/active
 * Get active journeys in user's family.
 */
router.get('/active', (req, res) => {
  try {
    if (!req.user.family_id) {
      return res.json({ journeys: [] });
    }

    const journeys = db.prepare(`
      SELECT j.*, u.name as user_name, u.avatar_color,
             l.latitude as current_lat, l.longitude as current_lng, l.timestamp as last_location_time
      FROM journeys j
      JOIN users u ON j.user_id = u.id
      LEFT JOIN (
        SELECT user_id, latitude, longitude, timestamp
        FROM locations
        WHERE id IN (SELECT MAX(id) FROM locations GROUP BY user_id)
      ) l ON j.user_id = l.user_id
      WHERE j.family_id = ? AND j.status = 'in_progress'
      ORDER BY j.started_at DESC
    `).all(req.user.family_id);

    res.json({ journeys });
  } catch (err) {
    console.error('Get active journeys error:', err);
    res.status(500).json({ error: 'Failed to retrieve journeys.' });
  }
});

/**
 * POST /api/journey/cancel
 * Cancel current in-progress journey.
 */
router.post('/cancel', (req, res) => {
  try {
    db.prepare(`
      UPDATE journeys SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND status = 'in_progress'
    `).run(req.user.id);

    res.json({ message: 'Journey cancelled.' });
  } catch (err) {
    console.error('Cancel journey error:', err);
    res.status(500).json({ error: 'Failed to cancel journey.' });
  }
});

module.exports = router;

