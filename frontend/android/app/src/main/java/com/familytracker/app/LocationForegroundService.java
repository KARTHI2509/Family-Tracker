package com.familytracker.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

public class LocationForegroundService extends Service implements LocationListener {
    private static final String TAG = "FamilyTrackerService";
    public static final String CHANNEL_ID = "familytracker_location_channel";
    public static final int NOTIFICATION_ID = 1001;
    public static final String ACTION_START = "ACTION_START";
    public static final String ACTION_STOP = "ACTION_STOP";

    private LocationManager locationManager;
    private ExecutorService networkExecutor;
    private PowerManager.WakeLock wakeLock;
    private long lastUploadTime = 0;
    private static final long MIN_UPLOAD_INTERVAL_MS = 25000; // at least 25s between native uploads

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        networkExecutor = Executors.newSingleThreadExecutor();

        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FamilyTracker::NativeGpsWakeLock");
                wakeLock.setReferenceCounted(false);
            }
        } catch (Exception ignored) {}
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_STOP.equals(action)) {
                stopTracking();
                stopForeground(true);
                stopSelf();
                return START_NOT_STICKY;
            }
        }

        Notification notification = createTrackingNotification();
        startForeground(NOTIFICATION_ID, notification);

        startNativeLocationTracking();

        return START_STICKY;
    }

    private void startNativeLocationTracking() {
        if (locationManager == null) {
            locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        }

        boolean hasFine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean hasCoarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;

        if (!hasFine && !hasCoarse) {
            Log.w(TAG, "Location permissions missing for background service");
            return;
        }

        SharedPreferences prefs = getSharedPreferences("familytracker_native_prefs", Context.MODE_PRIVATE);
        String mode = prefs.getString("mode", "balanced");

        long minTimeMs;
        float minDistanceM;

        if ("high_accuracy".equals(mode)) {
            minTimeMs = 30000;  // 30 seconds
            minDistanceM = 5.0f;
        } else if ("battery_saver".equals(mode)) {
            minTimeMs = 180000; // 3 minutes
            minDistanceM = 30.0f;
        } else { // balanced
            minTimeMs = 60000;  // 1 minute
            minDistanceM = 15.0f;
        }

        try {
            if (wakeLock != null && !wakeLock.isHeld()) {
                wakeLock.acquire(10 * 60 * 1000L); // 10 min timeout safe guard
            }
        } catch (Exception ignored) {}

        try {
            locationManager.removeUpdates(this);
        } catch (Exception ignored) {}

        try {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, minTimeMs, minDistanceM, this);
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, minTimeMs, minDistanceM, this);
            }
            Log.i(TAG, "Native location listener active: minTime=" + minTimeMs + "ms, minDistance=" + minDistanceM + "m");
        } catch (SecurityException se) {
            Log.e(TAG, "SecurityException requesting location updates: " + se.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error requesting location updates: " + e.getMessage());
        }
    }

    private void stopTracking() {
        if (locationManager != null) {
            try {
                locationManager.removeUpdates(this);
            } catch (Exception ignored) {}
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
            } catch (Exception ignored) {}
        }
    }

    @Override
    public void onLocationChanged(Location location) {
        if (location == null) return;

        long now = System.currentTimeMillis();
        if (now - lastUploadTime < MIN_UPLOAD_INTERVAL_MS) {
            return; // Throttle to conserve battery and server bandwidth
        }
        lastUploadTime = now;

        SharedPreferences prefs = getSharedPreferences("familytracker_native_prefs", Context.MODE_PRIVATE);
        boolean enabled = prefs.getBoolean("tracking_enabled", true);
        if (!enabled) return;

        final String token = prefs.getString("token", "");
        final String apiUrl = prefs.getString("apiUrl", "https://family-tracker-fidw.onrender.com/api");

        if (token == null || token.trim().isEmpty()) {
            return; // Not logged in
        }

        // Read battery state
        int batteryPct = 50;
        int isCharging = 0;
        try {
            IntentFilter ifilter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
            Intent batteryStatus = registerReceiver(null, ifilter);
            if (batteryStatus != null) {
                int level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                int scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
                int status = batteryStatus.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
                if (level >= 0 && scale > 0) {
                    batteryPct = Math.round((level / (float) scale) * 100);
                }
                isCharging = (status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL) ? 1 : 0;
            }
        } catch (Exception ignored) {}

        final double lat = location.getLatitude();
        final double lng = location.getLongitude();
        final float accuracy = location.getAccuracy();
        final double speedKmh = Math.max(0, location.getSpeed() * 3.6);
        final double alt = location.getAltitude();
        final int bat = batteryPct;
        final int charging = isCharging;

        if (networkExecutor != null && !networkExecutor.isShutdown()) {
            networkExecutor.submit(() -> {
                sendLocationToBackend(apiUrl, token, lat, lng, accuracy, speedKmh, alt, bat, charging);
            });
        }
    }

    private void sendLocationToBackend(String apiUrl, String token, double lat, double lng, float accuracy, double speed, double altitude, int battery, int isCharging) {
        HttpURLConnection conn = null;
        try {
            String endpoint = apiUrl.endsWith("/") ? (apiUrl + "location/update") : (apiUrl + "/location/update");
            URL url = new URL(endpoint);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.setDoOutput(true);

            JSONObject json = new JSONObject();
            json.put("latitude", lat);
            json.put("longitude", lng);
            json.put("accuracy", Math.round(accuracy));
            json.put("speed", Math.round(speed));
            json.put("altitude", Math.round(altitude));
            json.put("battery_level", battery);
            json.put("is_charging", isCharging);

            byte[] bytes = json.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bytes);
                os.flush();
            }

            int code = conn.getResponseCode();
            Log.d(TAG, "Native background location uploaded: HTTP " + code + " (lat=" + lat + ", lng=" + lng + ")");
        } catch (Exception e) {
            Log.w(TAG, "Background upload network exception: " + e.getMessage());
        } finally {
            if (conn != null) {
                try {
                    conn.disconnect();
                } catch (Exception ignored) {}
            }
        }
    }

    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {}

    @Override
    public void onProviderEnabled(String provider) {
        startNativeLocationTracking();
    }

    @Override
    public void onProviderDisabled(String provider) {}

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        Log.i(TAG, "App task removed from Recents. Sustaining background location service.");
        SharedPreferences prefs = getSharedPreferences("familytracker_native_prefs", Context.MODE_PRIVATE);
        boolean enabled = prefs.getBoolean("tracking_enabled", true);
        if (enabled) {
            Notification notification = createTrackingNotification();
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    @Override
    public void onDestroy() {
        stopTracking();
        if (networkExecutor != null) {
            networkExecutor.shutdown();
        }
        super.onDestroy();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "FamilyTracker Location Sharing",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Ongoing notification while your live location is actively shared with your family");
            channel.setShowBadge(false);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification createTrackingNotification() {
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        Intent stopIntent = new Intent(this, LocationForegroundService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPendingIntent = PendingIntent.getService(
            this,
            1,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("FamilyTracker Location Sharing")
            .setContentText("Actively sharing your live safety location with your family")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop Sharing", stopPendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
