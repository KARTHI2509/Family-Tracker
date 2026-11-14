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
 * Create a new family circle using an atomic database transaction.
 * Supports multiple family creation - does NOT remove from existing families!
 */
router.post('/create', (req, res) => {
  try {
    const { name, description, group_type, groupType } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Valid family name is required.' });
    }

    const cleanName = name.trim();
    const type = (group_type || groupType || 'FAMILY').toUpperCase();
    const desc = description ? description.trim() : '';

    // Generate unique 6-character alphanumeric invite code
    let inviteCode = uuidv4().replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase();
    while (db.prepare('SELECT id FROM families WHERE invite_code = ?').get(inviteCode) ||
           db.prepare('SELECT id FROM groups WHERE invite_code = ?').get(inviteCode)) {
      inviteCode = uuidv4().replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase();
    }

    let family;
    db.transaction(() => {
      // 1. Insert into families table
      const familyStmt = db.prepare(`
        INSERT INTO families (name, invite_code, created_by)
        VALUES (?, ?, ?)
      `);
      const familyResult = familyStmt.run(cleanName, inviteCode, req.user.id);
      const familyId = familyResult.lastInsertRowid;

      // 2. Mirror into groups table for multi-group architecture
      try {
        db.prepare(`
          INSERT INTO groups (id, name, description, group_type, avatar_color, icon, created_by, invite_code)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(familyId, cleanName, desc, type, '#4F46E5', 'Users', req.user.id, inviteCode);
      } catch (_) {
        db.prepare(`
          INSERT INTO groups (name, description, group_type, avatar_color, icon, created_by, invite_code)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(cleanName, desc, type, '#4F46E5', 'Users', req.user.id, inviteCode);
      }

      // 3. Add creator as OWNER in group_members (preserves all existing memberships!)
      db.prepare(`
        INSERT OR IGNORE INTO group_members (group_id, user_id, role, membership_status)
        VALUES (?, ?, 'OWNER', 'ACTIVE')
      `).run(familyId, req.user.id);

      // 4. Create default location sharing settings
      db.prepare(`
        INSERT OR IGNORE INTO group_location_settings (group_id, user_id, sharing_enabled, history_enabled)
        VALUES (?, ?, 1, 1)
      `).run(familyId, req.user.id);

      // 5. Update user's active family_id to the newly created family
      db.prepare('UPDATE users SET family_id = ? WHERE id = ?').run(familyId, req.user.id);
      family = db.prepare('SELECT * FROM families WHERE id = ?').get(familyId);
    })();

    // Migrate/join socket rooms for user
    const migrateSockets = req.app.get('migrateUserFamilySockets');
    if (migrateSockets) {
      migrateSockets(req.user.id, null, family.id);
    }

    res.status(201).json({
      message: 'Family created successfully.',
      family: {
        ...family,
        role: 'owner',
        is_owner: true
      },
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
 * Supports multiple family memberships without leaving existing families!
 */
router.post('/join', (req, res) => {
  try {
    const rawCode = req.body.invite_code || req.body.inviteCode;

    if (!rawCode || typeof rawCode !== 'string' || !rawCode.trim()) {
      return res.status(400).json({ error: 'Invite code is required.' });
    }

    const cleanCode = rawCode.trim().toUpperCase();

    // Check families or groups
    let family = db.prepare('SELECT * FROM families WHERE invite_code = ?').get(cleanCode);
    if (!family) {
      const grp = db.prepare('SELECT * FROM groups WHERE invite_code = ?').get(cleanCode);
      if (grp) {
        family = { id: grp.id, name: grp.name, invite_code: grp.invite_code, created_by: grp.created_by };
      }
    }

    if (!family) {
      return res.status(404).json({ error: 'Invalid invite code. No family found with this code.' });
    }

    // Verify user is not already a member of THIS specific family
    const existingMembership = db.prepare(`
      SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND membership_status = 'ACTIVE'
    `).get(family.id, req.user.id);

    if (existingMembership) {
      return res.status(400).json({ error: 'You are already a member of this family.' });
    }

    let members;
    db.transaction(() => {
      // 1. Add to group_members (preserves all existing family memberships!)
      db.prepare(`
        INSERT INTO group_members (group_id, user_id, role, membership_status)
        VALUES (?, ?, 'MEMBER', 'ACTIVE')
        ON CONFLICT(group_id, user_id) DO UPDATE SET membership_status = 'ACTIVE'
      `).run(family.id, req.user.id);

      // 2. Add location sharing settings
      db.prepare(`
        INSERT OR IGNORE INTO group_location_settings (group_id, user_id, sharing_enabled, history_enabled)
        VALUES (?, ?, 1, 1)
      `).run(family.id, req.user.id);

      // 3. Set newly joined family as active family
      db.prepare('UPDATE users SET family_id = ? WHERE id = ?').run(family.id, req.user.id);

      members = db.prepare(`
        SELECT u.id, u.name, u.email, u.phone, u.avatar_color, u.created_at, gm.role
        FROM group_members gm
        JOIN users u ON u.id = gm.user_id
        WHERE gm.group_id = ? AND gm.membership_status = 'ACTIVE'
      `).all(family.id);
    })();

    // Notify family socket room
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
      io.to(`group:${family.id}`).emit('member:joined', {
        userId: req.user.id,
        user_id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        avatarColor: req.user.avatar_color,
        groupId: family.id
      });
    }

    res.json({
      message: 'Successfully joined the family.',
      family: {
        ...family,
        role: 'member',
        is_owner: false
      },
      members
    });
  } catch (err) {
    console.error('Join family error:', err);
    res.status(500).json({ error: 'Internal server error while joining family.' });
  }
});

/**
 * GET /api/family/my-families
 * Retrieve every family circle the authenticated user belongs to.
 */
router.get('/my-families', (req, res) => {
  try {
    const currentUser = db.prepare('SELECT id, family_id FROM users WHERE id = ?').get(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Auto backfill if user has a family_id not yet in group_members
    if (currentUser.family_id) {
      const existsInGm = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(currentUser.family_id, currentUser.id);
      if (!existsInGm) {
        const fam = db.prepare('SELECT id, created_by FROM families WHERE id = ?').get(currentUser.family_id);
        if (fam) {
          const role = fam.created_by === currentUser.id ? 'OWNER' : 'MEMBER';
          db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id, role, membership_status) VALUES (?, ?, ?, ?)').run(fam.id, currentUser.id, role, 'ACTIVE');
          db.prepare('INSERT OR IGNORE INTO group_location_settings (group_id, user_id, sharing_enabled, history_enabled) VALUES (?, ?, 1, 1)').run(fam.id, currentUser.id);
        }
      }
    }

    const families = db.prepare(`
      SELECT 
        f.id,
        f.name,
        f.invite_code,
        f.created_by,
        f.created_at,
        COALESCE(gm.role, CASE WHEN f.created_by = ? THEN 'OWNER' ELSE 'MEMBER' END) as role,
        COALESCE(g.description, '') as description,
        COALESCE(g.group_type, 'FAMILY') as group_type,
        COALESCE(g.avatar_color, '#4F46E5') as avatar_color,
        COALESCE(g.icon, 'Users') as icon,
        (SELECT COUNT(*) FROM group_members WHERE group_id = f.id AND membership_status = 'ACTIVE') as member_count,
        CASE WHEN f.id = ? THEN 1 ELSE 0 END as is_active,
        CASE WHEN f.created_by = ? OR gm.role = 'OWNER' THEN 1 ELSE 0 END as is_owner
      FROM group_members gm
      JOIN families f ON f.id = gm.group_id
      LEFT JOIN groups g ON g.id = f.id
      WHERE gm.user_id = ? AND gm.membership_status = 'ACTIVE'
      ORDER BY is_active DESC, f.created_at DESC
    `).all(req.user.id, currentUser.family_id, req.user.id, req.user.id);

    res.json({
      families,
      activeFamilyId: currentUser.family_id
    });
  } catch (err) {
    console.error('Get my-families error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/family/select/:familyId
 * Select an active family dashboard without leaving any other family.
 */
router.post('/select/:familyId', (req, res) => {
  try {
    const familyId = parseInt(req.params.familyId, 10);
    if (!familyId || isNaN(familyId)) {
      return res.status(400).json({ error: 'Invalid family ID.' });
    }

    // Verify membership in group_members or legacy family_id
    const membership = db.prepare(`
      SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND membership_status = 'ACTIVE'
    `).get(familyId, req.user.id);

    const isDirectActive = req.user.family_id === familyId;

    if (!membership && !isDirectActive) {
      return res.status(403).json({ error: 'Access denied. You do not belong to this family.' });
    }

    const family = db.prepare('SELECT * FROM families WHERE id = ?').get(familyId);
    if (!family) {
      return res.status(404).json({ error: 'Family not found.' });
    }

    const oldFamilyId = req.user.family_id;

    // Set active family
    db.prepare('UPDATE users SET family_id = ? WHERE id = ?').run(familyId, req.user.id);

    // Migrate socket room
    const migrateSockets = req.app.get('migrateUserFamilySockets');
    if (migrateSockets) {
      migrateSockets(req.user.id, oldFamilyId, familyId);
    }

    res.json({
      message: `Switched active circle to ${family.name}.`,
      activeFamilyId: familyId,
      family: {
        ...family,
        role: membership?.role?.toLowerCase() || 'member'
      }
    });
  } catch (err) {
    console.error('Select family error:', err);
    res.status(500).json({ error: 'Internal server error.' });
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
      SELECT DISTINCT u.id, u.name, u.email, u.phone, u.avatar_color, u.created_at,
             CASE WHEN ? = u.id THEN 1 ELSE 0 END as is_owner,
             COALESCE(gm.role, CASE WHEN ? = u.id THEN 'OWNER' ELSE 'MEMBER' END) as role
      FROM users u
      LEFT JOIN group_members gm ON gm.user_id = u.id AND gm.group_id = ? AND gm.membership_status = 'ACTIVE'
      WHERE u.family_id = ? OR gm.group_id = ?
      ORDER BY is_owner DESC, u.created_at ASC
    `).all(family.created_by, family.created_by, family.id, family.id, family.id);

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
        db.prepare('UPDATE groups SET created_by = ? WHERE id = ?').run(successorId, oldFamilyId);
        db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?').run('OWNER', oldFamilyId, successorId);
      }

      // Remove user from old family's group_members and settings
      db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(oldFamilyId, currentUser.id);
      db.prepare('DELETE FROM group_location_settings WHERE group_id = ? AND user_id = ?').run(oldFamilyId, currentUser.id);

      // Add user to target family's group_members and settings
      db.prepare(`
        INSERT OR REPLACE INTO group_members (group_id, user_id, role, membership_status)
        VALUES (?, ?, 'MEMBER', 'ACTIVE')
      `).run(targetFamily.id, currentUser.id);

      db.prepare(`
        INSERT OR REPLACE INTO group_location_settings (group_id, user_id, sharing_enabled, history_enabled)
        VALUES (?, ?, 1, 1)
      `).run(targetFamily.id, currentUser.id);

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
 * POST /api/family/leave and POST /api/family/leave/:familyId
 * Securely leave a family circle with ownership succession and complete socket migration.
 * Preserves other family memberships!
 */
router.post(['/leave', '/leave/:familyId'], (req, res) => {
  try {
    const currentUser = db.prepare('SELECT id, name, family_id FROM users WHERE id = ?').get(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const targetFamilyId = req.params.familyId ? parseInt(req.params.familyId, 10) : currentUser.family_id;
    if (!targetFamilyId || isNaN(targetFamilyId)) {
      return res.status(400).json({ error: 'You are not in any family to leave.' });
    }

    const currentFamily = db.prepare('SELECT * FROM families WHERE id = ?').get(targetFamilyId);
    if (!currentFamily) {
      return res.status(404).json({ error: 'Family not found.' });
    }

    // Verify user is in this family
    const membership = db.prepare(`
      SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND membership_status = 'ACTIVE'
    `).get(targetFamilyId, currentUser.id);

    const isDirectActive = currentUser.family_id === targetFamilyId;
    if (!membership && !isDirectActive) {
      return res.status(400).json({ error: 'You are not a member of this family.' });
    }

    const otherMembers = db.prepare(`
      SELECT DISTINCT u.id, u.name 
      FROM group_members gm
      JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ? AND gm.user_id != ? AND gm.membership_status = 'ACTIVE'
      ORDER BY gm.joined_at ASC
    `).all(targetFamilyId, currentUser.id);

    const isCurrentOwner = currentFamily.created_by === currentUser.id || membership?.role === 'OWNER';
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

    let nextActiveFamilyId = currentUser.family_id;

    db.transaction(() => {
      // 1. Remove from group_members and location settings for this family
      db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(targetFamilyId, currentUser.id);
      db.prepare('DELETE FROM group_location_settings WHERE group_id = ? AND user_id = ?').run(targetFamilyId, currentUser.id);

      // 2. Clear or update user's active family_id if it pointed to targetFamilyId
      if (currentUser.family_id === targetFamilyId) {
        const remaining = db.prepare(`
          SELECT group_id FROM group_members 
          WHERE user_id = ? AND membership_status = 'ACTIVE' 
          ORDER BY joined_at DESC LIMIT 1
        `).get(currentUser.id);

        nextActiveFamilyId = remaining ? remaining.group_id : null;
        db.prepare('UPDATE users SET family_id = ? WHERE id = ?').run(nextActiveFamilyId, currentUser.id);
      }

      // 3. Ownership handover or cleanup if last member
      if (isCurrentOwner && successorId) {
        db.prepare('UPDATE families SET created_by = ? WHERE id = ?').run(successorId, targetFamilyId);
        db.prepare('UPDATE groups SET created_by = ? WHERE id = ?').run(successorId, targetFamilyId);
        db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?').run('OWNER', targetFamilyId, successorId);
      } else if (isCurrentOwner && otherMembers.length === 0) {
        // Last member leaving owner circle -> safely clean up related records and family
        db.prepare('UPDATE users SET family_id = NULL WHERE family_id = ?').run(targetFamilyId);
        try { db.prepare('UPDATE locations SET family_id = NULL WHERE family_id = ?').run(targetFamilyId); } catch (_) {}
        try { db.prepare('DELETE FROM journey_checkpoints WHERE journey_id IN (SELECT id FROM journeys WHERE family_id = ?)').run(targetFamilyId); } catch (_) {}
        try { db.prepare('DELETE FROM journeys WHERE family_id = ?').run(targetFamilyId); } catch (_) {}
        db.prepare('DELETE FROM group_members WHERE group_id = ?').run(targetFamilyId);
        db.prepare('DELETE FROM group_location_settings WHERE group_id = ?').run(targetFamilyId);
        db.prepare('DELETE FROM geofences WHERE family_id = ?').run(targetFamilyId);
        db.prepare('DELETE FROM alerts WHERE family_id = ?').run(targetFamilyId);
        db.prepare('DELETE FROM families WHERE id = ?').run(targetFamilyId);
        db.prepare('DELETE FROM groups WHERE id = ?').run(targetFamilyId);
      }
    })();

    // Socket migration
    const migrateSockets = req.app.get('migrateUserFamilySockets');
    if (migrateSockets) {
      migrateSockets(currentUser.id, targetFamilyId, nextActiveFamilyId);
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`family:${targetFamilyId}`).emit('member:left', {
        userId: currentUser.id,
        user_id: currentUser.id,
        userName: currentUser.name,
        user_name: currentUser.name,
        familyId: targetFamilyId
      });
    }

    res.json({
      message: 'Left family successfully.',
      leftFamilyId: targetFamilyId,
      activeFamilyId: nextActiveFamilyId,
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
 * Get all members of the active family (or specified familyId query) with their latest location.
 * Strictly respects per-family location sharing privacy!
 */
router.get('/members', (req, res) => {
  try {
    const targetFamilyId = req.query.familyId ? parseInt(req.query.familyId, 10) : req.user.family_id;
    if (!targetFamilyId) {
      return res.status(400).json({ error: 'You are not a member of any family.' });
    }

    // Verify user authorization for this family
    const isMember = db.prepare(`
      SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND membership_status = 'ACTIVE'
    `).get(targetFamilyId, req.user.id);

    if (!isMember && req.user.family_id !== targetFamilyId) {
      return res.status(403).json({ error: 'Access denied. You do not belong to this family.' });
    }

    const members = db.prepare(`
      SELECT DISTINCT u.id, u.name, u.email, u.phone, u.avatar_color, ? as family_id, u.created_at,
             COALESCE(gm.role, 'MEMBER') as role
      FROM users u
      LEFT JOIN group_members gm ON gm.user_id = u.id AND gm.group_id = ? AND gm.membership_status = 'ACTIVE'
      WHERE u.family_id = ? OR gm.group_id = ?
      ORDER BY gm.joined_at ASC
    `).all(targetFamilyId, targetFamilyId, targetFamilyId, targetFamilyId);

    // Get latest locations for all members
    const latestLocations = locationService.getLatestLocations(targetFamilyId);

    const membersWithLocations = members.map(member => {
      // Check if member has sharing enabled for this group/family
      const locSetting = db.prepare(`
        SELECT sharing_enabled FROM group_location_settings WHERE group_id = ? AND user_id = ?
      `).get(targetFamilyId, member.id);

      const isSharingAllowed = !locSetting || locSetting.sharing_enabled === 1;
      const location = isSharingAllowed ? latestLocations.find(loc => loc.user_id === member.id) : null;

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
 * GET /api/family/:familyId
 * Return specific family details only if user is authorized to access it.
 * Note: uses (\\d+) regex constraint to prevent shadowing any named static routes!
 */
router.get('/:familyId(\\d+)', (req, res) => {
  try {
    const familyId = parseInt(req.params.familyId, 10);
    if (!familyId || isNaN(familyId)) {
      return res.status(400).json({ error: 'Invalid family ID.' });
    }

    // Verify user authorization: must be member in group_members or active family_id
    const membership = db.prepare(`
      SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND membership_status = 'ACTIVE'
    `).get(familyId, req.user.id);

    const isDirectActive = req.user.family_id === familyId;

    if (!membership && !isDirectActive) {
      return res.status(403).json({ error: 'Access denied. You do not belong to this family.' });
    }

    const family = db.prepare('SELECT * FROM families WHERE id = ?').get(familyId);
    if (!family) {
      return res.status(404).json({ error: 'Family not found.' });
    }

    const owner = db.prepare('SELECT id, name, email, avatar_color FROM users WHERE id = ?').get(family.created_by);
    const members = db.prepare(`
      SELECT DISTINCT u.id, u.name, u.email, u.phone, u.avatar_color, u.created_at,
             CASE WHEN ? = u.id THEN 1 ELSE 0 END as is_owner,
             COALESCE(gm.role, CASE WHEN ? = u.id THEN 'OWNER' ELSE 'MEMBER' END) as role
      FROM users u
      LEFT JOIN group_members gm ON gm.user_id = u.id AND gm.group_id = ? AND gm.membership_status = 'ACTIVE'
      WHERE u.family_id = ? OR gm.group_id = ?
      ORDER BY is_owner DESC, u.created_at ASC
    `).all(family.created_by, family.created_by, family.id, family.id, family.id);

    const isOwner = family.created_by === req.user.id || (membership && membership.role === 'OWNER');
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
      userRole: isOwner ? 'owner' : (membership?.role?.toLowerCase() || 'member'),
      members,
      otherMembers,
      is_active: req.user.family_id === family.id,
      canLeaveDirectly: !isOwner || otherMembers.length === 0
    });
  } catch (err) {
    console.error('Get family by ID error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
