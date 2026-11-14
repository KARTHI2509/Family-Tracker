# ============================================================
# Multi-stage Dockerfile for FamilyTracker (Frontend + Backend)
# ============================================================

# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Production Runner
FROM node:20-alpine
WORKDIR /app

# Install build tools for better-sqlite3 native compilation
RUN apk add --no-cache python3 make g++

# Install backend dependencies
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install --omit=dev

# Copy backend source code
COPY backend/ ./

# Copy compiled frontend assets from Stage 1
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Ensure SQLite data folder exists
RUN mkdir -p /app/backend/data

# Configuration
ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/backend/data/familytracker.db

EXPOSE 3001

CMD ["node", "src/server.js"]

