import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { Network } from '@capacitor/network';
import { Preferences } from '@capacitor/preferences';
import { App } from '@capacitor/app';

const STORAGE_KEYS = {
  TRACKING_ENABLED: 'ft_native_tracking_enabled',
  TRACKING_MODE: 'ft_native_tracking_mode',
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
   * Check OS Location Permission Status
   */
  async checkPermissions() {
    if (!('geolocation' in navigator)) {
      return { status: 'unsupported', foreground: false, background: false };
    }

    try {
      if (navigator.permissions && navigator.permissions.query) {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        const isGranted = result.state === 'granted';
        return {
          status: result.state, // 'granted' | 'denied' | 'prompt'
          foreground: isGranted,
          background: isGranted && this.isNative,
          platform: this.platform,
        };
      }
    } catch (_) {
      // Some browsers don't support navigator.permissions.query for geolocation
    }

    return {
      status: 'unknown',
      foreground: true,
      background: this.isNative,
      platform: this.platform,
    };
  }

  /**
   * Request Location Permissions
   */
  async requestPermissions() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        return resolve({ granted: false, error: 'Geolocation not supported' });
      }

      navigator.geolocation.getCurrentPosition(
        () => resolve({ granted: true, status: 'granted' }),
        (err) => resolve({ granted: false, status: 'denied', code: err.code, error: err.message }),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
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

    const config = TRACKING_MODES[mode] || TRACKING_MODES.balanced;

    // Immediately acquire and send first position fix
    this.captureLocationFix();

    // Setup periodic polling interval to guarantee background execution
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.intervalTimer = setInterval(() => {
      if (!this.isPaused && this.isTracking) {
        this.captureLocationFix();
      }
    }, config.intervalMs);

    // Also register native watchPosition for movement detection
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

    console.log(`[NativeLocation] Tracking started in ${config.name} (${this.platform})`);
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
      platform: this.platform,
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

      // Keep maximum 200 points to avoid unbounded storage
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
          // If still failing, keep in remaining queue
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
}

export const nativeLocationService = new NativeLocationService();
export default nativeLocationService;
