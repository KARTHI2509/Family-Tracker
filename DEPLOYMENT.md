# 🚀 FamilyTracker V2 — Production Deployment Guide

This guide provides step-by-step instructions to deploy **FamilyTracker V2** with the recommended decoupled architecture:
- **Frontend:** [Vercel](https://vercel.com) (React + Vite SPA)
- **Backend:** [Render](https://render.com) (Node.js + Express + Socket.IO)
- **Database:** [MongoDB Atlas](https://www.mongodb.com/atlas) or [Render Persistent Disk / PostgreSQL](https://render.com)

---

## 🏗️ Architecture Overview

```mermaid
flowchart LR
    A[Mobile & Web Clients] -->|HTTPS| B[Vercel: React Frontend]
    A -->|WSS / HTTPS API| C[Render: Express + Socket.IO Backend]
    C -->|Persistent DB| D[(MongoDB Atlas / SQLite / PostgreSQL)]
```

---

## 1. Deploying the Backend on Render

### Step 1: Push Code to GitHub
```bash
git add .
git commit -m "FamilyTracker V2 production release"
git push origin main
```

### Step 2: Create Web Service on Render
1. Sign in to [Render.com](https://render.com).
2. Click **New +** $\rightarrow$ **Web Service**.
3. Select your `familytracker` repository.
4. Configure the service:
   - **Name:** `familytracker-backend`
   - **Root Directory:** `backend`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
5. Under **Environment Variables**, add:
   - `NODE_ENV` = `production`
   - `PORT` = `3001`
   - `JWT_SECRET` = *(Click Generate or enter a secure 32+ character random string)*
   - `FRONTEND_URL` = `https://your-app.vercel.app` *(update once Vercel is created)*
   - `CORS_ORIGIN` = `https://your-app.vercel.app`
   - `MONGODB_URI` = `mongodb+srv://karthikthalipineni_db_user1:KARTHI_23t@cluster0.zf5ottl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`
   - `DB_PATH` = `/data/familytracker.db`
6. Under **Disks** (if using SQLite):
   - **Name:** `familytracker-data`
   - **Mount Path:** `/data`
   - **Size:** `1 GB`
7. Click **Create Web Service**. Note your Render URL: e.g. `https://familytracker-backend.onrender.com`.

---

## 2. Deploying the Frontend on Vercel

### Step 1: Connect Repository to Vercel
1. Sign in to [Vercel.com](https://vercel.com).
2. Click **Add New...** $\rightarrow$ **Project**.
3. Import your `familytracker` repository.
4. Configure Project Settings:
   - **Root Directory:** Edit $\rightarrow$ select `frontend`
   - **Framework Preset:** `Vite`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. Under **Environment Variables**, add:
   - `VITE_API_URL` = `https://familytracker-backend.onrender.com/api`
   - `VITE_SOCKET_URL` = `https://familytracker-backend.onrender.com`
6. Click **Deploy**. Vercel will build the frontend with automatic HTTPS and SPA routing configured via `vercel.json`.

---

## 3. Database Migration

### Migrating SQLite to MongoDB Atlas
If you have local family data in `backend/data/familytracker.db` and wish to migrate it into your MongoDB Atlas cluster:
```bash
cd backend
node scripts/migrate_to_mongo.js
```
This migrates:
- Users (with email unique index)
- Families (with invite code unique index)
- Locations (with 7-day automated TTL retention index)
- Geofences & Safe Zones
- Alerts & SOS Events
- Audit logs

### Migrating to PostgreSQL
If using PostgreSQL on Render or AWS RDS:
```bash
psql $DATABASE_URL -f backend/scripts/migrate_to_postgres.sql
```

---

## 4. Super Admin Portal & Provisioning

FamilyTracker V2 includes an administrative control portal at `/admin/dashboard`.

### Default Initial Super Admin Account:
- **Email:** `admin@familytracker.local`
- **Password:** `AdminPass123!`
- **Role:** `super_admin`

### Provisioning a Custom Admin via CLI:
```bash
cd backend
node scripts/seed_admin.js <your_email> <your_password> "Your Name"
```

### Capabilities of Super Admin Portal:
1. **System Overview (`/admin/dashboard`):** Real-time KPIs, active SOS alerts, 7-day activity graphs.
2. **User Management (`/admin/users`):** Search users, activate/suspend accounts, role management.
3. **Emergency Center (`/admin/emergencies`):** Live SOS distress monitoring, emergency location access override with mandatory justification input.
4. **Audit Trail (`/admin/audit-logs`):** Immutable log of all administrative actions with CSV export.

---

## 5. Map Configuration & Watermark Troubleshooting

FamilyTracker V2 uses **OpenStreetMap** and **Google Maps** (Roadmap & Satellite) directly in Leaflet:
- **Zero API keys required** — no Carto watermarks or account signups.
- The map switcher in the top right corner of the live map allows switching between:
  - OpenStreetMap (Default)
  - Google Maps (Road)
  - Google Maps (Satellite)
  - Esri World Imagery (Satellite)
  - OpenTopoMap (Terrain)
- **If you still see old Carto watermarks in your browser:**  
  Hard-refresh your browser (`Ctrl + Shift + R` or `Cmd + Shift + R`) or clear your browser's site data to remove cached map tiles.
