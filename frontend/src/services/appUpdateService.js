import api from './api';
import { nativeLocationService } from './nativeLocationService';
import { APP_VERSION, APP_VERSION_CODE } from '../version';

class AppUpdateService {
  constructor() {
    this.updateInfo = null;
    this.isChecking = false;
    this.lastCheckedTime = null;
    this.waitingServiceWorker = null;
  }

  /**
   * Register a waiting service worker detected during manual check
   */
  setWaitingWorker(worker) {
    this.waitingServiceWorker = worker;
  }

  /**
   * Check if a newer version is available on the backend (MANUAL TRIGGER ONLY)
   */
  async checkForUpdate() {
    if (this.isChecking) return this.updateInfo;

    this.isChecking = true;
    try {
      const appInfo = await nativeLocationService.getAppVersionInfo();
      const platform = nativeLocationService.platform || 'web';

      // 1. Check for waiting PWA Service Worker (Web/PWA)
      let pwaWorkerWaiting = false;
      if (!nativeLocationService.isNative && 'serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            await reg.update().catch(() => {});
            if (reg.waiting) {
              this.waitingServiceWorker = reg.waiting;
              pwaWorkerWaiting = true;
            }
          }
        } catch (_) {}
      }

      // 2. Query backend for application release metadata
      const data = await api.get(
        `/app/check-update?platform=${platform}&versionCode=${appInfo.versionCode || APP_VERSION_CODE}&versionName=${encodeURIComponent(appInfo.versionName || APP_VERSION)}`
      );

      this.lastCheckedTime = new Date();

      // On Web/PWA, if a service worker is waiting or backend reports higher version
      const isAvailable = Boolean(data.updateAvailable || pwaWorkerWaiting);

      this.updateInfo = {
        ...data,
        updateAvailable: isAvailable,
        installedVersion: appInfo,
        lastCheckedTime: this.lastCheckedTime,
        pwaWorkerWaiting
      };

      return this.updateInfo;
    } catch (err) {
      console.warn('Manual update check failed:', err.message);
      return null;
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Apply update:
   * - If native Android: launch native APK installer
   * - If Web/PWA: activate waiting service worker and reload cleanly
   */
  async applyUpdate(apkUrl) {
    if (nativeLocationService.isNative && nativeLocationService.platform === 'android') {
      const url = apkUrl || this.updateInfo?.latestRelease?.apkUrl || 'https://family-tracker-fidw.onrender.com/FamilyTracker.apk';
      return await nativeLocationService.downloadAndInstallApk(url);
    }

    // Web/PWA workflow
    if (this.waitingServiceWorker) {
      this.waitingServiceWorker.postMessage({ type: 'SKIP_WAITING' });
    }

    if ('serviceWorker' in navigator) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }

    setTimeout(() => {
      window.location.reload();
    }, 600);

    return { status: 'reloading' };
  }
}

export const appUpdateService = new AppUpdateService();
export default appUpdateService;
