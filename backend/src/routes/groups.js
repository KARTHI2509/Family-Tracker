const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');
const locationService = require('../services/locationService');

const router = express.Router();

// All group routes require authentication
router.use(authMiddleware);

const VALID_GROUP_TYPES = ['FAMILY', 'FRIENDS', 'COLLEGE', 'CLASS', 'WORK', 'PROJECT', 'TRAVEL', 'CUSTOM'];

/**
 * Generate a unique 6-character alphanumeric invite code
 */
function generateInviteCode() {
  let code = uuidv4().replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase();
  while (db.prepare('SELECT id FROM groups WHERE invite_code = ?').get(code)) {
    code = uuidv4().replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase();
  }
  return code;
}

/**
 * GET /api/groups
 * List all groups that the authenticated user belongs to.
 */
router.get('/', (req, res) => {
  try {
    const groups = db.prepare(`
      SELECT 
        g.id,
        g.name,
        g.description,
        g.group_type,
        g.avatar_color,
        g.icon,
        g.invite_code,
        g.created_by,
        g.created_at,
        g.status,
        gm.role,
        gm.membership_status,
        gm.joined_at,
        COALESCE(gls.sharing_enabled, 1) as sharing_enabled,
        COALESCE(gls.history_enabled, 1) as history_enabled,
        (SELECT COUNT(*) FROM group_members WHERE group_id = g.id AND membership_status = 'ACTIVE') as total_members,
        u.name as creator_name
      FROM group_members gm
      JOIN groups g ON gm.group_id = g.id
      JOIN users u ON g.created_by = u.id
      LEFT JOIN group_location_settings gls ON gls.group_id = g.id AND gls.user_id = gm.user_id
      WHERE gm.user_id = ? AND gm.membership_status = 'ACTIVE' AND g.status = 'active'
      ORDER BY gm.joined_at ASC
    `).all(req.user.id);

    const onlineUsers = req.app.get('onlineUsers') || new Map();

    const formattedGroups = groups.map(g => {
      // Get all active member user IDs in this group
      const memberRows = db.prepare('SELECT user_id FROM group_members WHERE group_id = ? AND membership_status = "ACTIVE"').all(g.id);
      const onlineCount = memberRows.filter(m => onlineUsers.has(m.user_id)).length;

      // Active SOS events in this group
      const activeSOS = db.prepare(`
        SELECT COUNT(DISTINCT s.id) as count
        FROM sos_events s
        JOIN group_members gm ON s.user_id = gm.user_id
        WHERE s.is_active = 1 AND gm.group_id = ?
      `).get(g.id)?.count || 0;

      // Count how many members are actively sharing location in this group
      const sharingCount = db.prepare(`
        SELECT COUNT(*) as count
        FROM group_members gm
        LEFT JOIN group_location_settings gls ON gm.group_id = gls.group_id AND gm.user_id = gls.user_id
        WHERE gm.group_id = ? AND gm.membership_status = 'ACTIVE' AND COALESCE(gls.sharing_enabled, 1) = 1
      `).get(g.id)?.count || 0;

      return {
        id: g.id,
        name: g.name,
        description: g.description,
        groupType: g.group_type,
        group_type: g.group_type,
        avatarColor: g.avatar_color,
        avatar_color: g.avatar_color,
        icon: g.icon || 'Users',
        inviteCode: g.invite_code,
        invite_code: g.invite_code,
        role: g.role,
        isOwner: g.role === 'OWNER',
        isAdmin: g.role === 'OWNER' || g.role === 'ADMIN',
        totalMembers: g.total_members,
        onlineMembers: onlineCount,
        sharingMembers: sharingCount,
        activeSOSCount: activeSOS,
        sharingEnabled: Boolean(g.sharing_enabled),
        historyEnabled: Boolean(g.history_enabled),
        joinedAt: g.joined_at,
        creatorName: g.creator_name,
        created_at: g.created_at
      };
    });

    res.json({ groups: formattedGroups });
  } catch (err) {
    console.error('List groups error:', err);
    res.status(500).json({ error: 'Internal server error while fetching groups.' });
  }
});

/**
 * POST /api/groups/create
 * Create a new group.
 */
router.post('/create', (req, res) => {
  try {
    const { name, groupType, description, avatarColor, icon, sharingEnabled, historyEnabled } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Valid group name is required.' });
    }

    const typeUpper = (groupType || 'FAMILY').toUpperCase();
    const cleanType = VALID_GROUP_TYPES.includes(typeUpper) ? typeUpper : 'CUSTOM';
    const cleanColor = avatarColor && /^#[0-9A-Fa-f]{6}$/.test(avatarColor) ? avatarColor : '#4F46E5';
    const cleanIcon = icon && typeof icon === 'string' ? icon.trim() : 'Users';
    const inviteCode = generateInviteCode();

    let newGroup;
    db.transaction(() => {
      const groupStmt = db.prepare(`
        INSERT INTO groups (name, description, group_type, avatar_color, icon, created_by, invite_code, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
      `);
      const result = groupStmt.run(
        name.trim(),
        description ? description.trim() : null,
        cleanType,
        cleanColor,
        cleanIcon,
        req.user.id,
        inviteCode
      );

      const groupId = result.lastInsertRowid;

      // Add creator as OWNER
      db.prepare(`
        INSERT INTO group_members (group_id, user_id, role, membership_status)
        VALUES (?, ?, 'OWNER', 'ACTIVE')
      `).run(groupId, req.user.id);

      // Create default group location settings
      db.prepare(`
        INSERT INTO group_location_settings (group_id, user_id, sharing_enabled, history_enabled)
        VALUES (?, ?, ?, ?)
      `).run(
        groupId,
        req.user.id,
        sharingEnabled !== false ? 1 : 0,
        historyEnabled !== false ? 1 : 0
      );

      // Also set users.family_id if currently null for backward compatibility
      const u = db.prepare('SELECT family_id FROM users WHERE id = ?').get(req.user.id);
      if (!u || !u.family_id) {
        db.prepare('UPDATE users SET family_id = ? WHERE id = ?').run(groupId, req.user.id);
      }

      newGroup = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
    })();

    // Join user socket to new group room across all devices
    const joinSockets = req.app.get('joinUserGroupSockets');
    if (joinSockets) {
      joinSockets(req.user.id, newGroup.id);
    }

    res.status(201).json({
      message: 'Group created successfully.',
      group: {
        id: newGroup.id,
        name: newGroup.name,
        description: newGroup.description,
        groupType: newGroup.group_type,
        avatarColor: newGroup.avatar_color,
        icon: newGroup.icon,
        inviteCode: newGroup.invite_code,
        role: 'OWNER',
        isOwner: true,
        totalMembers: 1,
        sharingEnabled: sharingEnabled !== false,
        historyEnabled: historyEnabled !== false,
        created_at: newGroup.created_at
      }
    });
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: 'Internal server error while creating group.' });
  }
});

/**
 * POST /api/groups/validate-invite
 * Preview group details before accepting an invitation.
 */
router.post('/validate-invite', (req, res) => {
  try {
    const rawCode = req.body.invite_code || req.body.inviteCode;
    if (!rawCode || typeof rawCode !== 'string' || !rawCode.trim()) {
      return res.status(400).json({ error: 'Invite code is required.' });
    }

    const cleanCode = rawCode.trim().toUpperCase();
    const group = db.prepare('SELECT * FROM groups WHERE invite_code = ? AND status = "active"').get(cleanCode);

    if (!group) {
      return res.status(404).json({ error: 'Invalid invite code. No active group found.' });
    }

    // Check if user is already a member
    const existingMembership = db.prepare(`
      SELECT role, membership_status FROM group_members WHERE group_id = ? AND user_id = ?
    `).get(group.id, req.user.id);

    const memberCount = db.prepare('SELECT COUNT(*) as count FROM group_members WHERE group_id = ? AND membership_status = "ACTIVE"').get(group.id)?.count || 0;
    const creator = db.prepare('SELECT name FROM users WHERE id = ?').get(group.created_by);

    res.json({
      valid: true,
      groupId: group.id,
      groupName: group.name,
      description: group.description,
      groupType: group.group_type,
      avatarColor: group.avatar_color,
      icon: group.icon,
      creatorName: creator ? creator.name : 'Unknown',
      memberCount,
      alreadyMember: Boolean(existingMembership && existingMembership.membership_status === 'ACTIVE')
    });
  } catch (err) {
    console.error('Validate invite error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/groups/join
 * Join an existing group using an invite code.
 */
router.post('/join', (req, res) => {
  try {
    const rawCode = req.body.invite_code || req.body.inviteCode;
    const { sharingEnabled = true, historyEnabled = true } = req.body;

    if (!rawCode || typeof rawCode !== 'string' || !rawCode.trim()) {
      return res.status(400).json({ error: 'Invite code is required.' });
    }

    const cleanCode = rawCode.trim().toUpperCase();
    const group = db.prepare('SELECT * FROM groups WHERE invite_code = ? AND status = "active"').get(cleanCode);

    if (!group) {
      return res.status(404).json({ error: 'Invalid invite code. No active group found.' });
    }

    // Check duplicate membership
    const existing = db.prepare('SELECT id, membership_status FROM group_members WHERE group_id = ? AND user_id = ?').get(group.id, req.user.id);
    if (existing && existing.membership_status === 'ACTIVE') {
      return res.status(400).json({ error: 'You are already an active member of this group.' });
    }

    db.transaction(() => {
      if (existing) {
        db.prepare(`
          UPDATE group_members
          SET membership_status = 'ACTIVE', role = 'MEMBER', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(existing.id);
      } else {
        db.prepare(`
          INSERT INTO group_members (group_id, user_id, role, membership_status)
          VALUES (?, ?, 'MEMBER', 'ACTIVE')
        `).run(group.id, req.user.id);
      }

      // Initialize or update location settings
      db.prepare(`
        INSERT INTO group_location_settings (group_id, user_id, sharing_enabled, history_enabled)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(group_id, user_id) DO UPDATE SET
          sharing_enabled = excluded.sharing_enabled,
          history_enabled = excluded.history_enabled,
          updated_at = CURRENT_TIMESTAMP
      `).run(group.id, req.user.id, sharingEnabled ? 1 : 0, historyEnabled ? 1 : 0);

      // Backfill user's default family_id if empty
      const u = db.prepare('SELECT family_id FROM users WHERE id = ?').get(req.user.id);
      if (!u || !u.family_id) {
        db.prepare('UPDATE users SET family_id = ? WHERE id = ?').run(group.id, req.user.id);
      }
    })();

    // Join user socket across all devices
    const joinSockets = req.app.get('joinUserGroupSockets');
    if (joinSockets) {
      joinSockets(req.user.id, group.id);
    }

    // Broadcast member:joined event to group room
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${group.id}`).emit('member:joined', {
        groupId: group.id,
        group_id: group.id,
        userId: req.user.id,
        user_id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        avatarColor: req.user.avatar_color,
        role: 'MEMBER'
      });
    }

    res.json({
      message: `Successfully joined "${group.name}".`,
      group: {
        id: group.id,
        name: group.name,
        groupType: group.group_type,
        avatarColor: group.avatar_color,
        icon: group.icon,
        role: 'MEMBER'
      }
    });
  } catch (err) {
    console.error('Join group error:', err);
    res.status(500).json({ error: 'Internal server error while joining group.' });
  }
});

/**
 * GET /api/groups/all-map
 * Consolidated view of all locations the user is authorized to see across all their groups.
 */
router.get('/all-map', (req, res) => {
  try {
    // Find all groups the user actively belongs to
    const userGroups = db.prepare(`
      SELECT g.id, g.name, g.group_type, g.avatar_color, g.icon
      FROM group_members gm
      JOIN groups g ON gm.group_id = g.id
      WHERE gm.user_id = ? AND gm.membership_status = 'ACTIVE' AND g.status = 'active'
    `).all(req.user.id);

    if (!userGroups || userGroups.length === 0) {
      return res.json({ members: [], groups: [] });
    }

    const groupIds = userGroups.map(g => g.id);
    const placeholders = groupIds.map(() => '?').join(',');

    // Find all other members in those groups who have enabled sharing for that specific group
    const rows = db.prepare(`
      SELECT 
        u.id as user_id,
        u.name as user_name,
        u.email,
        u.avatar_color,
        u.phone,
        g.id as group_id,
        g.name as group_name,
        g.group_type,
        g.avatar_color as group_color,
        COALESCE(gls.sharing_enabled, 1) as sharing_enabled,
        l.latitude,
        l.longitude,
        l.accuracy,
        l.speed,
        l.battery_level,
        l.is_charging,
        l.address,
        l.timestamp as location_timestamp
      FROM group_members gm
      JOIN users u ON gm.user_id = u.id
      JOIN groups g ON gm.group_id = g.id
      LEFT JOIN group_location_settings gls ON gm.group_id = gls.group_id AND gm.user_id = gls.user_id
      LEFT JOIN locations l ON l.id = (
        SELECT id FROM locations
        WHERE user_id = u.id AND (group_id = g.id OR group_id IS NULL)
        ORDER BY timestamp DESC LIMIT 1
      )
      WHERE gm.group_id IN (${placeholders})
        AND gm.membership_status = 'ACTIVE'
        AND COALESCE(gls.sharing_enabled, 1) = 1
      ORDER BY u.name ASC
    `).all(...groupIds);

    const onlineUsers = req.app.get('onlineUsers') || new Map();

    // Deduplicate members so a person in multiple shared groups appears once with all their shared group badges
    const memberMap = new Map();

    rows.forEach(r => {
      if (!memberMap.has(r.user_id)) {
        memberMap.set(r.user_id, {
          id: r.user_id,
          name: r.user_name,
          email: r.email,
          avatarColor: r.avatar_color,
          phone: r.phone,
          isOnline: onlineUsers.has(r.user_id),
          isCurrentUser: r.user_id === req.user.id,
          groups: [],
          latestLocation: (r.latitude != null && r.longitude != null) ? {
            latitude: r.latitude,
            longitude: r.longitude,
            accuracy: r.accuracy,
            speed: r.speed,
            batteryLevel: r.battery_level,
            battery_level: r.battery_level,
            isCharging: Boolean(r.is_charging),
            is_charging: Boolean(r.is_charging),
            address: r.address,
            timestamp: r.location_timestamp
          } : null
        });
      }

      const m = memberMap.get(r.user_id);
      if (!m.groups.some(g => g.id === r.group_id)) {
        m.groups.push({
          id: r.group_id,
          name: r.group_name,
          type: r.group_type,
          color: r.group_color
        });
      }
    });

    res.json({
      members: Array.from(memberMap.values()),
      groups: userGroups
    });
  } catch (err) {
    console.error('All groups map error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/groups/:id
 * Retrieve details of a specific group.
 */
router.get('/:id', (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const membership = db.prepare(`
      SELECT gm.role, gm.membership_status, COALESCE(gls.sharing_enabled, 1) as sharing_enabled, COALESCE(gls.history_enabled, 1) as history_enabled
      FROM group_members gm
      LEFT JOIN group_location_settings gls ON gm.group_id = gls.group_id AND gm.user_id = gls.user_id
      WHERE gm.group_id = ? AND gm.user_id = ? AND gm.membership_status = 'ACTIVE'
    `).get(groupId, req.user.id);

    if (!membership) {
      return res.status(403).json({ error: 'Access denied. You are not an active member of this group.' });
    }

    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
    if (!group || group.status !== 'active') {
      return res.status(404).json({ error: 'Group not found.' });
    }

    const creator = db.prepare('SELECT name, email, avatar_color FROM users WHERE id = ?').get(group.created_by);
    const memberCount = db.prepare('SELECT COUNT(*) as count FROM group_members WHERE group_id = ? AND membership_status = "ACTIVE"').get(groupId)?.count || 0;

    res.json({
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        groupType: group.group_type,
        avatarColor: group.avatar_color,
        icon: group.icon,
        inviteCode: group.invite_code,
        created_at: group.created_at,
        created_by: group.created_by,
        creatorName: creator ? creator.name : 'Unknown',
        role: membership.role,
        isOwner: membership.role === 'OWNER',
        isAdmin: membership.role === 'OWNER' || membership.role === 'ADMIN',
        totalMembers: memberCount,
        sharingEnabled: Boolean(membership.sharing_enabled),
        historyEnabled: Boolean(membership.history_enabled)
      }
    });
  } catch (err) {
    console.error('Get group error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * PUT /api/groups/:id
 * Update group metadata (name, description, type, color, icon) - OWNER/ADMIN only.
 */
router.put('/:id', (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const membership = db.prepare(`
      SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND membership_status = 'ACTIVE'
    `).get(groupId, req.user.id);

    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      return res.status(403).json({ error: 'Only group owners and administrators can edit group settings.' });
    }

    const { name, description, groupType, avatarColor, icon } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Group name cannot be empty.' });
    }

    const typeUpper = (groupType || 'FAMILY').toUpperCase();
    const cleanType = VALID_GROUP_TYPES.includes(typeUpper) ? typeUpper : 'CUSTOM';
    const cleanColor = avatarColor && /^#[0-9A-Fa-f]{6}$/.test(avatarColor) ? avatarColor : '#4F46E5';
    const cleanIcon = icon && typeof icon === 'string' ? icon.trim() : 'Users';

    db.prepare(`
      UPDATE groups
      SET name = ?, description = ?, group_type = ?, avatar_color = ?, icon = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name.trim(), description ? description.trim() : null, cleanType, cleanColor, cleanIcon, groupId);

    const updated = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);

    // Notify group via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('group:updated', {
        groupId,
        group: updated
      });
    }

    res.json({ message: 'Group updated successfully.', group: updated });
  } catch (err) {
    console.error('Update group error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/groups/:id/members
 * Get members of a group with their latest location (if sharing is enabled for this group).
 */
router.get('/:id/members', (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const membership = db.prepare(`
      SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND membership_status = 'ACTIVE'
    `).get(groupId, req.user.id);

    if (!membership) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this group.' });
    }

    const members = db.prepare(`
      SELECT 
        u.id,
        u.name,
        u.email,
        u.phone,
        u.avatar_color,
        gm.role,
        gm.membership_status,
        gm.joined_at,
        COALESCE(gls.sharing_enabled, 1) as sharing_enabled,
        COALESCE(gls.history_enabled, 1) as history_enabled
      FROM group_members gm
      JOIN users u ON gm.user_id = u.id
      LEFT JOIN group_location_settings gls ON gm.group_id = gls.group_id AND gm.user_id = gls.user_id
      WHERE gm.group_id = ? AND gm.membership_status = 'ACTIVE'
      ORDER BY gm.joined_at ASC
    `).all(groupId);

    const onlineUsers = req.app.get('onlineUsers') || new Map();

    const formattedMembers = members.map(m => {
      let latestLocation = null;
      // ONLY include location if member has sharing_enabled = 1 for THIS group!
      if (m.sharing_enabled === 1) {
        latestLocation = db.prepare(`
          SELECT latitude, longitude, accuracy, speed, battery_level, is_charging, address, timestamp
          FROM locations
          WHERE user_id = ? AND (group_id = ? OR group_id IS NULL)
          ORDER BY timestamp DESC LIMIT 1
        `).get(m.id, groupId) || null;
      }

      return {
        id: m.id,
        name: m.name,
        email: m.email,
        phone: m.phone,
        avatarColor: m.avatar_color,
        role: m.role,
        isOwner: m.role === 'OWNER',
        isAdmin: m.role === 'OWNER' || m.role === 'ADMIN',
        membershipStatus: m.membership_status,
        joinedAt: m.joined_at,
        sharingEnabled: Boolean(m.sharing_enabled),
        historyEnabled: Boolean(m.history_enabled),
        isOnline: onlineUsers.has(m.id),
        latest_location: latestLocation,
        latestLocation
      };
    });

    res.json({ members: formattedMembers });
  } catch (err) {
    console.error('Get group members error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/groups/:id/location-settings
 * Get current user's location sharing settings for this group.
 */
router.get('/:id/location-settings', (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const settings = db.prepare(`
      SELECT sharing_enabled, history_enabled
      FROM group_location_settings
      WHERE group_id = ? AND user_id = ?
    `).get(groupId, req.user.id);

    res.json({
      groupId,
      sharingEnabled: settings ? Boolean(settings.sharing_enabled) : true,
      historyEnabled: settings ? Boolean(settings.history_enabled) : true
    });
  } catch (err) {
    console.error('Get location settings error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * PUT /api/groups/:id/location-settings
 * Toggle location sharing & history sharing for this specific group.
 */
router.put('/:id/location-settings', (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const { sharingEnabled, historyEnabled } = req.body;

    // Verify user is a member of this group
    const membership = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND membership_status = "ACTIVE"').get(groupId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this group.' });
    }

    db.prepare(`
      INSERT INTO group_location_settings (group_id, user_id, sharing_enabled, history_enabled)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(group_id, user_id) DO UPDATE SET
        sharing_enabled = COALESCE(?, sharing_enabled),
        history_enabled = COALESCE(?, history_enabled),
        updated_at = CURRENT_TIMESTAMP
    `).run(
      groupId,
      req.user.id,
      sharingEnabled !== undefined ? (sharingEnabled ? 1 : 0) : 1,
      historyEnabled !== undefined ? (historyEnabled ? 1 : 0) : 1,
      sharingEnabled !== undefined ? (sharingEnabled ? 1 : 0) : null,
      historyEnabled !== undefined ? (historyEnabled ? 1 : 0) : null
    );

    const updated = db.prepare('SELECT * FROM group_location_settings WHERE group_id = ? AND user_id = ?').get(groupId, req.user.id);

    // Broadcast sharing toggle to group so maps update immediately
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('member:sharing_updated', {
        groupId,
        userId: req.user.id,
        sharingEnabled: Boolean(updated.sharing_enabled),
        historyEnabled: Boolean(updated.history_enabled)
      });
    }

    res.json({
      message: 'Location sharing settings updated for this group.',
      sharingEnabled: Boolean(updated.sharing_enabled),
      historyEnabled: Boolean(updated.history_enabled)
    });
  } catch (err) {
    console.error('Update location settings error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/groups/:id/history/:memberId
 * Retrieve location history of a member scoped to this group.
 */
router.get('/:id/history/:memberId', (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const targetUserId = parseInt(req.params.memberId, 10);
    const hours = Math.min(168, Math.max(1, parseInt(req.query.hours, 10) || 24)); // 1 hour to 7 days

    // 1. Verify requester is active member
    const reqMembership = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND membership_status = "ACTIVE"').get(groupId, req.user.id);
    if (!reqMembership) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this group.' });
    }

    // 2. Verify target member is active member
    const targetMembership = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND membership_status = "ACTIVE"').get(groupId, targetUserId);
    if (!targetMembership) {
      return res.status(404).json({ error: 'Member not found in this group.' });
    }

    // 3. Verify target member has enabled history sharing for THIS group (unless viewing own history)
    if (targetUserId !== req.user.id) {
      const targetSettings = db.prepare(`
        SELECT sharing_enabled, history_enabled
        FROM group_location_settings
        WHERE group_id = ? AND user_id = ?
      `).get(groupId, targetUserId);

      if (targetSettings && (targetSettings.sharing_enabled === 0 || targetSettings.history_enabled === 0)) {
        return res.status(403).json({ error: 'This member has paused location history sharing with this group.' });
      }
    }

    const cutoffIso = new Date(Date.now() - hours * 3600 * 1000).toISOString();

    const points = db.prepare(`
      SELECT id, user_id, latitude, longitude, accuracy, speed, battery_level, is_charging, address, timestamp
      FROM locations
      WHERE user_id = ? 
        AND (group_id = ? OR group_id IS NULL)
        AND timestamp >= ?
      ORDER BY timestamp ASC
    `).all(targetUserId, groupId, cutoffIso);

    res.json({
      groupId,
      userId: targetUserId,
      hours,
      pointsCount: points.length,
      history: points
    });
  } catch (err) {
    console.error('Get group history error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/groups/:id/leave
 * Leave a group.
 */
router.post('/:id/leave', (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const { transferOwnerTo } = req.body;

    const membership = db.prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ? AND membership_status = "ACTIVE"').get(groupId, req.user.id);
    if (!membership) {
      return res.status(400).json({ error: 'You are not a member of this group.' });
    }

    const otherMembers = db.prepare(`
      SELECT user_id, role, joined_at
      FROM group_members
      WHERE group_id = ? AND user_id != ? AND membership_status = 'ACTIVE'
      ORDER BY CASE WHEN role = 'ADMIN' THEN 0 ELSE 1 END, joined_at ASC
    `).all(groupId, req.user.id);

    db.transaction(() => {
      // If user is owner
      if (membership.role === 'OWNER') {
        if (otherMembers.length > 0) {
          let successorId = transferOwnerTo ? parseInt(transferOwnerTo, 10) : null;
          if (!successorId || !otherMembers.some(m => m.user_id === successorId)) {
            // Auto-promote first admin or oldest member
            successorId = otherMembers[0].user_id;
          }

          db.prepare('UPDATE group_members SET role = "OWNER" WHERE group_id = ? AND user_id = ?').run(groupId, successorId);
          db.prepare('UPDATE groups SET created_by = ? WHERE id = ?').run(successorId, groupId);
        } else {
          // Sole member leaving -> archive group
          db.prepare('UPDATE groups SET status = "archived" WHERE id = ?').run(groupId);
        }
      }

      // Remove member
      db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, req.user.id);
      db.prepare('DELETE FROM group_location_settings WHERE group_id = ? AND user_id = ?').run(groupId, req.user.id);
    })();

    // Socket leave room
    const leaveSockets = req.app.get('leaveUserGroupSockets');
    if (leaveSockets) {
      leaveSockets(req.user.id, groupId);
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('member:left', {
        groupId,
        userId: req.user.id,
        userName: req.user.name
      });
    }

    res.json({ message: 'Successfully left the group.' });
  } catch (err) {
    console.error('Leave group error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/groups/:id/transfer-owner
 * Transfer ownership of group (OWNER only).
 */
router.post('/:id/transfer-owner', (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const { newOwnerId } = req.body;

    const myMembership = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND membership_status = "ACTIVE"').get(groupId, req.user.id);
    if (!myMembership || myMembership.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only the group owner can transfer ownership.' });
    }

    const targetMembership = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND membership_status = "ACTIVE"').get(groupId, newOwnerId);
    if (!targetMembership) {
      return res.status(404).json({ error: 'Target user is not an active member of this group.' });
    }

    db.transaction(() => {
      db.prepare('UPDATE group_members SET role = "OWNER" WHERE group_id = ? AND user_id = ?').run(groupId, newOwnerId);
      db.prepare('UPDATE group_members SET role = "ADMIN" WHERE group_id = ? AND user_id = ?').run(groupId, req.user.id);
      db.prepare('UPDATE groups SET created_by = ? WHERE id = ?').run(newOwnerId, groupId);
    })();

    res.json({ message: 'Ownership transferred successfully.' });
  } catch (err) {
    console.error('Transfer owner error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * PUT /api/groups/:id/members/:userId/role
 * Promote or demote an administrator (OWNER only).
 */
router.put('/:id/members/:userId/role', (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const targetUserId = parseInt(req.params.userId, 10);
    const { role } = req.body;

    if (!['ADMIN', 'MEMBER'].includes(role)) {
      return res.status(400).json({ error: 'Role must be either ADMIN or MEMBER.' });
    }

    const myMembership = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND membership_status = "ACTIVE"').get(groupId, req.user.id);
    if (!myMembership || myMembership.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only the group owner can promote or demote administrators.' });
    }

    db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?').run(role, groupId, targetUserId);

    res.json({ message: `Member role updated to ${role}.` });
  } catch (err) {
    console.error('Update member role error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * DELETE /api/groups/:id/members/:userId
 * Remove a member from the group (OWNER or ADMIN).
 */
router.delete('/:id/members/:userId', (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const targetUserId = parseInt(req.params.userId, 10);

    const myMembership = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND membership_status = "ACTIVE"').get(groupId, req.user.id);
    if (!myMembership || (myMembership.role !== 'OWNER' && myMembership.role !== 'ADMIN')) {
      return res.status(403).json({ error: 'Only group owners and admins can remove members.' });
    }

    const target = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, targetUserId);
    if (!target) {
      return res.status(404).json({ error: 'Member not found.' });
    }

    if (target.role === 'OWNER') {
      return res.status(400).json({ error: 'Cannot remove the group owner.' });
    }

    if (myMembership.role === 'ADMIN' && target.role === 'ADMIN') {
      return res.status(403).json({ error: 'Administrators cannot remove other administrators.' });
    }

    db.transaction(() => {
      db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, targetUserId);
      db.prepare('DELETE FROM group_location_settings WHERE group_id = ? AND user_id = ?').run(groupId, targetUserId);
    })();

    // Sockets leave
    const leaveSockets = req.app.get('leaveUserGroupSockets');
    if (leaveSockets) {
      leaveSockets(targetUserId, groupId);
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('member:removed', {
        groupId,
        userId: targetUserId
      });
    }

    res.json({ message: 'Member removed from group.' });
  } catch (err) {
    console.error('Remove member error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * DELETE /api/groups/:id
 * Delete a group (OWNER only).
 */
router.delete('/:id', (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const myMembership = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND membership_status = "ACTIVE"').get(groupId, req.user.id);
    if (!myMembership || myMembership.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only the group owner can delete the group.' });
    }

    db.transaction(() => {
      db.prepare('DELETE FROM group_members WHERE group_id = ?').run(groupId);
      db.prepare('DELETE FROM group_location_settings WHERE group_id = ?').run(groupId);
      db.prepare('DELETE FROM geofences WHERE group_id = ?').run(groupId);
      db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
    })();

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('group:deleted', { groupId });
    }

    res.json({ message: 'Group deleted successfully.' });
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/groups/:id/geofences
 * List geofences for a group.
 */
router.get('/:id/geofences', (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const membership = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND membership_status = "ACTIVE"').get(groupId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const geofences = db.prepare(`
      SELECT g.*, u.name as creator_name
      FROM geofences g
      JOIN users u ON g.created_by = u.id
      WHERE g.group_id = ? OR (g.group_id IS NULL AND g.family_id = ?)
      ORDER BY g.created_at DESC
    `).all(groupId, groupId);

    res.json({ geofences });
  } catch (err) {
    console.error('Get group geofences error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/groups/:id/geofences
 * Create a new geofence for a group.
 */
router.post('/:id/geofences', (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const membership = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND membership_status = "ACTIVE"').get(groupId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const { name, latitude, longitude, radius, color } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Safe zone name is required.' });
    }

    if (!locationService.isValidCoordinate(latitude, longitude)) {
      return res.status(400).json({ error: 'Valid latitude and longitude are required.' });
    }

    const cleanRadius = Math.max(50, Math.min(10000, Number(radius) || 200));
    const cleanColor = color && /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#4F46E5';

    const result = db.prepare(`
      INSERT INTO geofences (group_id, family_id, name, latitude, longitude, radius, color, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(groupId, groupId, name.trim(), Number(latitude), Number(longitude), cleanRadius, cleanColor, req.user.id);

    const geofence = db.prepare('SELECT * FROM geofences WHERE id = ?').get(result.lastInsertRowid);

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('geofence:created', geofence);
    }

    res.status(201).json({ message: 'Safe zone created.', geofence });
  } catch (err) {
    console.error('Create group geofence error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * DELETE /api/groups/:id/geofences/:fenceId
 * Delete a geofence.
 */
router.delete('/:id/geofences/:fenceId', (req, res) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const fenceId = parseInt(req.params.fenceId, 10);

    const membership = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND membership_status = "ACTIVE"').get(groupId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const fence = db.prepare('SELECT * FROM geofences WHERE id = ? AND (group_id = ? OR family_id = ?)').get(fenceId, groupId, groupId);
    if (!fence) {
      return res.status(404).json({ error: 'Geofence not found in this group.' });
    }

    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN' && fence.created_by !== req.user.id) {
      return res.status(403).json({ error: 'You do not have permission to delete this safe zone.' });
    }

    db.prepare('DELETE FROM geofence_events WHERE geofence_id = ?').run(fenceId);
    db.prepare('DELETE FROM geofences WHERE id = ?').run(fenceId);

    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('geofence:deleted', { id: fenceId, groupId });
    }

    res.json({ message: 'Safe zone deleted.' });
  } catch (err) {
    console.error('Delete geofence error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;

