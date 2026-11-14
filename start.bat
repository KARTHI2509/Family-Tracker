@echo off
echo ===================================================
echo Starting FamilyTracker Backend and Frontend...
echo ===================================================

start "FamilyTracker Backend (Port 3001)" cmd /k "cd /d %~dp0backend && npm start"
start "FamilyTracker Frontend (Port 5173)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Both servers are launching!
echo Backend:  http://localhost:3001
echo Frontend: http://localhost:5173
echo.

