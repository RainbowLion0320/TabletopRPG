package com.rainbowlion.fogtrpg;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Map;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** App-private, encrypted durable storage. Never copies a key into WebView localStorage or logs. */
@CapacitorPlugin(name = "GameStorage")
public class GameStoragePlugin extends Plugin {
    private static final String ALIAS = "fog-trpg-storage-v1";
    private SharedPreferences preferences() { return getContext().getSharedPreferences("fog-game-v1", Context.MODE_PRIVATE); }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }

    private String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] sealed = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] result = new byte[13 + sealed.length];
        result[0] = 1;
        System.arraycopy(cipher.getIV(), 0, result, 1, 12);
        System.arraycopy(sealed, 0, result, 13, sealed.length);
        return Base64.encodeToString(result, Base64.NO_WRAP);
    }

    private String decrypt(String value) throws Exception {
        byte[] data = Base64.decode(value, Base64.NO_WRAP);
        if (data.length < 29 || data[0] != 1) throw new IllegalArgumentException("Invalid storage version");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, data, 1, 12));
        return new String(cipher.doFinal(data, 13, data.length - 13), StandardCharsets.UTF_8);
    }

    @PluginMethod
    public synchronized void readAll(PluginCall call) {
        try {
            JSObject values = new JSObject();
            for (Map.Entry<String, ?> entry : preferences().getAll().entrySet()) {
                if (entry.getKey().startsWith("trpg-") && entry.getValue() instanceof String)
                    values.put(entry.getKey(), decrypt((String) entry.getValue()));
            }
            JSObject result = new JSObject(); result.put("values", values); call.resolve(result);
        } catch (Exception error) { call.reject("无法解密本机游戏数据，请重试。", "STORAGE_READ_FAILED"); }
    }

    @PluginMethod
    public synchronized void write(PluginCall call) {
        String name = call.getString("key");
        String value = call.getString("value");
        if (name == null || !name.startsWith("trpg-") || name.length() > 100 || (value != null && value.length() > 8000000)) {
            call.reject("存储内容超出限制。", "INVALID_STORAGE"); return;
        }
        try {
            SharedPreferences.Editor editor = preferences().edit();
            if (value == null) editor.remove(name); else editor.putString(name, encrypt(value));
            if (!editor.commit()) throw new IllegalStateException("Storage commit failed");
            call.resolve();
        } catch (Exception error) { call.reject("保存失败，请检查设备存储空间。", "STORAGE_WRITE_FAILED"); }
    }
}
