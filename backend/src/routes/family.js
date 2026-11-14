const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');
const locationService = require('../services/locationService');

const router = express.Router();

// All family routes require authentication
router.use(authMiddleware);

/**
 * POST /api/family/create
 * Create a new family using a transaction.
 */
router.post('/create', (req, res) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Valid family name is required.' });
    }

    // Refresh user state
    const currentUser = db.prepare('SELECT id, family_id FROM users WHERE id = ?').get(req.user.id);
    if (currentUser.family_id) {
      return res.status(400).json({ error: 'You are already a member of a family. Leave your current family first.' });
    }

    // Generate unique 6-character alphanumeric invite code
    let inviteCode = uuidv4().replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase();
    while (db.prepare('SELECT id FROM families WHERE invite_code = ?').get(inviteCode)) {
      inviteCode = uuidv4().replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase();
    }

    let family;
    // Database transaction to insert family and link user
    db.transaction(() => {
      const familyStmt = db.prepare(`
        INSERT INTO families (name, invite_code, created_by)
        VALUES (?, ?, ?)
      `);
      const familyResult = familyStmt.run(name.trim(), inviteCode, req.user.id);
      const familyId = familyResult.lastInsertRowid;

      db.prepare('UPDATE users SET family_id = ? WHERE id = ?').run(familyId, req.user.id);
      family = db.prepare('SELECT * FROM families WHERE id = ?').get(familyId);
    })();

    res.status(201).json({
      message: 'Family created successfully.',
      family,
      invite_code: family.invite_code,
      inviteCode: family.invite_code
    });
  } catch (err) {
    console.error('Create family error:', err);
    res.status(500).json({ error: 'Internal server error while creating family.' });
  }
});

/**
 * POST /api/family/join
 * Join an existing family by invite code.
 */
router.post('/join', (req, res) => {
  try {
    const rawCode = req.body.invite_code || req.body.inviteCode;

    if (!rawCode || typeof rawCode !== 'string' || !rawCode.trim()) {
      return res.status(400).json({ error: 'Invite code is required.' });
    }

    const cleanCode = rawCode.trim().toUpperCase();

    // Verify current user isn't already in a family
    const currentUser = db.prepare('SELECT id, family_id FROM users WHERE id = ?').get(req.user.id);
    if (currentUser.family_id) {
      return res.status(400).json({ error: 'You are already in a family. Leave your current family first.' });
    }

    const family = db.prepare('SELECT * FROM families WHERE invite_code = ?').get(cleanCode);
    if (!family) {
      return res.status(404).json({ error: 'Invalid invite code. No family found with this code.' });
    }

    let members;
    db.transaction(() => {
      db.prepare('UPDATE users SET family_id = ? WHERE id = ?').run(family.id, req.user.id);
      members = db.prepare(`
        SELECT id, name, email, phone, avatar_color, created_at
        FROM users WHERE family_id = ?
      `).all(family.id);
    })();

    res.json({
      message: 'Successfully joined the family.',
      family,
      members
    });
  } catch (err) {
    console.error('Join family error:', err);
    res.status(500).json({ error: 'Internal server error while joining family.' });
  }
});

/**
 * GET /api/family/members
 * Get all family members with their latest location.
 */
router.get('/members', (req, res) => {
  try {
    if (!req.user.family_id) {
      return res.status(400).json({ error: 'You are not a member of any family.' });
    }

    const members = db.prepare(`
      SELECT id, name, email, phone, avatar_color, family_id, created_at
      FROM users WHERE family_id = ?
    `).all(req.user.family_id);

    // Get latest locations for all members
    const latestLocations = locationService.getLatestLocations(req.user.family_id);

    // Merge members with their latest locations
    const membersWithLocations = members.map(member => {
      const location = latestLocations.find(loc => loc.user_id === member.id);
      return {
        ...member,
        latest_location: location ? {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          speed: location.speed,
          battery_level: location.battery_level,
          is_charging: location.is_charging,
          address: location.address,
          timestamp: location.timestamp
        } : null
      };
    });

    res.json({ members: membersWithLocations });
  } catch (err) {
    console.error('Get members error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/family/invite-code
 * Get the family's invite code.
 */
router.get('/invite-code', (req, res) => {
  try {
    if (!req.user.family_id) {
      return res.status(400).json({ error: 'You are not a member of any family.' });
    }

    const family = db.prepare('SELECT invite_code, name FROM families WHERE id = ?').get(req.user.family_id);

    if (!family) {
      return res.status(404).json({ error: 'Family not found.' });
    }

    res.json({
      invite_code: family.invite_code,
      inviteCode: family.invite_code,
      family_name: family.name
    });
  } catch (err) {
    console.error('Get invite code error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/family/leave
 * Leave current family.
 */
router.post('/leave', (req, res) => {
  try {
    if (!req.user.family_id) {
      return res.status(400).json({ error: 'You are not in any family.' });
    }

    const prevFamilyId = req.user.family_id;
    db.prepare('UPDATE users SET family_id = NULL WHERE id = ?').run(req.user.id);

    // Notify family
    const io = req.app.get('io');
    if (io) {
      io.to(`family:${prevFamilyId}`).emit('member:left', {
        userId: req.user.id,
        user_id: req.user.id,
        userName: req.user.name,
        user_name: req.user.name
      });
    }

    res.json({ message: 'Left family successfully.' });
  } catch (err) {
    console.error('Leave family error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
