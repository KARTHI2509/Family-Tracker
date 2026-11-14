const db = require('../config/database');

/**
 * Record an immutable audit log entry.
 */
function recordAuditLog({
  actorId = null,
  actorRole = 'system',
  action,
  targetId = null,
  targetType = null,
  reason = null,
  metadata = null,
  ipAddress = null
}) {
  try {
    const metaStr = metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null;
    const stmt = db.prepare(`
      INSERT INTO audit_logs (actor_id, actor_role, action, target_id, target_type, reason, metadata, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(actorId, actorRole, action, targetId, targetType, reason, metaStr, ipAddress);
    return result.lastInsertRowid;
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
    return null;
  }
}

/**
 * Query audit logs with pagination and filters.
 */
function queryAuditLogs({
  action,
  actorId,
  targetType,
  startDate,
  endDate,
  limit = 50,
  offset = 0
}) {
  let sql = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];

  if (action) {
    sql += ' AND action = ?';
    params.push(action);
  }
  if (actorId) {
    sql += ' AND actor_id = ?';
    params.push(actorId);
  }
  if (targetType) {
    sql += ' AND target_type = ?';
    params.push(targetType);
  }
  if (startDate) {
    sql += ' AND timestamp >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND timestamp <= ?';
    params.push(endDate);
  }

  // Count total matching
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  const countRow = db.prepare(countSql).get(...params);
  const total = countRow ? countRow.total : 0;

  // Append ordering and pagination
  sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const logs = db.prepare(sql).all(...params);
  return { logs, total, limit: Number(limit), offset: Number(offset) };
}

module.exports = {
  recordAuditLog,
  queryAuditLogs
};

