package com.routiq.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.location.Location;
import android.util.Log;

import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

@CapacitorPlugin(name = "NativeBeacon")
public class NativeBeacon extends Plugin {
    private static final String TAG = "RoutiqNativeBeacon";
    private static final String ACTION_BROADCAST = "com.equimaps.capacitor_background_geolocation.BackgroundGeolocationService.broadcast";
    private static final long SEND_INTERVAL_MS = 5000;
    private static final long HEARTBEAT_INTERVAL_MS = 15000;
    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor();
    private final SecureRandom random = new SecureRandom();
    private ScheduledFuture<?> publisher;
    private volatile JSONObject session;
    private volatile Location latestLocation;
    private volatile boolean dirty;
    private volatile long lastAttempt;
    private volatile long lastSuccess;
    private int sequence;

    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            Object value = intent.getParcelableExtra("location");
            if (value instanceof Location) {
                latestLocation = (Location) value;
                dirty = true;
            }
        }
    };

    @Override public void load() {
        super.load();
        LocalBroadcastManager.getInstance(getContext()).registerReceiver(receiver, new IntentFilter(ACTION_BROADCAST));
    }

    @PluginMethod public void start(PluginCall call) {
        try {
            JSONObject config = new JSONObject(call.getData().toString());
            String id = config.optString("id");
            String key = config.optString("key");
            if (!id.matches("[a-f0-9]{64}") || !key.matches("[a-f0-9]{64}")) {
                call.reject("Invalid Beacon configuration.");
                return;
            }
            session = config;
            sequence = 0;
            dirty = true;
            lastAttempt = 0;
            lastSuccess = 0;
            if (publisher != null) publisher.cancel(false);
            publisher = executor.scheduleWithFixedDelay(this::publishIfNeeded, 0, 1, TimeUnit.SECONDS);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not start native Beacon publishing.", error);
        }
    }

    @PluginMethod public void stop(PluginCall call) {
        session = null;
        latestLocation = null;
        dirty = false;
        if (publisher != null) publisher.cancel(false);
        publisher = null;
        call.resolve();
    }

    private void publishIfNeeded() {
        JSONObject config = session;
        if (config == null) return;
        long now = System.currentTimeMillis();
        if (now - lastAttempt < SEND_INTERVAL_MS) return;
        if (!dirty && now - lastSuccess < HEARTBEAT_INTERVAL_MS) return;
        lastAttempt = now;
        try {
            String packet = encrypt(config, latestLocation, now);
            int nextSequence = sequence + 1;
            JSONObject patch = new JSONObject();
            patch.put("seq", nextSequence);
            patch.put("updated", new JSONObject().put(".sv", "timestamp"));
            patch.put("packet", packet);
            try {
                patchState(config, patch);
            } catch (HttpFailure failure) {
                if (failure.status != 401 && failure.status != 403) throw failure;
                refreshIdToken(config);
                patchState(config, patch);
            }
            sequence = nextSequence;
            lastSuccess = now;
            dirty = false;
        } catch (Exception error) {
            Log.w(TAG, "Beacon update did not reach Firebase; will retry.", error);
        }
    }

    private String encrypt(JSONObject config, Location location, long now) throws Exception {
        JSONObject value = new JSONObject();
        value.put("sport", config.optString("sport", "Activity"));
        if (location != null && location.hasAccuracy()) {
            JSONObject fix = new JSONObject();
            fix.put("lat", location.getLatitude());
            fix.put("lon", location.getLongitude());
            fix.put("accuracy", location.getAccuracy());
            fix.put("age", Math.max(0, now - location.getTime()));
            value.put("fix", fix);
        } else {
            value.put("fix", JSONObject.NULL);
        }
        byte[] key = fromHex(config.getString("key"));
        byte[] iv = new byte[12];
        random.nextBytes(iv);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
        byte[] encrypted = cipher.doFinal(value.toString().getBytes(StandardCharsets.UTF_8));
        byte[] packet = new byte[iv.length + encrypted.length];
        System.arraycopy(iv, 0, packet, 0, iv.length);
        System.arraycopy(encrypted, 0, packet, iv.length, encrypted.length);
        return toHex(packet);
    }

    private void patchState(JSONObject config, JSONObject patch) throws Exception {
        String id = config.getString("id");
        String token = URLEncoder.encode(config.getString("idToken"), "UTF-8");
        URL url = new URL(config.getString("databaseURL").replaceAll("/+$", "") + "/beacons/" + id + "/state.json?auth=" + token);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod("PATCH");
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(10000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        byte[] body = patch.toString().getBytes(StandardCharsets.UTF_8);
        try (OutputStream output = connection.getOutputStream()) { output.write(body); }
        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) {
            String detail = readResponse(status >= 400 ? connection.getErrorStream() : connection.getInputStream());
            connection.disconnect();
            throw new HttpFailure(status, "Firebase rejected Beacon update: " + detail);
        }
        connection.disconnect();
    }

    private void refreshIdToken(JSONObject config) throws Exception {
        String key = URLEncoder.encode(config.getString("apiKey"), "UTF-8");
        URL url = new URL("https://securetoken.googleapis.com/v1/token?key=" + key);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(10000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        String body = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(config.getString("refreshToken"), "UTF-8");
        try (OutputStream output = connection.getOutputStream()) { output.write(body.getBytes(StandardCharsets.UTF_8)); }
        int status = connection.getResponseCode();
        String response = readResponse(status >= 400 ? connection.getErrorStream() : connection.getInputStream());
        connection.disconnect();
        if (status < 200 || status >= 300) throw new Exception("Firebase token refresh failed: " + response);
        JSONObject tokens = new JSONObject(response);
        config.put("idToken", tokens.getString("id_token"));
        if (tokens.has("refresh_token")) config.put("refreshToken", tokens.getString("refresh_token"));
    }

    private String readResponse(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder result = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) result.append(line);
        }
        return result.toString();
    }

    private byte[] fromHex(String value) {
        byte[] result = new byte[value.length() / 2];
        for (int i = 0; i < result.length; i++) result[i] = (byte) Integer.parseInt(value.substring(i * 2, i * 2 + 2), 16);
        return result;
    }

    private String toHex(byte[] value) {
        StringBuilder result = new StringBuilder(value.length * 2);
        for (byte item : value) result.append(String.format("%02x", item & 0xff));
        return result.toString();
    }

    @Override protected void handleOnDestroy() {
        session = null;
        LocalBroadcastManager.getInstance(getContext()).unregisterReceiver(receiver);
        if (publisher != null) publisher.cancel(false);
        executor.shutdownNow();
        super.handleOnDestroy();
    }

    private static class HttpFailure extends Exception {
        final int status;
        HttpFailure(int status, String message) { super(message); this.status = status; }
    }
}
