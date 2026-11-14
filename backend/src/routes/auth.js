const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const AVATAR_COLORS = ['#4F46E5', '#DC2626', '#059669', '#D97706', '#7C3AED', '#DB2777', '#0891B2', '#65A30D'];

function getRandomAvatarColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

function generateToken(userId) {
  const secret = process.env.JWT_SECRET || 'familytracker_default_dev_secret_key_change_me';
  return jwt.sign({ userId }, secret, { expiresIn: '30d' });
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/register
 * Register a new user.
 */
router.post('/register', (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Valid name is required.' });
    }

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ error: 'Valid email address is required.' });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if email already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Hash password
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    // Insert user
    const stmt = db.prepare(`
      INSERT INTO users (name, email, password, phone, avatar_color)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      name.trim(),
      normalizedEmail,
      hashedPassword,
      phone ? String(phone).trim() : null,
      getRandomAvatarColor()
    );

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = generateToken(user.id);

    res.status(201).json({
      message: 'Account created successfully.',
      token,
      user: sanitizeUser(user)
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/auth/login
 * Login with email and password.
 */
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'This account has been suspended. Please contact your administrator.' });
    }

    const token = generateToken(user.id);

    // Also get family info if assigned
    let family = null;
    if (user.family_id) {
      family = db.prepare('SELECT id, name, invite_code FROM families WHERE id = ?').get(user.family_id);
    }

    const safeUser = sanitizeUser(user);
    if (family) {
      safeUser.family_name = family.name;
    }

    // Attach active groups
    const userGroups = db.prepare(`
      SELECT g.id, g.name, g.group_type, g.avatar_color, g.icon, gm.role,
             COALESCE(gls.sharing_enabled, 1) as sharing_enabled
      FROM group_members gm
      JOIN groups g ON gm.group_id = g.id
      LEFT JOIN group_location_settings gls ON gm.group_id = gls.group_id AND gm.user_id = gls.user_id
      WHERE gm.user_id = ? AND gm.membership_status = 'ACTIVE' AND g.status = 'active'
      ORDER BY gm.joined_at ASC
    `).all(user.id);
    safeUser.groups = userGroups;

    res.json({
      message: 'Logged in successfully.',
      token,
      user: safeUser,
      family,
      groups: userGroups
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/auth/me
 * Get current user data including family info.
 */
router.get('/me', authMiddleware, (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    let family = null;
    if (user.family_id) {
      family = db.prepare('SELECT id, name, invite_code, created_by, created_at FROM families WHERE id = ?').get(user.family_id);
    }

    const safeUser = sanitizeUser(user);
    if (family) {
      safeUser.family_name = family.name;
    }

    // Attach active groups
    const userGroups = db.prepare(`
      SELECT g.id, g.name, g.group_type, g.avatar_color, g.icon, gm.role,
             COALESCE(gls.sharing_enabled, 1) as sharing_enabled
      FROM group_members gm
      JOIN groups g ON gm.group_id = g.id
      LEFT JOIN group_location_settings gls ON gm.group_id = gls.group_id AND gm.user_id = gls.user_id
      WHERE gm.user_id = ? AND gm.membership_status = 'ACTIVE' AND g.status = 'active'
      ORDER BY gm.joined_at ASC
    `).all(user.id);
    safeUser.groups = userGroups;

    res.json({
      user: safeUser,
      family,
      groups: userGroups
    });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
