import { Capacitor, registerPlugin } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { Network } from '@capacitor/network';
import { Preferences } from '@capacitor/preferences';
import { App } from '@capacitor/app';

import { APP_VERSION, APP_VERSION_CODE } from '../version';

// Native Android Plugin bridge
const FamilyLocation = registerPlugin('FamilyLocation');

const STORAGE_KEYS = {
  TRACKING_ENABLED: 'ft_native_tracking_enabled',
  TRACKING_MODE: 'ft_native_tracking_mode',
  DESIRED_PERMISSION: 'ft_desired_permission',
  OFFLINE_QUEUE: 'ft_offline_location_queue',
  LAST_LOCATION: 'ft_last_known_location',
};

// Mode configuration
export const TRACKING_MODES = {
  battery_saver: {
    id: 'battery_saver',
    name: 'Eco Mode (Battery Saver)',
    intervalMs: 10 * 60 * 1000, // 10 minutes
    distanceFilterMeters: 50,
    enableHighAccuracy: false,
    description: 'Updates location every 10 minutes. Minimal battery impact.',
  },
  balanced: {
    id: 'balanced',
    name: 'Balanced Mode',
    intervalMs: 5 * 60 * 1000, // 5 minutes
    distanceFilterMeters: 20,
    enableHighAccuracy: true,
    description: 'Updates location every 5 minutes. Recommended for daily use.',
  },
  high_accuracy: {
    id: 'high_accuracy',
    name: 'High Accuracy (Active Trip)',
    intervalMs: 60 * 1000, // 1 minute
    distanceFilterMeters: 5,
    enableHighAccuracy: true,
    description: 'Continuous 1-minute updates. Higher battery consumption.',
  },
};

class NativeLocationService {
  constructor() {
    this.isNative = Capacitor.isNativePlatform();
    this.platform = Capacitor.getPlatform(); // 'android' | 'ios' | 'web'
    this.watchId = null;
    this.intervalTimer = null;
    this.isTracking = false;
    this.isPaused = false;
    this.currentMode = 'balanced';
    this.subscribers = new Set();
    this.isSyncingQueue = false;
    this.wakeLock = null;

    // Listen for network connectivity to flush offline location queue
    if (this.isNative) {
      Network.addListener('networkStatusChange', (status) => {
        if (status.connected) {
          console.log('[NativeLocation] Network restored. Flushing offline queue...');
          this.flushOfflineQueue();
        }
      });

      // Handle app state transitions (background / foreground)
      App.addListener('appStateChange', (state) => {
        console.log(`[NativeLocation] App state changed to: ${state.isActive ? 'Active' : 'Background'}`);
        if (state.isActive) {
          this.flushOfflineQueue();
        }
      });
    } else {
      window.addEventListener('online', () => this.flushOfflineQueue());
    }
  }

  /**
   * Detect whether FamilyTracker is running as Web, PWA or Native App
   */
  getEnvironmentType() {
    if (this.isNative) {
      return this.platform; // 'android' | 'ios'
    }
    const isStandalone = typeof window !== 'undefined' && (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      (document.referrer && document.referrer.includes('android-app://'))
    );
    return isStandalone ? 'pwa' : 'web';
  }

  /**
   * Subscribe to live location updates
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers(locationData) {
    this.subscribers.forEach((cb) => {
      try {
        cb(locationData);
      } catch (e) {
        console.warn('[NativeLocation] Subscriber error:', e);
      }
    });
  }

  /**
   * Screen Wake Lock for Web browser keeping continuous tracking active
   */
  async requestWakeLock() {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        if (!this.wakeLock) {
          this.wakeLock = await navigator.wakeLock.request('screen');
          console.log('[NativeLocation] Screen Wake Lock acquired.');
          this.wakeLock.addEventListener('release', () => {
            console.log('[NativeLocation] Screen Wake Lock released.');
            this.wakeLock = null;
          });
        }
      } catch (err) {
        console.warn('[NativeLocation] Wake Lock notice:', err.message);
      }
    }
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      try {
        this.wakeLock.release().catch(() => {});
      } catch (_) {}
      this.wakeLock = null;
    }
  }

  /**
   * Check OS Location Permission Status
   * Returns granular statuses:
   * - foreground (boolean)
   * - background (boolean)
   * - backgroundSupported (boolean)
   * - locationServicesEnabled (boolean)
   * - serviceRunning (boolean)
   * - isTrackingActive (boolean)
   */
  async checkPermissions() {
    const env = this.getEnvironmentType();
    const isAndroidNative = env === 'android';
    const isIOSNative = env === 'ios';

    // 1. Real Native Android Permission Check via Capacitor Plugin
    if (isAndroidNative) {
      try {
        const androidRes = await FamilyLocation.checkPermissions();
        return {
          platform: 'android',
          envType: 'android',
          foreground: Boolean(androidRes.foreground),
          fineLocation: Boolean(androidRes.fineLocation),
          coarseLocation: Boolean(androidRes.coarseLocation),
          background: Boolean(androidRes.background),
          backgroundSupported: true,
          locationServicesEnabled: Boolean(androidRes.locationServicesEnabled),
          serviceRunning: Boolean(androidRes.serviceRunning),
          sdkVersion: androidRes.sdkVersion || 30,
          isTrackingActive: this.isTracking,
          lastLocation: await this.getLastKnownLocation()
        };
      } catch (err) {
        console.warn('[NativeLocation] Android native plugin error, fallback:', err);
      }
    }

    // 2. Native iOS Core Location Check
    if (isIOSNative) {
      let isGranted = false;
      if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
        try {
          const res = await navigator.permissions.query({ name: 'geolocation' });
          isGranted = res.state === 'granted';
        } catch (_) {}
      }
      return {
        platform: 'ios',
        envType: 'ios',
        foreground: isGranted,
        background: false, // Needs Core Location Always Auth
        backgroundSupported: true,
        locationServicesEnabled: true,
        serviceRunning: this.isTracking,
        isTrackingActive: this.isTracking,
        lastLocation: await this.getLastKnownLocation()
      };
    }

    // 3. Web Browser & Installed PWA
    let foregroundGranted = false;
    let queryState = 'prompt';

    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const result = await navigator.permissions.query({ name: 'geolocation' });
          queryState = result.state;
          foregroundGranted = result.state === 'granted';
        } catch (_) {}
      }
    }

    return {
      platform: env === 'pwa' ? 'pwa' : 'web',
      envType: env,
      foreground: foregroundGranted,
      status: queryState,
      background: false, // CRITICAL: NEVER claim background permission is granted in Web/PWA
      backgroundSupported: false, // Web browsers cannot run background tracking daemons
      locationServicesEnabled: true,
      serviceRunning: false, // No native background service on web
      isTrackingActive: this.isTracking,
      hasWakeLock: Boolean(this.wakeLock),
      lastLocation: await this.getLastKnownLocation()
    };
  }

  /**
   * Request Foreground Location Permissions
   */
  async requestForegroundPermissions() {
    const env = this.getEnvironmentType();
    if (env === 'android') {
      try {
        const res = await FamilyLocation.requestForegroundPermissions();
        return res;
      } catch (err) {
        console.warn('[NativeLocation] Android requestForegroundPermissions error:', err);
      }
    }

    // Web / iOS fallback
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        return resolve({ foreground: false, error: 'Geolocation not supported' });
      }
      navigator.geolocation.getCurrentPosition(
        () => resolve({ foreground: true, status: 'granted' }),
        (err) => resolve({ foreground: false, status: 'denied', code: err.code, error: err.message }),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  /**
   * Request Background Location on Android
   * On Android 11+ (API 30+), redirects to App Settings for "Allow all the time"
   */
  async requestBackgroundPermissions() {
    const env = this.getEnvironmentType();
    if (env === 'android') {
      try {
        return await FamilyLocation.requestBackgroundPermissions();
      } catch (err) {
        console.warn('[NativeLocation] Android requestBackgroundPermissions error:', err);
      }
    }
    return { background: false };
  }

  /**
   * Open Android Application Settings directly
   */
  async openAppSettings() {
    const env = this.getEnvironmentType();
    if (env === 'android') {
      try {
        await FamilyLocation.openAppSettings();
      } catch (err) {
        console.warn('[NativeLocation] openAppSettings error:', err);
      }
    }
  }

  /**
   * Open Device Location Source Settings (GPS toggle)
   */
  async openLocationSettings() {
    const env = this.getEnvironmentType();
    if (env === 'android') {
      try {
        await FamilyLocation.openLocationSettings();
      } catch (err) {
        console.warn('[NativeLocation] openLocationSettings error:', err);
      }
    }
  }

  /**
   * Get device telemetry (battery level & charging state)
   */
  async getDeviceTelemetry() {
    let batteryLevel = null;
    let isCharging = false;

    try {
      if (this.isNative) {
        const info = await Device.getBatteryInfo();
        batteryLevel = info.batteryLevel != null ? Math.round(info.batteryLevel * 100) : null;
        isCharging = Boolean(info.isCharging);
      } else if (navigator.getBattery) {
        const battery = await navigator.getBattery();
        batteryLevel = Math.round(battery.level * 100);
        isCharging = battery.charging;
      }
    } catch (_) {
      // Telemetry optional, fallback gracefully
    }

    return { batteryLevel, isCharging };
  }

  /**
   * Start Native Location Tracking
   */
  async startTracking(mode = 'balanced', uploadFn) {
    this.currentMode = mode;
    this.uploadFn = uploadFn;
    this.isTracking = true;
    this.isPaused = false;

    await Preferences.set({ key: STORAGE_KEYS.TRACKING_ENABLED, value: 'true' });
    await Preferences.set({ key: STORAGE_KEYS.TRACKING_MODE, value: mode });

    // On Android native, start the Android Location Foreground Service
    if (this.isNative && this.platform === 'android') {
      try {
        await FamilyLocation.startForegroundService();
        console.log('[NativeLocation] Android LocationForegroundService started.');
      } catch (err) {
        console.warn('[NativeLocation] Failed to start foreground service:', err.message);
      }
    } else {
      // On Web, acquire wake lock to keep browser awake
      await this.requestWakeLock();
    }

    const config = TRACKING_MODES[mode] || TRACKING_MODES.balanced;

    // Immediately acquire and send first position fix
    this.captureLocationFix();

    // Setup periodic polling interval
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.intervalTimer = setInterval(() => {
      if (!this.isPaused && this.isTracking) {
        this.captureLocationFix();
      }
    }, config.intervalMs);

    // Register watchPosition for movement detection
    if (navigator.geolocation) {
      if (this.watchId != null) {
        navigator.geolocation.clearWatch(this.watchId);
      }

      this.watchId = navigator.geolocation.watchPosition(
        (pos) => this.handleLocationSuccess(pos),
        (err) => console.warn('[NativeLocation] Watch warning:', err.message),
        {
          enableHighAccuracy: config.enableHighAccuracy,
          maximumAge: 5000,
          timeout: 12000,
        }
      );
    }

    console.log(`[NativeLocation] Tracking started in ${config.name} (${this.getEnvironmentType()})`);
    return true;
  }

  /**
   * Capture a single location fix
   */
  captureLocationFix() {
    if (!navigator.geolocation || !this.isTracking || this.isPaused) return;

    const config = TRACKING_MODES[this.currentMode] || TRACKING_MODES.balanced;

    navigator.geolocation.getCurrentPosition(
      (pos) => this.handleLocationSuccess(pos),
      (err) => console.warn('[NativeLocation] Fix error:', err.message),
      {
        enableHighAccuracy: config.enableHighAccuracy,
        timeout: 10000,
        maximumAge: 10000,
      }
    );
  }

  /**
   * Handle successful GPS fix from OS
   */
  async handleLocationSuccess(pos) {
    if (!pos || !pos.coords) return;

    const { latitude, longitude, accuracy, speed, altitude, heading } = pos.coords;
    const timestamp = new Date(pos.timestamp || Date.now()).toISOString();
    const telemetry = await this.getDeviceTelemetry();

    const locationPayload = {
      latitude,
      longitude,
      accuracy: accuracy != null ? Math.round(accuracy) : null,
      speed: speed != null ? Math.max(0, speed * 3.6) : 0, // Convert m/s to km/h
      altitude: altitude != null ? Math.round(altitude) : null,
      heading: heading != null ? Math.round(heading) : null,
      battery_level: telemetry.batteryLevel,
      is_charging: telemetry.isCharging ? 1 : 0,
      timestamp,
      tracking_mode: this.currentMode,
      platform: this.getEnvironmentType(),
    };

    // Save as last known location
    await Preferences.set({
      key: STORAGE_KEYS.LAST_LOCATION,
      value: JSON.stringify(locationPayload),
    });

    // Notify UI components
    this.notifySubscribers(locationPayload);

    // Send to backend via provided upload function or enqueue if offline
    if (this.uploadFn) {
      try {
        await this.uploadFn(locationPayload);
      } catch (netErr) {
        console.warn('[NativeLocation] Network transmission failed, saving to offline queue:', netErr.message);
        await this.enqueueOfflineLocation(locationPayload);
      }
    }
  }

  /**
   * Queue failed location updates in persistent storage
   */
  async enqueueOfflineLocation(payload) {
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEYS.OFFLINE_QUEUE });
      const queue = value ? JSON.parse(value) : [];

      if (queue.length > 200) {
        queue.shift();
      }
      queue.push(payload);

      await Preferences.set({
        key: STORAGE_KEYS.OFFLINE_QUEUE,
        value: JSON.stringify(queue),
      });
      console.log(`[NativeLocation] Enqueued offline fix. Total queued: ${queue.length}`);
    } catch (e) {
      console.error('[NativeLocation] Queue save error:', e);
    }
  }

  /**
   * Flush queued offline location updates when network returns
   */
  async flushOfflineQueue() {
    if (this.isSyncingQueue || !this.uploadFn) return;

    try {
      this.isSyncingQueue = true;
      const { value } = await Preferences.get({ key: STORAGE_KEYS.OFFLINE_QUEUE });
      if (!value) return;

      const queue = JSON.parse(value);
      if (!Array.isArray(queue) || queue.length === 0) return;

      console.log(`[NativeLocation] Synchronizing ${queue.length} offline location points...`);
      const remaining = [];

      for (const item of queue) {
        try {
          await this.uploadFn(item);
        } catch (err) {
          remaining.push(item);
        }
      }

      await Preferences.set({
        key: STORAGE_KEYS.OFFLINE_QUEUE,
        value: JSON.stringify(remaining),
      });
      console.log(`[NativeLocation] Queue synchronized. Remaining unsynced: ${remaining.length}`);
    } catch (e) {
      console.error('[NativeLocation] Queue flush error:', e);
    } finally {
      this.isSyncingQueue = false;
    }
  }

  /**
   * Pause location tracking
   */
  pauseTracking() {
    this.isPaused = true;
    console.log('[NativeLocation] Tracking paused.');
  }

  /**
   * Resume location tracking
   */
  resumeTracking() {
    this.isPaused = false;
    this.captureLocationFix();
    console.log('[NativeLocation] Tracking resumed.');
  }

  /**
   * Stop location tracking completely
   */
  async stopTracking() {
    this.isTracking = false;
    this.isPaused = false;

    if (this.watchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    // Stop Android Foreground Service if native
    if (this.isNative && this.platform === 'android') {
      try {
        await FamilyLocation.stopForegroundService();
        console.log('[NativeLocation] Android LocationForegroundService stopped.');
      } catch (err) {
        console.warn('[NativeLocation] Failed to stop foreground service:', err.message);
      }
    }

    this.releaseWakeLock();

    await Preferences.set({ key: STORAGE_KEYS.TRACKING_ENABLED, value: 'false' });
    console.log('[NativeLocation] Tracking stopped.');
  }

  /**
   * Retrieve last known location from storage
   */
  async getLastKnownLocation() {
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEYS.LAST_LOCATION });
      return value ? JSON.parse(value) : null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Get native application version info
   */
  async getAppVersionInfo() {
    if (this.isNative && this.platform === 'android') {
      try {
        return await FamilyLocation.getAppVersionInfo();
      } catch (err) {
        console.warn('Failed to get native version info:', err);
      }
    }
    return {
      versionCode: APP_VERSION_CODE,
      versionName: APP_VERSION,
      packageName: 'com.familytracker.app'
    };
  }

  /**
   * Download and launch APK installer on Android
   */
  async downloadAndInstallApk(url) {
    if (this.isNative && this.platform === 'android') {
      return await FamilyLocation.downloadAndInstallApk({ url });
    }
    // Web/PWA fallback: trigger direct browser download
    window.location.href = url || '/FamilyTracker.apk';
    return { status: 'downloading' };
  }
}

export const nativeLocationService = new NativeLocationService();
export default nativeLocationService;
