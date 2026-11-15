package com.familytracker.app;

import android.Manifest;
import android.app.ActivityManager;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;

@CapacitorPlugin(
    name = "FamilyLocation",
    permissions = {
        @Permission(
            strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION },
            alias = "location"
        ),
        @Permission(
            strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION },
            alias = "backgroundLocation"
        )
    }
)
public class FamilyLocationPlugin extends Plugin {

    private boolean isServiceRunning(Class<?> serviceClass) {
        Context context = getContext();
        ActivityManager manager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        if (manager != null) {
            for (ActivityManager.RunningServiceInfo service : manager.getRunningServices(Integer.MAX_VALUE)) {
                if (serviceClass.getName().equals(service.service.getClassName())) {
                    return true;
                }
            }
        }
        return false;
    }

    private boolean isLocationProviderEnabled() {
        Context context = getContext();
        LocationManager lm = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return false;
        boolean gpsEnabled = false;
        boolean networkEnabled = false;
        try {
            gpsEnabled = lm.isProviderEnabled(LocationManager.GPS_PROVIDER);
        } catch (Exception ignored) {}
        try {
            networkEnabled = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception ignored) {}
        return gpsEnabled || networkEnabled;
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        Context context = getContext();
        boolean fineGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarseGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean foregroundGranted = fineGranted || coarseGranted;

        boolean backgroundGranted = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            backgroundGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
        } else {
            backgroundGranted = foregroundGranted;
        }

        boolean serviceRunning = isServiceRunning(LocationForegroundService.class);
        boolean locationEnabled = isLocationProviderEnabled();

        boolean ignoringBattery = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                ignoringBattery = pm.isIgnoringBatteryOptimizations(context.getPackageName());
            }
        }

        JSObject ret = new JSObject();
        ret.put("foreground", foregroundGranted);
        ret.put("fineLocation", fineGranted);
        ret.put("coarseLocation", coarseGranted);
        ret.put("background", backgroundGranted);
        ret.put("locationServicesEnabled", locationEnabled);
        ret.put("serviceRunning", serviceRunning);
        ret.put("ignoringBatteryOptimizations", ignoringBattery);
        ret.put("manufacturer", Build.MANUFACTURER != null ? Build.MANUFACTURER.toLowerCase() : "");
        ret.put("model", Build.MODEL != null ? Build.MODEL : "");
        ret.put("sdkVersion", Build.VERSION.SDK_INT);
        ret.put("platform", "android");
        call.resolve(ret);
    }

    @PluginMethod
    public void requestForegroundPermissions(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            checkPermissions(call);
        } else {
            requestPermissionForAlias("location", call, "locationCallback");
        }
    }

    @PermissionCallback
    private void locationCallback(PluginCall call) {
        checkPermissions(call);
    }

    @PluginMethod
    public void requestBackgroundPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Android 11+ (API 30+) requires redirecting user to Settings to grant background location
            openAppSettings(call);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Android 10 (API 29) can prompt directly
            requestPermissionForAlias("backgroundLocation", call, "backgroundCallback");
        } else {
            // Android 9 and below grants background location with foreground
            checkPermissions(call);
        }
    }

    @PermissionCallback
    private void backgroundCallback(PluginCall call) {
        checkPermissions(call);
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Context context = getContext();
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            Uri uri = Uri.fromParts("package", context.getPackageName(), null);
            intent.setData(uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to open app settings: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        try {
            Context context = getContext();
            Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to open location settings: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openAutostartSettings(PluginCall call) {
        Context context = getContext();
        String manufacturer = Build.MANUFACTURER != null ? Build.MANUFACTURER.toLowerCase() : "";
        boolean opened = false;

        Intent intent = new Intent();
        try {
            if (manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco")) {
                intent.setComponent(new ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"));
            } else if (manufacturer.contains("oppo") || manufacturer.contains("realme")) {
                intent.setComponent(new ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"));
            } else if (manufacturer.contains("vivo")) {
                intent.setComponent(new ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"));
            } else if (manufacturer.contains("huawei") || manufacturer.contains("honor")) {
                intent.setComponent(new ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"));
            } else if (manufacturer.contains("samsung")) {
                intent.setComponent(new ComponentName("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"));
            }

            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            opened = true;
        } catch (Exception e) {
            try {
                if (manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco")) {
                    Intent miuiIntent = new Intent("miui.intent.action.OP_AUTO_START");
                    miuiIntent.addCategory(Intent.CATEGORY_DEFAULT);
                    miuiIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(miuiIntent);
                    opened = true;
                }
            } catch (Exception ignored) {}
        }

        if (!opened) {
            // Universal fallback: Open App Info Settings where Autostart / Battery is located
            openAppSettings(call);
            return;
        }

        JSObject ret = new JSObject();
        ret.put("opened", true);
        ret.put("manufacturer", manufacturer);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        try {
            Context context = getContext();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                if (pm != null && pm.isIgnoringBatteryOptimizations(context.getPackageName())) {
                    JSObject ret = new JSObject();
                    ret.put("alreadyWhitelisted", true);
                    call.resolve(ret);
                    return;
                }

                Intent intent = new Intent();
                intent.setAction(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + context.getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            } else {
                openAppSettings(call);
                return;
            }
            JSObject ret = new JSObject();
            ret.put("requested", true);
            call.resolve(ret);
        } catch (Exception e) {
            try {
                Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                call.resolve();
            } catch (Exception e2) {
                openAppSettings(call);
            }
        }
    }

    @PluginMethod
    public void startForegroundService(PluginCall call) {
        try {
            Context context = getContext();
            String token = call.getString("token", "");
            String apiUrl = call.getString("apiUrl", "https://family-tracker-fidw.onrender.com/api");
            String mode = call.getString("mode", "balanced");

            android.content.SharedPreferences prefs = context.getSharedPreferences("familytracker_native_prefs", Context.MODE_PRIVATE);
            prefs.edit()
                .putString("token", token)
                .putString("apiUrl", apiUrl)
                .putString("mode", mode)
                .putBoolean("tracking_enabled", true)
                .apply();

            Intent intent = new Intent(context, LocationForegroundService.class);
            intent.setAction(LocationForegroundService.ACTION_START);
            intent.putExtra("token", token);
            intent.putExtra("apiUrl", apiUrl);
            intent.putExtra("mode", mode);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(context, intent);
            } else {
                context.startService(intent);
            }
            JSObject ret = new JSObject();
            ret.put("started", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to start foreground service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopForegroundService(PluginCall call) {
        try {
            Context context = getContext();
            android.content.SharedPreferences prefs = context.getSharedPreferences("familytracker_native_prefs", Context.MODE_PRIVATE);
            prefs.edit()
                .putBoolean("tracking_enabled", false)
                .apply();

            Intent intent = new Intent(context, LocationForegroundService.class);
            intent.setAction(LocationForegroundService.ACTION_STOP);
            context.startService(intent);
            JSObject ret = new JSObject();
            ret.put("stopped", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to stop foreground service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getAppVersionInfo(PluginCall call) {
        try {
            Context context = getContext();
            PackageInfo pInfo = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            long versionCode = 1;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                versionCode = pInfo.getLongVersionCode();
            } else {
                versionCode = pInfo.versionCode;
            }

            JSObject ret = new JSObject();
            ret.put("versionCode", versionCode);
            ret.put("versionName", pInfo.versionName);
            ret.put("packageName", context.getPackageName());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to get package info: " + e.getMessage());
        }
    }

    @PluginMethod
    public void downloadAndInstallApk(PluginCall call) {
        String apkUrl = call.getString("url");
        if (apkUrl == null || apkUrl.isEmpty()) {
            call.reject("APK URL is required.");
            return;
        }

        try {
            Context context = getContext();

            // Check if unknown app install permission is needed on Android 8+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!context.getPackageManager().canRequestPackageInstalls()) {
                    Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    settingsIntent.setData(Uri.parse("package:" + context.getPackageName()));
                    settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(settingsIntent);
                    JSObject ret = new JSObject();
                    ret.put("status", "permission_required");
                    ret.put("message", "Please allow install unknown apps and try again.");
                    call.resolve(ret);
                    return;
                }
            }

            DownloadManager downloadManager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
            if (downloadManager == null) {
                call.reject("DownloadManager not available on this device.");
                return;
            }

            Uri downloadUri = Uri.parse(apkUrl);
            DownloadManager.Request request = new DownloadManager.Request(downloadUri);
            request.setTitle("FamilyTracker Update");
            request.setDescription("Downloading latest FamilyTracker update...");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);

            File updateFile = new File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "FamilyTracker-update.apk");
            if (updateFile.exists()) {
                updateFile.delete();
            }

            request.setDestinationUri(Uri.fromFile(updateFile));
            request.setMimeType("application/vnd.android.package-archive");

            long downloadId = downloadManager.enqueue(request);

            BroadcastReceiver onComplete = new BroadcastReceiver() {
                @Override
                public void onReceive(Context c, Intent intent) {
                    long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (id == downloadId) {
                        try {
                            if (updateFile.exists()) {
                                Uri contentUri = FileProvider.getUriForFile(
                                    context,
                                    context.getPackageName() + ".fileprovider",
                                    updateFile
                                );

                                Intent installIntent = new Intent(Intent.ACTION_VIEW);
                                installIntent.setDataAndType(contentUri, "application/vnd.android.package-archive");
                                installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                context.startActivity(installIntent);
                            }
                        } catch (Exception e) {
                            e.printStackTrace();
                        }
                        try {
                            context.unregisterReceiver(this);
                        } catch (Exception ignored) {}
                    }
                }
            };

            ContextCompat.registerReceiver(
                context,
                onComplete,
                new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                ContextCompat.RECEIVER_EXPORTED
            );

            JSObject ret = new JSObject();
            ret.put("status", "downloading");
            ret.put("downloadId", downloadId);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to trigger update download: " + e.getMessage());
        }
    }
}

