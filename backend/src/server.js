require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const db = require('./config/database');
const mongoSync = require('./config/mongoSync');
const alertService = require('./services/alertService');

// Import routes
const authRoutes = require('./routes/auth');
const familyRoutes = require('./routes/family');
const locationRoutes = require('./routes/location');
const geofenceRoutes = require('./routes/geofence');
const sosRoutes = require('./routes/sos');
const alertRoutes = require('./routes/alerts');
const adminRoutes = require('./routes/admin');
const journeyRoutes = require('./routes/journey');
const locationService = require('./services/locationService');

const app = express();
const server = http.createServer(app);

// Trust reverse proxy (Render, Vercel, Railway) for accurate IP resolution and rate-limiting
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disabled to allow external map tiles (OSM/Google) and fonts
  crossOriginEmbedderPolicy: false
}));

// CORS configuration supporting separate Vercel frontend and local development
const allowedOrigins = [];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL.replace(/\/+$/, ''));
}
if (process.env.CORS_ORIGIN) {
  process.env.CORS_ORIGIN.split(',').forEach(o => allowedOrigins.push(o.trim().replace(/\/+$/, '')));
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser callers (curl, tests, server-to-server), localhost, vercel deployments, wildcard or matching allowed origins
    if (
      !origin ||
      allowedOrigins.length === 0 ||
      allowedOrigins.includes('*') ||
      allowedOrigins.includes(origin) ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.endsWith('.vercel.app')
    ) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per windowMs for auth
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: 'Too many requests from this IP, please try again after 15 minutes.' }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600, // 600 requests per windowMs for general API
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: 'Too many requests, please slow down.' }
});

// Socket.IO setup
const io = new Server(server, {
  cors: corsOptions,
  pingTimeout: 30000,
  pingInterval: 25000
});

app.set('io', io);

// Multi-device tracking: Map<userId, { socketIds: Set<string>, familyId: number, lastSeen: number, name: string, avatarColor: string }>
const onlineUsers = new Map();

// Socket.IO authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const secret = process.env.JWT_SECRET || 'familytracker_default_dev_secret_key_change_me';
    const decoded = jwt.verify(token, secret);
    const user = db.prepare('SELECT id, name, email, avatar_color, family_id FROM users WHERE id = ?').get(decoded.userId);

    if (!user) {
      return next(new Error('User not found'));
    }

    socket.user = user;
    next();
  } catch (err) {
    return next(new Error('Invalid or expired token'));
  }
});

io.on('connection', (socket) => {
  const user = socket.user;

  if (user.family_id) {
    const familyRoom = `family:${user.family_id}`;
    socket.join(familyRoom);

    // Track user session across multiple devices
    let userSession = onlineUsers.get(user.id);
    const wasAlreadyOnline = userSession && userSession.socketIds.size > 0;

    if (!userSession) {
      userSession = {
        socketIds: new Set(),
        familyId: user.family_id,
        lastSeen: Date.now(),
        name: user.name,
        avatarColor: user.avatar_color
      };
      onlineUsers.set(user.id, userSession);
    }

    userSession.socketIds.add(socket.id);
    userSession.lastSeen = Date.now();

    // If newly online, broadcast to family
    if (!wasAlreadyOnline) {
      io.to(familyRoom).emit('member:online', {
        userId: user.id,
        user_id: user.id,
        userName: user.name,
        user_name: user.name,
        avatarColor: user.avatar_color,
        avatar_color: user.avatar_color,
        timestamp: new Date().toISOString()
      });
    }

    // Send list of currently online family members to the connecting socket
    const onlineFamilyMembers = [];
    for (const [uid, session] of onlineUsers.entries()) {
      if (session.familyId === user.family_id && session.socketIds.size > 0) {
        onlineFamilyMembers.push(uid);
      }
    }
    socket.emit('online:members', onlineFamilyMembers);
  }

  // Handle client-emitted real-time location update via socket
  socket.on('location:update', (locationData) => {
    if (user.family_id) {
      const userSession = onlineUsers.get(user.id);
      if (userSession) {
        userSession.lastSeen = Date.now();
      }

      const payload = {
        userId: user.id,
        user_id: user.id,
        userName: user.name,
        user_name: user.name,
        avatarColor: user.avatar_color,
        avatar_color: user.avatar_color,
        ...locationData,
        timestamp: new Date().toISOString()
      };

      // Broadcast to other family members in room
      socket.to(`family:${user.family_id}`).emit('location:update', payload);
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const userSession = onlineUsers.get(user.id);
    if (!userSession) return;

    userSession.socketIds.delete(socket.id);

    // Only mark user offline if NO remaining active devices/tabs
    if (userSession.socketIds.size === 0) {
      onlineUsers.delete(user.id);

      if (user.family_id) {
        const familyRoom = `family:${user.family_id}`;
        io.to(familyRoom).emit('member:offline', {
          userId: user.id,
          user_id: user.id,
          userName: user.name,
          user_name: user.name,
          timestamp: new Date().toISOString()
        });

        // Ghost mode check after threshold
        setTimeout(() => {
          if (!onlineUsers.has(user.id)) {
            const ghostAlert = alertService.detectGhostMode(user.id, user.family_id);
            if (ghostAlert) {
              io.to(familyRoom).emit('alert:new', {
                ...ghostAlert,
                userId: user.id,
                user_id: user.id,
                userName: user.name,
                user_name: user.name
              });
            }
          }
        }, alertService.GHOST_MODE_THRESHOLD_MINUTES * 60 * 1000);
      }
    }
  });
});

// Apply rate limiters
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api', apiLimiter);

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/geofence', geofenceRoutes);
app.use('/api/sos', sosRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/journey', journeyRoutes);

// Health check endpoint (production safe - no credentials exposed)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: 'connected',
    mongo: mongoSync.getMongoStatus(),
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    onlineUsers: onlineUsers.size,
    socket: 'ready',
    environment: process.env.NODE_ENV || 'development'
  });
});

// 7-Day Location Retention Cleanup: Purge locations older than 7 days daily
try {
  locationService.cleanupExpiredLocations(7);
} catch (purgeErr) {
  console.warn('Initial location purge warning:', purgeErr.message);
}
setInterval(() => {
  try {
    locationService.cleanupExpiredLocations(7);
  } catch (err) {
    console.error('Scheduled location retention cleanup error:', err.message);
  }
}, 24 * 60 * 60 * 1000);

// Serve production frontend assets if built
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  console.log(`📦 Serving static frontend from: ${frontendDist}`);
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API route not found.' });
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  // Helpful status landing page for browser visitors accessing the root backend URL
  app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FamilyTracker Backend API</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b1120; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 36px; max-width: 520px; width: 100%; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
    .badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399; padding: 6px 14px; border-radius: 9999px; font-weight: 600; font-size: 13px; margin-bottom: 20px; }
    .dot { width: 8px; height: 8px; background: #10b981; border-radius: 50%; display: inline-block; box-shadow: 0 0 10px #10b981; }
    h1 { font-size: 24px; margin: 0 0 10px; font-weight: 700; color: #ffffff; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 20px; }
    .info-box { background: #0f172a; border: 1px solid #1e293b; border-radius: 10px; padding: 14px; text-align: left; font-size: 13px; color: #cbd5e1; margin-bottom: 24px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .info-box div { margin-bottom: 6px; }
    .info-box div:last-child { margin-bottom: 0; }
    .btn { display: inline-block; background: #3b82f6; color: white; text-decoration: none; padding: 10px 22px; border-radius: 8px; font-weight: 600; font-size: 14px; transition: background 0.2s; }
    .btn:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge"><span class="dot"></span> Backend API Server is Live & Ready</div>
    <h1>🛡️ FamilyTracker Backend</h1>
    <p>This is the backend API and real-time Socket.IO server powering FamilyTracker.</p>
    <div class="info-box">
      <div><strong>Status:</strong> OK (Healthy)</div>
      <div><strong>Database:</strong> Connected (SQLite)</div>
      <div><strong>Version:</strong> 2.0.0</div>
      <div><strong>Socket:</strong> Ready</div>
      <div><strong>Role:</strong> Backend Web Service</div>
    </div>
    <p style="font-size: 13px;">To use the application interface, open your <strong>Vercel frontend URL</strong> or on your laptop at <a href="http://localhost:5173" style="color: #60a5fa;">localhost:5173</a>.</p>
    <a class="btn" href="/api/health" target="_blank">View Health API JSON</a>
  </div>
</body>
</html>`);
  });

  // 404 handler for unknown routes
  app.use((req, res) => {
    res.status(404).json({ error: 'Route not found.' });
  });
}

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// Start server if executed directly
const PORT = process.env.PORT || 3001;
if (require.main === module) {
  server.listen(PORT, async () => {
    console.log(`🚀 Family Tracker server running on port ${PORT}`);
    console.log(`📡 Socket.IO ready for connections`);
    console.log(`🗄️  Database: ${db.dbPath || process.env.DB_PATH || './data/familytracker.db'}`);
    await mongoSync.startMongoSync(db);
  });
}

module.exports = { app, server, io };
