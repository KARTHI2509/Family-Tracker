const express = require('express');
const router = express.Router();

// Current latest release metadata
const APP_RELEASE_INFO = {
  latestVersion: '1.1.0',
  latestVersionCode: 2,
  minSupportedVersionCode: 1,
  releaseDate: '2026-11-14',
  apkUrl: 'https://family-tracker-fidw.onrender.com/FamilyTracker.apk',
  downloadUrl: '/FamilyTracker.apk',
  fileSizeBytes: 12376373,
  releaseNotes: [
    '✨ Family Circle Management: Easily switch or leave families at any time',
    '👑 Owner Succession: Seamless ownership handover when leaving a circle',
    '🔒 Strict Privacy Isolation: Cross-family location and history strictly blocked',
    '🛡️ Location Audience Consent: Explicit prompt before sharing with a new circle',
    '📲 In-App Auto-Update: Single-tap seamless updates directly inside the app'
  ]
};

/**
 * GET /api/app/version
 * Retrieve latest version information and release notes
 */
router.get('/version', (req, res) => {
  res.json(APP_RELEASE_INFO);
});

/**
 * GET /api/app/check-update
 * Check if client version is outdated
 * Query params: platform, versionCode, versionName
 */
router.get('/check-update', (req, res) => {
  const currentVersionCode = parseInt(req.query.versionCode, 10) || 1;
  const currentVersionName = req.query.versionName || '1.0.0';
  const platform = (req.query.platform || 'web').toLowerCase();

  const isUpdateAvailable = currentVersionCode < APP_RELEASE_INFO.latestVersionCode;
  const isMandatory = currentVersionCode < APP_RELEASE_INFO.minSupportedVersionCode;

  res.json({
    updateAvailable: isUpdateAvailable,
    mandatory: isMandatory,
    currentVersion: {
      versionCode: currentVersionCode,
      versionName: currentVersionName,
      platform
    },
    latestRelease: APP_RELEASE_INFO
  });
});

module.exports = router;

