const authMiddleware = require('./auth');

/**
 * Middleware that requires the user to have 'admin' or 'super_admin' role.
 */
function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
    }
    next();
  });
}

/**
 * Middleware that strictly requires 'super_admin' role.
 */
function superAdminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied. Super Administrator privileges required.' });
    }
    next();
  });
}

module.exports = { adminMiddleware, superAdminMiddleware };

