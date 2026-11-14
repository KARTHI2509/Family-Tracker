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
    // Allow non-browser callers (curl, tests, server-to-server) or localhost or matching allowed origins
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin) || origin.includes('localhost') || origin.includes('127.0.0.1')) {
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
  message: { error: 'Too many requests from this IP, please try again after 15 minutes.' }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600, // 600 requests per windowMs for general API
  standardHeaders: true,
  legacyHeaders: false,
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
  // 404 handler for dev API
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
  server.listen(PORT, () => {
    console.log(`🚀 Family Tracker server running on port ${PORT}`);
    console.log(`📡 Socket.IO ready for connections`);
    console.log(`🗄️  Database: ${process.env.DB_PATH || './data/familytracker.db'}`);
  });
}

module.exports = { app, server, io };
