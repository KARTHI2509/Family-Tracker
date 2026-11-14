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
 * Create a new family using an atomic database transaction.
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
      return res.status(400).json({ error: 'You are already a member of a family. Leave or switch your current family first.' });
    }

    // Generate unique 6-character alphanumeric invite code
    let inviteCode = uuidv4().replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase();
    while (db.prepare('SELECT id FROM families WHERE invite_code = ?').get(inviteCode)) {
      inviteCode = uuidv4().replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase();
    }

    let family;
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

    // Migrate socket room for user
    const migrateSockets = req.app.get('migrateUserFamilySockets');
    if (migrateSockets) {
      migrateSockets(req.user.id, null, family.id);
    }

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
      return res.status(400).json({ error: 'You are already in a family. Use Switch Family to change your circle.' });
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

    // Migrate sockets and notify family
    const migrateSockets = req.app.get('migrateUserFamilySockets');
    if (migrateSockets) {
      migrateSockets(req.user.id, null, family.id);
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`family:${family.id}`).emit('member:joined', {
        userId: req.user.id,
        user_id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        avatarColor: req.user.avatar_color,
        familyId: family.id
      });
    }

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
 * GET /api/family/details
 * Retrieve complete details of the current family, ownership, role, and invite code.
 */
router.get('/details', (req, res) => {
  try {
    const currentUser = db.prepare('SELECT id, family_id FROM users WHERE id = ?').get(req.user.id);
    if (!currentUser || !currentUser.family_id) {
      return res.status(400).json({ error: 'You are not a member of any family.' });
    }

    const family = db.prepare('SELECT * FROM families WHERE id = ?').get(currentUser.family_id);
    if (!family) {
      return res.status(404).json({ error: 'Family not found.' });
    }

    const owner = db.prepare('SELECT id, name, email, avatar_color FROM users WHERE id = ?').get(family.created_by);
    const members = db.prepare(`
      SELECT id, name, email, phone, avatar_color, created_at,
             CASE WHEN id = ? THEN 1 ELSE 0 END as is_owner
      FROM users WHERE family_id = ?
      ORDER BY created_at ASC
    `).all(family.created_by, family.id);

    const isOwner = family.created_by === req.user.id;
    const otherMembers = members.filter(m => m.id !== req.user.id);

    res.json({
      family: {
        id: family.id,
        name: family.name,
        invite_code: family.invite_code,
        inviteCode: family.invite_code,
        created_by: family.created_by,
        created_at: family.created_at,
        is_owner: isOwner,
        owner_name: owner ? owner.name : 'Unknown'
      },
      userRole: isOwner ? 'owner' : 'member',
      members,
      otherMembers,
      canLeaveDirectly: !isOwner || otherMembers.length === 0
    });
  } catch (err) {
    console.error('Get family details error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/family/validate-code
 * Preview and validate an invite code before switching.
 */
router.post('/validate-code', (req, res) => {
  try {
    const rawCode = req.body.invite_code || req.body.inviteCode;
    if (!rawCode || typeof rawCode !== 'string' || !rawCode.trim()) {
      return res.status(400).json({ error: 'Invite code is required.' });
    }

    const cleanCode = rawCode.trim().toUpperCase();
    const targetFamily = db.prepare('SELECT id, name, created_by, created_at FROM families WHERE invite_code = ?').get(cleanCode);

    if (!targetFamily) {
      return res.status(404).json({ error: 'Invalid invite code. No family found with this code.' });
    }

    const currentUser = db.prepare('SELECT family_id FROM users WHERE id = ?').get(req.user.id);
    if (currentUser && currentUser.family_id === targetFamily.id) {
      return res.status(400).json({ error: 'You are already a member of this family.' });
    }

    const memberCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE family_id = ?').get(targetFamily.id)?.count || 0;

    res.json({
      valid: true,
      familyId: targetFamily.id,
      familyName: targetFamily.name,
      memberCount
    });
  } catch (err) {
    console.error('Validate invite code error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/family/switch
 * Securely switch from current family to another family atomically.
 * Applies owner succession if current user is owner and other members exist.
 */
router.post('/switch', (req, res) => {
  try {
    const rawCode = req.body.invite_code || req.body.inviteCode;
    const { transferOwnerTo } = req.body;

    if (!rawCode || typeof rawCode !== 'string' || !rawCode.trim()) {
      return res.status(400).json({ error: 'Invite code is required.' });
    }

    const cleanCode = rawCode.trim().toUpperCase();

    // 1. Authenticate & fetch current user
    const currentUser = db.prepare('SELECT id, name, email, avatar_color, family_id FROM users WHERE id = ?').get(req.user.id);
    if (!currentUser || !currentUser.family_id) {
      return res.status(400).json({ error: 'You are not in any family to switch from. Use Join Family instead.' });
    }

    const oldFamilyId = currentUser.family_id;

    // 2. Validate target family
    const targetFamily = db.prepare('SELECT * FROM families WHERE invite_code = ?').get(cleanCode);
    if (!targetFamily) {
      return res.status(404).json({ error: 'Invalid invite code. Target family does not exist.' });
    }

    if (targetFamily.id === oldFamilyId) {
      return res.status(400).json({ error: 'You are already a member of this family.' });
    }

    // 3. Inspect current family and ownership
    const currentFamily = db.prepare('SELECT * FROM families WHERE id = ?').get(oldFamilyId);
    const otherMembers = db.prepare('SELECT id, name FROM users WHERE family_id = ? AND id != ? ORDER BY created_at ASC').all(oldFamilyId, currentUser.id);

    const isCurrentOwner = currentFamily && currentFamily.created_by === currentUser.id;
    let successorId = null;

    if (isCurrentOwner && otherMembers.length > 0) {
      if (transferOwnerTo) {
        const candidate = otherMembers.find(m => m.id === Number(transferOwnerTo));
        if (!candidate) {
          return res.status(400).json({ error: 'The specified successor is not a member of your current family.' });
        }
        successorId = candidate.id;
      } else {
        // Explicit Succession Policy: automatically promote oldest member
        successorId = otherMembers[0].id;
      }
    }

    let newMembers;
    // 4. Perform atomic database transaction
    db.transaction(() => {
      // Transfer ownership if needed
      if (isCurrentOwner && successorId) {
        db.prepare('UPDATE families SET created_by = ? WHERE id = ?').run(successorId, oldFamilyId);
      }

      // Update user to new family
      db.prepare('UPDATE users SET family_id = ? WHERE id = ?').run(targetFamily.id, currentUser.id);

      // Fetch members of target family
      newMembers = db.prepare(`
        SELECT id, name, email, phone, avatar_color, created_at
        FROM users WHERE family_id = ?
      `).all(targetFamily.id);
    })();

    // 5. Real-Time Socket.IO Room Migration across all active user sessions
    const io = req.app.get('io');
    if (io) {
      // Notify old family room
      io.to(`family:${oldFamilyId}`).emit('member:left', {
        userId: currentUser.id,
        user_id: currentUser.id,
        userName: currentUser.name,
        user_name: currentUser.name
      });

      // Migrate user's sockets to new room
      const migrateSockets = req.app.get('migrateUserFamilySockets');
      if (migrateSockets) {
        migrateSockets(currentUser.id, oldFamilyId, targetFamily.id);
      }

      // Notify new family room
      io.to(`family:${targetFamily.id}`).emit('member:joined', {
        userId: currentUser.id,
        user_id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        avatarColor: currentUser.avatar_color,
        familyId: targetFamily.id
      });
    }

    res.json({
      message: `Successfully switched to ${targetFamily.name}.`,
      family: targetFamily,
      members: newMembers,
      previousFamilyId: oldFamilyId,
      ownerTransferredTo: successorId
    });
  } catch (err) {
    console.error('Switch family error:', err);
    res.status(500).json({ error: 'Internal server error while switching family.' });
  }
});

/**
 * POST /api/family/transfer-owner
 * Explicitly transfer family ownership to another member.
 */
router.post('/transfer-owner', (req, res) => {
  try {
    const { newOwnerId } = req.body;
    if (!newOwnerId) {
      return res.status(400).json({ error: 'New owner user ID is required.' });
    }

    const family = db.prepare('SELECT * FROM families WHERE id = ?').get(req.user.family_id);
    if (!family) {
      return res.status(404).json({ error: 'Family not found.' });
    }

    if (family.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the family owner can transfer ownership.' });
    }

    const targetUser = db.prepare('SELECT id, name, family_id FROM users WHERE id = ?').get(Number(newOwnerId));
    if (!targetUser || targetUser.family_id !== family.id) {
      return res.status(400).json({ error: 'The selected user is not a member of your family.' });
    }

    db.prepare('UPDATE families SET created_by = ? WHERE id = ?').run(targetUser.id, family.id);

    const io = req.app.get('io');
    if (io) {
      io.to(`family:${family.id}`).emit('family:owner_changed', {
        familyId: family.id,
        newOwnerId: targetUser.id,
        newOwnerName: targetUser.name
      });
    }

    res.json({
      message: `Family ownership transferred to ${targetUser.name}.`,
      newOwnerId: targetUser.id
    });
  } catch (err) {
    console.error('Transfer owner error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/family/leave
 * Securely leave current family with ownership succession and complete socket migration.
 */
router.post('/leave', (req, res) => {
  try {
    const currentUser = db.prepare('SELECT id, name, family_id FROM users WHERE id = ?').get(req.user.id);
    if (!currentUser || !currentUser.family_id) {
      return res.status(400).json({ error: 'You are not in any family.' });
    }

    const prevFamilyId = currentUser.family_id;
    const currentFamily = db.prepare('SELECT * FROM families WHERE id = ?').get(prevFamilyId);
    const otherMembers = db.prepare('SELECT id, name FROM users WHERE family_id = ? AND id != ? ORDER BY created_at ASC').all(prevFamilyId, currentUser.id);

    const isCurrentOwner = currentFamily && currentFamily.created_by === currentUser.id;
    let successorId = null;

    if (isCurrentOwner && otherMembers.length > 0) {
      const { transferOwnerTo } = req.body;
      if (transferOwnerTo) {
        const candidate = otherMembers.find(m => m.id === Number(transferOwnerTo));
        successorId = candidate ? candidate.id : otherMembers[0].id;
      } else {
        successorId = otherMembers[0].id;
      }
    }

    db.transaction(() => {
      if (isCurrentOwner && successorId) {
        db.prepare('UPDATE families SET created_by = ? WHERE id = ?').run(successorId, prevFamilyId);
      }
      db.prepare('UPDATE users SET family_id = NULL WHERE id = ?').run(currentUser.id);
    })();

    // Socket migration
    const migrateSockets = req.app.get('migrateUserFamilySockets');
    if (migrateSockets) {
      migrateSockets(currentUser.id, prevFamilyId, null);
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`family:${prevFamilyId}`).emit('member:left', {
        userId: currentUser.id,
        user_id: currentUser.id,
        userName: currentUser.name,
        user_name: currentUser.name
      });
    }

    res.json({
      message: 'Left family successfully.',
      ownerTransferredTo: successorId
    });
  } catch (err) {
    console.error('Leave family error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * DELETE /api/family/delete
 * Delete an entire family (only creator/owner allowed).
 */
router.delete('/delete', (req, res) => {
  try {
    const family = db.prepare('SELECT * FROM families WHERE id = ?').get(req.user.family_id);
    if (!family) {
      return res.status(404).json({ error: 'Family not found.' });
    }

    if (family.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the family owner can delete the family circle.' });
    }

    db.transaction(() => {
      // Clear family_id from all users
      db.prepare('UPDATE users SET family_id = NULL WHERE family_id = ?').run(family.id);
      db.prepare('DELETE FROM geofence_events WHERE geofence_id IN (SELECT id FROM geofences WHERE family_id = ?)').run(family.id);
      db.prepare('DELETE FROM geofences WHERE family_id = ?').run(family.id);
      db.prepare('DELETE FROM alerts WHERE family_id = ?').run(family.id);
      db.prepare('DELETE FROM journeys WHERE family_id = ?').run(family.id);
      db.prepare('DELETE FROM families WHERE id = ?').run(family.id);
    })();

    const io = req.app.get('io');
    if (io) {
      io.to(`family:${family.id}`).emit('family:deleted', { familyId: family.id });
    }

    res.json({ message: 'Family deleted successfully.' });
  } catch (err) {
    console.error('Delete family error:', err);
    res.status(500).json({ error: 'Internal server error.' });
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

module.exports = router;
