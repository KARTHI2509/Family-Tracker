import api from './api';
import { nativeLocationService } from './nativeLocationService';

class AppUpdateService {
  constructor() {
    this.updateInfo = null;
    this.isChecking = false;
    this.hasPromptedThisSession = false;
  }

  /**
   * Check if a newer version is available on the backend
   * @param {boolean} force - Force check even if already checked this session
   */
  async checkForUpdate(force = false) {
    if (this.isChecking) return this.updateInfo;
    if (this.hasPromptedThisSession && !force) return this.updateInfo;

    this.isChecking = true;
    try {
      const appInfo = await nativeLocationService.getAppVersionInfo();
      const platform = nativeLocationService.platform || 'web';

      const data = await api.get(
        `/app/check-update?platform=${platform}&versionCode=${appInfo.versionCode || 1}&versionName=${encodeURIComponent(appInfo.versionName || '1.0.0')}`
      );

      this.updateInfo = {
        ...data,
        installedVersion: appInfo
      };
      return this.updateInfo;
    } catch (err) {
      console.warn('Update check failed:', err.message);
      return null;
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Start APK download and prompt system installer
   */
  async applyUpdate(apkUrl) {
    const url = apkUrl || this.updateInfo?.latestRelease?.apkUrl || '/FamilyTracker.apk';
    return await nativeLocationService.downloadAndInstallApk(url);
  }
}

export const appUpdateService = new AppUpdateService();
export default appUpdateService;

