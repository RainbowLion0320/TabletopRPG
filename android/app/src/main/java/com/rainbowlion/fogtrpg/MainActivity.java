package com.rainbowlion.fogtrpg;

import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inspector.WindowInspector;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.util.List;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GameStoragePlugin.class);
        registerPlugin(AiTransportPlugin.class);
        super.onCreate(savedInstanceState);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        getBridge().getWebView().getSettings().setTextZoom(100);
        getBridge().getWebView().getSettings().setAllowFileAccess(false);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (dispatchBackToPopup()) return;
                setEnabled(false);
                try { getOnBackPressedDispatcher().onBackPressed(); }
                finally { setEnabled(true); }
            }
        });
        immersive();
    }
    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }
    private boolean dispatchBackToPopup() {
        // Old tablet WebViews create a non-focusable select panel above the web form.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false;
        IBinder owner = getWindow().getDecorView().getWindowToken();
        if (owner == null) return false;
        List<View> windows = WindowInspector.getGlobalWindowViews();
        for (int i = windows.size() - 1; i >= 0; i--) {
            View popup = windows.get(i);
            if (!popup.isAttachedToWindow() || !popup.isShown() || popup.getWindowVisibility() != View.VISIBLE
                || !(popup.getLayoutParams() instanceof WindowManager.LayoutParams)) continue;
            WindowManager.LayoutParams params = (WindowManager.LayoutParams) popup.getLayoutParams();
            if (params.type != WindowManager.LayoutParams.TYPE_APPLICATION_PANEL || !owner.equals(params.token)
                || (params.flags & WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE) == 0) continue;
            long now = SystemClock.uptimeMillis();
            boolean down = popup.dispatchKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BACK, 0));
            boolean up = popup.dispatchKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_BACK, 0));
            if (down && up) return true;
        }
        return false;
    }
    private void immersive() {
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        bars.hide(WindowInsetsCompat.Type.systemBars());
    }
}
