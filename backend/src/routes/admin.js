const express = require('express');
const db = require('../config/database');
const { adminMiddleware, superAdminMiddleware } = require('../middleware/adminAuth');
const { recordAuditLog, queryAuditLogs } = require('../services/auditService');

const router = express.Router();

// Apply adminMiddleware to all admin routes
router.use(adminMiddleware);

/**
 * GET /api/admin/stats
 * Overview analytics and operational statistics.
 */
router.get('/stats', (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const activeUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'active'").get().count;
    const suspendedUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'suspended'").get().count;
    const totalFamilies = db.prepare('SELECT COUNT(*) as count FROM families').get().count;
    const totalGeofences = db.prepare('SELECT COUNT(*) as count FROM geofences').get().count;
    const activeSOS = db.prepare('SELECT COUNT(*) as count FROM sos_events WHERE is_active = 1').get().count;

    // Today's locations
    const locationsToday = db.prepare(`
      SELECT COUNT(*) as count FROM locations 
      WHERE timestamp >= date('now', 'start of day')
    `).get().count;

    // 7-day location activity trend
    const sevenDayTrend = db.prepare(`
      SELECT date(timestamp) as day, COUNT(*) as count
      FROM locations
      WHERE timestamp >= date('now', '-6 days')
      GROUP BY date(timestamp)
      ORDER BY day ASC
    `).all();

    // Recent active SOS list
    const activeSOSEvents = db.prepare(`
      SELECT s.id, s.user_id, s.latitude, s.longitude, s.triggered_at,
             u.name as user_name, u.email as user_email, u.phone as user_phone,
             f.name as family_name
      FROM sos_events s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN families f ON u.family_id = f.id
      WHERE s.is_active = 1
      ORDER BY s.triggered_at DESC
      LIMIT 10
    `).all();

    res.json({
      stats: {
        totalUsers,
        activeUsers,
        suspendedUsers,
        totalFamilies,
        totalGeofences,
        activeSOS,
        locationsToday,
        sevenDayTrend,
        activeSOSEvents
      }
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Failed to retrieve admin stats.' });
  }
});

/**
 * GET /api/admin/users
 * Searchable, filterable list of all registered users.
 */
router.get('/users', (req, res) => {
  try {
    const { search, status, role, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT u.id, u.name, u.email, u.phone, u.avatar_color, u.role, u.status, u.family_id, u.created_at,
             f.name as family_name,
             l.latitude as last_latitude, l.longitude as last_longitude, l.timestamp as last_location_time,
             l.battery_level, l.is_charging
      FROM users u
      LEFT JOIN families f ON u.family_id = f.id
      LEFT JOIN (
        SELECT user_id, latitude, longitude, timestamp, battery_level, is_charging
        FROM locations
        WHERE id IN (SELECT MAX(id) FROM locations GROUP BY user_id)
      ) l ON u.id = l.user_id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      sql += ' AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    if (status) {
      sql += ' AND u.status = ?';
      params.push(status);
    }

    if (role) {
      sql += ' AND u.role = ?';
      params.push(role);
    }

    const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
    const countRow = db.prepare(countSql).get(...params);
    const total = countRow ? countRow.total : 0;

    sql += ' ORDER BY u.id DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const users = db.prepare(sql).all(...params);

    res.json({
      users,
      total,
      limit: Number(limit),
      offset: Number(offset)
    });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Failed to retrieve users.' });
  }
});

/**
 * PUT /api/admin/users/:id/status
 * Activate or suspend a user account.
 */
router.put('/users/:id/status', (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { status, reason } = req.body;

    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be 'active' or 'suspended'." });
    }

    const user = db.prepare('SELECT id, name, email, role, status FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Prevent modifying super_admin by regular admin
    if (user.role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Cannot modify status of a Super Administrator.' });
    }

    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, userId);

    recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: status === 'suspended' ? 'USER_SUSPENDED' : 'USER_ACTIVATED',
      targetId: userId,
      targetType: 'user',
      reason: reason || `Account ${status} by admin ${req.user.name}`,
      metadata: { previousStatus: user.status, newStatus: status, userEmail: user.email },
      ipAddress: req.ip
    });

    res.json({
      message: `User account successfully ${status}.`,
      userId,
      status
    });
  } catch (err) {
    console.error('Update user status error:', err);
    res.status(500).json({ error: 'Failed to update user status.' });
  }
});

/**
 * PUT /api/admin/users/:id/role
 * Upgrade or downgrade user role (Super Admin only).
 */
router.put('/users/:id/role', superAdminMiddleware, (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { role, reason } = req.body;

    if (!['user', 'admin', 'super_admin'].includes(role)) {
      return res.status(400).json({ error: "Invalid role. Must be 'user', 'admin', or 'super_admin'." });
    }

    const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);

    recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'USER_ROLE_CHANGED',
      targetId: userId,
      targetType: 'user',
      reason: reason || `Role changed to ${role} by super admin ${req.user.name}`,
      metadata: { previousRole: user.role, newRole: role, userEmail: user.email },
      ipAddress: req.ip
    });

    res.json({
      message: `User role updated to ${role}.`,
      userId,
      role
    });
  } catch (err) {
    console.error('Update user role error:', err);
    res.status(500).json({ error: 'Failed to update user role.' });
  }
});

/**
 * GET /api/admin/families
 * List all registered family circles.
 */
router.get('/families', (req, res) => {
  try {
    const families = db.prepare(`
      SELECT f.id, f.name, f.invite_code, f.created_by, f.created_at,
             u.name as creator_name, u.email as creator_email,
             COUNT(m.id) as member_count
      FROM families f
      LEFT JOIN users u ON f.created_by = u.id
      LEFT JOIN users m ON m.family_id = f.id
      GROUP BY f.id
      ORDER BY f.id DESC
    `).all();

    res.json({ families });
  } catch (err) {
    console.error('Admin families error:', err);
    res.status(500).json({ error: 'Failed to retrieve families.' });
  }
});

/**
 * POST /api/admin/emergency-access
 * Strict emergency location access authorization workflow.
 */
router.post('/emergency-access', (req, res) => {
  try {
    const { targetUserId, caseType, justification } = req.body;

    if (!targetUserId || !caseType || !justification || justification.trim().length < 10) {
      return res.status(400).json({
        error: 'Missing required emergency details. Justification must be at least 10 characters explaining the life-safety or urgent concern.'
      });
    }

    const targetUser = db.prepare('SELECT id, name, email, phone, family_id FROM users WHERE id = ?').get(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found.' });
    }

    // Grant expires in 2 hours
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const insertGrant = db.prepare(`
      INSERT INTO emergency_access_grants (admin_id, target_user_id, case_type, justification, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.user.id, targetUserId, caseType, justification.trim(), expiresAt);

    // Record immutable audit log
    recordAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: 'EMERGENCY_LOCATION_ACCESS_GRANTED',
      targetId: targetUserId,
      targetType: 'user_location',
      reason: justification.trim(),
      metadata: {
        grantId: insertGrant.lastInsertRowid,
        caseType,
        targetEmail: targetUser.email,
        expiresAt
      },
      ipAddress: req.ip
    });

    // Retrieve target user's latest location and 24h history
    const latestLocation = db.prepare(`
      SELECT latitude, longitude, accuracy, speed, battery_level, is_charging, timestamp
      FROM locations
      WHERE user_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(targetUserId);

    res.json({
      message: 'Emergency access granted. All access is logged to the immutable audit trail.',
      grantId: insertGrant.lastInsertRowid,
      expiresAt,
      targetUser: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        phone: targetUser.phone
      },
      latestLocation
    });
  } catch (err) {
    console.error('Emergency access error:', err);
    res.status(500).json({ error: 'Failed to process emergency access grant.' });
  }
});

/**
 * GET /api/admin/emergencies
 * List all live SOS events and active emergency access grants.
 */
router.get('/emergencies', (req, res) => {
  try {
    const activeSOS = db.prepare(`
      SELECT s.id, s.user_id, s.latitude, s.longitude, s.triggered_at,
             u.name as user_name, u.email as user_email, u.phone as user_phone,
             f.name as family_name
      FROM sos_events s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN families f ON u.family_id = f.id
      WHERE s.is_active = 1
      ORDER BY s.triggered_at DESC
    `).all();

    const activeGrants = db.prepare(`
      SELECT g.id, g.admin_id, g.target_user_id, g.case_type, g.justification, g.granted_at, g.expires_at,
             a.name as admin_name,
             u.name as target_user_name, u.phone as target_user_phone
      FROM emergency_access_grants g
      JOIN users a ON g.admin_id = a.id
      JOIN users u ON g.target_user_id = u.id
      WHERE g.is_revoked = 0 AND g.expires_at > CURRENT_TIMESTAMP
      ORDER BY g.granted_at DESC
    `).all();

    res.json({
      activeSOS,
      activeGrants
    });
  } catch (err) {
    console.error('Admin emergencies error:', err);
    res.status(500).json({ error: 'Failed to retrieve emergencies.' });
  }
});

/**
 * GET /api/admin/audit-logs
 * Paginated and filterable audit logs.
 */
router.get('/audit-logs', (req, res) => {
  try {
    const { action, actorId, targetType, startDate, endDate, limit, offset } = req.query;
    const result = queryAuditLogs({
      action,
      actorId,
      targetType,
      startDate,
      endDate,
      limit: limit || 50,
      offset: offset || 0
    });
    res.json(result);
  } catch (err) {
    console.error('Query audit logs error:', err);
    res.status(500).json({ error: 'Failed to query audit logs.' });
  }
});

/**
 * GET /api/admin/audit-logs/export
 * Download audit logs as CSV.
 */
router.get('/audit-logs/export', (req, res) => {
  try {
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 5000').all();

    let csv = 'ID,ActorID,ActorRole,Action,TargetID,TargetType,Reason,IPAddress,Timestamp\n';
    logs.forEach(log => {
      const cleanReason = (log.reason || '').replace(/"/g, '""');
      csv += `${log.id},${log.actor_id || ''},"${log.actor_role || ''}","${log.action || ''}",${log.target_id || ''},"${log.target_type || ''}","${cleanReason}","${log.ip_address || ''}","${log.timestamp}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="familytracker-audit-logs-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('Export audit logs error:', err);
    res.status(500).json({ error: 'Failed to export audit logs.' });
  }
});

module.exports = router;

