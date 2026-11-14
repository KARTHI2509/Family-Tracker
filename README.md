# 🛡️ FamilyTracker V2 — Real-Time Family Location & Safety Platform

A production-grade, real-time family location tracking and safety platform featuring live multi-device mapping, Google Maps integration, smart geofencing, route replay, journey safety, battery optimization modes, emergency SOS broadcast, and a comprehensive Super Admin Portal.

---

## 🌟 Key Features

### 1. Interactive Multi-Layer Live Map
- **Multiple High-Speed Basemaps:** Google Maps (Roadmap), Google Maps (Satellite/Hybrid), Esri World Imagery, Esri Street Map, Humanitarian OpenStreetMap (HOT), and Topographic terrain.
- **Directions & Route Navigation:** Live routing calculated via OSRM with driving ETA and distance, plus one-click deep links to **Google Maps** and **Apple Maps**.
- **Follow Member Mode:** Camera smoothly follows any moving family member.
- **Auto-Fit Bounds & Legend:** Real-time visibility of all family members, battery levels, online status, and safe zones.

### 2. Battery-Adaptive Live Tracking
- **Eco Mode (Battery Saver):** Synchronizes every 10 minutes.
- **Balanced Mode (Default):** Synchronizes every 5 minutes.
- **High Accuracy Mode:** Synchronizes every 1 minute for active navigation.
- **Explicit Privacy Consent:** Instant one-click toggle ("Sharing Live" vs "Sharing Paused").

### 3. Journey Safety & Safe Arrival
- **Start Tracked Trip:** Destination coordinates, destination name, and estimated duration.
- **Safe Arrival Confirmation:** One-tap "I've Arrived Safely" broadcast to the entire family circle.
- **Emergency Check-In:** "Please check on me" instant notification with GPS coordinates.

### 4. 7-Day Location History & Gap Detection
- **Timeline Filters:** 1h, 3h, 6h, 12h, 24h, 7 Days, and custom date range.
- **Route Replay:** Animated playback with 1x, 2x, 5x speed controls and scrubber slider.
- **Signal Gap Detection:** Intelligently identifies and marks tracking gaps (>30m inactive) without drawing misleading lines.
- **Automated Retention:** Scheduled background purge cleans up locations older than 7 days while preserving immutable audit logs.

### 5. Emergency SOS Broadcast
- **Hold-to-Activate:** 1-second safety delay prevents accidental triggers.
- **GPS-Denied Fallback:** Works even when device location permissions are blocked.
- **Real-Time Pulse:** Immediate audio-visual broadcast to all family devices via WebSockets.

### 6. Super Admin Portal (`/admin/*`)
- **System Telemetry:** Real-time user counts, active SOS monitors, and 7-day activity graphs.
- **User Management:** Search, role elevation (`user`, `admin`, `super_admin`), and account suspension/activation.
- **Emergency Location Override:** Strict emergency access authorization requiring case type and mandatory justification ($\ge 10$ characters), recorded to an append-only audit trail.
- **Immutable Audit Trail:** Downloadable security audit logs with CSV export.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, Vite, React-Leaflet, Leaflet, Socket.IO Client, Lucide React, date-fns |
| **Backend** | Node.js, Express, Socket.IO, JWT, bcryptjs, Helmet, Express-Rate-Limit |
| **Databases** | SQLite (WAL mode, persistent storage) with built-in migration to MongoDB Atlas or PostgreSQL |
| **Hosting** | Vercel (Frontend SPA) + Render (Backend Web Service) |
| **CI/CD** | GitHub Actions (`.github/workflows/ci.yml`) |

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- **Node.js** (v18 or higher)
- **npm**

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/KARTHI2509/Family-Tracker.git
cd Family-Tracker

# Install root, backend, and frontend dependencies
npm run install:all
```

### 3. Start Development Servers
```bash
# Start backend (Port 3001) and frontend (Port 5173) concurrently
npm run dev
```
Or start each service separately:
- **Backend:** `cd backend && npm start`
- **Frontend:** `cd frontend && npm run dev`

---

## 🧪 Automated Testing

FamilyTracker includes a comprehensive automated test suite testing all endpoints, Socket.IO multi-device behavior, role permissions, and privacy boundaries:

```bash
cd backend
npm test
```
*Expected: 47/47 passing tests.*

---

## 🚢 Production Deployment

Detailed deployment guides for Vercel, Render, and GitHub Actions are available in:
- 📖 [DEPLOYMENT.md](file:///c:/Users/karth/Downloads/familytracker/DEPLOYMENT.md)
- 📖 [GITHUB_DEPLOYMENT_SETUP.md](file:///c:/Users/karth/Downloads/familytracker/GITHUB_DEPLOYMENT_SETUP.md)

### Production URLs (Placeholders):
- **Frontend (Vercel):** `https://family-tracker.vercel.app`
- **Backend (Render):** `https://family-tracker-backend.onrender.com`
- **Health Check Endpoint:** `https://family-tracker-backend.onrender.com/api/health`

---

## 🔒 Security & Privacy

- **Family Isolation:** Family circles cannot view members, locations, or geofences outside their own circle.
- **Sanitized Coordinates:** Invalid coordinates (e.g. `0, 0` Gulf of Guinea) are rejected.
- **Zero Raw Passwords:** Passwords hashed with `bcryptjs` (salt 10).
- **Audit Trails:** Administrative overrides are recorded in an append-only audit log with timestamp, IP, and justification.
