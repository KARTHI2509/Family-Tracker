const jwt = require('jsonwebtoken');
const db = require('../config/database');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Access denied. Invalid token format. Use: Bearer <token>' });
  }

  const token = parts[1];

  try {
    const secret = process.env.JWT_SECRET || 'familytracker_default_dev_secret_key_change_me';
    const decoded = jwt.verify(token, secret);

    // Fetch the full user from the database to ensure they still exist and check status/role
    const user = db.prepare('SELECT id, name, email, phone, avatar_color, family_id, role, status, created_at FROM users WHERE id = ?').get(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'Access denied. User no longer exists.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Access denied. Account has been suspended.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access denied. Token has expired. Please log in again.' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Access denied. Invalid token.' });
    }
    return res.status(500).json({ error: 'Internal server error during authentication.' });
  }
}

module.exports = authMiddleware;
