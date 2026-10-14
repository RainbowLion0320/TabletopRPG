package com.rainbowlion.fogtrpg;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.SystemClock;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import okhttp3.mockwebserver.Dispatcher;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import okhttp3.mockwebserver.SocketPolicy;
import static org.junit.Assert.*;

/** Runs inside the installed APK, using its real WebView, native HTTP and Android Keystore. */
@RunWith(AndroidJUnit4.class)
public class GameAndroidTest {
    private ActivityScenario<MainActivity> activity;
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    private String js(String expression) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        activity.onActivity(a -> a.getBridge().getWebView().evaluateJavascript(expression, value -> { result.set(value); done.countDown(); }));
        assertTrue("JavaScript callback", done.await(10, TimeUnit.SECONDS));
        return result.get();
    }
    private void until(String expression) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 20000;
        do { if ("true".equals(js("Boolean(" + expression + ")"))) return; SystemClock.sleep(100); }
        while (SystemClock.elapsedRealtime() < deadline);
        fail("Timed out: " + expression + "\n" + js("document.body.innerText.slice(-1400)"));
    }
    private boolean imeVisible() {
        AtomicReference<Boolean> visible = new AtomicReference<>(false);
        activity.onActivity(a -> {
            WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(a.getWindow().getDecorView());
            visible.set(insets != null && insets.isVisible(WindowInsetsCompat.Type.ime()));
        });
        return visible.get();
    }
    private void awaitSettledIme(boolean visible) {
        long deadline = SystemClock.elapsedRealtime() + 10000;
        long stableSince = 0;
        while (SystemClock.elapsedRealtime() < deadline) {
            if (imeVisible() == visible) {
                if (stableSince == 0) stableSince = SystemClock.elapsedRealtime();
                if (SystemClock.elapsedRealtime() - stableSince >= 300) return;
            } else stableSince = 0;
            SystemClock.sleep(50);
        }
        fail("Input method visibility did not settle to " + visible);
    }
    private String awaitSettledScroll(String selector) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 10000;
        long stableSince = 0;
        String previous = null;
        while (SystemClock.elapsedRealtime() < deadline) {
            String position = js("document.querySelector(" + JSONObject.quote(selector) + ").scrollTop");
            if (position.equals(previous)) {
                if (stableSince == 0) stableSince = SystemClock.elapsedRealtime();
                if (SystemClock.elapsedRealtime() - stableSince >= 300) return position;
            } else stableSince = 0;
            previous = position;
            SystemClock.sleep(50);
        }
        fail("Reading scroll did not settle: " + selector);
        return null;
    }
    private void click(String text) throws Exception {
        String match = "Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === " + JSONObject.quote(text) + " || b.getAttribute('aria-label') === " + JSONObject.quote(text) + ")";
        until(match + " && !" + match + ".disabled"); js(match + ".click()");
        awaitUiMotion();
    }
    private void fill(String selector, String value) throws Exception {
        js("(()=>{const e=document.querySelector(" + JSONObject.quote(selector) + ");Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e," + JSONObject.quote(value) + ");e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()");
    }
    private void screenshot(String name) throws Exception {
        // DOM updates can precede WebView's next compositor frame on a background emulator.
        SystemClock.sleep(600);
        File folder = new File(context.getExternalFilesDir(null), "qa"); folder.mkdirs();
        Bitmap bitmap = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        try (FileOutputStream output = new FileOutputStream(new File(folder, name + ".png"))) { bitmap.compress(Bitmap.CompressFormat.PNG, 100, output); }
        bitmap.recycle();
    }
    private void paintedHomeEmblem(String selector) throws Exception {
        until("(()=>{const e=document.querySelector(" + JSONObject.quote(selector) + ");return e?.complete&&e.naturalWidth===64&&e.naturalHeight===64})()");
        assertEquals("Painted home navigation remains decorative and its original button receives touch", "true", js("(()=>{const e=document.querySelector(" + JSONObject.quote(selector) + "),r=e.getBoundingClientRect();return getComputedStyle(e).pointerEvents==='none'&&e.alt===''&&e.getAttribute('aria-hidden')==='true'&&r.width===20&&r.height===20&&e.closest('button').contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()"));
    }
    private void fresh() throws Exception {
        SharedPreferences preferences = context.getSharedPreferences("fog-game-v1", Context.MODE_PRIVATE);
        String seen = preferences.getString("trpg-opening-v1", null);
        preferences.edit().clear().commit();
        // Existing regressions represent returning players; the dedicated opening test
        // starts with an empty store and observes real first-launch playback separately.
        if (seen != null) preferences.edit().putString("trpg-opening-v1", seen).commit();
        activity = ActivityScenario.launch(MainActivity.class);
        until("document.querySelector('.title-screen')");
        if (seen == null) {
            js("window.qaPresentationReady=false;Capacitor.Plugins.GameStorage.write({key:'trpg-opening-v1',value:'seen'}).then(()=>window.qaPresentationReady=true)");
            until("window.qaPresentationReady");
            activity.recreate();
            until("document.querySelector('.title-screen')&&!document.querySelector('.opening-cinematic')");
        }
        watchResizeErrors();
    }
    private void watchResizeErrors() throws Exception {
        js("window.__qaResizeErrors=[];window.addEventListener('error',e=>{if(e.message.includes('ResizeObserver'))window.__qaResizeErrors.push(e.message)})");
    }
    private void assertNoResizeErrors() throws Exception {
        js("window.__qaResizeSettled=false;requestAnimationFrame(()=>requestAnimationFrame(()=>window.__qaResizeSettled=true))");
        until("window.__qaResizeSettled");
        assertEquals("Viewport and action restoration do not recurse during observation", "0", js("window.__qaResizeErrors.length"));
    }
    private void nativeTap(String selector) throws Exception {
        nativeTap(selector, 0);
    }
    private void nativeTap(String selector, int driftCssY) throws Exception {
        nativeTap(selector, driftCssY, selector);
    }
    private void nativeTap(String selector, int driftCssY, String pointSelector) throws Exception {
        reachable(selector);
        CountDownLatch painted = new CountDownLatch(1);
        activity.onActivity(a -> a.getBridge().getWebView().postVisualStateCallback(SystemClock.uptimeMillis(), new WebView.VisualStateCallback() {
            @Override public void onComplete(long requestId) { painted.countDown(); }
        }));
        assertTrue("The target DOM has been drawn before sending real touch", painted.await(10, TimeUnit.SECONDS));
        if (!selector.equals(pointSelector)) assertEquals("The requested touch point reaches its original control", "true", js("(()=>{const e=document.querySelector(" + JSONObject.quote(selector) + "),r=document.querySelector(" + JSONObject.quote(pointSelector) + ").getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()"));
        org.json.JSONArray point = new org.json.JSONArray(js("(()=>{const r=document.querySelector(" + JSONObject.quote(pointSelector) + ").getBoundingClientRect();return [(r.x+r.width/2)*devicePixelRatio,(r.y+r.height/2)*devicePixelRatio,devicePixelRatio]})()"));
        int[] origin = new int[2];
        activity.onActivity(a -> a.getBridge().getWebView().getLocationOnScreen(origin));
        long now = SystemClock.uptimeMillis();
        float screenX = (float) point.getDouble(0) + origin[0], screenY = (float) point.getDouble(1) + origin[1];
        MotionEvent down = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, screenX, screenY, 0);
        float endY = (float) (screenY + driftCssY * point.getDouble(2));
        MotionEvent up = MotionEvent.obtain(now, now + 80, MotionEvent.ACTION_UP, screenX, endY, 0);
        InstrumentationRegistry.getInstrumentation().sendPointerSync(down);
        if (driftCssY != 0) {
            MotionEvent move = MotionEvent.obtain(now, now + 40, MotionEvent.ACTION_MOVE, screenX, endY, 0);
            InstrumentationRegistry.getInstrumentation().sendPointerSync(move);
            move.recycle();
        }
        InstrumentationRegistry.getInstrumentation().sendPointerSync(up);
        down.recycle(); up.recycle();
    }
    private void configure(String endpoint, String protocol) throws Exception {
        boolean openedMenu = false;
        if (!"true".equals(js("Boolean(document.querySelector('#api-config-modal-title'))"))) {
            if ("true".equals(js("Boolean(document.querySelector('.title-screen'))"))) click("AI 设置");
            else { menu("AI 设置"); openedMenu = true; }
        }
        until("document.querySelector('#api-config-modal-title')");
        fill("#api-provider", "custom");
        until("document.querySelector('#api-provider').value === 'custom' && (document.querySelector('.api-connection-toggle').getAttribute('aria-expanded')==='true')");
        fill("#api-protocol", protocol);
        fill("#api-endpoint", endpoint);
        fill("#api-key", "android-qa-only-token");
        fill("#api-model", "android-qa-model");
        click("保存"); until("!document.querySelector('#api-config-modal-title')");
        if (openedMenu && "true".equals(js("Boolean(document.querySelector('.game-menu'))"))) {
            click("继续调查"); until("!document.querySelector('.game-menu')");
        }
    }

    private void awaitUiMotion() throws Exception {
        js("window.qaUiMotionSettled=false;Promise.all(document.getAnimations().filter(a=>a.playState==='running'&&Number.isFinite(a.effect?.getTiming().iterations??1)).map(a=>a.finished.catch(()=>{}))).then(()=>window.qaUiMotionSettled=true)");
        until("window.qaUiMotionSettled");
    }

    private void viewport(int width, int height) throws Exception {
        double scale = Double.parseDouble(js("devicePixelRatio"));
        activity.onActivity(a -> {
            WebView web = a.getBridge().getWebView();
            ViewGroup.LayoutParams params = web.getLayoutParams();
            params.width = (int) Math.round(width * scale);
            params.height = (int) Math.round(height * scale);
            web.setLayoutParams(params);
        });
        until("Math.abs(innerWidth-" + width + ")<2 && Math.abs(innerHeight-" + height + ")<2");
        awaitUiMotion();
    }

    /** Check actual visible bounds, ancestor clipping, and touch occlusion after transitions. */
    private void reachable(String selector) throws Exception {
        awaitUiMotion();
        until("(()=>{const e=document.querySelector(" + JSONObject.quote(selector) + ");if(!e)return false;"
            + "const r=e.getBoundingClientRect();if(r.width<1||r.height<1||r.left<0||r.top<0||r.right>innerWidth+.5||r.bottom>innerHeight+.5)return false;"
            + "for(let p=e.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();"
            + "if(/hidden|auto|scroll/.test(s.overflowY)&&(r.top<b.top-.5||r.bottom>b.bottom+.5))return false;"
            + "if(/hidden|auto|scroll/.test(s.overflowX)&&(r.left<b.left-.5||r.right>b.right+.5))return false;if(s.position==='fixed')break;}"
            + "return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()");
    }

    private void titlePlayback(boolean covered) throws Exception {
        until("(()=>{const video=document.querySelector('.title-backdrop video');return video&&(" + covered + "||document.hidden||matchMedia('(prefers-reduced-motion:reduce)').matches?video.paused:!video.paused)})()");
    }

    private void readableTurnPrompt() throws Exception {
        reachable(".check-card"); reachable(".check-card > button");
        if ("true".equals(js("document.querySelector('.check-card > button').textContent.trim()==='掷骰'"))) {
            until("document.querySelector('.dice-emblem-art')?.complete&&document.querySelector('.dice-emblem-art').naturalWidth>0");
            assertEquals("Painted roll emblem stays decorative inside the original control", "true", js("(()=>{const e=document.querySelector('.dice-emblem-art'),r=e.getBoundingClientRect(),b=e.parentElement.getBoundingClientRect();return r.width>=24&&r.width<=24.5&&r.height>=24&&r.height<=24.5&&r.left>=b.left&&r.right<=b.right&&r.top>=b.top&&r.bottom<=b.bottom&&e.alt===''&&e.getAttribute('aria-hidden')==='true'&&getComputedStyle(e).pointerEvents==='none'})()"));
        }
        if (Double.parseDouble(js("innerHeight")) > 300) readablePartyDossiers();
        assertEquals("Turn information uses readable text, drawn dossier and full touch controls", "true", js("(()=>{const c=document.querySelector('.check-card'),b=c.querySelector('button'),r=b.getBoundingClientRect(),d=c.closest('.action-dock').getBoundingClientRect(),s=document.querySelector('.narrative-panel').getBoundingClientRect();return Array.from(c.querySelectorAll('strong,span,button')).every(e=>parseFloat(getComputedStyle(e).fontSize)>=15)&&getComputedStyle(c).borderImageSource.includes('panel-frame')&&r.width>=44&&r.height>=44&&s.height>=140&&s.bottom<=d.top+.5&&c.scrollWidth<=c.clientWidth+1})()"));
    }

    private void readablePartyDossiers() throws Exception {
        String scroll = js("document.querySelector('.party-strip-compact').scrollLeft");
        int count = Integer.parseInt(js("document.querySelectorAll('.party-compact').length"));
        for (int player = 1; player <= count; player++) {
            String selector = ".party-compact:nth-child(" + player + ")";
            js("document.querySelector('" + selector + "').scrollIntoView({block:'nearest',inline:'nearest'})");
            reachable(selector);
            assertEquals("Every investigator remains readable, drawn and reachable", "true", js("(()=>{const d=document.querySelector('.action-dock').getBoundingClientRect(),e=document.querySelector('" + selector + "'),r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.top>=d.top&&r.bottom<=Math.min(d.bottom,innerHeight)+.5&&getComputedStyle(e).borderImageSource.includes('panel-frame')&&getComputedStyle(e).opacity==='1'&&e.scrollWidth<=e.clientWidth+1&&Array.from(e.querySelectorAll('strong,.party-action-status,.bar-label,.bar-value')).every(t=>{const b=t.getBoundingClientRect(),s=parseFloat(getComputedStyle(t).fontSize);return s>=(t.tagName==='STRONG'?14:t.classList.contains('bar-value')?13:12)&&b.left>=r.left&&b.right<=r.right})})()"));
        }
        js("document.querySelector('.party-strip-compact').scrollLeft=" + scroll);
    }

    private void readableNavigation() throws Exception {
        assertEquals("Phone location and full date remain readable inside their navigation row", "true", js("(()=>{const t=document.querySelector('.game-top'),r=t.getBoundingClientRect(),b=document.querySelector('.drawer-tab').getBoundingClientRect();return parseFloat(getComputedStyle(t.querySelector('.brand-scene')).fontSize)>=13&&parseFloat(getComputedStyle(t.querySelector('.world-time')).fontSize)>=12&&Array.from(t.querySelectorAll('.brand-title,.brand-scene,.world-time')).every(e=>{const q=e.getBoundingClientRect();return q.left>=r.left&&q.right<=b.left-4&&q.top>=r.top&&q.bottom<=r.bottom&&e.scrollWidth<=e.clientWidth+1})&&document.documentElement.scrollWidth<=innerWidth})()"));
        reachable(".menu-button"); reachable(".drawer-tab");
    }

    private void menu(String label) throws Exception {
        if (!"true".equals(js("Boolean(document.querySelector('.game-menu.open'))")))
            js("document.querySelector('.menu-button').click()");
        click(label);
    }

    private void readableGameNotice() throws Exception {
        until("document.querySelector('.game-notice .toast')");
        assertEquals("Feedback is readable above the actions and never intercepts input", "true", js("(()=>{const e=document.querySelector('.game-notice'),n=e.querySelector('.toast'),r=n.getBoundingClientRect(),d=document.querySelector('.action-dock').getBoundingClientRect(),t=document.querySelector('.game-top').getBoundingClientRect();return e.getAttribute('role')==='status'&&e.getAttribute('aria-live')==='polite'&&getComputedStyle(e).pointerEvents==='none'&&parseFloat(getComputedStyle(n).fontSize)>=15&&getComputedStyle(n).borderImageSource.includes('panel-frame')&&r.left>=0&&r.right<=innerWidth&&r.top>=t.bottom&&r.bottom<=d.top&&n.scrollWidth<=n.clientWidth+1})()"));
        if (Double.parseDouble(js("innerHeight")) > 300) readablePartyDossiers();
        assertEquals("Short confirmation leaves the NPC nameplate readable", "true", js("(()=>{const n=document.querySelector('.toast'),c=document.querySelector('.npc-nameplate');if(n.textContent!=='已保存'||!c)return true;const a=n.getBoundingClientRect(),b=c.getBoundingClientRect();return a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom})()"));
    }

    @Test public void bundledDefaultsStartWithoutConfigurationAndKeepPlayerSettings() throws Exception {
        fresh();
        try {
            viewport(390, 844); click("AI 设置"); until("document.querySelector('#api-key')");
            assertEquals("APK ships the intended model and Token Plan service with a masked credential", "true", js("document.querySelector('#api-provider').value==='mimo'&&document.querySelector('#api-protocol').value==='responses'&&document.querySelector('#api-model').value==='mimo-v2.6-pro'&&document.querySelector('#api-endpoint').value==='https://token-plan-cn.xiaomimimo.com/v1'&&document.querySelector('#api-key').type==='password'&&document.querySelector('#api-key').value.length>0"));
            js("document.querySelector('.api-config-close').click()");
            click("开始游戏"); click("进入游戏"); until("document.querySelector('.action-dock')");
            assertEquals("First-time player starts directly without an API prompt", "false", js("Boolean(document.querySelector('#api-config-modal-title'))"));
            nativeTap(".drawer-tab"); until("document.querySelector('.case-board-mobile-list')");
            nativeTap(".case-board-mobile-card[aria-label='人物 伊莎贝拉·摩勒']"); until("document.querySelector('.case-board-inspector')");
            assertEquals("Bundled known dossiers open offline and retain the chosen NPC", "true", js("document.querySelector('.case-board-inspector h4').textContent==='伊莎贝拉·摩勒'&&!document.querySelector('.react-flow')"));
            nativeTap(".case-board-inspector button[aria-label='关闭资料详情']"); until("!document.querySelector('.case-board-inspector')");
            nativeTap(".info-drawer-react button[aria-label='关闭资料']"); until("!document.querySelector('.info-drawer-react.open')");
            assertEquals("Phone dossiers never load the desktop graph or layout worker", "0", js("performance.getEntriesByType('resource').filter(e=>/CaseBoardFlow-|caseBoardLayout-|elk-worker/.test(e.name)).length"));
            // Explicit delivery probe only; ordinary instrumentation stays offline.
            if ("true".equals(InstrumentationRegistry.getArguments().getString("liveMiMo"))) {
                fill(".dock-input", "温和询问伊莎贝拉，她父亲平时有哪些习惯，以及最近心情是否有变化。");
                click("提交");
                long deadline = SystemClock.elapsedRealtime() + 150000;
                while (SystemClock.elapsedRealtime() < deadline && !"true".equals(js("Boolean(document.querySelectorAll('.story-message.dm').length>1 || document.querySelector('.action-dock [role=status]'))"))) SystemClock.sleep(500);
                assertEquals("Bundled service completes a real first turn", "true", js("document.querySelectorAll('.story-message.dm').length>1&&!document.querySelector('.action-dock [role=status]')&&!/返回格式无效|request_check/.test(document.querySelector('.narrative-scroll').innerText)"));
                screenshot("mimo-default-live-turn");
            }
            // Switch to an offline QA service before any turn submission.
            configure("http://127.0.0.1:1/v1", "responses");
            activity.close(); activity = ActivityScenario.launch(MainActivity.class); until("document.querySelector('.title-screen')");
            click("AI 设置"); until("document.querySelector('#api-key')");
            assertEquals("Player settings win after process restart", "true", js("document.querySelector('#api-provider').value==='custom'&&document.querySelector('#api-endpoint').value==='http://127.0.0.1:1/v1'&&document.querySelector('#api-key').value==='android-qa-only-token'&&document.querySelector('#api-model').value==='android-qa-model'"));
        } finally { activity.close(); }
    }

    @Test public void nativeSelectReturnPreservesUnsavedSettings() throws Exception {
        fresh();
        android.app.UiAutomation automation = InstrumentationRegistry.getInstrumentation().getUiAutomation();
        android.accessibilityservice.AccessibilityServiceInfo info = automation.getServiceInfo();
        int originalFlags = info.flags;
        try {
            int smallestWidth = context.getResources().getConfiguration().smallestScreenWidthDp;
            if ("true".equals(InstrumentationRegistry.getArguments().getString("tabletSelect"))) {
                assertTrue("The compatibility probe uses an actual tablet configuration", smallestWidth >= 600);
            }
            System.out.println("Select return fixture smallestWidthDp=" + smallestWidth);
            info.flags |= android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
            automation.setServiceInfo(info);
            viewport(390, 844); click("AI 设置"); until("document.querySelector('#api-model')");
            assertEquals("Bundled connection details stay collapsed", "true", js("!(document.querySelector('.api-connection-toggle').getAttribute('aria-expanded')==='true')"));
            screenshot("native-bundled-compact-connection");
            nativeTap(".api-connection-toggle"); until("(document.querySelector('.api-connection-toggle').getAttribute('aria-expanded')==='true')");
            fill("#api-model", "android-unsaved-model");
            String[][] fields = {{"#api-provider", "自定义 / 兼容服务", "provider"}, {"#api-protocol", "Chat Completions compatible", "protocol"}};
            for (String[] field : fields) {
                nativeTap(field[0], 0, field[0] + " + svg");
                assertNotNull("The actual Android choices appear", awaitNativeOption(automation, field[1]));
                screenshot("native-select-options-" + field[2]);
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                until("document.querySelector('.api-config-card')&&document.querySelector('#api-provider').value==='mimo'&&document.querySelector('#api-protocol').value==='responses'&&document.querySelector('#api-model').value==='android-unsaved-model'");
                reachable(".api-config-close"); screenshot("native-select-return-" + field[2]);
                assertNull("One return dismisses only the choices", visibleNativeOption(automation, field[1]));
            }
            nativeTap("#api-provider", 0, "#api-provider + svg");
            android.view.accessibility.AccessibilityNodeInfo custom = awaitNativeOption(automation, "自定义 / 兼容服务");
            assertNotNull("Provider choices reopen after cancellation", custom);
            nativeOptionTap(custom);
            until("document.querySelector('#api-provider').value==='custom'&&document.querySelector('#api-protocol').value==='chat-completions'&&document.querySelector('#api-model').value===''");
            fill("#api-model", "android-unsaved-model");
            js("document.querySelector('#api-model').scrollIntoView({block:'center'})");
            nativeTap("#api-model"); awaitSettledIme(true);
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
            awaitSettledIme(false);
            assertEquals("Keyboard return retains the unsaved form", "true", js("Boolean(document.querySelector('.api-config-card'))&&document.querySelector('#api-model').value==='android-unsaved-model'"));
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
            until("!document.querySelector('.api-config-card')");
            click("AI 设置");
            until("document.querySelector('#api-provider')?.value==='mimo'&&document.querySelector('#api-model')?.value==='mimo-v2.6-pro'");
            assertNoResizeErrors();
        } finally {
            info.flags = originalFlags; automation.setServiceInfo(info);
            activity.close();
        }
    }

    private android.view.accessibility.AccessibilityNodeInfo awaitNativeOption(android.app.UiAutomation automation, String text) {
        long deadline = SystemClock.elapsedRealtime() + 5000;
        android.view.accessibility.AccessibilityNodeInfo node;
        do {
            node = visibleNativeOption(automation, text);
            if (node != null) return node;
            SystemClock.sleep(100);
        } while (SystemClock.elapsedRealtime() < deadline);
        return null;
    }

    private void nativeOptionTap(android.view.accessibility.AccessibilityNodeInfo option) {
        android.graphics.Rect bounds = new android.graphics.Rect();
        option.getBoundsInScreen(bounds);
        assertTrue("The native option has visible screen bounds", bounds.width() > 0 && bounds.height() > 0);
        long now = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, bounds.centerX(), bounds.centerY(), 0);
        MotionEvent up = MotionEvent.obtain(now, now + 80, MotionEvent.ACTION_UP, bounds.centerX(), bounds.centerY(), 0);
        try {
            InstrumentationRegistry.getInstrumentation().sendPointerSync(down);
            InstrumentationRegistry.getInstrumentation().sendPointerSync(up);
        } finally { down.recycle(); up.recycle(); }
    }

    private android.view.accessibility.AccessibilityNodeInfo visibleNativeOption(android.app.UiAutomation automation, String text) {
        for (android.view.accessibility.AccessibilityWindowInfo window : automation.getWindows()) {
            android.view.accessibility.AccessibilityNodeInfo root = window.getRoot();
            if (root != null) for (android.view.accessibility.AccessibilityNodeInfo node : root.findAccessibilityNodeInfosByText(text)) {
                if (node.isVisibleToUser() && text.contentEquals(node.getText() == null ? "" : node.getText())) return node;
            }
        }
        return null;
    }

    @Test public void portraitSelectionStaysSingleColumnOnWidePhones() throws Exception {
        // Dedicated QA canvas: at least 1400 x 2000 physical pixels at density 320.
        fresh();
        try {
            viewport(562, 1000); click("开始游戏");
            until("document.querySelectorAll('.preset-card-modern.selected').length===1");
            assertEquals("Default investigator uses a real checked selection control", "true", js("document.querySelector('.preset-selection-input').checked"));
            assertEquals("Selection shows specialties while keeping background details collapsed", "true", js("document.querySelector('.preset-specialties').textContent.includes('侦查')&&document.querySelector('.preset-other-panel').hidden"));
            js("document.querySelectorAll('.preset-card-modern strong')[1].click()");
            for (int width : new int[] {562, 599, 600, 601, 700}) {
                viewport(width, 1000);
                js("document.querySelector('.preset-grid-modern').scrollTop=0");
                assertEquals("Portrait cards stay full-width in one vertical column", "true", js("(()=>{const cards=Array.from(document.querySelectorAll('.preset-card-modern')).map(e=>e.getBoundingClientRect());return cards[0].width>innerWidth*.9&&cards.every((r,i)=>!i||(r.left===cards[0].left&&r.right===cards[0].right&&r.top>=cards[i-1].bottom+8))})()"));
                js("document.querySelector('.preset-attrs-toggle').click()");
                assertEquals("Expanding attributes keeps the selected party and fits inside the card", "true", js("document.querySelectorAll('.preset-card-modern.selected').length===2&&Array.from(document.querySelectorAll('.preset-card-content,.preset-vitals')).every(e=>e.scrollWidth<=e.clientWidth+1)"));
                assertEquals("Expanded files never overlay the following investigator", "true", js("(()=>{const cards=document.querySelectorAll('.preset-card-modern');return cards[1].getBoundingClientRect().top>=cards[0].getBoundingClientRect().bottom+8})()"));
                reachable(".setup-footer .primary-btn"); js("document.querySelector('.preset-attrs-toggle').click()");
                screenshot("single-column-" + width);
                js("document.querySelector('.preset-grid-modern').scrollTop=99999");
                reachable(".preset-card-modern:last-child .preset-attrs-toggle"); reachable(".setup-footer .primary-btn");
            }
            js("document.querySelectorAll('.preset-card-modern strong')[2].click();document.querySelectorAll('.preset-card-modern strong')[3].click()");
            until("document.querySelectorAll('.preset-card-modern.selected').length===4");
            click("进入游戏"); until("document.querySelectorAll('.party-compact').length===4");
            for (int width : new int[] {562, 600, 700}) {
                viewport(width, 1000); readablePartyDossiers();
                assertEquals("Wide phone party remains in two readable columns", "true", js("getComputedStyle(document.querySelector('.party-strip-compact')).gridTemplateColumns.split(' ').length===2"));
            }
            screenshot("party-dossiers-wide-phone");
        } finally { activity.close(); }
    }

    @Test public void loadedSceneArtStartsMotionAndSurvivesCachedReturn() throws Exception {
        fresh();
        try {
            viewport(390, 844); click("开始游戏");
            js("window.qaArtMotion=[];document.addEventListener('animationstart',e=>{"
                + "if(!e.target.matches('.scene-stage img'))return;window.qaArtMotion.push({name:e.animationName,"
                + "loaded:e.target.complete&&e.target.naturalWidth>0,arriving:e.target.classList.contains('scene-image-arriving')});})");
            click("进入游戏");
            until("window.qaArtMotion.length===2&&window.qaArtMotion.every(e=>e.loaded&&e.arriving)"
                + "&&window.qaArtMotion.some(e=>e.name==='fog-scene-enter')&&window.qaArtMotion.some(e=>e.name==='fog-portrait-enter')");
            awaitUiMotion();
            assertEquals("Loaded APK paintings and portraits finish at full visibility", "true", js("Array.from(document.querySelectorAll('.scene-stage img')).every(e=>e.complete&&e.naturalWidth>0&&getComputedStyle(e).opacity==='1')"));
            fill(".dock-input", "先记录日期\n再检查门廊");
            menu("返回首页"); click("继续游戏");
            until("window.qaArtMotion.length===4&&window.qaArtMotion.every(e=>e.loaded&&e.arriving)");
            awaitUiMotion();
            assertEquals("Cached artwork reveals normally while the action draft stays intact", "true", js("document.querySelector('.dock-input').value==='先记录日期'+String.fromCharCode(10)+'再检查门廊'&&document.querySelectorAll('.scene-stage img.scene-image-arriving').length===2"));
            nativeTap(".dock-actor-avatar"); until("document.querySelector('.investigator-sheet[role=dialog]')");
            nativeTap(".investigator-close"); until("!document.querySelector('[data-ui-phase=closing]')");
            assertEquals("Inspecting a dossier does not restart loaded scene motion", "4", js("window.qaArtMotion.length"));
            assertNoResizeErrors(); screenshot("loaded-scene-art");
        } finally { activity.close(); }
    }

    private void watchPanelTransition(String layerSelector, String panelSelector, String phase) throws Exception {
        js("(()=>{window.qaPanelTraceCleanup?.();const layerSelector=" + JSONObject.quote(layerSelector)
                + ",panelSelector=" + JSONObject.quote(panelSelector) + ",phase=" + JSONObject.quote(phase) + ";"
                + "const trace=window.qaPanelTrace={frames:[],events:[],immediate:null,reduced:matchMedia('(prefers-reduced-motion:reduce)').matches};"
                + "let layer=document.querySelector(layerSelector),panel=document.querySelector(panelSelector),frame;const run=e=>{if(e.target.matches(panelSelector))trace.events.push({property:e.propertyName,phase:e.target.closest('[data-ui-phase]')?.dataset.uiPhase})};"
                + "document.addEventListener('transitionrun',run);"
                + "const read=at=>{const s=getComputedStyle(panel);return{at,connected:panel.isConnected,phase:layer.dataset.uiPhase??null,inert:layer.inert,hidden:layer.getAttribute('aria-hidden'),role:panel.getAttribute('role'),opacity:Number(s.opacity),transform:s.transform,animation:s.animationName,visibility:s.visibility,properties:s.transitionProperty,durations:s.transitionDuration,focused:panel.contains(document.activeElement)}};"
                + "const take=at=>{trace.frames.push(read(at));if(trace.frames.length<24)frame=requestAnimationFrame(take);else{const animations=panel.getAnimations().filter(a=>a.playState==='running'&&Number.isFinite(a.effect?.getTiming().iterations??1));Promise.all(animations.map(a=>a.finished.catch(()=>{}))).then(()=>{trace.settledAt=performance.now();trace.terminal=read(trace.settledAt)})}};"
                + "const observer=new MutationObserver(()=>{layer=document.querySelector(layerSelector)??layer;panel=document.querySelector(panelSelector)??panel;if(!layer||!panel)return;"
                + "if(layer.dataset.uiPhase!==phase&&!(trace.reduced&&phase==='closing'&&panel.getAttribute('role')!=='dialog'&&(layer.inert||!layer.isConnected)))return;observer.disconnect();"
                + "trace.immediate={phase:layer.dataset.uiPhase??null,inert:layer.inert,hidden:layer.getAttribute('aria-hidden'),role:panel.getAttribute('role')};frame=requestAnimationFrame(take)});"
                + "observer.observe(document.body,{childList:true,attributes:true,attributeFilter:['data-ui-phase'],subtree:true});"
                + "window.qaPanelTraceCleanup=()=>{observer.disconnect();cancelAnimationFrame(frame);document.removeEventListener('transitionrun',run)};})()");
    }

    private void assertPanelTransition(String phase) throws Exception {
        until("window.qaPanelTrace.frames.length===24&&window.qaPanelTrace.terminal");
        boolean opening = "open".equals(phase);
        assertEquals("Logical panel state changes without waiting for its picture", "true", js("(()=>{const q=window.qaPanelTrace,s=q.immediate;return(s.phase===" + JSONObject.quote(phase)
                + "||(q.reduced&&" + !opening + "&&s.phase===null))&&s.inert===" + !opening + "&&" + (opening ? "s.hidden!=='true'" : "s.hidden==='true'") + "&&s.role===" + (opening ? "'dialog'" : "null") + "})()"));
        assertEquals("Real native frames use opacity/transform transitions without fixed keyframes", "true", js("(()=>{const q=window.qaPanelTrace,f=q.frames.filter(f=>f.connected&&f.phase===" + JSONObject.quote(phase) + ");"
                + "return q.reduced?q.frames.every(f=>!f.connected||f.animation==='none'&&f.durations.split(',').every(d=>parseFloat(d)===0)&&(" + opening + "||f.role===null&&f.inert&&f.hidden==='true'&&f.visibility==='hidden'))"
                + ":f.length>0&&f.every(f=>f.animation==='none'&&['opacity','transform'].every(p=>f.properties.split(',').map(s=>s.trim()).includes(p))&&f.durations.split(',').every(d=>Math.abs(parseFloat(d)-" + (opening ? ".24" : ".17") + ")<.001))"
                + "&&q.events.some(e=>e.property==='opacity')&&q.frames.some(f=>f.opacity>.001&&f.opacity<.999)})()"));
        if (opening) {
            assertEquals("Entering finishes visible and focused without moving the reading controls", "true", js("(()=>{const f=window.qaPanelTrace.terminal;return f.connected&&f.opacity>=.999&&f.transform==='none'&&f.focused})()"));
        }
        System.out.println("PANEL_TRANSITION_NATIVE: " + js("JSON.stringify({phase:" + JSONObject.quote(phase) + ",first:window.qaPanelTrace.frames[0],last:window.qaPanelTrace.frames.at(-1),terminal:window.qaPanelTrace.terminal,settledAt:window.qaPanelTrace.settledAt,intermediate:window.qaPanelTrace.frames.filter(f=>f.opacity>.001&&f.opacity<.999).length,events:window.qaPanelTrace.events})"));
        js("(window.qaPanelRecords??=[]).push(window.qaPanelTrace)");
    }

    private void savePanelMotionTrace(String name, String expression) throws Exception {
        String json = new JSONObject("{\"trace\":" + js("JSON.stringify(" + expression + ")") + "}").getString("trace");
        File folder = new File(context.getExternalFilesDir(null), "qa"); folder.mkdirs();
        try (FileOutputStream output = new FileOutputStream(new File(folder, name + ".json"))) {
            output.write(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
    }

    @Test public void pairedPanelMotionKeepsNativeBackAndDraftResponsive() throws Exception {
        fresh();
        try {
            viewport(390, 844); click("开始游戏"); click("进入游戏");
            fill(".dock-input", "先记录日期\n再检查门廊");
            watchPanelTransition(".game-menu-backdrop", ".game-menu", "open");
            nativeTap(".menu-button"); until("document.querySelector('.game-menu[role=dialog]')");
            assertPanelTransition("open");
            screenshot("paired-motion-menu");
            watchPanelTransition(".audio-settings-backdrop", ".audio-settings", "open");
            nativeTap(".game-menu button[aria-label='声音设置']"); until("document.querySelector('.audio-settings[role=dialog]')");
            assertPanelTransition("open");
            watchPanelTransition(".audio-settings-backdrop", ".audio-settings", "closing");
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
            until("!document.querySelector('.audio-settings[role=dialog]')");
            assertEquals("The first Back releases the child layer and restores its menu opener", "true", js("document.querySelector('.game-menu[role=dialog]')&&document.activeElement===document.querySelector('.game-menu button[aria-label=声音设置]')"));
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
            until("!document.querySelector('.game-menu[role=dialog]')");
            assertEquals("Closing visuals release system Back and return to the original menu control", "true", js("!document.querySelector('.android-exit-card')&&document.activeElement===document.querySelector('.menu-button')"));
            assertPanelTransition("closing");
            until("!document.querySelector('[data-ui-phase=closing]')");
            nativeTap(".dock-actor-avatar"); until("document.querySelector('.investigator-sheet[role=dialog]')");
            nativeTap(".investigator-close"); until("!document.querySelector('.investigator-sheet[role=dialog]')");
            nativeTap(".dock-input"); awaitSettledIme(true);
            until("!document.querySelector('[data-ui-phase=closing]')");
            assertEquals("Retiring a character sheet cannot take focus from the next action", "true", js("document.activeElement===document.querySelector('.dock-input')&&document.querySelector('.dock-input').value==='先记录日期'+String.fromCharCode(10)+'再检查门廊'"));
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK); awaitSettledIme(false);
            watchPanelTransition(".info-drawer-react", ".info-drawer-react", "open");
            nativeTap(".drawer-tab"); until("document.querySelector('.info-drawer-react[role=dialog]')");
            assertPanelTransition("open");
            watchPanelTransition(".info-drawer-react", ".info-drawer-react", "closing");
            nativeTap(".info-drawer-react button[aria-label='关闭资料']"); until("!document.querySelector('.info-drawer-react[role=dialog]')");
            assertPanelTransition("closing");
            until("!document.querySelector('[data-ui-phase=closing]')");
            assertNoResizeErrors(); screenshot("paired-motion-return");
        } finally {
            if (activity != null) {
                try {
                    js("window.qaPanelTraceCleanup?.()");
                    savePanelMotionTrace("panel-transition-native", "({completed:window.qaPanelRecords??[],current:window.qaPanelTrace??null})");
                } finally { activity.close(); }
            }
        }
    }

    // Seed with real touch, then run the real button handlers before nativeTap's motion wait could settle them.
    private void watchPanelReversals(String openerSelector, String layerSelector, String panelSelector, String closeSelector) throws Exception {
        js("(()=>{window.qaPanelReverseCleanup?.();const openerSelector=" + JSONObject.quote(openerSelector)
                + ",layerSelector=" + JSONObject.quote(layerSelector) + ",panelSelector=" + JSONObject.quote(panelSelector) + ",closeSelector=" + JSONObject.quote(closeSelector) + ";"
                + "const q=window.qaPanelReverse={pairs:[],frames:[],done:false,error:null,reduced:matchMedia('(prefers-reduced-motion:reduce)').matches};let layer,panel,frame;"
                + "const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),raf=()=>new Promise(resolve=>requestAnimationFrame(resolve));"
                + "const phase=wanted=>new Promise((resolve,reject)=>{let observer,timer;const check=()=>{const e=document.querySelector(layerSelector),p=document.querySelector(panelSelector);"
                + "if(e?.dataset.uiPhase!==wanted&&!(q.reduced&&wanted==='closing'&&(!p||p.getAttribute('role')!=='dialog')))return;observer?.disconnect();clearTimeout(timer);resolve()};"
                + "observer=new MutationObserver(check);observer.observe(document.body,{childList:true,attributes:true,attributeFilter:['data-ui-phase'],subtree:true});timer=setTimeout(()=>{observer.disconnect();reject(new Error('Missing '+wanted+' phase'))},2000);check()});"
                + "const take=()=>{const currentLayer=document.querySelector(layerSelector),currentPanel=document.querySelector(panelSelector),e=currentPanel??panel,r=currentLayer??layer,s=getComputedStyle(e),m=new DOMMatrixReadOnly(s.transform==='none'||!s.transform?undefined:s.transform),b=e.getBoundingClientRect();"
                + "return{at:performance.now(),connected:e.isConnected,sameLayer:currentLayer===layer,samePanel:currentPanel===panel,phase:r.dataset.uiPhase??null,inert:r.inert,hidden:r.getAttribute('aria-hidden'),role:e.getAttribute('role'),opacity:Number(s.opacity),veil:Number(getComputedStyle(r).opacity),matrix:[m.a,m.b,m.c,m.d,m.e,m.f],bounds:[b.left,b.top,b.width,b.height],focused:e.contains(document.activeElement),animation:s.animationName,markers:document.querySelectorAll('[data-ui-enter]').length}};"
                + "const sample=()=>{q.frames.push(take());if(!q.done&&q.frames.length<90)frame=requestAnimationFrame(sample)};"
                + "const run=async()=>{await phase('open');layer=document.querySelector(layerSelector);panel=document.querySelector(panelSelector);frame=requestAnimationFrame(sample);await raf();await wait(35);"
                + "for(let i=0;i<3;i++){const beforeClose=take();document.querySelector(closeSelector).click();await phase('closing');const closed={phase:'closing',before:beforeClose,after:take()};q.pairs.push(closed);"
                + "await raf();await wait(0);closed.focusReleased=!panel.contains(document.activeElement)&&document.activeElement===document.querySelector(openerSelector);await wait(35);"
                + "const beforeOpen=take();document.querySelector(openerSelector).click();await phase('open');q.pairs.push({phase:'open',before:beforeOpen,after:take()});await raf();await wait(35)}q.done=true;cancelAnimationFrame(frame)};"
                + "const start=e=>{if(!(e.target instanceof Element)||!e.target.closest(openerSelector))return;document.removeEventListener('click',start,true);run().catch(error=>{q.error=String(error);q.done=true;cancelAnimationFrame(frame)})};"
                + "document.addEventListener('click',start,true);window.qaPanelReverseCleanup=()=>{document.removeEventListener('click',start,true);cancelAnimationFrame(frame)};})()");
    }

    private void assertPanelReversals(String panelSelector, String openerSelector) throws Exception {
        until("window.qaPanelReverse.done");
        assertEquals("Quick reversals finish through the real UI handlers", "null", js("window.qaPanelReverse.error"));
        assertEquals("Closing and reopening keep their immediate logical semantics and release focus before fading finishes", "true", js("(()=>{const q=window.qaPanelReverse;return q.pairs.length===6&&q.pairs.every(({phase,after:s,focusReleased})=>phase==='open'?s.phase==='open'&&!s.inert&&s.hidden!=='true'&&s.role==='dialog':(s.phase==='closing'||q.reduced)&&s.role===null&&(!s.connected||s.inert&&s.hidden==='true')&&focusReleased)})()"));
        assertEquals("A retained panel reverses from its current opacity, transform and position", "true", js("(()=>{const q=window.qaPanelReverse;return q.reduced?q.frames.every(s=>!s.connected||s.animation==='none'):q.frames.some(s=>s.opacity>.001&&s.opacity<.999)&&q.pairs.every(({before:a,after:b})=>a.sameLayer&&a.samePanel&&b.sameLayer&&b.samePanel&&a.animation==='none'&&b.animation==='none'&&b.markers===0&&Math.abs(a.opacity-b.opacity)<=.02&&Math.abs(a.veil-b.veil)<=.02&&a.matrix.every((v,i)=>Math.abs(v-b.matrix[i])<=(i<4?.002:1))&&a.bounds.every((v,i)=>Math.abs(v-b.bounds[i])<=1))})()"));
        awaitUiMotion();
        assertEquals("The same reopened panel finishes visible, focused and usable", "true", js("(()=>{const p=document.querySelector(" + JSONObject.quote(panelSelector) + "),s=getComputedStyle(p);return p.getAttribute('role')==='dialog'&&!p.closest('[inert]')&&p.contains(document.activeElement)&&Number(s.opacity)>=.999&&s.transform==='none'&&document.querySelectorAll('[data-ui-enter]').length===0})()"));
        System.out.println("PANEL_REVERSE_NATIVE: " + js("JSON.stringify({panel:" + JSONObject.quote(panelSelector) + ",reduced:window.qaPanelReverse.reduced,frames:window.qaPanelReverse.frames.length,pairs:window.qaPanelReverse.pairs.map(p=>({phase:p.phase,opacityDelta:Math.abs(p.before.opacity-p.after.opacity),veilDelta:Math.abs(p.before.veil-p.after.veil),positionDelta:Math.max(...p.before.bounds.map((v,i)=>Math.abs(v-p.after.bounds[i]))),samePanel:p.after.samePanel,focusReleased:p.focusReleased}))})"));
        js("(window.qaPanelReverseRecords??=[]).push(window.qaPanelReverse)");
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
        until("!document.querySelector(" + JSONObject.quote(panelSelector + "[role=dialog]") + ")");
        assertEquals("The final native Back immediately restores the original opener", "true", js("document.activeElement===document.querySelector(" + JSONObject.quote(openerSelector) + ")&&!document.querySelector('.android-exit-card')"));
        until("!document.querySelector('[data-ui-phase=closing]')");
    }

    @Test public void panelReversalsKeepNativePartyDraftAndFocus() throws Exception {
        for (int party : new int[]{1, 2, 4}) {
            fresh();
            try {
                viewport(390, 844); click("开始游戏");
                for (int i = 1; i < party; i++) js("document.querySelectorAll('.preset-selection-input')[" + i + "].click()");
                until("document.querySelectorAll('.preset-selection-input:checked').length===" + party);
                click("进入游戏"); fill(".dock-input", "先核对门廊痕迹\n再记录来访者。");
                watchPanelReversals(".menu-button", ".game-menu-backdrop", ".game-menu", ".game-menu-close");
                nativeTap(".menu-button"); assertPanelReversals(".game-menu", ".menu-button");
                nativeTap(".menu-button"); until("document.querySelector('.game-menu[role=dialog]')");
                watchPanelReversals(".game-menu button[aria-label='声音设置']", ".audio-settings-backdrop", ".audio-settings", ".audio-close");
                nativeTap(".game-menu button[aria-label='声音设置']"); assertPanelReversals(".audio-settings", ".game-menu button[aria-label='声音设置']");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                until("!document.querySelector('.game-menu[role=dialog]')");
                watchPanelReversals(".dock-actor-avatar", ".investigator-overlay", ".investigator-sheet", ".investigator-close");
                nativeTap(".dock-actor-avatar"); assertPanelReversals(".investigator-sheet", ".dock-actor-avatar");
                watchPanelReversals(".drawer-tab", ".info-drawer-react", ".info-drawer-react", ".info-drawer-react button[aria-label='关闭资料']");
                nativeTap(".drawer-tab"); assertPanelReversals(".info-drawer-react", ".drawer-tab");
                assertEquals("Repeated panel reversals retain the complete action and selected party", "true", js("document.querySelector('.dock-input').value==='先核对门廊痕迹'+String.fromCharCode(10)+'再记录来访者。'&&document.querySelectorAll('.party-compact').length===" + party));
                awaitSettledIme(false);
                assertNoResizeErrors(); if (party == 2) screenshot("panel-reverse-native");
            } finally {
                if (activity != null) {
                    try {
                        js("window.qaPanelReverseCleanup?.()");
                        savePanelMotionTrace("panel-reverse-native-party-" + party, "({completed:window.qaPanelReverseRecords??[],current:window.qaPanelReverse??null})");
                    } finally { activity.close(); }
                }
            }
        }
    }

    // Initial entry is real native touch; precision reversal invokes the existing buttons in observed RAFs.
    private void watchSecondaryReading(String[] route, boolean cold) throws Exception {
        JSONObject selectors = new JSONObject();
        String[] keys = {"kind", "entry", "opener", "layer", "card", "body", "scroll", "close"};
        for (int i = 0; i < keys.length; i++) selectors.put(keys[i], route[i]);
        js("(()=>{const s=" + selectors + ",cold=" + cold + ";" + """
            window.qaSecondaryCleanup?.();
            if(window.qaSecondary?.done)(window.qaSecondaryRecords??=[]).push(window.qaSecondary);
            const prior=window.qaSecondaryBody??document.querySelector(s.body);
            const q=window.qaSecondary={kind:s.kind,cold,source:cold?'native initial touch and actual cold reading RAF; no rapid handler':'native initial touch; observed-RAF real close/opener button handlers; final native Back',
                done:false,error:null,frames:[],reduced:matchMedia('(prefers-reduced-motion:reduce)').matches,finishError:null};
            let body,card,layer,scroll,original,frame,timer;const cleanups=[];
            const targetAnimations=()=>body.getAnimations().filter(a=>a.effect?.target===body&&a.effect.getTiming().duration===190);
            const take=()=>{const style=getComputedStyle(body),m=new DOMMatrixReadOnly(style.transform==='none'||!style.transform?undefined:style.transform),outer=getComputedStyle(card),n=new DOMMatrixReadOnly(outer.transform==='none'||!outer.transform?undefined:outer.transform),button=document.querySelector(s.close),r=button?.getBoundingClientRect();
                return{at:performance.now(),connected:body.isConnected,sameBody:document.querySelector(s.body)===body,sameCard:document.querySelector(s.card)===card,
                    sameLayer:document.querySelector(s.layer)===layer,sameScroll:document.querySelector(s.scroll)===scroll,scroll:scroll.scrollTop,scrollHeight:scroll.scrollHeight,clientHeight:scroll.clientHeight,
                    page:body.className,title:card.querySelector('h2,h3,h4')?.textContent??null,phase:layer.dataset.uiPhase??null,inert:layer.inert,hidden:layer.getAttribute('aria-hidden'),role:card.getAttribute('role'),modal:card.getAttribute('aria-modal'),
                    focusInside:card.contains(document.activeElement),focusReturned:document.activeElement===document.querySelector(s.opener),opacity:Number(style.opacity),matrix:[m.a,m.b,m.c,m.d,m.e,m.f],
                    outerOpacity:Number(outer.opacity),outerMatrix:[n.a,n.b,n.c,n.d,n.e,n.f],entryMarker:card.hasAttribute('data-ui-enter'),running:targetAnimations().filter(a=>a.playState==='running').length,
                    currentTime:original?.currentTime??null,progress:original?.effect.getComputedTiming().progress??null,closeSize:r?[r.width,r.height]:null,
                    closeHit:!!r&&button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};};
            const raf=()=>new Promise(resolve=>{frame=requestAnimationFrame(()=>{if(body&&q.frames.length<24)q.frames.push(take());resolve()})});
            const committed=test=>new Promise((resolve,reject)=>{let observer,deadline;const probe=()=>{if(!test())return;observer?.disconnect();clearTimeout(deadline);resolve()};
                observer=new MutationObserver(probe);observer.observe(document.body,{childList:true,attributes:true,subtree:true});
                deadline=setTimeout(()=>{observer.disconnect();reject(new Error('Missing actual '+s.kind+' commit'))},2000);
                cleanups.push(()=>{observer.disconnect();clearTimeout(deadline)});probe()});
            const run=async()=>{
                await committed(()=>document.querySelector(s.card)?.getAttribute('role')==='dialog'&&document.querySelector(s.layer)?.dataset.uiPhase==='open'&&document.querySelector(s.scroll));
                await raf();body=document.querySelector(s.body);card=document.querySelector(s.card);layer=document.querySelector(s.layer);scroll=document.querySelector(s.scroll);window.qaSecondaryBody=body;window.qaSecondaryCard=card;
                q.changedBody=prior!==body;original=targetAnimations().find(a=>a.playState==='running');q.first=take();q.frames.push(q.first);
                if(!q.reduced&&!original)throw new Error('Actual committed reading body has no running 190ms effect');
                const completion=original?original.finished.then(()=>{q.finished=true;q.finishedAt=performance.now()},error=>{q.finished=false;q.finishError=String(error)}):Promise.resolve();
                q.originalAnimation=original?{duration:original.effect.getTiming().duration,currentTime:original.currentTime,progress:original.effect.getComputedTiming().progress,observedAt:performance.now()}:null;
                if(!cold&&!q.reduced){
                    if(scroll.scrollHeight-scroll.clientHeight<=1)throw new Error('Authored record has no natural overflow; see first geometry');
                    let scrolled=scroll.scrollTop>0;const observedScroll=()=>{scrolled=true};scroll.addEventListener('scroll',observedScroll);cleanups.push(()=>scroll.removeEventListener('scroll',observedScroll));
                    if(!scrolled)scroll.scrollTop=Math.round((scroll.scrollHeight-scroll.clientHeight)*.35);await raf();scroll.removeEventListener('scroll',observedScroll);q.bookmark=scroll.scrollTop;
                    if(!scrolled||q.bookmark<=0)throw new Error('Real nonzero scroll event did not reach the reading body');
                    q.beforeClose=take();
                    while(original.playState==='running'&&!(q.beforeClose.progress>0&&q.beforeClose.progress<1)){await raf();q.beforeClose=take();}
                    if(original.playState!=='running'||!(q.beforeClose.progress>0&&q.beforeClose.progress<1))throw new Error('Missed actual running close window');
                    const closed=committed(()=>layer.dataset.uiPhase==='closing'&&card.getAttribute('role')===null);document.querySelector(s.close).click();await closed;q.closed=take();q.closedAt=performance.now();
                    await raf();q.closedFocus=take();q.beforeReopen=take();
                    if(!body.isConnected||original.playState!=='running')throw new Error('Missed retained running reopen window');
                    const opened=committed(()=>layer.dataset.uiPhase==='open'&&card.getAttribute('role')==='dialog');document.querySelector(s.opener).click();await opened;q.openAt=performance.now();q.reopened=take();
                    q.sameAnimation=targetAnimations().includes(original);q.sameOriginalTime=original.currentTime>=q.beforeReopen.currentTime;
                }
                while(q.frames.length<24)await raf();await completion;q.terminal=take();q.done=true;
            };
            const start=event=>{if(!(event.target instanceof Element)||!event.target.closest(s.entry))return;document.removeEventListener('click',start,true);clearTimeout(timer);
                timer=setTimeout(()=>{q.error='Secondary reading trace deadline';q.done=true;window.qaSecondaryCleanup()},4000);
                run().catch(error=>{q.error=String(error);q.done=true}).finally(()=>{clearTimeout(timer);cleanups.forEach(clean=>clean())})};
            document.addEventListener('click',start,true);timer=setTimeout(()=>{q.error='No actual native entry click';q.done=true;window.qaSecondaryCleanup()},20000);
            window.qaSecondaryCleanup=()=>{document.removeEventListener('click',start,true);cancelAnimationFrame(frame);clearTimeout(timer);cleanups.forEach(clean=>clean())};
            })()
            """);
    }

    @Test public void secondaryReadingKeepsRunningEffectsAcrossRetainedReturns() throws Exception {
        String[][] routes = {
            {"info", ".info-drawer-tabs button[id$='-log']", ".drawer-tab", ".info-drawer-react", ".info-drawer-react", ".info-drawer-page", ".action-log-list", ".info-drawer-react button[aria-label='关闭资料']"},
            {"case", ".case-board-mobile-card[aria-label='地点 摩勒住宅']", ".case-board-mobile-card[aria-label='地点 摩勒住宅']", ".case-board-inspector", ".case-board-inspector", ".case-board-inspector-scroll", ".case-board-inspector-scroll", "[aria-label='关闭资料详情']"},
            {"entity", ".narrative-scroll button.narrative-mark[aria-label='查看摩勒住宅详情']", ".narrative-scroll button.narrative-mark[aria-label='查看摩勒住宅详情']", ".entity-detail-overlay", ".entity-detail-card", ".entity-detail-body", ".entity-detail-body", ".entity-detail-close"}
        };
        for (int party : new int[]{1, 2, 4}) {
            AtomicInteger modelCalls = new AtomicInteger(); MockWebServer server = new MockWebServer();
            server.setDispatcher(new Dispatcher() { @Override public MockResponse dispatch(RecordedRequest request) { modelCalls.incrementAndGet(); return new MockResponse().setResponseCode(503); } }); server.start();
            try {
                fresh(); viewport(390, 844); configure(server.url("/v1").toString(), "chat-completions"); click("开始游戏");
                for (int i = 1; i < party; i++) js("document.querySelectorAll('.preset-selection-input')[" + i + "].click()");
                until("document.querySelectorAll('.preset-selection-input:checked').length===" + party); click("进入游戏"); fill(".dock-input", "先核对门廊痕迹\n再记录委托资料。"); menu("返回首页");
                // Repeat the authored visible log entry, and render the existing S01 title/description through real state.
                js("window.qaSecondaryFixtureReady=false;window.qaSecondaryFixtureError=null;Capacitor.Plugins.GameStorage.readAll().then(async({values})=>{const record=JSON.parse(values['trpg-android-session-v1']);const original=record.state.actionLog[0];"
                    + "record.state.actionLog=Array.from({length:32},()=>({...original}));record.state.messages.push({...record.state.messages[0],id:'qa-secondary-public-scene',text:'摩勒住宅'+String.fromCharCode(10)+'纽伦上街101-102号的维多利亚式别墅，伊莎贝拉·摩勒在此等待调查员。'});"
                    + "await Capacitor.Plugins.GameStorage.write({key:'trpg-android-session-v1',value:JSON.stringify(record)});window.qaSecondaryFixtureReady=true}).catch(error=>{window.qaSecondaryFixtureError=String(error);window.qaSecondaryFixtureReady=true})");
                until("window.qaSecondaryFixtureReady"); assertEquals("Public reading fixture uses the real encrypted checkpoint", "null", js("window.qaSecondaryFixtureError"));
                activity.recreate(); until("document.querySelector('.title-resume-preview')"); watchResizeErrors(); viewport(390, 430); click("继续游戏");
                until("document.querySelector('.scene-backdrop-img')?.complete&&document.querySelector('.scene-backdrop-img').naturalWidth>0");
                assertEquals("The exact multiline action survives encrypted fixture recovery", JSONObject.quote("先核对门廊痕迹\n再记录委托资料。"), js("document.querySelector('.dock-input').value"));
                assertEquals("The restored reading party is actual native Android", "true", js("Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android'&&document.querySelectorAll('.party-compact').length===" + party));
                js("window.qaSecondaryRecords=[];window.qaSecondaryGameBefore={draft:document.querySelector('.dock-input').value,actor:document.querySelector('.dock-input').getAttribute('aria-label'),party:Array.from(document.querySelectorAll('.party-compact strong'),e=>e.textContent),world:document.querySelector('.brand-scene').textContent+document.querySelector('.world-time').textContent,messages:document.querySelectorAll('.story-message.player').length}");
                for (String[] route : routes) {
                    if (!route[0].equals("entity")) {
                        String[] drawer = {"info-first", ".drawer-tab", ".drawer-tab", ".info-drawer-react", ".info-drawer-react", ".info-drawer-page", ".case-board-workspace", ".info-drawer-react button[aria-label='关闭资料']"};
                        watchSecondaryReading(drawer, true); nativeTap(".drawer-tab"); until("window.qaSecondary.done");
                        assertEquals("The new InfoDrawer keyed body really enters at 190ms", "true", js("(()=>{const q=window.qaSecondary;return q.error===null&&q.changedBody&&q.frames.length===24&&(q.reduced||q.originalAnimation?.duration===190&&q.frames.some(f=>f.progress>0&&f.progress<1&&f.opacity>.001&&f.opacity<.999)&&q.finished&&q.finishError===null)&&q.terminal.opacity>=.999&&q.terminal.running===0})()"));
                    }
                    if (route[0].equals("info")) {
                        nativeTap(route[1]); awaitUiMotion(); js("document.querySelector('.action-log-list').scrollTop=240");
                        String bookmark = awaitSettledScroll(".action-log-list"); assertTrue("Authored log entries give a nonzero native reading bookmark", Double.parseDouble(bookmark) > 0);
                        js("window.qaSecondaryLogBookmark=" + bookmark); nativeTap(".info-drawer-tabs button[id$='-board']");
                    } else if (route[0].equals("entity")) js("document.querySelector(" + JSONObject.quote(route[1]) + ").scrollIntoView({block:'center',inline:'nearest'})");
                    watchSecondaryReading(route, false); nativeTap(route[1]); until("window.qaSecondary.done");
                    assertEquals("The real reading trace completes without fake events or guessed scheduling", "null", js("window.qaSecondary.error"));
                    assertEquals("Retained reopening keeps the actual running Animation, bookmark, AX and focus", "true", js("(()=>{const q=window.qaSecondary;if(q.reduced)return q.frames.length===24&&q.terminal.running===0;const a=q.beforeReopen,b=q.reopened,c=q.closed;return q.sameAnimation&&q.sameOriginalTime&&a.running===1&&b.running===1&&q.openAt-q.closedAt<170&&c.phase==='closing'&&c.inert&&c.hidden==='true'&&c.role===null&&c.modal===null&&q.closedFocus.focusReturned&&!q.closedFocus.focusInside&&b.phase==='open'&&!b.inert&&b.hidden!=='true'&&b.role==='dialog'&&b.modal==='true'&&b.focusInside&&b.sameBody&&b.sameCard&&b.sameLayer&&b.sameScroll&&!b.entryMarker&&b.page===q.first.page&&b.title===q.first.title&&q.bookmark>0&&Math.abs(b.scroll-q.bookmark)<=1&&Math.abs(a.opacity-b.opacity)<=.02&&a.matrix.every((v,i)=>Math.abs(v-b.matrix[i])<=(i<4?.002:1))&&Math.abs(a.outerOpacity-b.outerOpacity)<=.02&&a.outerMatrix.every((v,i)=>Math.abs(v-b.outerMatrix[i])<=(i<4?.002:1))})()"));
                    assertEquals("Twenty-four real frames plus natural completion leave a usable reading surface", "true", js("(()=>{const q=window.qaSecondary,t=q.terminal;return q.frames.length===24&&(q.reduced||q.finished&&q.finishError===null)&&t.opacity>=.999&&t.matrix.every((v,i)=>Math.abs(v-([1,0,0,1,0,0][i]))<.001)&&t.running===0&&t.closeSize[0]>=44&&t.closeSize[1]>=44&&t.closeHit&&(q.reduced||Math.abs(t.scroll-q.bookmark)<=1)&&(q.kind!=='info'||q.first.scroll===window.qaSecondaryLogBookmark)})()"));
                    if (party == 2) screenshot("secondary-reading-native-" + route[0]);
                    InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                    if (route[0].equals("info")) until("!document.querySelector('.info-drawer-react').hasAttribute('data-ui-phase')&&document.querySelector('.info-drawer-react').inert&&document.activeElement===document.querySelector('.drawer-tab')");
                    else until("!document.querySelector(" + JSONObject.quote(route[4]) + ")&&!window.qaSecondaryBody.isConnected&&document.activeElement===document.querySelector(" + JSONObject.quote(route[2]) + ")");
                    js("window.qaSecondary.completeClose={source:'native system Back',at:performance.now(),bodyConnected:window.qaSecondaryBody.isConnected,focusReturned:document.activeElement===document.querySelector(" + JSONObject.quote(route[2]) + "),parentDrawerOpen:document.querySelector('.info-drawer-react')?.getAttribute('role')==='dialog'}");
                    String[] freshRoute = route.clone(); freshRoute[1] = route[2]; if (route[0].equals("info")) freshRoute[6] = ".case-board-workspace";
                    watchSecondaryReading(freshRoute, true); nativeTap(freshRoute[1]); until("window.qaSecondary.done");
                    assertEquals("Complete exit creates a new authored reading session and actual first-entry frames", "true", js("(()=>{const q=window.qaSecondary;return q.error===null&&q.changedBody&&q.frames.length===24&&q.first.scroll===0&&(q.reduced||q.originalAnimation?.duration===190&&q.frames.some(f=>f.progress>0&&f.progress<1&&f.opacity>.001&&f.opacity<.999)&&q.finished&&q.finishError===null)&&q.terminal.opacity>=.999&&q.terminal.running===0&&(q.kind!=='info'||q.terminal.page.includes('board-page'))})()"));
                    InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                    until("!document.querySelector(" + JSONObject.quote(route[4]) + ")?.hasAttribute('role')&&!document.querySelector(" + JSONObject.quote(route[3]) + ")?.hasAttribute('data-ui-phase')");
                    js("window.qaSecondary.freshClose={source:'native system Back',at:performance.now(),focusReturned:document.activeElement===document.querySelector(" + JSONObject.quote(route[2]) + ")}");
                    assertEquals("The fresh native visit returns to its actual opener", "true", js("window.qaSecondary.freshClose.focusReturned"));
                    if (route[0].equals("case")) { InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK); until("!document.querySelector('.info-drawer-react').hasAttribute('data-ui-phase')"); }
                }
                js("window.qaSecondaryGameAfter={draft:document.querySelector('.dock-input').value,actor:document.querySelector('.dock-input').getAttribute('aria-label'),party:Array.from(document.querySelectorAll('.party-compact strong'),e=>e.textContent),world:document.querySelector('.brand-scene').textContent+document.querySelector('.world-time').textContent,messages:document.querySelectorAll('.story-message.player').length}");
                assertEquals("Reading does not mutate the action, actor, party, world or submitted messages", "true", js("JSON.stringify(window.qaSecondaryGameBefore)===JSON.stringify(window.qaSecondaryGameAfter)"));
                assertEquals("Reading never calls any model endpoint", 0, modelCalls.get()); awaitSettledIme(false); assertNoResizeErrors();
                System.out.println("SECONDARY_READING_NATIVE: " + js("JSON.stringify({party:" + party + ",frames:window.qaSecondaryRecords.filter(q=>!q.cold).map(q=>({kind:q.kind,frames:q.frames.length,sameAnimation:q.sameAnimation??null,bookmark:q.bookmark??null,reduced:q.reduced})),modelCalls:0})"));
            } finally {
                try { if (activity != null) {
                        js("window.qaSecondaryCleanup?.()");
                        savePanelMotionTrace("secondary-reading-native-party-" + party, "({completed:window.qaSecondaryRecords??[],current:window.qaSecondary??null,nativeContext:{native:Capacitor.isNativePlatform(),platform:Capacitor.getPlatform()},viewport:{width:innerWidth,height:innerHeight,scope:'fixed WebView CSS pixels'},gameBefore:window.qaSecondaryGameBefore??null,gameAfter:window.qaSecondaryGameAfter??null,imeVisible:" + imeVisible() + ",modelCalls:" + modelCalls.get() + "})");
                    }
                } finally { try { if (activity != null) activity.close(); } finally { server.shutdown(); } }
            }
        }
    }

    private void watchNativeDossierReopen() throws Exception {
        js("(()=>{window.qaDossierReopenCleanup?.();const sheet=document.querySelector('.investigator-sheet'),body=document.querySelector('.investigator-body'),layer=sheet.closest('[data-ui-phase]');"
                + "const q=window.qaDossierReopen={source:'native Back then button click',done:false,error:null};let timer,changed;"
                + "const read=()=>{const s=getComputedStyle(body);return{tab:sheet.querySelector('[role=tab][aria-selected=true]').textContent,scroll:body.scrollTop,opacity:Number(s.opacity),transform:s.transform,running:body.getAnimations().filter(a=>a.playState==='running').length}};q.before=read();"
                + "const observer=new MutationObserver(()=>{if(layer.dataset.uiPhase!=='closing'||sheet.getAttribute('role')==='dialog')return;observer.disconnect();q.closedAt=performance.now();"
                + "q.closed={phase:layer.dataset.uiPhase,inert:layer.inert,hidden:layer.getAttribute('aria-hidden'),role:sheet.getAttribute('role')};"
                + "timer=setTimeout(()=>{q.reopenAt=performance.now();q.retainedBeforeClick=sheet.isConnected&&body.isConnected;q.focusReturned=document.activeElement===document.querySelector('.dock-actor-avatar');"
                + "changed=new MutationObserver(()=>{if(layer.dataset.uiPhase!=='open'||sheet.getAttribute('role')!=='dialog')return;changed.disconnect();clearTimeout(deadline);q.openAt=performance.now();q.sameSheet=sheet===document.querySelector('.investigator-sheet');q.sameBody=body===document.querySelector('.investigator-body');q.after=read();q.done=true});"
                + "changed.observe(layer,{attributes:true,attributeFilter:['data-ui-phase'],subtree:true});document.querySelector('.dock-actor-avatar').click();},35);});"
                + "observer.observe(layer,{attributes:true,attributeFilter:['data-ui-phase'],subtree:true});const deadline=setTimeout(()=>{q.error='Native closing/reopen phase missing';q.done=true;observer.disconnect();changed?.disconnect();clearTimeout(timer)},2000);"
                + "window.qaDossierReopenCleanup=()=>{observer.disconnect();changed?.disconnect();clearTimeout(timer);clearTimeout(deadline)};})()");
    }

    private void runQuickDossierPageChanges(int party) throws Exception {
        js("(()=>{const party=" + party + ",sheet=document.querySelector('.investigator-sheet'),body=document.querySelector('.investigator-body'),names=Array.from(document.querySelectorAll('.party-compact strong'),e=>e.textContent);"
                + "const q=window.qaDossierPages={source:'real button clicks inside installed WebView',steps:[],frames:[],done:false,error:null,reduced:matchMedia('(prefers-reduced-motion:reduce)').matches};"
                + "const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),raf=()=>new Promise(resolve=>requestAnimationFrame(resolve));"
                + "const take=()=>{const s=getComputedStyle(body),m=new DOMMatrixReadOnly(s.transform==='none'||!s.transform?undefined:s.transform);return{at:performance.now(),sameSheet:sheet===document.querySelector('.investigator-sheet'),sameBody:body===document.querySelector('.investigator-body'),member:sheet.querySelector('.investigator-identity h2').textContent,tab:sheet.querySelector('[role=tab][aria-selected=true]').textContent,scroll:body.scrollTop,opacity:Number(s.opacity),matrix:[m.a,m.b,m.c,m.d,m.e,m.f],animations:body.getAnimations().filter(a=>a.playState==='running').map(a=>({duration:a.effect.getTiming().duration,progress:a.effect.getComputedTiming().progress})),role:sheet.getAttribute('role'),inert:sheet.closest('[data-ui-phase]').inert}};"
                + "const change=async(selector,member,tab)=>{const before=take(),label=tab==='skills'?'技能':'随身与背景',expectedScroll=window.qaDossierPositions[member+':'+tab];"
                + "const committed=new Promise((resolve,reject)=>{const observer=new MutationObserver(()=>{if(sheet.querySelector('.investigator-identity h2').textContent!==names[member]||sheet.querySelector('[role=tab][aria-selected=true]').textContent!==label)return;observer.disconnect();clearTimeout(timer);resolve()});"
                + "observer.observe(sheet,{childList:true,attributes:true,subtree:true,attributeFilter:['aria-selected','aria-pressed']});const timer=setTimeout(()=>{observer.disconnect();reject(new Error('Missing dossier page '+member+':'+tab))},2000)});"
                + "document.querySelector(selector).click();await committed;q.steps.push({expectedMember:names[member],expectedTab:label,expectedScroll,before,after:take()});await raf();await wait(35)};"
                + "(async()=>{for(let member=0;member<party;member++){if(member>0)await change('.investigator-party button:nth-child('+(member+1)+')',member,'background');"
                + "await change('.investigator-tabs button:nth-child(2)',member,'skills');await change('.investigator-tabs button:nth-child(3)',member,'background')}"
                + "if(party>1)await change('.investigator-party button:first-child',0,'background');await change('.investigator-tabs button:nth-child(2)',0,'skills');"
                + "for(let i=0;i<24;i++){await raf();q.frames.push(take())}await Promise.all(body.getAnimations().filter(a=>a.playState==='running'&&Number.isFinite(a.effect?.getTiming().iterations??1)).map(a=>a.finished.catch(()=>{})));q.terminal=take();q.done=true;})().catch(error=>{q.error=String(error);q.done=true});})()");
    }

    @Test public void investigatorReadingSurvivesQuickReopenAndPageChanges() throws Exception {
        for (int party : new int[]{1, 2, 4}) {
            fresh();
            try {
                viewport(390, 844); click("开始游戏");
                for (int i = 1; i < party; i++) js("document.querySelectorAll('.preset-selection-input')[" + i + "].click()");
                until("document.querySelectorAll('.preset-selection-input:checked').length===" + party);
                click("进入游戏"); fill(".dock-input", "先核对技能与装备\n再向委托人询问经过。"); menu("返回首页");
                js("window.qaDossierFixtureReady=false;window.qaDossierFixtureError=null;Capacitor.Plugins.GameStorage.readAll().then(async({values})=>{const record=JSON.parse(values['trpg-android-session-v1']);"
                        + "record.state.players.forEach((p,i)=>{p.background={...p.background,story:('调查员'+(i+1)+'把来访时间、门廊痕迹与携带装备逐项记在调查本上。'+String.fromCharCode(10)).repeat(60)}});"
                        + "await Capacitor.Plugins.GameStorage.write({key:'trpg-android-session-v1',value:JSON.stringify(record)});window.qaDossierFixtureReady=true;}).catch(error=>{window.qaDossierFixtureError=String(error);window.qaDossierFixtureReady=true})");
                until("window.qaDossierFixtureReady"); assertEquals("Native reading fixture is saved through the encrypted checkpoint", "null", js("window.qaDossierFixtureError"));
                activity.recreate(); until("document.querySelector('.title-resume-preview')"); watchResizeErrors(); viewport(390, 844); click("继续游戏");
                assertEquals("The reading scenario starts with the complete restored multiline action", JSONObject.quote("先核对技能与装备\n再向委托人询问经过。"), js("document.querySelector('.dock-input').value"));
                js("window.qaDossierGameBefore={draft:document.querySelector('.dock-input').value,actor:document.querySelector('.dock-input').getAttribute('aria-label'),party:Array.from(document.querySelectorAll('.party-compact strong'),e=>e.textContent),messages:document.querySelectorAll('.story-message.player').length};window.qaDossierPositions={}");
                nativeTap(".dock-actor-avatar"); until("document.querySelector('.investigator-sheet[role=dialog]')");
                nativeTap(".investigator-tabs button:nth-child(2)"); until("document.querySelector('.investigator-skills')"); awaitUiMotion();
                js("(()=>{const b=document.querySelector('.investigator-body');b.scrollTop=Math.round((b.scrollHeight-b.clientHeight)*.35)})()");
                String firstSkillPosition = awaitSettledScroll(".investigator-body");
                assertTrue("A real skill list provides a nonzero reading bookmark", Double.parseDouble(firstSkillPosition) > 100);
                if (!"true".equals(js("matchMedia('(prefers-reduced-motion:reduce)').matches"))) {
                    watchNativeDossierReopen();
                    InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                    until("window.qaDossierReopen.done");
                    assertEquals("Native closing/reopen phase is observed without artificial key events", "null", js("window.qaDossierReopen.error"));
                    assertEquals("Native Back reaches logical closing before a genuinely quick retained reopen", "true", js("(()=>{const q=window.qaDossierReopen;return q.closed.phase==='closing'&&q.closed.inert&&q.closed.hidden==='true'&&q.closed.role===null&&q.reopenAt-q.closedAt>=30&&q.openAt-q.closedAt<170&&q.retainedBeforeClick&&q.focusReturned&&q.sameSheet&&q.sameBody})()"));
                    assertEquals("Quick reopening keeps the same skill page, exact bookmark and current body pose", "true", js("(()=>{const q=window.qaDossierReopen;return q.after.tab==='技能'&&q.after.tab===q.before.tab&&Math.abs(q.after.scroll-q.before.scroll)<=1&&Math.abs(q.after.opacity-q.before.opacity)<=.01&&q.after.transform===q.before.transform&&q.after.running===q.before.running})()"));
                } else {
                    InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK); until("!document.querySelector('.investigator-sheet')");
                    nativeTap(".dock-actor-avatar"); until("document.querySelector('.investigator-sheet[role=dialog]')");
                    assertEquals("The actual reduced-motion preference closes immediately into a new reading session", "true", js("document.querySelector('.investigator-tabs [aria-selected=true]').textContent==='属性'&&document.querySelector('.investigator-body').scrollTop===0&&document.querySelector('.investigator-body').getAnimations().length===0"));
                    js("window.qaDossierReopen={source:'native Back and native reopen with actual reduced motion',sameBody:false}");
                }
                until("document.querySelector('.investigator-sheet').contains(document.activeElement)"); awaitUiMotion();
                for (int member = 0; member < party; member++) {
                    if (party > 1) {
                        nativeTap(".investigator-party button:nth-child(" + (member + 1) + ")");
                        until("document.querySelectorAll('.investigator-party button')[" + member + "].getAttribute('aria-pressed')==='true'");
                    }
                    for (int tab = 2; tab <= 3; tab++) {
                        nativeTap(".investigator-tabs button:nth-child(" + tab + ")");
                        until("document.querySelectorAll('.investigator-tabs button')[" + (tab - 1) + "].getAttribute('aria-selected')==='true'"); awaitUiMotion();
                        double fraction = tab == 2 ? .25 + member * .12 : .7 - member * .1;
                        js("(()=>{const b=document.querySelector('.investigator-body');b.scrollTop=Math.round((b.scrollHeight-b.clientHeight)*" + fraction + ")})()");
                        String position = awaitSettledScroll(".investigator-body");
                        assertTrue("Each member and page has a real nonzero bookmark", Double.parseDouble(position) > 100);
                        js("window.qaDossierPositions['" + member + ":" + (tab == 2 ? "skills" : "background") + "']=" + position);
                    }
                }
                if (party > 1) {
                    nativeTap(".investigator-party button:first-child"); until("document.querySelector('.investigator-party button:first-child').getAttribute('aria-pressed')==='true'");
                }
                awaitUiMotion();
                runQuickDossierPageChanges(party); until("window.qaDossierPages.done");
                assertEquals("Rapid page changes complete through real buttons", "null", js("window.qaDossierPages.error"));
                assertEquals("Every visited player and page keeps its own bookmark in the same usable surface", "true", js("window.qaDossierPages.steps.every(s=>s.after.sameSheet&&s.after.sameBody&&s.after.member===s.expectedMember&&s.after.tab===s.expectedTab&&Math.abs(s.after.scroll-s.expectedScroll)<=1&&s.after.role==='dialog'&&!s.after.inert)"));
                assertEquals("An interrupted reading effect continues its current opacity and transform", "true", js("(()=>{const q=window.qaDossierPages,r=q.steps.filter(s=>s.before.animations.length);return q.reduced?q.steps.every(s=>s.after.animations.length===0):r.length>=2&&r.every(s=>Math.abs(s.before.opacity-s.after.opacity)<=.02&&s.before.matrix.every((v,i)=>Math.abs(v-s.after.matrix[i])<=(i<4?.002:1))&&s.after.animations.length===1&&s.after.animations[0].duration===190)})()"));
                assertEquals("Twenty-four real frames are retained and natural completion leaves the reading surface fully visible", "true", js("(()=>{const q=window.qaDossierPages,f=q.terminal;return q.frames.length===24&&f.opacity>=.999&&f.animations.length===0&&f.matrix.every((v,i)=>Math.abs(v-([1,0,0,1,0,0][i]))<.001)&&Math.abs(f.scroll-window.qaDossierPositions['0:skills'])<=1})()"));
                js("window.qaDossierOldSheet=document.querySelector('.investigator-sheet');window.qaDossierOldBody=document.querySelector('.investigator-body')");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                until("!document.querySelector('.investigator-sheet')&&!window.qaDossierOldSheet.isConnected&&!window.qaDossierOldBody.isConnected");
                assertEquals("Complete native close restores the avatar without opening the keyboard", "true", js("document.activeElement===document.querySelector('.dock-actor-avatar')")); awaitSettledIme(false);
                nativeTap(".dock-actor-avatar"); until("document.querySelector('.investigator-sheet[role=dialog]')");
                assertEquals("A fully ended session creates a fresh attribute page at the beginning", "true", js("window.qaDossierOldSheet!==document.querySelector('.investigator-sheet')&&window.qaDossierOldBody!==document.querySelector('.investigator-body')&&document.querySelector('.investigator-tabs [aria-selected=true]').textContent==='属性'&&document.querySelector('.investigator-body').scrollTop===0"));
                nativeTap(".investigator-tabs button:nth-child(2)"); awaitUiMotion();
                assertEquals("The previous session's skill bookmark is cleared", "0", js("document.querySelector('.investigator-body').scrollTop"));
                nativeTap(".investigator-tabs button:nth-child(3)"); awaitUiMotion();
                assertEquals("The previous session's background bookmark is cleared", "0", js("document.querySelector('.investigator-body').scrollTop"));
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK); until("!document.querySelector('.investigator-sheet')");
                assertEquals("Reading never changes the multiline action, acting investigator or chosen party", "true", js("(()=>{const q=window.qaDossierGameBefore;return document.querySelector('.dock-input').value===q.draft&&document.querySelector('.dock-input').getAttribute('aria-label')===q.actor&&JSON.stringify(Array.from(document.querySelectorAll('.party-compact strong'),e=>e.textContent))===JSON.stringify(q.party)&&document.querySelectorAll('.story-message.player').length===q.messages})()"));
                awaitSettledIme(false); assertNoResizeErrors();
                System.out.println("DOSSIER_READING_NATIVE: " + js("JSON.stringify({party:" + party + ",nativeBack:true,reopenSource:window.qaDossierReopen.source,reopenMs:window.qaDossierReopen.openAt-window.qaDossierReopen.closedAt,sameBody:window.qaDossierReopen.sameBody,rapidSource:window.qaDossierPages.source,pageSteps:window.qaDossierPages.steps.length,interrupted:window.qaDossierPages.steps.filter(s=>s.before.animations.length).length,bookmarks:window.qaDossierPositions})"));
                if (party == 2) screenshot("dossier-reading-native-return");
            } finally {
                if (activity != null) {
                    try {
                        js("window.qaDossierReopenCleanup?.()");
                        savePanelMotionTrace("dossier-reading-native-party-" + party, "({reopen:window.qaDossierReopen??null,pages:window.qaDossierPages??null,bookmarks:window.qaDossierPositions??null})");
                    } finally { activity.close(); }
                }
            }
        }
    }

    private void watchPassiveNotice(String expected, boolean resumeDuringExit, String source) throws Exception {
        js("(()=>{window.qaNoticeCleanup?.();if(window.qaNotice)(window.qaNoticeRecords??=[]).push(window.qaNotice);const root=document.querySelector('.game-notice');"
                + "const q=window.qaNotice={source:" + JSONObject.quote(source) + ",expected:" + JSONObject.quote(expected) + ",rapid:" + resumeDuringExit + ",reduced:matchMedia('(prefers-reduced-motion:reduce)').matches,entryFrames:[],exitFrames:[],finalExitFrames:[],events:[],done:false,error:null};let node,phase,timer,firstExitDone=false,finalExitDone=false,entryDone=false;"
                + "const pose=()=>{if(!node?.isConnected)return{at:performance.now(),connected:false};const s=getComputedStyle(node),r=node.getBoundingClientRect();return{at:performance.now(),connected:true,opacity:Number(s.opacity),transform:s.transform,phase:node.dataset.uiPhase,inert:node.inert,hidden:node.getAttribute('aria-hidden'),font:parseFloat(s.fontSize),frame:s.borderImageSource,animation:s.animationName,transition:s.transitionDuration,rect:{x:r.x,y:r.y,width:r.width,height:r.height},passive:getComputedStyle(root).pointerEvents==='none',focusInside:root.contains(document.activeElement)}};"
                + "const logical=()=>({phase:node.dataset.uiPhase,inert:node.inert,hidden:node.getAttribute('aria-hidden'),rootRole:root.getAttribute('role'),live:root.getAttribute('aria-live'),atomic:root.getAttribute('aria-atomic'),rootHidden:root.getAttribute('aria-hidden'),text:node.textContent,focusInside:root.contains(document.activeElement),regions:document.querySelectorAll('.game-notice[role=status]').length});"
                + "const raf=()=>new Promise(resolve=>requestAnimationFrame(resolve)),complete=()=>{if(q.removedAt&&entryDone&&(q.rapid?finalExitDone:firstExitDone)){q.terminal=pose();q.rootEmpty=root.childElementCount===0;q.done=true;clearTimeout(deadline)}};"
                + "const sample=async(name)=>{const finishing=Promise.all(node.getAnimations().filter(a=>a.playState==='running'&&Number.isFinite(a.effect?.getTiming().iterations??1)).map(a=>a.finished.catch(()=>{})));for(let i=0;i<24;i++){await raf();q[name].push(pose())}await finishing;return pose()};"
                + "const transition=e=>{if(e.target===node)q.events.push({type:e.type,property:e.propertyName,at:performance.now()})};"
                + "const observer=new MutationObserver(()=>{const current=root.querySelector('.toast');if(!node&&current?.textContent===q.expected){node=current;phase='open';q.openAt=performance.now();q.opened=logical();q.first=pose();node.addEventListener('transitionrun',transition);node.addEventListener('transitionend',transition);"
                + "void sample('entryFrames').then(last=>{q.entryTerminal=last;entryDone=true;complete()}).catch(error=>{q.error=String(error);q.done=true})}"
                + "if(!node)return;const now=current?.dataset.uiPhase??(node.dataset.uiPhase==='closing'?'closing':undefined);if(now==='closing'&&phase!=='closing'){phase='closing';const again=!!q.reopenedAt;if(!again){q.closedAt=performance.now();q.closed=logical()}else{q.finalClosedAt=performance.now();q.finalClosed=logical()}"
                + "void sample(again?'finalExitFrames':'exitFrames').then(()=>{if(again)finalExitDone=true;else firstExitDone=true;complete()}).catch(error=>{q.error=String(error);q.done=true});"
                + "if(q.rapid&&!again){let attempts=0;const seek=()=>{const p=pose();if(q.reduced||(p.connected&&p.opacity>.001&&p.opacity<.999)){q.publishedClosingPose=p;q.triggerAt=performance.now();q.beforeReopen=pose();const save=document.querySelector('.game-menu[role=dialog] .menu-list button:first-child');if(!save){q.error='Prepared real Save action missing';q.done=true;return}save.click()}else if(++attempts<12&&p.connected)requestAnimationFrame(seek);else{q.error='No real intermediate exit frame';q.done=true}};requestAnimationFrame(seek)}}"
                + "if(q.rapid&&q.closedAt&&now==='open'&&phase==='closing'){phase='open';q.reopenedAt=performance.now();q.sameNode=current===node;q.reopened=logical();q.afterReopen=pose();q.entryMarker=node.hasAttribute('data-ui-enter')}"
                + "if(!current&&node&&!q.removedAt){q.removedAt=performance.now();complete()}});observer.observe(root,{childList:true,attributes:true,subtree:true,attributeFilter:['data-ui-phase','aria-hidden','inert']});"
                + "const deadline=setTimeout(()=>{q.error='Natural notification lifecycle did not finish';q.done=true},14000);window.qaNoticeCleanup=()=>{observer.disconnect();node?.removeEventListener('transitionrun',transition);node?.removeEventListener('transitionend',transition);clearTimeout(timer);clearTimeout(deadline)};})()");
    }

    private void assertPassiveNotice() throws Exception {
        until("window.qaNotice.done"); assertEquals("Native notification finishes through its real timer and transitions", "null", js("window.qaNotice.error"));
        assertEquals("The same passive live region exposes only current feedback, then releases it from accessibility immediately", "true", js("(()=>{const q=window.qaNotice,o=q.opened,c=q.closed;return o.regions===1&&o.rootRole==='status'&&o.live==='polite'&&o.atomic==='true'&&!o.rootHidden&&!o.inert&&o.text===q.expected&&!o.focusInside&&c.inert&&c.hidden==='true'&&!c.rootHidden&&c.regions===1&&!c.focusInside&&q.rootEmpty&&!q.terminal.connected})()"));
        assertEquals("Painted feedback is readable inside the real viewport and never owns focus or input", "true", js("(()=>{const q=window.qaNotice;return q.entryFrames.length===24&&q.exitFrames.length===24&&q.entryFrames.filter(f=>f.connected).every(f=>f.font>=15&&f.frame.includes('panel-frame')&&f.animation==='none'&&f.passive&&!f.focusInside&&f.rect.x>=0&&f.rect.y>=0&&f.rect.x+f.rect.width<=innerWidth+.5&&f.rect.y+f.rect.height<=innerHeight+.5)})()"));
        assertEquals("Short feedback retains its logical timeout and produces real entry and exit frames", "true", js("(()=>{const q=window.qaNotice;return q.closedAt-q.openAt>=1700&&q.closedAt-q.openAt<3000&&(q.reduced?q.entryFrames.every(f=>!f.connected||f.opacity===1):q.entryFrames.some(f=>f.connected&&f.opacity>.001&&f.opacity<.999)&&q.exitFrames.some(f=>f.connected&&f.opacity>.001&&f.opacity<.999)&&q.events.some(e=>e.type==='transitionrun'&&e.property==='opacity'))})()"));
        if ("true".equals(js("window.qaNotice.rapid"))) {
            assertEquals("A real Save action resumes the retained toast and its old retirement never removes the new feedback", "true", js("(()=>{const q=window.qaNotice;return q.sameNode&&!q.entryMarker&&q.reopened.regions===1&&!q.reopened.inert&&!q.reopened.hidden&&!q.reopened.focusInside&&q.reopened.text===q.expected&&q.reopenedAt-q.closedAt<170&&q.finalExitFrames.length===24&&q.finalClosedAt-q.reopenedAt>=1700&&(q.reduced||q.beforeReopen.connected&&q.beforeReopen.opacity>.001&&q.beforeReopen.opacity<.999&&q.afterReopen.opacity>.001&&q.afterReopen.opacity<.999)})()"));
        }
    }

    @Test public void passiveFeedbackKeepsNativeHomeAndGameResponsive() throws Exception {
        AtomicInteger modelCalls = new AtomicInteger(); MockWebServer server = new MockWebServer();
        server.setDispatcher(new Dispatcher() { @Override public MockResponse dispatch(RecordedRequest request) { modelCalls.incrementAndGet(); return new MockResponse().setResponseCode(503); } }); server.start();
        try {
            for (int party : new int[]{1, 2, 4}) {
                fresh();
                try {
                    viewport(390, 844); nativeTap(".title-settings"); until("document.querySelector('#api-provider')");
                    fill("#api-provider", "custom"); until("document.querySelector('.api-connection-toggle').getAttribute('aria-expanded')==='true'");
                    fill("#api-protocol", "chat-completions"); fill("#api-endpoint", server.url("/v1").toString()); fill("#api-key", "android-notice-qa-only-token"); fill("#api-model", "android-notice-qa-model");
                    watchPassiveNotice("AI 设置已保存", false, "real native home AI settings Save"); nativeTap(".api-config-card footer .primary-btn"); assertPassiveNotice();
                    assertEquals("The home live region remains available after the visible text expires", "true", js("document.querySelector('.title-screen')&&document.querySelectorAll('.game-notice[role=status]').length===1&&!document.querySelector('.toast')"));
                    // A second real save immediately leaves home; this is a new screen, not a retained notice session.
                    nativeTap(".title-settings"); nativeTap(".api-config-card footer .primary-btn"); until("document.querySelector('.game-notice .toast[data-ui-phase=open]')"); nativeTap(".title-new");
                    until("document.querySelector('.setup-screen')"); assertEquals("Entering selection removes the previous screen's feedback picture immediately", "false", js("!!document.querySelector('.toast')"));
                    InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK); until("document.querySelector('.title-screen')");
                    assertEquals("Cancelling selection never replays the old home save feedback", "false", js("!!document.querySelector('.toast')"));
                    nativeTap(".title-new"); for (int i = 1; i < party; i++) js("document.querySelectorAll('.preset-selection-input')[" + i + "].click()");
                    until("document.querySelectorAll('.preset-selection-input:checked').length===" + party); click("进入游戏"); fill(".dock-input", "先记录日期\n再检查门廊，不提交行动。");
                    awaitUiMotion(); awaitSettledScroll(".narrative-scroll");
                    js("window.qaNoticeGameBefore={draft:document.querySelector('.dock-input').value,actor:document.querySelector('.dock-input').getAttribute('aria-label'),party:Array.from(document.querySelectorAll('.party-compact strong'),e=>e.textContent),scroll:document.querySelector('.narrative-scroll').scrollTop,height:document.querySelector('.narrative-scroll').clientHeight,messages:document.querySelectorAll('.story-message.player').length};window.qaNoticeRecords??=[]");
                    boolean resumeTail = !"true".equals(js("matchMedia('(prefers-reduced-motion:reduce)').matches"));
                    nativeTap(".menu-button"); watchPassiveNotice("已保存", resumeTail, "first native Save; with actual motion preference the tail resumes through the prepared real Save button handler"); nativeTap(".game-menu[role=dialog] .menu-list button:first-child");
                    until("document.querySelector('.toast[data-ui-phase=open]')");
                    if (resumeTail) { nativeTap(".menu-button"); until("document.querySelector('.game-menu[role=dialog]')"); }
                    assertPassiveNotice();
                    assertEquals("Feedback and its rapid resumption preserve the acting investigator, party, draft and reading geometry", "true", js("(()=>{const q=window.qaNoticeGameBefore,s=document.querySelector('.narrative-scroll');return document.querySelector('.dock-input').value===q.draft&&document.querySelector('.dock-input').getAttribute('aria-label')===q.actor&&JSON.stringify(Array.from(document.querySelectorAll('.party-compact strong'),e=>e.textContent))===JSON.stringify(q.party)&&Math.abs(s.scrollTop-q.scroll)<=1&&s.clientHeight===q.height&&document.querySelectorAll('.story-message.player').length===q.messages})()"));
                    activity.onActivity(a -> { WebView web=a.getBridge().getWebView(); ViewGroup.LayoutParams params=web.getLayoutParams(); params.height=ViewGroup.LayoutParams.MATCH_PARENT; web.setLayoutParams(params); });
                    awaitUiMotion(); awaitSettledScroll(".narrative-scroll"); String availableHeight=js("innerHeight"); nativeTap(".dock-input"); awaitSettledIme(true); until("innerHeight<" + availableHeight);
                    String imeHeight=js("innerHeight"); InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK); awaitSettledIme(false);
                    viewport(320, 300); js("window.qaNoticeShortBefore={scroll:document.querySelector('.narrative-scroll').scrollTop,height:document.querySelector('.narrative-scroll').clientHeight};window.qaNoticeIme={mode:'actual available native height and real IME, followed by separately fixed 320x300 WebView',availableHeight:" + availableHeight + ",imeHeight:" + imeHeight + ",fixedWidth:innerWidth,fixedHeight:innerHeight}");
                    nativeTap(".menu-button"); watchPassiveNotice("已保存", false, "real native Save in separately fixed 320x300 WebView after actual IME dismissal"); nativeTap(".game-menu[role=dialog] .menu-list button:first-child");
                    until("document.querySelector('.toast[data-ui-phase=open]')"); readableGameNotice(); if (party == 2) screenshot("passive-feedback-native-short"); assertPassiveNotice();
                    assertEquals("The short-window feedback leaves the full action and reader unchanged", "true", js("(()=>{const q=window.qaNoticeGameBefore,s=window.qaNoticeShortBefore,r=document.querySelector('.narrative-scroll');return document.querySelector('.dock-input').value===q.draft&&document.querySelector('.dock-input').getAttribute('aria-label')===q.actor&&document.querySelectorAll('.party-compact').length===q.party.length&&Math.abs(r.scrollTop-s.scroll)<=1&&r.clientHeight===s.height&&!document.querySelector('.thinking-line')})()"));
                    menu("返回首页"); until("document.querySelector('.title-screen')"); assertEquals("Screen navigation cannot carry the previous picture into the home screen", "false", js("!!document.querySelector('.toast')"));
                    awaitSettledIme(false); assertNoResizeErrors(); assertEquals("Notification QA never calls a player or test model", 0, modelCalls.get());
                    System.out.println("PASSIVE_FEEDBACK_NATIVE: " + js("JSON.stringify({party:" + party + ",entryFrames:window.qaNotice.entryFrames.length,exitFrames:window.qaNotice.exitFrames.length,homeAndGame:true,ime:window.qaNoticeIme,modelCalls:0})"));
                } finally {
                    if (activity != null) { try { js("window.qaNoticeCleanup?.()"); savePanelMotionTrace("passive-feedback-native-party-" + party, "({completed:window.qaNoticeRecords??[],current:window.qaNotice??null,ime:window.qaNoticeIme??null})"); } finally { activity.close(); } }
                }
            }
        } finally { server.shutdown(); }
    }

    private void watchSaveConfirmation(String selector, boolean opening, boolean rapidCancel, String source) throws Exception {
        js("(()=>{window.qaSaveConfirmationCleanup?.();if(window.qaSaveConfirmation)(window.qaSaveConfirmationRecords??=[]).push(window.qaSaveConfirmation);"
                + "const row=document.querySelector(" + JSONObject.quote(selector) + "),list=row.closest('.save-list'),motion=row.querySelector('.disclosure-motion'),actions=row.querySelector('.save-slot-actions'),next=row.nextElementSibling;"
                + "const q=window.qaSaveConfirmation={source:" + JSONObject.quote(source) + ",opening:" + opening + ",rapid:" + rapidCancel + ",frames:[],events:[],done:false,error:null,reduced:matchMedia('(prefers-reduced-motion:reduce)').matches};"
                + "const take=()=>{const r=row.getBoundingClientRect(),l=list.getBoundingClientRect(),a=actions.getBoundingClientRect(),s=getComputedStyle(motion);return{at:performance.now(),height:motion.getBoundingClientRect().height,rowHeight:r.height,actionHeight:a.height,nextTop:next?next.getBoundingClientRect().top-l.top+list.scrollTop:null,rowTop:r.top-l.top+list.scrollTop,scroll:list.scrollTop,opacity:Number(s.opacity),phase:motion.dataset.uiPhase,inert:motion.inert,hidden:motion.getAttribute('aria-hidden'),sameRow:row===document.querySelector(" + JSONObject.quote(selector) + "),sameActions:actions===row.querySelector('.save-slot-actions'),animation:getComputedStyle(row.querySelector('.save-delete-confirmation')).animationName,running:motion.getAnimations().filter(a=>a.playState==='running').map(a=>({property:a.transitionProperty,duration:a.effect.getTiming().duration}))}};"
                + "const logical=()=>({phase:motion.dataset.uiPhase,inert:motion.inert,hidden:motion.getAttribute('aria-hidden'),role:document.querySelector('.save-manager-card').getAttribute('role'),safeFocus:document.activeElement===row.querySelector('.save-slot-actions button:first-child'),deleteFocus:document.activeElement===row.querySelector('[data-action=delete]'),confirmCount:document.querySelectorAll('.save-slot-actions.confirming .danger').length,enabled:Array.from(row.querySelectorAll('.save-slot-actions button')).every(b=>!b.disabled)});q.before=take();q.intrinsic=motion.firstElementChild.scrollHeight;"
                + "const raf=()=>new Promise(resolve=>requestAnimationFrame(resolve));let started=false;"
                + "const finish=async()=>{try{for(let i=0;i<24;i++){await raf();const current=take();q.frames.push(current);if(q.rapid&&!q.cancelAt&&(q.reduced||current.height>1&&current.height<q.intrinsic-1&&current.running.some(a=>a.property==='grid-template-rows'))){q.cancelAt=performance.now();q.reversalBefore=current;const keep=row.querySelector('.save-slot-actions.confirming button:first-child');if(!keep)throw new Error('Current safe choice missing');keep.click()}}if(q.rapid&&!q.cancelAt)throw new Error('No actual running prompt frame for reversal');await Promise.all(motion.getAnimations().filter(a=>a.playState==='running'&&Number.isFinite(a.effect?.getTiming().iterations??1)).map(a=>a.finished.catch(()=>{})));q.terminal=take();q.done=true;clearTimeout(deadline)}catch(error){q.error=String(error);q.done=true}};"
                + "const changed=new MutationObserver(()=>{const expected=q.opening?'open':'closing';if(!started&&motion.dataset.uiPhase===expected){started=true;q.committedAt=performance.now();q.logical=logical();void finish();"
                + "}"
                + "if(q.rapid&&q.cancelAt&&motion.dataset.uiPhase==='closing'&&!q.reversalAfter){q.cancelledAt=performance.now();q.cancelled=logical();q.reversalAfter=take()}});"
                + "changed.observe(row,{attributes:true,childList:true,subtree:true,attributeFilter:['data-ui-phase','class','aria-hidden','inert']});"
                + "const click=e=>{if(q.opening&&!started&&e.target.closest('.save-slot-delete')?.closest('.save-slot-card')===row)q.before=take()};document.addEventListener('click',click,true);"
                + "const transition=e=>{if(e.target===motion){const at=performance.now();q.events.push({type:e.type,property:e.propertyName,at});if(e.type==='transitionrun'&&e.propertyName==='grid-template-rows'&&q.firstGridRunAt===undefined)q.firstGridRunAt=at}};motion.addEventListener('transitionrun',transition);motion.addEventListener('transitionend',transition);"
                + "const deadline=setTimeout(()=>{q.error='Natural save prompt sequence did not complete';q.done=true},5000);window.qaSaveConfirmationCleanup=()=>{changed.disconnect();document.removeEventListener('click',click,true);motion.removeEventListener('transitionrun',transition);motion.removeEventListener('transitionend',transition);clearTimeout(deadline)};})()");
    }

    private void assertSaveConfirmationMotion() throws Exception {
        until("window.qaSaveConfirmation.done");
        assertEquals("Save prompt sequence completes without artificial transition events", "null", js("window.qaSaveConfirmation.error"));
        assertEquals("The operation row remains the same full touch height through twenty-four real frames", "true", js("(()=>{const q=window.qaSaveConfirmation;return q.frames.length===24&&q.frames.concat(q.terminal).every(f=>f.sameRow&&f.sameActions&&f.actionHeight>=44&&Math.abs(f.actionHeight-q.before.actionHeight)<=1&&Math.abs((f.rowHeight-q.before.rowHeight)-(f.height-q.before.height))<=1&&f.animation==='none'&&(f.nextTop===null||Math.abs((f.nextTop-q.before.nextTop)-(f.rowHeight-q.before.rowHeight))<=1))})()"));
        assertEquals("Logical confirmation and safe focus change immediately without disabling the available buttons", "true", js("(()=>{const q=window.qaSaveConfirmation,l=q.logical;return l.role==='dialog'&&l.enabled&&(q.opening?l.phase==='open'&&!l.inert&&l.safeFocus&&l.confirmCount===1:l.inert&&l.hidden==='true'&&l.deleteFocus&&l.confirmCount===0)})()"));
        assertEquals("Prompt height naturally interpolates and finishes at its current logical state", "true", js("(()=>{const q=window.qaSaveConfirmation,f=q.terminal,closed=!q.opening||q.rapid;return f.running.length===0&&(closed?f.height<=.5&&f.inert&&f.hidden==='true':f.height>20&&!f.inert&&f.opacity>=.999)&&(q.reduced?q.frames.every(f=>f.running.length===0):q.frames.some(f=>f.height>1&&f.height<q.intrinsic-1)&&q.events.some(e=>e.type==='transitionrun'&&e.property==='grid-template-rows'))})()"));
        if ("true".equals(js("window.qaSaveConfirmation.rapid"))) {
            assertEquals("A quick real button cancellation releases confirmation immediately and reverses the same prompt pose", "true", js("(()=>{const q=window.qaSaveConfirmation,b=q.reversalBefore,a=q.reversalAfter,l=q.cancelled;return b&&a&&l&&l.inert&&l.hidden==='true'&&l.deleteFocus&&l.confirmCount===0&&l.enabled&&(q.reduced?b.running.length===0:q.cancelAt>=q.firstGridRunAt&&b.height>1&&b.height<q.intrinsic-1&&b.running.some(x=>x.property==='grid-template-rows')&&Math.abs(b.height-a.height)<=1)})()"));
        }
    }

    @Test public void saveConfirmationMotionKeepsNativeRecordsFocusAndDraft() throws Exception {
        final String penultimate = ".save-slot-card:nth-last-child(2)", last = ".save-slot-card:last-child";
        for (int party : new int[]{1, 2, 4}) {
            fresh();
            try {
                viewport(390, 844); click("开始游戏");
                for (int i = 1; i < party; i++) js("document.querySelectorAll('.preset-selection-input')[" + i + "].click()");
                until("document.querySelectorAll('.preset-selection-input:checked').length===" + party); click("进入游戏");
                fill(".dock-input", "先保留调查记录\n再询问委托人。"); menu("保存游戏"); until("document.querySelector('.toast')?.textContent==='已保存'"); menu("返回首页");
                js("window.qaSaveFixtureReady=false;window.qaSaveFixtureError=null;Capacitor.Plugins.GameStorage.readAll().then(async({values})=>{const original=JSON.parse(values['trpg-saves-v2'])[0];"
                        + "await Capacitor.Plugins.GameStorage.write({key:'trpg-saves-v2',value:JSON.stringify(Array.from({length:12},(_,i)=>({...original,id:original.id-i,savedAt:'2026/10/13 12:00:'+String(59-i).padStart(2,'0')})))});window.qaSaveFixtureReady=true}).catch(error=>{window.qaSaveFixtureError=String(error);window.qaSaveFixtureReady=true})");
                until("window.qaSaveFixtureReady"); assertEquals("The record fixture uses the native encrypted storage", "null", js("window.qaSaveFixtureError"));
                activity.recreate(); until("document.querySelector('.title-resume-preview')"); watchResizeErrors(); viewport(390, 844); click("继续游戏");
                js("window.qaSaveGameBefore={draft:document.querySelector('.dock-input').value,actor:document.querySelector('.dock-input').getAttribute('aria-label'),party:Array.from(document.querySelectorAll('.party-compact strong'),e=>e.textContent),messages:document.querySelectorAll('.story-message.player').length};window.qaSaveConfirmationRecords=[]");
                menu("读取存档"); until("document.querySelectorAll('.save-slot-card').length===12"); awaitUiMotion();
                js("document.querySelector('.save-list').scrollTop=99999"); reachable(penultimate + " .save-slot-delete");
                watchSaveConfirmation(penultimate, true, false, "native tap on penultimate Delete"); nativeTap(penultimate + " .save-slot-delete"); assertSaveConfirmationMotion();
                reachable(penultimate + " .save-slot-actions.confirming .danger");
                if (party == 2) screenshot("save-confirmation-native");
                nativeTap(penultimate + " .save-slot-actions.confirming button:first-child");
                assertEquals("Native Keep leaves every record and returns to this row immediately", "true", js("document.querySelectorAll('.save-slot-card').length===12&&document.activeElement===document.querySelector('" + penultimate + " .save-slot-delete')&&!document.querySelector('.save-slot-actions.confirming')"));
                awaitUiMotion(); watchSaveConfirmation(penultimate, true, true, "native Delete then actual running frame current Keep button click"); nativeTap(penultimate + " .save-slot-delete"); assertSaveConfirmationMotion();
                assertEquals("Quick cancellation has not removed any saved record", "12", js("document.querySelectorAll('.save-slot-card').length"));
                js("document.querySelector('.save-list').scrollTop=99999"); nativeTap(last + " .save-slot-delete"); awaitUiMotion(); reachable(last + " .save-slot-actions.confirming .danger");
                watchSaveConfirmation(last, false, false, "actual Android system Back cancels last record confirmation");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK); assertSaveConfirmationMotion();
                assertEquals("System Back cancels the prompt while preserving the reader and every record", "true", js("document.querySelector('.save-manager-card').getAttribute('role')==='dialog'&&document.querySelectorAll('.save-slot-card').length===12&&document.activeElement===document.querySelector('" + last + " .save-slot-delete')"));
                nativeTap(".save-manager-close"); until("!document.querySelector('.save-manager-card')");
                viewport(320, 844); nativeTap(".dock-input"); awaitSettledIme(true);
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK); awaitSettledIme(false);
                // Real IME visibility is verified separately; this deliberately fixes the native WebView to 320x300.
                viewport(320, 300); menu("读取存档"); until("document.querySelector('.save-manager-card[role=dialog]')"); awaitUiMotion();
                js("document.querySelector('.save-list').scrollTop=99999;window.qaSaveShortScope={nativeImeOpened:true,nativeImeDismissed:true,mode:'fixed native WebView after actual IME visibility and dismissal',width:innerWidth,height:innerHeight}");
                watchSaveConfirmation(last, true, false, "native Delete in fixed 320x300 window after actual IME dismissal"); nativeTap(last + " .save-slot-delete"); assertSaveConfirmationMotion();
                reachable(last + " .save-slot-actions.confirming button:first-child"); reachable(last + " .save-slot-actions.confirming .danger");
                assertEquals("The short-window confirmation keeps full touch controls inside the independently scrolling list", "true", js("(()=>{const row=document.querySelector('" + last + "'),l=document.querySelector('.save-list').getBoundingClientRect();return Array.from(row.querySelectorAll('.save-slot-actions button')).every(e=>{const r=e.getBoundingClientRect();return r.height>=44&&r.top>=l.top-.5&&r.bottom<=l.bottom+.5&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})})()"));
                if (party == 2) screenshot("save-confirmation-native-short");
                watchSaveConfirmation(last, false, false, "actual Android Back in fixed 320x300 window"); InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK); assertSaveConfirmationMotion();
                nativeTap(".save-manager-close"); until("!document.querySelector('.save-manager-card')");
                assertEquals("All cancellations preserve the complete multiline draft, acting investigator, party and unsubmitted action", "true", js("(()=>{const q=window.qaSaveGameBefore;return document.querySelector('.dock-input').value===q.draft&&document.querySelector('.dock-input').getAttribute('aria-label')===q.actor&&JSON.stringify(Array.from(document.querySelectorAll('.party-compact strong'),e=>e.textContent))===JSON.stringify(q.party)&&document.querySelectorAll('.story-message.player').length===q.messages&&!document.querySelector('.thinking-line')})()"));
                viewport(390, 844); menu("读取存档"); until("document.querySelectorAll('.save-slot-card').length===12");
                js("document.querySelector('.save-list').scrollTop=99999;window.qaSaveIdsBefore=Array.from(document.querySelectorAll('.save-slot-card'),r=>r.dataset.saveId);window.qaSaveExpectedId=window.qaSaveIdsBefore.at(-1)");
                nativeTap(last + " .save-slot-delete"); nativeTap(last + " .save-slot-actions.confirming .danger"); until("document.querySelectorAll('.save-slot-card').length===11");
                assertEquals("Only the separately confirmed record is removed and focus returns to a remaining Load action", "true", js("(()=>{const after=Array.from(document.querySelectorAll('.save-slot-card'),r=>r.dataset.saveId);return window.qaSaveIdsBefore.filter(id=>!after.includes(id)).join(',')===window.qaSaveExpectedId&&document.activeElement===document.querySelector('" + last + " .save-slot-load')})()"));
                js("window.qaSaveDurableReady=false;Capacitor.Plugins.GameStorage.readAll().then(({values})=>{window.qaSaveDurableIds=JSON.parse(values['trpg-saves-v2']).map(s=>String(s.id));window.qaSaveDurableReady=true})"); until("window.qaSaveDurableReady");
                assertEquals("Native persistence contains precisely the eleven unremoved records", "true", js("window.qaSaveDurableIds.length===11&&!window.qaSaveDurableIds.includes(window.qaSaveExpectedId)&&window.qaSaveIdsBefore.every(id=>id===window.qaSaveExpectedId||window.qaSaveDurableIds.includes(id))"));
                awaitSettledIme(false); assertNoResizeErrors();
                System.out.println("SAVE_CONFIRMATION_NATIVE: " + js("JSON.stringify({party:" + party + ",source:'native Delete/Keep/Back; rapid reversal uses the current button handler',traces:(window.qaSaveConfirmationRecords?.length??0)+1,frames:window.qaSaveConfirmation.frames.length,short:window.qaSaveShortScope,removed:1,remaining:window.qaSaveDurableIds.length})"));
            } finally {
                if (activity != null) {
                    try {
                        js("window.qaSaveConfirmationCleanup?.()");
                        savePanelMotionTrace("save-confirmation-native-party-" + party, "({completed:window.qaSaveConfirmationRecords??[],current:window.qaSaveConfirmation??null,short:window.qaSaveShortScope??null,beforeIds:window.qaSaveIdsBefore??null,durableIds:window.qaSaveDurableIds??null})");
                    } finally { activity.close(); }
                }
            }
        }
    }

    private void watchDisclosureSize(String selector) throws Exception {
        js("window.qaDisclosureSizes=[];document.addEventListener('click',()=>{const take=()=>{window.qaDisclosureSizes.push(document.querySelector(" + JSONObject.quote(selector) + ").getBoundingClientRect().height);if(window.qaDisclosureSizes.length<18)requestAnimationFrame(take)};take()},{once:true,capture:true})");
    }

    private void assertDisclosureSizeChangesSmoothly() throws Exception {
        until("window.qaDisclosureSizes.length===18");
        assertEquals("The native compositor sees intermediate heights rather than a one-frame jump", "true", js("(()=>{const f=window.qaDisclosureSizes,a=f[0],b=f.at(-1);return Math.abs(b-a)>100&&f.some(h=>h>Math.min(a,b)+1&&h<Math.max(a,b)-1)})()"));
        System.out.println("DISCLOSURE_NATIVE: " + js("JSON.stringify({first:window.qaDisclosureSizes[0],last:window.qaDisclosureSizes.at(-1),intermediate:window.qaDisclosureSizes.filter(h=>h>Math.min(window.qaDisclosureSizes[0],window.qaDisclosureSizes.at(-1))+1&&h<Math.max(window.qaDisclosureSizes[0],window.qaDisclosureSizes.at(-1))-1).length})"));
    }

    @Test public void inlineDisclosuresKeepNativeKeyboardValuesAndParty() throws Exception {
        for (int party : new int[]{1, 2, 4}) {
            fresh();
            try {
                viewport(390, 844); click("开始游戏");
                for (int i = 1; i < party; i++) js("document.querySelectorAll('.preset-selection-input')[" + i + "].click()");
                js("window.qaDisclosureFontsReady=false;document.fonts.ready.then(()=>window.qaDisclosureFontsReady=true)");
                until("window.qaDisclosureFontsReady");
                for (int width : new int[]{390, 720}) {
                    viewport(width, width == 390 ? 844 : 960);
                    watchDisclosureSize(".preset-card-modern"); nativeTap(".preset-attrs-toggle"); assertDisclosureSizeChangesSmoothly();
                    watchDisclosureSize(".preset-card-modern"); nativeTap(".preset-attrs-toggle"); assertDisclosureSizeChangesSmoothly();
                    assertEquals("A closed dossier is inert and has no retained visible content", "true", js("(()=>{const d=document.querySelector('.disclosure-motion');return d.hasAttribute('inert')&&d.getAttribute('aria-hidden')==='true'&&d.getBoundingClientRect().height===0})()"));
                    assertEquals("Disclosure does not change the selected party", Integer.toString(party), js("document.querySelectorAll('.preset-selection-input:checked').length"));
                }
                viewport(390, 844); click("进入游戏"); fill(".dock-input", "先记录日期\n再检查门廊。"); menu("AI 设置");
                fill("#api-provider", "openai"); fill("#api-model", "qa-preserved-draft");
                until("document.querySelector('.api-connection-toggle').getAttribute('aria-expanded')==='false'"); awaitUiMotion();
                js("document.querySelector('.api-connection-toggle').focus()");
                watchDisclosureSize(".api-connection");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_ENTER); assertDisclosureSizeChangesSmoothly();
                fill("#api-endpoint", "https://qa-disclosure.example/v1");
                watchDisclosureSize(".api-connection");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_SPACE); assertDisclosureSizeChangesSmoothly();
                assertEquals("Keyboard collapse releases its content from focus immediately", "true", js("document.querySelector('.api-connection-toggle').getAttribute('aria-expanded')==='false'&&document.querySelector('#api-connection-content').hasAttribute('inert')"));
                nativeTap(".api-connection-toggle"); awaitUiMotion();
                assertEquals("Reopening retains both edited connection values", "true", js("document.querySelector('#api-endpoint').value==='https://qa-disclosure.example/v1'&&document.querySelector('#api-model').value==='qa-preserved-draft'"));
                reachable(".api-config-card footer .primary-btn"); reachable(".api-config-close");
                if (party == 2) screenshot("disclosure-motion-native");
                nativeTap(".api-config-close"); awaitUiMotion();
                if ("true".equals(js("Boolean(document.querySelector('.game-menu'))"))) click("继续调查");
                assertEquals("Unsaved settings and disclosure motion leave the complete action draft intact", "true", js("document.querySelector('.dock-input').value==='先记录日期'+String.fromCharCode(10)+'再检查门廊。'&&document.querySelectorAll('.party-compact').length===" + party));
                menu("声音设置"); until("document.querySelector('.audio-settings[role=dialog]')"); awaitUiMotion();
                js("document.querySelector('.audio-credits-toggle').scrollIntoView({block:'nearest'})");
                watchDisclosureSize(".audio-credits"); nativeTap(".audio-credits-toggle"); assertDisclosureSizeChangesSmoothly();
                assertEquals("Credits keep their license links in the existing phone panel", "true", js("document.querySelector('.audio-credits-toggle').getAttribute('aria-expanded')==='true'&&document.querySelector('.audio-credit-links a[href*=zero]')!==null"));
                js("document.querySelector('.audio-credits-toggle').focus()");
                watchDisclosureSize(".audio-credits");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_SPACE); assertDisclosureSizeChangesSmoothly();
                assertEquals("Credits collapse to the same 44px title and release their body from focus", "true", js("(()=>{const c=document.querySelector('.audio-credits'),b=c.querySelector('.disclosure-motion');return c.querySelector('button').getAttribute('aria-expanded')==='false'&&c.getBoundingClientRect().height>=44&&c.getBoundingClientRect().height<45&&b.inert&&b.getAttribute('aria-hidden')==='true'&&b.getBoundingClientRect().height===0&&document.activeElement===c.querySelector('button')})()"));
                nativeTap(".audio-credits-toggle"); awaitUiMotion();
                if (party == 2) screenshot("record-disclosure-native");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                until("!document.querySelector('.audio-settings[role=dialog]')&&document.querySelector('.game-menu[role=dialog]')");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK); awaitUiMotion();
                assertEquals("System Back releases the audio and menu without changing the party or multiline draft", "true", js("!document.querySelector('.audio-settings')&&!document.querySelector('.game-menu')&&document.querySelector('.dock-input').value==='先记录日期'+String.fromCharCode(10)+'再检查门廊。'&&document.querySelectorAll('.party-compact').length===" + party));
                assertNoResizeErrors();
            } finally { if (activity != null) activity.close(); }
        }
    }

    private void watchStoryFold() throws Exception {
        js("window.qaStoryFold=[];document.addEventListener('click',()=>{const take=()=>{const p=document.querySelector('.narrative-panel').getBoundingClientRect();window.qaStoryFold.push({top:p.top,height:p.height,nav:document.querySelector('.game-top').getBoundingClientRect().bottom,dock:document.querySelector('.action-dock').getBoundingClientRect().top,art:document.querySelector('.scene-art-canvas').getBoundingClientRect().height});if(window.qaStoryFold.length<24)requestAnimationFrame(take)};take()},{once:true,capture:true})");
    }

    private void assertStoryFoldIsSmoothAndAnchored() throws Exception {
        until("window.qaStoryFold.length===24");
        assertEquals("Real native frames interpolate layout while retaining the original illustration size and fixed navigation/actions", "true", js("(()=>{const f=window.qaStoryFold,a=f[0],b=f.at(-1);return Math.abs(b.top-a.top)>100&&f.some(p=>p.top>Math.min(a.top,b.top)+1&&p.top<Math.max(a.top,b.top)-1)&&f.every(p=>Math.abs(p.nav-a.nav)<=1&&Math.abs(p.dock-a.dock)<=1&&Math.abs(p.art-a.art)<=1&&p.top>=p.nav-.5&&Math.abs(p.top+p.height-p.dock)<=1)})()"));
        System.out.println("STORY_FOLD_NATIVE: " + js("JSON.stringify({first:window.qaStoryFold[0],last:window.qaStoryFold.at(-1),intermediate:window.qaStoryFold.filter(p=>p.top>Math.min(window.qaStoryFold[0].top,window.qaStoryFold.at(-1).top)+1&&p.top<Math.max(window.qaStoryFold[0].top,window.qaStoryFold.at(-1).top)-1).length})"));
    }

    @Test public void storyFoldMotionKeepsPortraitArtDraftAndParty() throws Exception {
        for (int party : new int[]{1, 2, 4}) {
            fresh();
            try {
                viewport(390, 844); click("开始游戏");
                for (int i = 1; i < party; i++) js("document.querySelectorAll('.preset-selection-input')[" + i + "].click()");
                click("进入游戏"); fill(".dock-input", "先记录门廊痕迹\n再请同伴核对时间。");
                js("window.qaFoldFontsReady=false;document.fonts.ready.then(()=>window.qaFoldFontsReady=true)"); until("window.qaFoldFontsReady"); awaitUiMotion();
                for (int width : new int[]{390, 720}) {
                    viewport(width, width == 390 ? 844 : 960);
                    watchStoryFold(); nativeTap(".narrative-toggle-btn"); assertStoryFoldIsSmoothAndAnchored();
                    assertEquals("Expanded story yields the scene row completely", "0", js("document.querySelector('.scene-stage').getBoundingClientRect().height"));
                    watchStoryFold(); nativeTap(".narrative-toggle-btn"); assertStoryFoldIsSmoothAndAnchored();
                    assertEquals("Closing preserves the complete multiline action and chosen party", "true", js("document.querySelector('.dock-input').value==='先记录门廊痕迹'+String.fromCharCode(10)+'再请同伴核对时间。'&&document.querySelectorAll('.party-compact').length===" + party));
                    reachable(".dock-input"); reachable(".narrative-toggle-btn");
                }
                viewport(390, 844); nativeTap(".narrative-toggle-btn"); viewport(390, 360);
                assertEquals("A short keyboard-sized viewport settles directly without delayed layout", "0", js("document.querySelector('.game-screen').getAnimations().length"));
                reachable(".dock-input"); nativeTap(".narrative-toggle-btn"); reachable(".dock-input");
                viewport(390, 844); awaitUiMotion();
                assertEquals("Original scene composition is restored after resize", "true", js("(()=>{const s=document.querySelector('.scene-stage'),c=document.querySelector('.scene-art-canvas');return getComputedStyle(s).opacity==='1'&&Math.abs(s.getBoundingClientRect().height-c.getBoundingClientRect().height)<=1})()"));
                assertNoResizeErrors(); if (party == 2) screenshot("story-fold-native-return");
            } finally { if (activity != null) activity.close(); }
        }
    }

    @Test public void suggestionPreviewsKeepFullActionsAndResetBetweenInvestigators() throws Exception {
        String longAction = "沿着门廊与窗边逐处查看细小划痕，再向伊莎贝拉询问父亲失踪前几天来往的访客，记下姓名、时间和随身物品，以便之后与其他线索互相核对";
        for (int party : new int[]{1, 2, 4}) {
            fresh();
            try {
                viewport(390, 844); click("开始游戏");
                for (int i = 1; i < party; i++) js("document.querySelectorAll('.preset-selection-input')[" + i + "].click()");
                click("进入游戏"); fill(".dock-input", "检查门廊"); menu("返回首页");
                js("window.qaSuggestionsReady=false;Capacitor.Plugins.GameStorage.readAll().then(async({values})=>{"
                    + "const record=JSON.parse(values['trpg-android-session-v1']);"
                    + "const options=[" + JSONObject.quote(longAction) + ", '礼貌地询问委托人最后一次见到父亲时的穿着和情绪，并记录有没有陌生访客或异常声音', '查看屋内座钟和门廊的足迹，比较能够确认的时间与行走方向'];"
                    + "record.state.suggestionsByPlayerId=Object.fromEntries(record.state.players.map(p=>[p.id,options.map(text=>p.name+'：'+text)]));"
                    + "record.state.declarations={};record.state.currentActorIndex=0;"
                    + "await Capacitor.Plugins.GameStorage.write({key:'trpg-android-session-v1',value:JSON.stringify(record)});window.qaSuggestionsReady=true;})");
                until("window.qaSuggestionsReady"); activity.recreate(); until("document.querySelector('.title-resume-preview')");
                watchResizeErrors(); viewport(390, 844); click("继续游戏");
                until("document.querySelectorAll('.suggestion-row button').length===3");
                js("window.qaSuggestionFontsReady=false;document.fonts.ready.then(()=>window.qaSuggestionFontsReady=true)");
                until("window.qaSuggestionFontsReady");
                for (int width : new int[]{390, 720}) {
                    viewport(width, width == 390 ? 844 : 960);
                    assertEquals("Native portrait previews stay bounded, legible and have two lines", "true", js("Array.from(document.querySelectorAll('.suggestion-row button')).every(e=>{const r=e.getBoundingClientRect(),t=e.querySelector('.action-suggestion-text');return r.width<=260.5&&r.height>=44&&r.height<=64&&getComputedStyle(t).webkitLineClamp==='2'&&parseFloat(getComputedStyle(t).fontSize)>=14})"));
                }
                viewport(390, 844);
                js("window.qaFirstFullSuggestion=document.querySelector('.suggestion-row button').textContent");
                nativeTap(".suggestion-row button");
                assertEquals("A real touch fills the complete action without submitting", "true", js("document.querySelector('.dock-input').value===window.qaFirstFullSuggestion&&document.querySelectorAll('.story-message.player').length===0"));
                for (int actor = 0; actor < party; actor++) {
                    js("(()=>{const row=document.querySelector('.suggestion-row');row.scrollLeft=row.scrollWidth;window.qaSuggestionLeft=row.scrollLeft})()");
                    until("window.qaSuggestionLeft>0");
                    nativeTap(".suggestion-row button:last-child");
                    js("window.qaPickedSuggestion=document.querySelector('.suggestion-row button:last-child').textContent");
                    assertEquals("The selected preview keeps its entire text", "true", js("document.querySelector('.dock-input').value===window.qaPickedSuggestion"));
                    String picked = new org.json.JSONArray("[" + js("window.qaPickedSuggestion") + "]").getString(0);
                    fill(".dock-input", picked + "\n补充自己的判断。");
                    assertEquals("Editing keeps the suggestion row where the player left it", "true", js("document.querySelector('.suggestion-row').scrollLeft===window.qaSuggestionLeft"));
                    nativeTap(".dock-actor-avatar"); nativeTap(".investigator-close"); awaitUiMotion();
                    assertEquals("Opening and closing a dossier keeps the row and the multiline draft", "true", js("document.querySelector('.suggestion-row').scrollLeft===window.qaSuggestionLeft&&document.querySelector('.dock-input').value===window.qaPickedSuggestion+String.fromCharCode(10)+'补充自己的判断。'"));
                    if (actor < party - 1) {
                        nativeTap(".dock-submit");
                        awaitSettledIme(true);
                        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK); awaitSettledIme(false);
                        until("document.querySelector('.dock-input').value===''");
                        assertEquals("The next investigator starts with their own first suggestion visible", "true", js("(()=>{const row=document.querySelector('.suggestion-row'),first=row.firstElementChild,r=first.getBoundingClientRect(),b=row.getBoundingClientRect();return row.scrollLeft===0&&r.left>=b.left-.5&&r.right<=b.right+.5})()"));
                    }
                }
                assertEquals("All party controls remain and the page does not overflow", "true", js("document.querySelectorAll('.party-compact').length===" + party + "&&document.documentElement.scrollWidth<=innerWidth"));
                assertNoResizeErrors();
                if (party == 2) screenshot("compact-suggestions-native");
            } finally { if (activity != null) activity.close(); }
        }
    }

    @Test public void shortWindowNavigationRemainsTouchableWithNativeIme() throws Exception {
        for (int party : new int[]{1, 2, 4}) {
            fresh();
            try {
                viewport(320, 568); click("开始游戏");
                for (int i = 1; i < party; i++) js("document.querySelectorAll('.preset-selection-input')[" + i + "].click()");
                until("document.querySelectorAll('.preset-selection-input:checked').length===" + party);
                click("进入游戏");
                String draft = "先记录目击者的话。\n再查看门廊细节。\n".repeat(4);
                fill(".dock-input", draft); viewport(320, 300);
                nativeTap(".narrative-toggle-btn"); awaitUiMotion();
                assertEquals("Android's late-loaded styles keep the short toolbar out of layout and reserve heading space", "true", js("(()=>{const top=document.querySelector('.game-top'),header=document.querySelector('.narrative-header'),panel=document.querySelector('.narrative-panel'),ts=getComputedStyle(top),hs=getComputedStyle(header);return ts.position==='absolute'&&top.getBoundingClientRect().height===0&&parseFloat(ts.minHeight)===0&&parseFloat(hs.paddingRight)>=100&&Math.abs(panel.getBoundingClientRect().top-document.querySelector('.game-screen').getBoundingClientRect().top-parseFloat(getComputedStyle(document.querySelector('.game-screen')).paddingTop))<=1})()"));
                for (String selector : new String[]{".menu-button", ".drawer-tab"}) {
                    reachable(selector);
                    assertEquals("Short-window navigation keeps real touch targets", "true", js("(()=>{const r=document.querySelector(" + JSONObject.quote(selector) + ").getBoundingClientRect();return r.width>=44&&r.height>=44})()"));
                }
                nativeTap(".dock-input"); awaitSettledIme(true);
                assertEquals("A real keyboard is visible with the native WebView explicitly sized to 300 CSS pixels", "true", js("Math.abs(innerHeight-300)<2&&document.activeElement===document.querySelector('.dock-input')"));
                screenshot("short-controls-ime-" + party);
                nativeTap(".menu-button"); until("document.querySelector('.game-menu.open')"); awaitSettledIme(false);
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                until("!document.querySelector('.game-menu')");
                assertEquals("System Back returns focus to the visible menu entry", "true", js("document.activeElement===document.querySelector('.menu-button')"));
                nativeTap(".dock-input"); awaitSettledIme(true);
                nativeTap(".drawer-tab"); until("document.querySelector('.info-drawer-react.open')"); awaitSettledIme(false);
                reachable("[aria-label='关闭资料']"); nativeTap("[aria-label='关闭资料']");
                until("!document.querySelector('.info-drawer-react.open')"); awaitUiMotion();
                assertEquals("Closing references returns focus to the visible book entry", "true", js("document.activeElement===document.querySelector('.drawer-tab')"));
                assertEquals("Both navigation paths preserve every draft line", JSONObject.quote(draft), js("document.querySelector('.dock-input').value"));
                assertEquals("Navigation preserves the complete selected party", Integer.toString(party), js("document.querySelectorAll('.party-compact').length"));
                assertEquals("Navigation preserves the current actor", JSONObject.quote("亨利·格雷"), js("document.querySelector('.party-compact.active strong').textContent"));
                reachable(".dock-input"); reachable(".dock-submit");
                assertEquals("Short navigation keeps a 140-pixel story frame, a 75-pixel reading body and no page overflow", "true", js("document.querySelector('.narrative-panel').getBoundingClientRect().height>=140&&document.querySelector('.narrative-scroll').clientHeight>=75&&document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight"));
                assertNoResizeErrors(); screenshot("short-controls-return-" + party);
                System.out.println("SHORT_CONTROLS_NATIVE: " + js("JSON.stringify({party:document.querySelectorAll('.party-compact').length,innerWidth,innerHeight,top:document.querySelector('.game-top').getBoundingClientRect().toJSON(),topPosition:getComputedStyle(document.querySelector('.game-top')).position,headingPadding:getComputedStyle(document.querySelector('.narrative-header')).paddingRight,story:document.querySelector('.narrative-scroll').clientHeight,menu:document.querySelector('.menu-button').getBoundingClientRect().toJSON(),book:document.querySelector('.drawer-tab').getBoundingClientRect().toJSON()})"));
            } finally { activity.close(); }
        }
    }

    @Test public void storyReadingKeepsItsBookmarkAcrossFoldingAndNativeIme() throws Exception {
        for (int party : new int[]{1, 2, 4}) {
            fresh();
            try {
                viewport(390, 844); click("开始游戏");
                for (int i = 1; i < party; i++) js("document.querySelectorAll('.preset-selection-input')[" + i + "].click()");
                click("进入游戏"); fill(".dock-input", "先记录日期\n再检查门廊"); menu("返回首页");
                js("window.qaReadingReady=false;Capacitor.Plugins.GameStorage.readAll().then(async ({values})=>{"
                    + "const record=JSON.parse(values['trpg-android-session-v1']);"
                    + "record.state.messages=Array.from({length:24},(_,i)=>({id:'reading-'+i,type:'dm',text:i===23?'伊莎贝拉静静地等待调查员回应。':'第'+(i+1)+'页。'+('伊莎贝拉轻声回忆门廊里的脚步，调查员听着雨声记下细节。'+String.fromCharCode(10,10)).repeat(3)}));"
                    + "await Capacitor.Plugins.GameStorage.write({key:'trpg-android-session-v1',value:JSON.stringify(record)});window.qaReadingReady=true;})");
                until("window.qaReadingReady"); activity.recreate(); until("document.querySelector('.title-resume-preview')");
                watchResizeErrors();
                viewport(390, 844); click("继续游戏"); until("document.querySelectorAll('.story-message.dm').length===24");
                js("document.querySelector('.narrative-scroll').focus()");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_MOVE_END);
                String atEnd = "(()=>{const p=document.querySelector('.narrative-scroll');return p.scrollHeight-p.clientHeight-p.scrollTop<=1})()";
                until(atEnd);
                nativeTap(".narrative-toggle-btn"); awaitUiMotion(); until(atEnd);
                nativeTap(".narrative-toggle-btn"); awaitUiMotion(); until(atEnd);
                fill(".dock-input", "询问经过，再检查门廊。\n".repeat(8)); until(atEnd);
                // Use the real available native height so the IME actually resizes the reader.
                activity.onActivity(a -> {
                    WebView web = a.getBridge().getWebView();
                    ViewGroup.LayoutParams params = web.getLayoutParams();
                    params.height = ViewGroup.LayoutParams.MATCH_PARENT; web.setLayoutParams(params);
                });
                until(atEnd); awaitSettledScroll(".narrative-scroll");
                String beforeImeHeight = js("document.querySelector('.narrative-scroll').clientHeight");
                nativeTap(".dock-input"); awaitSettledIme(true);
                System.out.println("READING_IME: before=" + beforeImeHeight + ", viewport=" + js("JSON.stringify({innerHeight,visualHeight:visualViewport.height,story:document.querySelector('.narrative-scroll').clientHeight,top:document.querySelector('.narrative-scroll').scrollTop})"));
                activity.onActivity(a -> {
                    WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(a.getWindow().getDecorView());
                    assertTrue("A real soft keyboard occupies native space", insets.getInsets(WindowInsetsCompat.Type.ime()).bottom > 0);
                    System.out.println("READING_NATIVE: root=" + a.getWindow().getDecorView().getHeight() + ", web=" + a.getBridge().getWebView().getHeight() + ", ime=" + insets.getInsets(WindowInsetsCompat.Type.ime()).bottom);
                });
                screenshot("reading-ime-measurement");
                until("document.querySelector('.narrative-scroll').clientHeight < " + beforeImeHeight); until(atEnd);
                assertEquals("The real keyboard keeps the current actor's long draft", "true", js("document.activeElement===document.querySelector('.dock-input')&&document.querySelector('.dock-input').value===('询问经过，再检查门廊。'+String.fromCharCode(10)).repeat(8)"));
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK); awaitSettledIme(false); until(atEnd);
                assertEquals("Folding and native IME retain the entire party", Integer.toString(party), js("document.querySelectorAll('.party-compact').length"));
                if (party == 1) screenshot("reading-end-ime-return");
                viewport(390, 844);
                js("document.querySelector('.narrative-scroll').scrollTop=600"); awaitSettledScroll(".narrative-scroll");
                js("window.qaReadingBookmark=(()=>{const p=document.querySelector('.narrative-scroll'),m=Array.from(p.children).reverse().find(e=>e.offsetTop<=p.scrollTop);return {id:m.dataset.messageId,fraction:(p.scrollTop-m.offsetTop)/m.offsetHeight}})()");
                nativeTap(".narrative-toggle-btn"); awaitUiMotion(); nativeTap(".narrative-toggle-btn"); awaitUiMotion();
                assertEquals("Folding keeps an older bookmark", "600", js("document.querySelector('.narrative-scroll').scrollTop"));
                viewport(430, 932);
                until("(()=>{const p=document.querySelector('.narrative-scroll'),m=p.querySelector('[data-message-id=\"'+window.qaReadingBookmark.id+'\"]');return Math.abs(p.scrollTop-m.offsetTop-window.qaReadingBookmark.fraction*m.offsetHeight)<=2})()");
                assertEquals("Resize preserves every story entry without model requests", "24", js("document.querySelectorAll('.story-message.dm').length"));
                assertEquals("No artificial unread indicator is added by folding or reflow", "0", js("document.querySelectorAll('.narrative-new-content').length"));
                assertNoResizeErrors(); if (party == 4) screenshot("reading-older-reflow");
            } finally { activity.close(); }
        }
    }

    @Test public void portraitDialogsAndReadingStayWithinPhoneViewport() throws Exception {
        // Run on a dedicated emulator at least 860 x 1864 physical pixels at density 320.
        for (int[] size : new int[][] {{320,568}, {360,640}, {390,844}, {430,932}}) {
            fresh();
            try {
                viewport(size[0], size[1]);
                activity.onActivity(a -> assertEquals(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT, a.getRequestedOrientation()));
                String prefix = "portrait-" + size[0] + "x" + size[1];
                reachable(".title-actions .primary-btn");
                until("Array.from(document.querySelectorAll('.title-mark,.title-actions img')).every(e=>e.complete&&e.naturalWidth>0)");
                assertEquals("Original artist logo and home buttons decode inside the APK", "true", js("document.querySelector('.title-mark').naturalWidth===674&&Array.from(document.querySelectorAll('.title-actions img')).every(e=>e.naturalWidth===498)"));
                assertEquals("New players see one compact main action and lightweight replay/settings", "true", js("document.querySelectorAll('.title-actions button').length===1&&Array.from(document.querySelectorAll('.title-actions button')).every(e=>{const r=e.getBoundingClientRect();return r.width<=240.5&&r.height>=48&&r.height<=64})&&document.querySelectorAll('.title-utilities button').length===3"));
                reachable(".title-opening"); reachable(".title-settings"); reachable(".title-audio");
                if (size[0] == 320) {
                    js("window.qaPaintedArtReady=false;window.qaPaintedArtError=false;window.qaPaintedArtDiagnostics='';"
                        + "Promise.all(['panel-frame','icon-frame','dice-panel','portrait-mount','input-frame','heading-rule','control-stud'].map(name=>new Promise((resolve,reject)=>{"
                        + "const image=new Image(),probe=document.createElement('span');probe.style.cssText='position:fixed;width:0;height:0;pointer-events:none';"
                        + "probe.style.backgroundImage='var(--ui-'+name+')';document.body.append(probe);const value=getComputedStyle(probe).backgroundImage;probe.remove();"
                        + "image.onload=()=>resolve({name,image});image.onerror=()=>reject(name+' '+image.src);image.src=value.slice(4,-1).replaceAll(String.fromCharCode(34),'').replaceAll(String.fromCharCode(39),'');"
                        + "}))).then(images=>{const alpha=entry=>{const canvas=document.createElement('canvas');canvas.width=entry.image.naturalWidth;canvas.height=entry.image.naturalHeight;"
                        + "const context=canvas.getContext('2d');context.drawImage(entry.image,0,0);return context.getImageData(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1).data[3];};"
                        + "window.qaPaintedArtDiagnostics=JSON.stringify(images.map(entry=>({name:entry.name,width:entry.image.naturalWidth,height:entry.image.naturalHeight,alpha:alpha(entry)})));"
                        + "window.qaPaintedArtReady=images.every(entry=>entry.image.naturalWidth>0&&entry.image.naturalHeight>0)"
                        + "&&alpha(images.find(entry=>entry.name==='portrait-mount'))===0&&alpha(images.find(entry=>entry.name==='panel-frame'))===255;"
                        + "}).catch(error=>{window.qaPaintedArtDiagnostics=String(error);window.qaPaintedArtError=true;})");
                    until("window.qaPaintedArtReady||window.qaPaintedArtError");
                    assertEquals("All seven painted assets decode, with a truly hollow portrait and opaque dossier: " + js("window.qaPaintedArtDiagnostics"), "true", js("window.qaPaintedArtReady&&!window.qaPaintedArtError"));
                }
                assertEquals("Home video does not create a page scrollbar", "true", js("document.querySelector('.title-screen').scrollHeight<=document.querySelector('.title-screen').clientHeight+1"));
                click("AI 设置");
                until("document.querySelector('.api-config-fields')");
                titlePlayback(true);
                assertEquals("Bundled MiMo settings are quiet, masked and keep advanced connection fields collapsed", "true", js("!document.querySelector('.api-config-card [role=alert]')&&document.querySelector('#api-provider').value==='mimo'&&document.querySelector('#api-model').value==='mimo-v2.6-pro'&&document.querySelector('#api-key').type==='password'&&!(document.querySelector('.api-connection-toggle').getAttribute('aria-expanded')==='true')"));
                for (String field : new String[] {"#api-provider", "#api-key", "#api-model", ".api-connection-toggle"}) reachable(field);
                reachable(".api-config-close");
                reachable(".api-config-card footer .primary-btn"); screenshot(prefix + "-api");
                if (size[0] == 390) {
                    android.app.UiAutomation automation = InstrumentationRegistry.getInstrumentation().getUiAutomation();
                    android.accessibilityservice.AccessibilityServiceInfo info = automation.getServiceInfo();
                    int originalFlags = info.flags;
                    // The native select popup is a separate interactive window, not the active WebView root.
                    info.flags |= android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
                    automation.setServiceInfo(info);
                    try {
                        fill("#api-model", "android-unsaved-model");
                        nativeTap("#api-provider", 0, "#api-provider + svg");
                        boolean optionsVisible = false;
                        long optionDeadline = SystemClock.elapsedRealtime() + 5000;
                        do {
                            for (android.view.accessibility.AccessibilityWindowInfo window : automation.getWindows()) {
                                android.view.accessibility.AccessibilityNodeInfo root = window.getRoot();
                                if (root != null) for (android.view.accessibility.AccessibilityNodeInfo node : root.findAccessibilityNodeInfosByText("自定义 / 兼容服务")) if (node.isVisibleToUser()) optionsVisible = true;
                            }
                            if (!optionsVisible) SystemClock.sleep(100);
                        } while (!optionsVisible && SystemClock.elapsedRealtime() < optionDeadline);
                        screenshot("api-provider-options");
                        assertTrue("Touching the decorative caret opens the real Android provider choices", optionsVisible);
                        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                        until("document.querySelector('.api-config-card')&&document.querySelector('#api-provider').value==='mimo'&&document.querySelector('#api-model').value==='android-unsaved-model'");
                        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                        until("!document.querySelector('.api-config-card')");
                        click("AI 设置");
                        until("document.querySelector('#api-provider')?.value==='mimo'&&document.querySelector('#api-model')?.value==='mimo-v2.6-pro'");
                    } finally {
                        info.flags = originalFlags;
                        automation.setServiceInfo(info);
                    }
                }
                // No real API credentials or network dependency in layout probes.
                configure("http://127.0.0.1:1/v1", "responses");
                titlePlayback(false);
                click("开始游戏");
                int partySize = size[0] == 360 ? 4 : size[0] == 390 ? 2 : 1;
                for (int i = 1; i < partySize; i++) js("document.querySelectorAll('.preset-card-modern strong')[" + i + "].click()");
                reachable(".setup-footer .primary-btn"); screenshot(prefix + "-setup");
                js("document.querySelector('.preset-attrs-toggle').click()");
                until("document.querySelector('.preset-other-panel:not([hidden])')");
                js("document.querySelector('.preset-other-panel:not([hidden])').scrollIntoView({block:'end'})");
                reachable(".setup-footer .primary-btn");
                assertEquals("Expanded stats do not widen the card", "true", js("Array.from(document.querySelectorAll('.preset-card-content')).every(e=>e.scrollWidth<=e.clientWidth+1)"));
                click("进入游戏"); reachable(".dock-input");
                assertEquals("Starting an investigation leaves title feedback behind", "false", js("!!document.querySelector('.toast')"));
                assertEquals("Empty phone action hint stays inside its field", "true", js("(()=>{const e=document.querySelector('.dock-input');return e.value===''&&e.scrollHeight<=e.clientHeight+1})()"));
                readablePartyDossiers();
                if (size[0] == 360) {
                    reachable(".party-compact:last-child");
                    assertEquals("All four status cards fit without horizontal scrolling", "true", js("document.querySelector('.party-strip-compact').scrollWidth<=document.querySelector('.party-strip-compact').clientWidth+1"));
                    viewport(320, 568);
                    readablePartyDossiers();
                    assertEquals("Smallest four-player HUD keeps readable values in a single horizontal row", "true", js("Array.from(document.querySelectorAll('.party-compact')).every(e=>e.scrollWidth<=e.clientWidth+1)&&getComputedStyle(document.querySelector('.party-strip-compact')).flexWrap==='nowrap'"));
                    assertEquals("Compact four-player HUD gives the complete scene enough height", "true", js("document.querySelector('.scene-stage').getBoundingClientRect().height>=145"));
                    assertEquals("Smallest four-player reading area remains usable", "true", js("document.querySelector('.narrative-panel').clientHeight>=140"));
                    assertEquals("Smallest four-player empty action hint is not clipped", "true", js("(()=>{const e=document.querySelector('.dock-input');return e.value===''&&e.scrollHeight<=e.clientHeight+1})()"));
                    screenshot("portrait-320x568-four-game");
                    viewport(320, 360); readableNavigation();
                    String shortDraft = "核对地点和时间。\n然后继续调查。";
                    fill(".dock-input", shortDraft); reachable(".dock-input"); reachable(".dock-submit");
                    readablePartyDossiers();
                    for (int player = 0; player < 4; player++) {
                        String card = "document.querySelectorAll('.party-compact')[" + player + "]";
                        js(card + ".scrollIntoView({block:'nearest',inline:'nearest'})");
                        assertEquals("Every short-window party card can be fully exposed", "true", js("(()=>{const r=" + card + ".getBoundingClientRect(),p=document.querySelector('.party-strip-compact').getBoundingClientRect();return r.left>=p.left-.5&&r.right<=p.right+.5&&r.top>=0&&r.bottom<=innerHeight})()"));
                        nativeTap(".party-compact:nth-child(" + (player + 1) + ")"); until("document.querySelector('.investigator-sheet')");
                        nativeTap(".investigator-close"); until("!document.querySelector('.investigator-sheet')&&document.activeElement===" + card);
                        assertEquals("Inspecting each party member preserves the multiline action", JSONObject.quote(shortDraft), js("document.querySelector('.dock-input').value"));
                    }
                    js("document.querySelector('.party-strip-compact').scrollLeft=0"); screenshot("portrait-320x360-four-game");
                    fill(".dock-input", shortDraft + "先保留当前的观察记录。先保留当前的观察记录。先保留当前的观察记录。");
                    readablePartyDossiers(); reachable(".dock-input"); reachable(".dock-submit");
                    screenshot("compact-short-long-action");
                    viewport(320, 340);
                    assertEquals("Very short windows keep dossiers available through the avatar", "true", js("getComputedStyle(document.querySelector('.party-strip-compact')).display==='none'"));
                    nativeTap(".dock-actor-avatar"); until("document.querySelector('.investigator-party button')");
                    assertEquals("The avatar still offers every teammate", "4", js("document.querySelectorAll('.investigator-party button').length"));
                    nativeTap(".investigator-close"); until("!document.querySelector('.investigator-sheet')");
                    fill(".dock-input", "");
                    viewport(size[0], size[1]);
                }
                assertEquals("Reading area keeps at least 140 CSS pixels", "true", js("document.querySelector('.narrative-panel').clientHeight>=140"));
                readableNavigation();
                until("document.querySelector('.scene-npc').complete && document.querySelector('.scene-npc').naturalWidth>0");
                assertEquals("NPC has its own visible stage above both panels", "true", js("(()=>{const n=document.querySelector('.scene-npc').getBoundingClientRect(),p=document.querySelector('.narrative-panel').getBoundingClientRect(),d=document.querySelector('.action-dock').getBoundingClientRect();return n.width>innerWidth*.9&&n.height>=110&&n.left>=0&&n.top>=44&&n.bottom<=p.top+.5&&d.top>=p.bottom-.5&&d.left===p.left&&d.right===p.right&&d.bottom<=innerHeight-8})()"));
                until("document.querySelector('.scene-backdrop-img').complete && document.querySelector('.scene-backdrop-img').naturalWidth>0");
                assertEquals("Whole scene fits a full-width upper frame without stretching or cropping", "true", js("(()=>{const i=document.querySelector('.scene-backdrop-img'),b=i.getBoundingClientRect(),p=document.querySelector('.narrative-panel').getBoundingClientRect();return getComputedStyle(i).objectFit==='contain'&&Math.abs(b.width/b.height-i.naturalWidth/i.naturalHeight)<.01&&b.left===0&&Math.abs(b.width-innerWidth)<1&&b.top>=44&&b.bottom<=innerHeight*.5+.5&&b.bottom<=p.top+.5})()"));
                // Keep the background visible in scenes with no NPC.
                assertEquals("Scene framing is independent of NPC presence", "true", js("(()=>{const n=document.querySelector('.scene-npc'),parent=n.parentNode,p=document.querySelector('.narrative-panel'),top=p.getBoundingClientRect().top;n.remove();try{return p.getBoundingClientRect().top===top&&document.querySelector('.scene-backdrop-img').getBoundingClientRect().height>100}finally{parent.appendChild(n)}})()"));
                screenshot(prefix + "-game");
                fill(".dock-input", "查看属性时保留这段行动草稿");
                assertEquals("Phone action input supports multiline even on wide portrait devices", "true", js("document.querySelector('.dock-input').tagName==='TEXTAREA'&&document.querySelector('.dock-input').enterKeyHint==='enter'"));
                assertEquals("Phone Enter never confirms an action", "true", js("document.querySelector('.dock-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))"));
                reachable(".dock-actor-avatar"); nativeTap(".dock-actor-avatar");
                until("document.querySelector('.investigator-sheet')"); reachable(".investigator-close");
                assertEquals("Character sheet reads the selected investigator", "true", js("document.querySelector('.investigator-identity h2').textContent==='亨利·格雷'&&document.querySelectorAll('.investigator-attributes>div').length===8"));
                assertEquals("Resource labels and upper limits remain readable", "true", js("Array.from(document.querySelectorAll('.investigator-vitals dt,.investigator-vitals dd small')).every(e=>parseFloat(getComputedStyle(e).fontSize)>=14)"));
                assertEquals("Attribute abbreviations remain readable", "true", js("Array.from(document.querySelectorAll('.investigator-attributes dt small')).every(e=>parseFloat(getComputedStyle(e).fontSize)>=12)"));
                assertEquals("Investigator navigation text remains readable", "true", js("Array.from(document.querySelectorAll('.investigator-tabs button,.investigator-party button')).every(e=>parseFloat(getComputedStyle(e).fontSize)>=15)"));
                assertEquals("Phone resources use two complete columns without overflow", "true", js("(()=>{const v=document.querySelector('.investigator-vitals'),r=Array.from(v.children).map(e=>e.getBoundingClientRect());return r.length===4&&r[0].top===r[1].top&&r[2].top===r[3].top&&r[2].top>r[0].bottom&&v.scrollWidth<=v.clientWidth&&Array.from(v.querySelectorAll('dt,dd')).every(e=>e.scrollWidth<=e.clientWidth)})()"));
                if (partySize > 1) {
                    js("document.querySelector('.investigator-party button:last-child').click()");
                    until("document.querySelector('.investigator-party button:last-child').getAttribute('aria-pressed')==='true'");
                    js("document.querySelector('.investigator-party button:first-child').click()");
                }
                screenshot(prefix + "-attributes"); click("技能");
                assertEquals("The complete skill list has no search control", "true", js("!document.querySelector('input[type=search]')&&document.querySelectorAll('.investigator-skills tbody tr').length>10"));
                assertEquals("Dodge uses half of percentile DEX", "true", js("Array.from(Array.from(document.querySelectorAll('.investigator-skills tbody tr')).find(r=>r.querySelector('th').textContent.startsWith('闪避')).querySelectorAll('td')).map(e=>e.textContent).join(',')==='30,15,6'"));
                assertEquals("Skill thresholds match the game rules", "true", js("Array.from(Array.from(document.querySelectorAll('.investigator-skills tbody tr')).find(r=>r.querySelector('th').textContent.startsWith('侦查')).querySelectorAll('td')).map(e=>e.textContent).join(',')==='75,37,15'"));
                assertEquals("Skills remain readable", "true", js("parseFloat(getComputedStyle(document.querySelector('.investigator-skills tbody th')).fontSize)>=15"));
                if (partySize > 1) {
                    js("document.querySelector('.investigator-party button:last-child').click()");
                    String expectedDodge = partySize == 4 ? "50,25,10" : "35,17,7";
                    assertEquals("Teammate skill uses its own corrected allocation", JSONObject.quote(expectedDodge), js("Array.from(Array.from(document.querySelectorAll('.investigator-skills tbody tr')).find(r=>r.querySelector('th').textContent.startsWith('闪避')).querySelectorAll('td')).map(e=>e.textContent).join(',')"));
                    viewport(size[0], 300);
                    assertEquals("Complete teammate skills remain readable in a short window", "true", js("document.querySelector('.investigator-body').clientHeight>=75&&Array.from(document.querySelectorAll('.investigator-skills thead th')).every(e=>parseFloat(getComputedStyle(e).fontSize)>=13)"));
                    js("document.querySelector('.investigator-body').scrollTop=99999");
                    reachable(".investigator-skills tbody tr:last-child"); reachable(".investigator-close"); screenshot(prefix + "-skills-short");
                    js("document.querySelector('.investigator-body').scrollTop=0;document.querySelector('.investigator-party button:first-child').scrollIntoView({block:'nearest',inline:'nearest'})");
                    nativeTap(".investigator-party button:first-child"); viewport(size[0], size[1]);
                }
                js("document.querySelector('.investigator-body').scrollTop=99999");
                String skillsReadingPosition = js("document.querySelector('.investigator-body').scrollTop");
                reachable(".investigator-skills thead th"); reachable(".investigator-close"); screenshot(prefix + "-skills");
                if (partySize > 1) {
                    js("document.querySelector('.investigator-party button:last-child').scrollIntoView({block:'nearest',inline:'nearest'})");
                    nativeTap(".investigator-party button:last-child");
                    until("document.querySelector('.investigator-party button:last-child').getAttribute('aria-pressed')==='true'");
                    assertEquals("First teammate visit starts at the list beginning", "0", js("document.querySelector('.investigator-body').scrollTop"));
                    js("(()=>{const b=document.querySelector('.investigator-body');b.scrollTop=(b.scrollHeight-b.clientHeight)/2})()");
                    String teammateReadingPosition = js("document.querySelector('.investigator-body').scrollTop");
                    assertTrue("Teammate skill list has a distinct reading position", Double.parseDouble(teammateReadingPosition) > 0);
                    js("document.querySelector('.investigator-party button:first-child').scrollIntoView({block:'nearest',inline:'nearest'})");
                    nativeTap(".investigator-party button:first-child");
                    until("document.querySelector('.investigator-party button:first-child').getAttribute('aria-pressed')==='true'");
                    assertEquals("Returning to the actor retains that member's reading position", skillsReadingPosition, js("document.querySelector('.investigator-body').scrollTop"));
                    screenshot(prefix + "-skills-member-return");
                    js("document.querySelector('.investigator-party button:last-child').scrollIntoView({block:'nearest',inline:'nearest'})");
                    nativeTap(".investigator-party button:last-child");
                    until("document.querySelector('.investigator-party button:last-child').getAttribute('aria-pressed')==='true'");
                    assertEquals("Returning to the teammate retains its own reading position", teammateReadingPosition, js("document.querySelector('.investigator-body').scrollTop"));
                    js("document.querySelector('.investigator-party button:first-child').scrollIntoView({block:'nearest',inline:'nearest'})");
                    nativeTap(".investigator-party button:first-child");
                    until("document.querySelector('.investigator-party button:first-child').getAttribute('aria-pressed')==='true'");
                }
                click("随身与背景");
                js("document.querySelector('.investigator-background dd').textContent='长篇角色背景记录。'.repeat(150);document.querySelector('.investigator-body').scrollTop=99999");
                reachable(".investigator-close");
                click("技能");
                assertEquals("Returning to skills restores the reading position", skillsReadingPosition, js("document.querySelector('.investigator-body').scrollTop"));
                // Direct browsing never opens a search keyboard; one system Back closes the dossier.
                awaitSettledIme(false);
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                until("!document.querySelector('.investigator-sheet')");
                assertEquals("Inspecting a teammate preserves the current action and actor", "true", js("document.querySelector('.dock-input').value==='查看属性时保留这段行动草稿'&&document.querySelector('.party-compact.active strong').textContent==='亨利·格雷'"));
                nativeTap(".party-compact:last-child"); until("document.querySelector('.investigator-sheet')");
                assertEquals("Status cards inspect their own player", "true", js("document.querySelector('.investigator-identity h2').textContent===document.querySelector('.party-compact:last-child strong').textContent"));
                click("技能"); viewport(size[0], 300);
                js("document.querySelector('.investigator-body').scrollTop=99999");
                reachable(".investigator-skills tbody tr:last-child"); reachable(".investigator-close"); screenshot(prefix + "-sheet-short-direct-skills");
                js("document.querySelector('.investigator-close').click()");
                until("!document.querySelector('.investigator-sheet')&&document.activeElement===document.querySelector('.dock-actor-avatar')");
                assertEquals("Closing a short-window dossier keeps the action draft", JSONObject.quote("查看属性时保留这段行动草稿"), js("document.querySelector('.dock-input').value"));
                screenshot(prefix + "-sheet-focus-restored"); viewport(size[0], size[1]); fill(".dock-input", "");
                js("document.querySelector('.narrative-toggle-btn').click()"); reachable(".narrative-toggle-btn");
                assertEquals("Expanded reading stays below navigation and above the dock", "true", js("(()=>{const p=document.querySelector('.narrative-panel').getBoundingClientRect(),d=document.querySelector('.action-dock').getBoundingClientRect(),n=document.querySelector('.game-top').getBoundingClientRect();return p.top>=n.bottom&&p.bottom<=d.top+.5&&p.width>innerWidth*.9&&p.left===d.left&&p.right===d.right})()"));
                js("(()=>{const e=document.createElement('div');e.id='qa-long-story';e.className='story-message dm';e.textContent='调查员沿着门廊仔细查看，斑驳的木板上留下了一道浅浅的划痕。伊莎贝拉回忆起那天走廊里急促的脚步声。'.repeat(40);document.querySelector('.narrative-scroll').appendChild(e)})()");
                String headerTop = js("document.querySelector('.narrative-header').getBoundingClientRect().top");
                assertEquals("Story identity and tools have readable illustrated touch controls", "true", js("(()=>{const h=document.querySelector('.narrative-header').getBoundingClientRect();return Array.from(document.querySelectorAll('.narrative-header button')).every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.left>=h.left&&r.right<=h.right+.5})&&parseFloat(getComputedStyle(document.querySelector('.npc-nameplate strong')).fontSize)>=14&&getComputedStyle(document.querySelector('.npc-nameplate')).borderImageSource.includes('panel-frame')&&getComputedStyle(document.querySelector('.narrative-toggle-btn'),'::before').backgroundImage.includes('icon-frame')})()"));
                for (double fraction : new double[] {0, .5, 1}) {
                    js("(()=>{const s=document.querySelector('.narrative-scroll');s.scrollTop=(s.scrollHeight-s.clientHeight)*" + fraction + "})()");
                    assertEquals("Story header stays fixed when history scrolls", headerTop, js("document.querySelector('.narrative-header').getBoundingClientRect().top"));
                    assertEquals("Only the story body scrolls below the header", "true", js("(()=>{const p=document.querySelector('.narrative-panel'),s=document.querySelector('.narrative-scroll'),h=document.querySelector('.narrative-header').getBoundingClientRect();return p.scrollTop===0&&s.scrollHeight>s.clientHeight&&s.getBoundingClientRect().top>=h.bottom})()"));
                    reachable(".narrative-toggle-btn"); reachable(".menu-button"); reachable(".drawer-tab"); reachable(".dock-input");
                }
                screenshot(prefix + "-expanded");
                js("document.querySelector('#qa-long-story').remove();document.querySelector('.narrative-scroll').scrollTop=0");
                nativeTap(".narrative-toggle-btn"); until("document.querySelector('.narrative-toggle-btn').getAttribute('aria-label')==='展开剧情'");
                reachable(".npc-nameplate"); nativeTap(".npc-nameplate"); until("document.querySelector('.entity-detail-card')");
                reachable(".entity-detail-close"); screenshot(prefix + "-entity");
                // Long unlocked descriptions scroll without moving the close control.
                js("document.querySelector('.entity-detail-known p').textContent='长篇调查记录。'.repeat(150)");
                String entityHeaderTop = js("document.querySelector('.entity-detail-header').getBoundingClientRect().top");
                js("document.querySelector('.entity-detail-body').scrollTop=99999");
                assertEquals("Entity title stays outside the long body scroll", entityHeaderTop, js("document.querySelector('.entity-detail-header').getBoundingClientRect().top"));
                reachable(".entity-detail-close"); js("document.querySelector('.entity-detail-close').click()");
                reachable(".drawer-tab"); nativeTap(".drawer-tab", 6);
                until("document.querySelector('.case-board-mobile-card')"); reachable("[aria-label='关闭资料']");
                assertEquals("Transient feedback stays below the open reading panel", "true", js("Number(getComputedStyle(document.querySelector('.game-notice')).zIndex)<Number(getComputedStyle(document.querySelector('.info-drawer-react.open')).zIndex)"));
                assertEquals("Native portrait entry stays a fixed button after slight touch drift", "true", js("document.querySelector('.drawer-tab').style.top===''&&!document.querySelector('.drawer-tab').classList.contains('dragging')&&document.querySelector('.drawer-tab').title==='资料'"));
                assertEquals("Phone archive does not construct a hidden graph", "true", js("!document.querySelector('.react-flow')&&!document.querySelector('.case-board-flow-wrap')"));
                until("Array.from(document.querySelectorAll('.case-record-photo img')).every(i=>i.complete&&i.naturalWidth>0)");
                assertEquals("Archive tabs announce the active page", "true", js("document.querySelector('[role=tab][aria-selected=true]').textContent==='案件板'&&document.querySelector('[role=tabpanel]').getAttribute('aria-labelledby')===document.querySelector('[role=tab][aria-selected=true]').id"));
                assertEquals("Known dossiers are available directly without search or type filters", "true", js("!document.querySelector('input[type=search]')&&!document.querySelector('.case-board-type')&&!document.querySelector('.case-board-threads')&&document.querySelectorAll('.case-board-mobile-card').length===3"));
                viewport(size[0], 300); reachable("[aria-label='关闭资料']");
                js("document.querySelector('.case-board-workspace').scrollTop=99999");
                String archivePosition = js("document.querySelector('.case-board-workspace').scrollTop");
                assertTrue("The direct dossier list has its own reading position", Double.parseDouble(archivePosition) > 0);
                nativeTap(".info-drawer-tabs button[id$='-log']"); until("document.querySelector('.action-log-list')");
                nativeTap(".info-drawer-tabs button[id$='-board']"); until("document.querySelector('.case-board-workspace')");
                assertEquals("Real tab taps resume the direct dossier list", archivePosition, js("document.querySelector('.case-board-workspace').scrollTop"));
                reachable("[aria-label='关闭资料']"); screenshot(prefix + "-board-retained");
                js("document.querySelector('.case-board-workspace').scrollTop=0"); viewport(size[0], size[1]);
                if (size[0] == 430) {
                    viewport(960, 1000);
                    assertEquals("Wide native portrait remains a list rather than creating the desktop graph", "true", js("document.querySelector('.case-board-view').classList.contains('archive-layout')&&!document.querySelector('.react-flow')&&document.querySelectorAll('.case-board-mobile-card').length===3"));
                    viewport(size[0], size[1]);
                }
                reachable(".case-board-mobile-card"); screenshot(prefix + "-board");
                js("document.querySelector(\"[aria-label='人物 伊莎贝拉·摩勒']\").click()"); reachable("[aria-label='关闭资料详情']");
                until("document.querySelector('.case-board-inspector').contains(document.activeElement)");
                until("document.querySelector('.case-board-inspector .record-detail-media img').complete&&document.querySelector('.case-board-inspector .record-detail-media img').naturalWidth>0");
                js("document.querySelector(\"[aria-label='查看摩勒住宅资料']\").click()");
                until("document.querySelector('.case-board-inspector h4').textContent==='摩勒住宅'");
                assertEquals("Scene archive preserves its full painting", "true", js("getComputedStyle(document.querySelector('.case-board-inspector .record-detail-media img')).objectFit==='contain'"));
                reachable("[aria-label='返回上一份资料']");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                until("document.querySelector('.case-board-inspector h4').textContent==='伊莎贝拉·摩勒'");
                viewport(size[0], 300); reachable("[aria-label='关闭资料详情']");
                assertEquals("A short viewport gives room to known text instead of the photo", "true", js("getComputedStyle(document.querySelector('.case-board-inspector .record-detail-media')).display==='none'"));
                viewport(size[0], size[1]);
                nativeTap("[aria-label='关闭资料详情']"); until("!document.querySelector('.case-board-inspector')");
                nativeTap(".case-board-mobile-card[aria-label='地点 摩勒住宅']"); until("document.querySelector('.case-board-inspector h4').textContent==='摩勒住宅'");
                viewport(size[0], 300);
                js("document.querySelector(\"[aria-label='关闭资料详情']\").focus()");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_TAB);
                until("document.activeElement===document.querySelector('.case-board-inspector-scroll')");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_PAGE_DOWN);
                until("document.querySelector('.case-board-inspector-scroll').scrollTop>0");
                // WebView animates PageDown; record its final position before following a relation.
                String recordPosition = awaitSettledScroll(".case-board-inspector-scroll");
                nativeTap("[aria-label='查看伊莎贝拉·摩勒资料']"); until("document.querySelector('.case-board-inspector h4').textContent==='伊莎贝拉·摩勒'");
                assertEquals("A newly followed record starts at its beginning", "0", js("document.querySelector('.case-board-inspector-scroll').scrollTop"));
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                until("document.querySelector('.case-board-inspector h4').textContent==='摩勒住宅'");
                assertEquals("System Back resumes the original known-record reading position", recordPosition, js("document.querySelector('.case-board-inspector-scroll').scrollTop"));
                reachable("[aria-label='关闭资料详情']"); screenshot(prefix + "-case-reading-retained"); viewport(size[0], size[1]);
                nativeTap("[aria-label='关闭资料详情']"); until("!document.querySelector('.case-board-inspector')");
                nativeTap(".case-board-mobile-card[aria-label='人物 伊莎贝拉·摩勒']"); until("document.querySelector('.case-board-inspector h4').textContent==='伊莎贝拉·摩勒'");
                screenshot(prefix + "-inspector");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                until("!document.querySelector('.case-board-inspector') && document.querySelector('.info-drawer-react.open')"); click("进度");
                assertEquals("Progress does not expose the script's undiscovered clue total", "true", js("!document.querySelector('.scenario-progress').textContent.match(/已发现\\s+0\\s*\\/\\s*8/)") );
                assertEquals("Current objectives use readable text and omit empty clue statistics", "true", js("parseFloat(getComputedStyle(document.querySelector('.objective-row strong')).fontSize)>=15&&!document.querySelector('.progress-stat')"));
                js("document.querySelector(\"[aria-label='关闭资料']\").focus()");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_TAB);
                until("document.activeElement===document.querySelector('.info-drawer-page.progress-page')");
                reachable("[aria-label='关闭资料']"); screenshot(prefix + "-progress"); click("日志");
                until("document.querySelector('.action-log-list p')");
                assertEquals("The log body uses readable text without search controls", "true", js("parseFloat(getComputedStyle(document.querySelector('.action-log-list p')).fontSize)>=15&&!document.querySelector('input[type=search]')"));
                assertEquals("Only player records appear in the log", "true", js("!document.querySelector('.action-log-list').textContent.match(/EV_[A-Z_]+|AI DM 返回格式无效/)&&document.querySelector('.action-log-list').textContent.includes('摩勒住宅')"));
                js("document.querySelector(\"[aria-label='关闭资料']\").focus()");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_TAB);
                until("document.activeElement===document.querySelector('.action-log-list')");
                viewport(size[0], 300); reachable("[aria-label='关闭资料']");
                js("document.querySelector('.action-log-list').scrollTop=99999");
                String logReadingPosition = js("document.querySelector('.action-log-list').scrollTop");
                click("进度"); click("日志");
                assertEquals("Reference tab returns retain the complete log's reading position", logReadingPosition, js("document.querySelector('.action-log-list').scrollTop"));
                assertEquals("Only the complete log scrolls beneath the fixed header", "true", js("(()=>{const l=document.querySelector('.action-log-list').getBoundingClientRect(),h=document.querySelector('.info-drawer-react>header').getBoundingClientRect();return l.top>=h.bottom&&l.bottom<=innerHeight+1&&l.height>140})()"));
                screenshot(prefix + "-log-short");
                viewport(size[0], size[1]); screenshot(prefix + "-log"); reachable("[aria-label='关闭资料']");
                String referenceDraft = js("document.querySelector('.dock-input').value");
                viewport(size[0], 300); nativeTap("[aria-label='关闭资料']");
                until("!document.querySelector('.info-drawer-react.open')&&document.activeElement===document.querySelector('.drawer-tab')");
                assertEquals("Closing short-window references keeps the action draft", referenceDraft, js("document.querySelector('.dock-input').value"));
                screenshot(prefix + "-reference-focus-restored"); viewport(size[0], size[1]);
                nativeTap(".drawer-tab"); until("document.querySelector('.case-board-mobile-card')");
                assertEquals("A new reference visit starts with all known records", "true", js("!document.querySelector('input[type=search]')&&document.querySelector('.case-board-workspace').scrollTop===0&&document.querySelectorAll('.case-board-mobile-card').length===3"));
                nativeTap("[aria-label='关闭资料']"); until("!document.querySelector('.info-drawer-react.open')");
                menu("声音设置"); reachable("[role='switch'][aria-label='背景音乐']"); reachable("[role='switch'][aria-label='游戏音效']");
                screenshot(prefix + "-audio");
                js("document.querySelector('.audio-credits-toggle').click();document.querySelector('.audio-settings-body').scrollTop=99999");
                reachable(".audio-close"); js("document.querySelector('.audio-close').click()");
                until("document.querySelector('.game-menu').contains(document.activeElement)");
                paintedHomeEmblem(".game-menu .home-emblem-art");
                reachable(".game-menu-close"); reachable(".game-menu footer button");
                assertEquals("Packaged menu labels stay readable on the blue panel", "true", js("(()=>{const p=getComputedStyle(document.documentElement).getPropertyValue('--panel').trim().slice(1).match(/../g).map(x=>parseInt(x,16));const lum=a=>a.map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);return Array.from(document.querySelectorAll('.game-menu .menu-list button')).every(e=>{const c=getComputedStyle(e).color.match(/[\\d.]+/g).slice(0,3).map(Number);return(Math.max(lum(c),lum(p))+.05)/(Math.min(lum(c),lum(p))+.05)>=4.5})})()"));
                screenshot(prefix + "-menu");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                until("!document.querySelector('.game-menu') && document.activeElement===document.querySelector('.menu-button')");
                String currentDraft = js("document.querySelector('.dock-input').value");
                menu("AI 设置"); until("document.querySelector('.api-config-card')"); viewport(size[0], 300);
                nativeTap(".api-config-close"); until("!document.querySelector('.api-config-card')&&document.activeElement===document.querySelector('.menu-button')");
                assertEquals("Closing short-window AI settings keeps the action draft", currentDraft, js("document.querySelector('.dock-input').value"));
                screenshot(prefix + "-api-focus-restored"); viewport(size[0], size[1]);
                String currentActor = js("document.querySelector('.party-compact.active strong').textContent");
                menu("返回首页"); until("document.querySelector('.title-resume-preview')");
                assertEquals("Artist navigation retains focused one-tap continuation", "true", js("document.querySelector('.title-resume-preview').textContent.includes('当前调查')&&document.querySelector('.title-actions button:first-child').getAttribute('aria-label')==='开始游戏'&&document.activeElement===document.querySelector('.title-continue')"));
                assertEquals("Party preview fits the phone without horizontal overflow", "true", js("document.querySelector('.title-resume-preview').scrollWidth<=document.querySelector('.title-resume-preview').clientWidth+1"));
                reachable(".title-continue"); screenshot(prefix + "-resume");
                viewport(size[0], 300); reachable(".title-continue"); viewport(size[0], size[1]);
                click("继续游戏"); until("document.querySelector('.dock-input')");
                assertEquals("Returning home preserves the action draft", currentDraft, js("document.querySelector('.dock-input').value"));
                assertEquals("Returning home preserves the acting investigator", currentActor, js("document.querySelector('.party-compact.active strong').textContent"));
                menu("重新开始"); until("document.querySelector('.setup-screen')"); click("返回");
                until("document.querySelector('.title-resume-preview')"); click("继续游戏");
                assertEquals("Cancelling character selection preserves the same investigation", currentDraft, js("document.querySelector('.dock-input').value"));
                assertEquals("Cancelling character selection preserves the whole party", Integer.toString(partySize), js("document.querySelectorAll('.party-compact').length"));
                for (int i = 0; i < 4; i++) {
                    if (i == 1 || i == 3) js("document.querySelector('.narrative-toggle-btn').click()");
                    menu("保存游戏"); until("document.querySelector('.toast')?.textContent==='已保存'");
                    if (i == 2) viewport(size[0], 300);
                    readableGameNotice();
                    assertEquals("Saving keeps the full action draft", currentDraft, js("document.querySelector('.dock-input').value"));
                    if (i == 0) {
                        nativeTap(".party-compact:last-child"); until("document.querySelector('.investigator-sheet')");
                        reachable(".investigator-close"); nativeTap(".investigator-close");
                    }
                    if (i == 1) screenshot(prefix + "-feedback");
                    if (i == 2) viewport(size[0], size[1]);
                }
                menu("返回首页"); until("document.querySelector('.title-resume-preview')");
                assertEquals("Returning home removes feedback from the previous screen", "false", js("!!document.querySelector('.toast')"));
                click("继续游戏"); until("document.querySelector('.dock-input')");
                assertEquals("Continuing keeps the action draft after feedback cleanup", currentDraft, js("document.querySelector('.dock-input').value"));
                menu("读取存档"); until("document.querySelector('.save-manager-card')");
                reachable(".save-manager-card footer button");
                assertEquals("Opening the reader keeps the current draft", currentDraft, js("document.querySelector('.dock-input').value"));
                assertEquals("Save dates and party names remain readable", "true", js("Array.from(document.querySelectorAll('.save-slot-time,.save-slot-party>span')).every(e=>parseFloat(getComputedStyle(e).fontSize)>=14&&e.scrollWidth<=e.clientWidth+1)"));
                js("document.querySelector('.save-list').scrollTop=99999");
                reachable(".save-slot-card:last-child .save-slot-delete"); screenshot(prefix + "-saves");
                js("document.querySelector('.save-slot-card:last-child .save-slot-delete').click()");
                until("document.querySelector('.save-slot-actions.confirming')");
                reachable(".save-slot-actions.confirming .danger");
                assertEquals("Deletion first focuses the safe choice", "true", js("document.activeElement.innerText==='保留存档'"));
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                until("document.querySelector('.save-manager-card')&&!document.querySelector('.save-slot-actions.confirming')&&Array.from(document.querySelectorAll('.save-slot-controls .disclosure-motion')).every(e=>e.inert&&e.getAttribute('aria-hidden')==='true')");
                assertEquals("Returning from confirmation retains every record and the original row", "true", js("document.querySelectorAll('.save-slot-card').length===4&&document.activeElement===document.querySelector('.save-slot-card:last-child .save-slot-delete')"));
                reachable(".save-slot-card:last-child .save-slot-delete"); screenshot(prefix + "-save-return");
                js("document.querySelector('.save-slot-card:last-child .save-slot-delete').click()");
                until("document.querySelector('.save-slot-actions.confirming')");
                click("保留存档");
                assertEquals("Cancelling keeps every save", "4", js("document.querySelectorAll('.save-slot-card').length"));
                js("document.querySelector('.save-slot-card:last-child .save-slot-delete').click()");
                until("document.querySelector('.save-slot-actions.confirming')");
                click("确认删除");
                until("document.querySelectorAll('.save-slot-card').length===3");
                assertEquals("Deleting a record focuses a remaining Load action", "true", js("document.activeElement.classList.contains('save-slot-load')"));
                viewport(size[0], 300);
                reachable(".save-manager-close"); nativeTap(".save-manager-close");
                until("!document.querySelector('.save-manager-card')");
                assertEquals("Closing the reader in a short viewport returns focus to its visible menu opener", "true", js("document.activeElement.classList.contains('menu-button')"));
                assertEquals("Cancelling the reader keeps the current draft", currentDraft, js("document.querySelector('.dock-input').value"));
                screenshot(prefix + "-save-focus-restored");
                viewport(size[0], size[1]);
                js("document.querySelector('.menu-button').click()");
                until("document.querySelector('.game-menu')");
                assertEquals("KP notes are not in the player menu", "false", js("document.querySelector('.game-menu').innerText.includes('KP 笔记')"));
                assertEquals("The menu has one explicit reader instead of duplicate load entries", "false", js("document.querySelector('.game-menu').innerText.includes('存档管理')"));
                viewport(size[0], 300);
                reachable(".game-menu footer button"); nativeTap(".game-menu footer button");
                until("!document.querySelector('.game-menu')");
                assertEquals("Closing the menu in a short viewport returns focus to its visible menu entry", "true", js("document.activeElement.classList.contains('menu-button')"));
                assertEquals("Closing the menu keeps the current draft", currentDraft, js("document.querySelector('.dock-input').value"));
                viewport(size[0], size[1]);
                viewport(size[0], 300); fill(".dock-input", "输入法占位后仍可完成输入。");
                assertEquals("Keyboard space prioritizes reading and input", "true", js("document.querySelector('.narrative-panel').getBoundingClientRect().width>innerWidth*.9 && getComputedStyle(document.querySelector('.scene-stage')).visibility==='hidden' && document.querySelector('.scene-stage').getBoundingClientRect().height===0"));
                reachable(".dock-input"); reachable(".dock-submit"); screenshot(prefix + "-keyboard");
                js("document.querySelector('.narrative-toggle-btn').click()");
                reachable(".narrative-toggle-btn"); reachable(".dock-input"); reachable(".dock-submit");
                assertEquals("Expanded story keeps its header above the keyboard-sized body", "true", js("(()=>{const h=document.querySelector('.narrative-header').getBoundingClientRect(),s=document.querySelector('.narrative-scroll').getBoundingClientRect(),d=document.querySelector('.action-dock').getBoundingClientRect();return h.top>=0&&s.top>=h.bottom&&s.bottom<=d.top+.5})()"));
                js("document.querySelector('.narrative-toggle-btn').click()");
                // The API form must also keep the focused field and Save usable above an IME.
                viewport(size[0], size[1]); menu("AI 设置"); viewport(size[0], 300);
                js("document.querySelector('.api-config-fields input[type=password]').focus()");
                reachable(".api-config-fields input[type=password]"); reachable(".api-config-card footer .primary-btn");
                screenshot(prefix + "-api-keyboard");
                fill("#api-model", "");
                js("document.querySelector('.api-connection-toggle').click()");
                nativeTap(".api-config-card footer .primary-btn");
                until("document.activeElement===document.querySelector('#api-model')&&document.querySelector('#api-model').getAttribute('aria-invalid')==='true'");
                assertEquals("Model correction leaves unrelated connection fields collapsed", "false", js("(document.querySelector('.api-connection-toggle').getAttribute('aria-expanded')==='true')"));
                reachable("#api-model"); reachable(".api-config-close"); reachable(".api-config-card footer .primary-btn");
                assertEquals("Model and its readable error fit within the keyboard body", "true", js("(()=>{const b=document.querySelector('.api-config-fields').getBoundingClientRect(),m=document.querySelector('#api-model').getBoundingClientRect(),e=document.querySelector('.api-field-error').getBoundingClientRect();return m.top>=b.top&&m.bottom<=b.bottom&&e.top>=b.top&&e.bottom<=b.bottom&&parseFloat(getComputedStyle(document.querySelector('.api-field-error')).fontSize)>=15&&document.querySelector('.api-config-card').scrollTop===0})()"));
                fill("#api-model", "待确认的模型");
                for (String composition : new String[] {"isComposing:true", "keyCode:229"}) {
                    js("document.querySelector('#api-model').focus()");
                    assertEquals("IME Escape is not consumed by a dialog", "true", js("document.querySelector('#api-model').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true," + composition + "}))"));
                    assertEquals("IME Escape preserves the editable model and input focus", "true", js("!!document.querySelector('.api-config-card')&&document.querySelector('#api-model').value==='待确认的模型'&&document.activeElement===document.querySelector('#api-model')"));
                    js("document.querySelector('.api-config-card footer .primary-btn').focus()");
                    assertEquals("IME Tab is not consumed by a focus trap", "true", js("document.querySelector('.api-config-card footer .primary-btn').dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true," + composition + "}))"));
                    assertEquals("IME Tab keeps its candidate focus", "true", js("document.activeElement===document.querySelector('.api-config-card footer .primary-btn')"));
                }
                js("document.querySelector('.api-config-card footer .primary-btn').dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}))");
                assertEquals("Ordinary Tab still wraps inside the dialog", "true", js("document.activeElement===document.querySelector('.api-config-close')"));
                fill("#api-model", "edited-qa-model"); fill("#api-endpoint", "bad-address");
                nativeTap(".api-config-card footer .primary-btn");
                until("document.activeElement===document.querySelector('#api-endpoint')&&(document.querySelector('.api-connection-toggle').getAttribute('aria-expanded')==='true')");
                reachable("#api-endpoint");
                assertEquals("Endpoint and its error fit without moving the dialog", "true", js("(()=>{const b=document.querySelector('.api-config-fields').getBoundingClientRect(),m=document.querySelector('#api-endpoint').getBoundingClientRect(),e=document.querySelector('.api-field-error').getBoundingClientRect();return m.top>=b.top&&m.bottom<=b.bottom&&e.top>=b.top&&e.bottom<=b.bottom&&document.querySelector('.api-config-card').scrollTop===0})()"));
                screenshot(prefix + "-api-repair");
                nativeTap(".api-config-close"); until("!document.querySelector('.api-config-card')"); viewport(size[0], size[1]);
                assertEquals("Configuration correction does not erase the game draft", JSONObject.quote("输入法占位后仍可完成输入。"), js("document.querySelector('.dock-input').value"));
                menu("AI 设置");
                assertEquals("Closing an invalid edit retains the saved connection and masked credential", "true", js("document.querySelector('#api-model').value==='android-qa-model'&&document.querySelector('#api-endpoint').value==='http://127.0.0.1:1/v1'&&document.querySelector('#api-key').type==='password'&&!document.querySelector('.api-config-card [role=alert]')"));
                nativeTap(".api-config-close");
                assertNoResizeErrors();
            } finally { activity.close(); }
        }
    }

    @Test public void semanticRecoveryKeepsDiagnosticsPrivateAndConnectsFreeActionDice() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        AtomicInteger retainedCorrections = new AtomicInteger();
        try (MockWebServer server = new MockWebServer()) {
            server.setDispatcher(new Dispatcher() {
                @Override public MockResponse dispatch(RecordedRequest request) {
                    String body = request.getBody().readUtf8();
                    boolean narrator = body.contains("COC 第七版 AI DM Agent");
                    int count = narrator ? calls.incrementAndGet() : 0;
                    if (narrator && count % 3 == 0 && body.contains("上一版响应需要修正")) retainedCorrections.incrementAndGet();
                    String text = count <= 6 ? "纸片写着贝尔街14号，那就是藏身地址。" : "亨利需要进行潜行检定，判定能否避过对方目光。";
                    String content = narrator ? "{\"narrative\":" + JSONObject.quote(text) + ",\"activeNpc\":null,\"nextPrompt\":\"\",\"playerChoices\":{}}" : "{\"facts\":[],\"nodes\":[],\"edges\":[]}";
                    return new MockResponse().setHeader("Content-Type", "application/json").setBody("{\"output_text\":" + JSONObject.quote(content) + ",\"output\":[]}");
                }
            });
            server.start(); fresh(); viewport(390, 844);
            click("开始游戏"); click("进入游戏"); configure(server.url("/v1").toString(), "responses");
            fill(".dock-input", "伸手拿走纸条，不引起灰风衣男人注意。"); click("提交");
            for (int expected : new int[] {3, 6}) {
                long recoveryDeadline = SystemClock.elapsedRealtime() + 20000;
                while (calls.get() < expected && SystemClock.elapsedRealtime() < recoveryDeadline) SystemClock.sleep(100);
                assertEquals("This recovery completes its expected requests before inspecting the notice", expected, calls.get());
                until("document.querySelector('.action-dock [role=status]')");
                assertEquals("One recovery notice", "1", js("document.querySelectorAll('.action-dock [role=status]').length"));
                assertEquals("No leaked rules or hidden scene names", "false", js("/贝尔街|request_check|返回格式无效/.test(document.body.innerText)"));
                assertEquals("No error history spam", "0", js("document.querySelectorAll('.story-message.system').length"));
                if (expected == 3) {
                    for (int[] size : new int[][] {{320,568},{390,844},{430,932},{562,1000}}) {
                        viewport(size[0], size[1]); readableTurnPrompt();
                        viewport(size[0], 300); readableTurnPrompt();
                    }
                    viewport(390,844);
                }
                readableTurnPrompt(); screenshot("semantic-retry-" + expected);
                nativeTap(".check-card > button");
            }
            until("document.querySelector('.check-card strong')?.textContent.includes('潜行')");
            assertEquals(7, calls.get()); assertEquals(2, retainedCorrections.get());
            assertEquals("Original declaration appears once", "1", js("document.querySelectorAll('.story-message.player').length"));
            click("掷骰"); until("document.querySelector('.dice-roll-overlay')"); screenshot("free-action-dice");
            assertNoResizeErrors();
        } finally { if (activity != null) activity.close(); }
    }

    @Test public void negativeInstructionsAndPartialPartyChecksStayPlayable() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        String[] names = { "亨利·格雷", "艾达·华莱士", "托马斯·贝尔", "罗伯特·肖" };
        try (MockWebServer server = new MockWebServer()) {
            server.setDispatcher(new Dispatcher() {
                @Override public MockResponse dispatch(RecordedRequest request) {
                    String body = request.getBody().readUtf8();
                    boolean narrator = body.contains("COC 第七版 AI DM Agent");
                    int count = narrator ? calls.incrementAndGet() : 0;
                    String text = "需要注意，这里无需进行潜行检定，直接拿起即可。";
                    if (count > 1) {
                        text = "";
                        for (String name : names) text += name + (count == 2 ? "需要进行潜行检定。" : "的潜行检定没有通过。");
                        if (count > 2) text += "你们停下脚步，另想办法。";
                    }
                    String content = narrator ? "{\"narrative\":" + JSONObject.quote(text) + ",\"activeNpc\":null,\"nextPrompt\":\"\",\"playerChoices\":{}}" : "{\"facts\":[],\"nodes\":[],\"edges\":[]}";
                    String args = "{\"player\":\"亨利·格雷\",\"skill\":\"潜行\",\"difficulty\":\"困难\"}";
                    String tools = count == 2 ? "[{\"type\":\"function_call\",\"call_id\":\"first-check\",\"name\":\"request_check\",\"arguments\":" + JSONObject.quote(args) + "}]" : "[]";
                    return new MockResponse().setHeader("Content-Type", "application/json").setBody("{\"output_text\":" + JSONObject.quote(content) + ",\"output\":" + tools + "}");
                }
            });
            server.start(); fresh(); viewport(390, 844);
            click("开始游戏");
            for (int i = 1; i < 4; i++) js("document.querySelectorAll('.preset-card-modern strong')[" + i + "].click()");
            click("进入游戏"); configure(server.url("/v1").toString(), "responses");
            for (int round = 0; round < 2; round++) {
                for (int i = 0; i < 4; i++) { fill(".dock-input", "原地思考"); click(i == 3 ? "提交" : "下一位"); }
                if (round == 0) {
                    until("document.querySelector('.dock-input') && !document.querySelector('.dock-input').disabled");
                    assertEquals(1, calls.get());
                    assertEquals("Negated request does not create dice", "false", js("Boolean(document.querySelector('.check-card'))"));
                }
            }
            js("Math.random = () => .899");
            for (int i = 0; i < 4; i++) {
                until("document.querySelector('.check-card') && document.querySelector('.check-card').textContent.includes(" + JSONObject.quote(names[i] + " · 潜行") + ")");
                assertEquals("Complete batch", "true", js("document.querySelector('.check-card').textContent.includes('" + (i + 1) + "/4')"));
                if (i == 0) {
                    for (int[] size : new int[][] {{320,568},{390,844},{430,932},{562,1000}}) {
                        viewport(size[0], size[1]); readableTurnPrompt();
                        viewport(size[0], 300); readableTurnPrompt();
                    }
                    viewport(390,844); screenshot("turn-check-four-player");
                }
                nativeTap(".check-card > button"); until("document.querySelector('.dice-roll-overlay.revealed')"); click("确认结果");
            }
            until("document.body.innerText.includes('你们停下脚步，另想办法。') && !document.querySelector('.dock-input').disabled");
            assertEquals("No false failure retry", 3, calls.get());
            assertEquals("No duplicate declarations", "8", js("document.querySelectorAll('.story-message.player').length"));
            assertEquals("No internal diagnostics or retry required", "false", js("/request_check|返回格式无效|重试本轮/.test(document.body.innerText)"));
            reachable(".dock-input"); screenshot("smooth-four-player");
        } finally { if (activity != null) activity.close(); }
    }

    @Test public void partyFlowUsesNativeNetworkAndEncryptedRecovery() throws Exception {
        for (int party : new int[] { 1, 2, 4 }) {
            AtomicInteger narratorCalls = new AtomicInteger();
            try (MockWebServer server = new MockWebServer()) {
                server.setDispatcher(new Dispatcher() {
                    @Override public MockResponse dispatch(RecordedRequest request) {
                        String body = request.getBody().readUtf8();
                        boolean narrator = body.contains("COC 第七版 AI DM Agent");
                        if (narrator) narratorCalls.incrementAndGet();
                        assertEquals("Bearer android-qa-only-token", request.getHeader("Authorization"));
                        String content = narrator ? "{\"narrative\":\"Android 调查继续，伊莎贝拉说明父亲失踪的经过。\",\"activeNpc\":\"伊莎贝拉·摩勒\",\"nextPrompt\":\"继续调查。\",\"playerChoices\":[\"检查门锁\",\" 检查门锁 \",\"观察窗边\",\"询问委托人\"]}" : "{\"facts\":[],\"nodes\":[],\"edges\":[]}";
                        String response = request.getPath().endsWith("/responses") ? "{\"output_text\":" + JSONObject.quote(content) + "}" : "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":" + JSONObject.quote(content) + "}}]}";
                        MockResponse reply = new MockResponse().setHeader("Content-Type", "application/json").setBody(response);
                        if (party == 1 && narrator) reply.setBodyDelay(10, TimeUnit.SECONDS);
                        return reply;
                    }
                });
                server.start(); fresh();
                if (party == 1) viewport(390, 844);
                click("开始游戏"); until("document.querySelectorAll('.preset-card-modern.selected').length === 1");
                for (int i = 1; i < party; i++) js("document.querySelectorAll('.preset-card-modern strong')[" + i + "].click()");
                until("document.querySelectorAll('.preset-card-modern.selected').length === " + party);
                click("进入游戏"); configure(server.url("/v1").toString(), party == 1 ? "responses" : "chat-completions");
                until("document.querySelectorAll('.party-compact').length === " + party);
                screenshot("party-" + party);
                assertEquals("Readable narrative", "true", js("document.querySelector('.narrative-panel').clientHeight > 90"));
                if (party == 4) viewport(320, 568);
                for (int i = 0; i < party; i++) {
                    if (party == 4 && i == 0) js("document.querySelector('.party-strip-compact').scrollLeft=999;window.qaReviewedPartyPosition=document.querySelector('.party-strip-compact').scrollLeft");
                    fill(".dock-input", "接受委托\n询问失踪经过");
                    if (party == 4 && i == 0) assertEquals("Typing preserves the manually reviewed teammate", "true", js("document.querySelector('.party-strip-compact').scrollLeft===window.qaReviewedPartyPosition"));
                    click(i == party - 1 ? "提交" : "下一位");
                    if (i < party - 1) {
                        assertEquals("Next investigator can keep typing immediately", "true", js("document.activeElement===document.querySelector('.dock-input')"));
                        assertEquals("Completed actor is indicated", "true", js("document.querySelectorAll('.party-compact')[" + i + "].textContent.includes('已提交')"));
                        if (party == 4) {
                            String exposed = js("(()=>{const a=document.querySelector('.party-compact[aria-current=step]'),r=a.getBoundingClientRect(),s=a.parentElement.getBoundingClientRect();return r.left>=s.left-.5&&r.right<=s.right+.5&&document.documentElement.scrollWidth<=innerWidth})()");
                            if (!"true".equals(exposed)) screenshot("party-scroll-diagnostic");
                            assertEquals("The next actor is fully exposed without scrolling the story: " + js("(()=>{const a=document.querySelector('.party-compact[aria-current=step]'),p=a.parentElement;return {actor:a.textContent,card:a.getBoundingClientRect().toJSON(),strip:p.getBoundingClientRect().toJSON(),scrollLeft:p.scrollLeft,scrollWidth:p.scrollWidth,clientWidth:p.clientWidth,gap:getComputedStyle(p).gap,snap:getComputedStyle(p).scrollSnapType,pageWidth:document.documentElement.scrollWidth,innerWidth}})()"), "true", exposed);
                            if (i == 2) screenshot("compact-four-last-actor");
                        }
                        readablePartyDossiers();
                    }
                }
                if (party == 4) viewport(390, 844);
                if (party == 1) {
                    until("document.querySelector('.thinking-line-text')");
                    until("document.querySelector('.thinking-line-nib').naturalHeight===128");
                    js("window.qaWaitingFirst=document.querySelector('.thinking-line-text').textContent;window.qaWaitingHeight=document.querySelector('.thinking-line').getBoundingClientRect().height");
                    until("document.querySelector('.thinking-line-text') && document.querySelector('.thinking-line-text').textContent!==window.qaWaitingFirst");
                    assertEquals("Waiting captions change without moving the story or exceeding the phone", "true", js("(()=>{const e=document.querySelector('.thinking-line-text'),r=e.getBoundingClientRect();return parseFloat(getComputedStyle(e).fontSize)>=15&&r.left>=0&&r.right<=innerWidth&&document.querySelector('.thinking-line').getBoundingClientRect().height===window.qaWaitingHeight})()"));
                    assertEquals("Painted waiting nib remains decorative and the caption stays still", "true", js("(()=>{const n=document.querySelector('.thinking-line-nib'),t=document.querySelector('.thinking-line-text');return n.naturalWidth===55&&n.offsetHeight===24&&n.alt===''&&n.getAttribute('aria-hidden')==='true'&&getComputedStyle(t).animationName==='none'&&document.querySelectorAll('.thinking-line-dots i').length===3})()"));
                    js("window.qaWaitMotion=Array.from(document.querySelectorAll('.thinking-line-nib,.thinking-line-dots i')).map(e=>getComputedStyle(e).transform+'|'+getComputedStyle(e).opacity).join(';')");
                    until("Array.from(document.querySelectorAll('.thinking-line-nib,.thinking-line-dots i')).map(e=>getComputedStyle(e).transform+'|'+getComputedStyle(e).opacity).join(';')!==window.qaWaitMotion");
                    js("document.querySelector('.narrative-scroll').scrollTop=0");
                    assertEquals("Waiting remains visible when reading earlier messages", "true", js("(()=>{const w=document.querySelector('.thinking-line').getBoundingClientRect(),s=document.querySelector('.narrative-scroll').getBoundingClientRect(),p=document.querySelector('.narrative-panel').getBoundingClientRect();return w.height===36&&w.top>=s.bottom-.5&&w.bottom<=p.bottom&&s.height>=24&&w.left>=p.left&&w.right<=p.right})()"));
                    screenshot("varied-wait-phone");
                }
                until("document.body.innerText.includes('Android 调查继续')");
                assertEquals(1, narratorCalls.get());
                until("document.querySelectorAll('.story-message.player').length === " + party);
                assertEquals("Multiline player action is preserved in the actual turn", "true", js("document.querySelector('.story-message.player .player-message-text').textContent.includes('接受委托'+String.fromCharCode(10)+'询问失踪经过')"));
                until("document.querySelector('.dock-input') && !document.querySelector('.dock-input').disabled");
                assertEquals("Phone replies leave the input unfocused so players can read first", "false", js("document.activeElement===document.querySelector('.dock-input')"));
                awaitSettledIme(false);
                assertNoResizeErrors();
                until("document.querySelectorAll('.suggestion-row button').length===3");
                assertEquals("Distinct choices remain beside the existing story route", "true", js("Array.from(document.querySelectorAll('.suggestion-row button')).map(e=>e.textContent).join('|')==='前往老赫特酒吧继续调查|检查门锁|观察窗边'"));
                nativeTap(".suggestion-row button:first-child");
                until("document.querySelector('.dock-input').value==='前往老赫特酒吧继续调查'");
                assertEquals("A suggestion only fills the current draft", "true", js("document.querySelector('.dock-input').value==='前往老赫特酒吧继续调查'"));
                assertEquals("A suggestion never starts another model turn", 1, narratorCalls.get());
                assertEquals("No additional action was submitted", String.valueOf(party), js("document.querySelectorAll('.story-message.player').length"));
                assertEquals("No API token in WebView storage", "null", js("localStorage.getItem('trpg-api')"));
                assertFalse(context.getSharedPreferences("fog-game-v1", Context.MODE_PRIVATE).getAll().toString().contains("android-qa-only-token"));
                assertTrue(context.getSharedPreferences("fog-game-v1", Context.MODE_PRIVATE).contains("trpg-api"));
                fill(".dock-input", "下轮先观察门廊\n再询问雨夜访客");
                SystemClock.sleep(300);
                js("window.qaPortraitUpgradeReady=false;Capacitor.Plugins.GameStorage.readAll().then(async({values})=>{"
                    + "const record=JSON.parse(values['trpg-android-session-v1']);record.state.players.forEach((p,i)=>p.portrait='/assets/'+String(i+1).padStart(16,'0')+'-oldBuild.webp');"
                    + "window.qaDistinctSavedChoices=Object.values(record.state.suggestionsByPlayerId).every(list=>list.length===3&&new Set(list).size===3&&list[1]==='检查门锁'&&list[2]==='观察窗边');"
                    + "await Capacitor.Plugins.GameStorage.write({key:'trpg-android-session-v1',value:JSON.stringify(record)});window.qaPortraitUpgradeReady=true;})");
                until("window.qaPortraitUpgradeReady");
                assertEquals("Encrypted save retains distinct choices within the existing story route limit", "true", js("window.qaDistinctSavedChoices"));
                activity.recreate(); until("document.querySelector('.title-screen')"); viewport(390, 844); click("继续游戏");
                until("document.body.innerText.includes('Android 调查继续')");
                assertEquals("No repeated API prompt", "false", js("Boolean(document.querySelector('#api-config-modal-title'))"));
                assertEquals("Encrypted session recovery keeps every line of the draft", "true", js("document.querySelector('.dock-input').value.split(String.fromCharCode(10)).join('|')==='下轮先观察门廊|再询问雨夜访客'"));
                assertEquals("Encrypted recovery retains distinct choices and the existing route", "true", js("Array.from(document.querySelectorAll('.suggestion-row button')).map(e=>e.textContent).join('|')==='前往老赫特酒吧继续调查|检查门锁|观察窗边'"));
                until("document.querySelector('.dock-actor-avatar img')?.complete&&document.querySelector('.dock-actor-avatar img').naturalWidth>0");
                nativeTap(".dock-actor-avatar"); until("document.querySelector('.investigator-sheet')");
                for (int i = 0; i < party; i++) {
                    if (party > 1) {
                        nativeTap(".investigator-party button:nth-child(" + (i + 1) + ")");
                        until("document.querySelector('.investigator-party button:nth-child(" + (i + 1) + ")').getAttribute('aria-pressed')==='true'");
                    }
                    until("document.querySelector('.investigator-portrait img')?.complete&&document.querySelector('.investigator-portrait img').naturalWidth>0");
                    assertEquals("Updated artwork does not retain an obsolete saved build URL", "true", js("!document.querySelector('.investigator-portrait img').getAttribute('src').includes('oldBuild')"));
                }
                nativeTap("[aria-label='关闭调查员档案']"); until("!document.querySelector('.investigator-sheet')");
                assertEquals("Inspecting updated artwork retains the recovered draft", "true", js("document.querySelector('.dock-input').value.split(String.fromCharCode(10)).join('|')==='下轮先观察门廊|再询问雨夜访客'"));
                screenshot("restored-" + party);
                if (party == 1) {
                    js("document.querySelector('.drawer-tab').click()");
                    until("document.querySelector('.info-drawer-react.open .case-board-mobile-card')");
                    assertEquals("Case information is reachable on a short display", "true", js("innerWidth>900 || document.querySelector('.case-board-mobile-card').getBoundingClientRect().top < innerHeight-60"));
                    screenshot("caseboard");
                    js("document.querySelector('[aria-label=关闭资料]').click()");
                    menu("返回首页"); until("document.querySelector('.title-resume-preview')");
                    js("window.qaEmptyNpcReady=false;Capacitor.Plugins.GameStorage.readAll().then(async ({values})=>{"
                        + "const record=JSON.parse(values['trpg-android-session-v1']);record.state.activeNpcId=null;record.state.activeNpcName=null;"
                        + "await Capacitor.Plugins.GameStorage.write({key:'trpg-android-session-v1',value:JSON.stringify(record)});window.qaEmptyNpcReady=true;})");
                    until("window.qaEmptyNpcReady"); activity.recreate(); until("document.querySelector('.title-resume-preview')"); viewport(390, 844);
                    click("继续游戏"); until("document.querySelector('.dock-input')");
                    assertEquals("Encrypted continuation keeps an explicitly empty NPC stage", "0", js("document.querySelectorAll('.scene-npc').length"));
                    assertEquals("Empty-stage recovery keeps the full backdrop", "true", js("document.querySelector('.scene-backdrop-img').getBoundingClientRect().height>100&&getComputedStyle(document.querySelector('.scene-backdrop-img')).objectFit==='contain'"));
                    assertEquals("Empty-stage recovery keeps the multiline draft", "true", js("document.querySelector('.dock-input').value.split(String.fromCharCode(10)).join('|')==='下轮先观察门廊|再询问雨夜访客'"));
                    screenshot("restored-empty-npc");
                }
                if (party == 4) {
                    viewport(390, 844); menu("返回首页");
                    // Long-history fixture goes through the production encrypted session port.
                    js("window.qaHistoryReady=false;Capacitor.Plugins.GameStorage.readAll().then(async ({values})=>{"
                        + "const record=JSON.parse(values['trpg-android-session-v1']);"
                        + "const text='伊莎贝拉·摩勒与亨利·格雷站在摩勒住宅，艾达·华莱士查看求助信。托马斯·贝尔记录谈话，罗伯特·肖留意窗台，调查员决定进行心理学检定。';"
                        + "record.state.messages=Array.from({length:200},(_,i)=>({id:'long-'+i,type:'dm',text:text+'记录 '+(i+1)+'。',keywords:[{text:'求助信',kind:'clue'}]}));"
                        + "await Capacitor.Plugins.GameStorage.write({key:'trpg-android-session-v1',value:JSON.stringify(record)});window.qaHistoryReady=true;})");
                    until("window.qaHistoryReady"); activity.recreate(); until("document.querySelector('.title-resume-preview')"); viewport(390, 844);
                    click("继续游戏"); until("document.querySelectorAll('.story-message.dm').length===200");
                    nativeTap(".narrative-toggle-btn"); awaitUiMotion();
                    js("window.qaHistoryText=JSON.stringify(Array.from(document.querySelectorAll('.story-message.dm p'),e=>e.textContent));window.qaHistoryColors=JSON.stringify(Array.from(document.querySelector('.story-message.dm').querySelectorAll('.narrative-mark-person'),e=>e.style.getPropertyValue('--person-color')));document.querySelector('.narrative-scroll').scrollTop=100");
                    awaitSettledScroll(".narrative-scroll");
                    SharedPreferences preferences = context.getSharedPreferences("fog-game-v1", Context.MODE_PRIVATE);
                    AtomicInteger draftCommits = new AtomicInteger();
                    SharedPreferences.OnSharedPreferenceChangeListener commitListener = (store, key) -> {
                        if ("trpg-android-session-v1".equals(key)) draftCommits.incrementAndGet();
                    };
                    preferences.registerOnSharedPreferenceChangeListener(commitListener);
                    String rapidDraft = "先记录信的日期，然后观察门锁和窗台。";
                    try {
                        for (int length = 1; length <= rapidDraft.length(); length++) {
                            fill(".dock-input", rapidDraft.substring(0, length)); SystemClock.sleep(40);
                        }
                        js("window.qaRapidDraftSaved=false;const probe=setInterval(()=>Capacitor.Plugins.GameStorage.readAll().then(({values})=>{"
                            + "const record=JSON.parse(values['trpg-android-session-v1']);const actor=record.state.players[record.state.currentActorIndex];"
                            + "if(record.state.declarations[actor.id]===" + JSONObject.quote(rapidDraft) + "){window.qaRapidDraftSaved=true;clearInterval(probe);}}),100);");
                        until("window.qaRapidDraftSaved");
                        int writes = draftCommits.get();
                        assertTrue("Rapid typing commits fewer full encrypted sessions than individual characters", writes > 0 && writes < rapidDraft.length() / 2);
                        System.out.println("DRAFT_AUTOSAVE: inputEvents=" + rapidDraft.length() + ", encryptedCommits=" + writes);
                    } finally { preferences.unregisterOnSharedPreferenceChangeListener(commitListener); }
                    fill(".dock-input", "记下求助信日期\n然后检查门廊");
                    assertEquals("Long history input keeps all prose, colors and reading position", "true", js("JSON.stringify(Array.from(document.querySelectorAll('.story-message.dm p'),e=>e.textContent))===window.qaHistoryText&&JSON.stringify(Array.from(document.querySelector('.story-message.dm').querySelectorAll('.narrative-mark-person'),e=>e.style.getPropertyValue('--person-color')))===window.qaHistoryColors&&document.querySelector('.narrative-scroll').scrollTop===100"));
                    nativeTap(".npc-nameplate"); until("document.querySelector('.entity-detail-card')");
                    nativeTap(".entity-detail-close"); until("!document.querySelector('.entity-detail-card')");
                    assertEquals("Known NPC return retains multiline action and reading", "true", js("document.querySelector('.dock-input').value==='记下求助信日期'+String.fromCharCode(10)+'然后检查门廊'&&document.querySelector('.narrative-scroll').scrollTop===100"));
                    nativeTap(".dock-submit"); until("document.querySelector('.dock-input').getAttribute('aria-label')==='艾达·华莱士的行动'");
                    assertEquals("Changing actor retains the entire long history without calling the model", "true", js("document.querySelectorAll('.story-message.dm').length===200&&document.querySelectorAll('.story-message.player').length===1&&document.querySelector('.narrative-scroll').scrollTop===100&&!!document.querySelector('.narrative-new-content')"));
                    assertEquals(1, narratorCalls.get()); screenshot("long-history-input");
                    CountDownLatch backgroundCommit = new CountDownLatch(1);
                    SharedPreferences.OnSharedPreferenceChangeListener backgroundListener = (store, key) -> {
                        if ("trpg-android-session-v1".equals(key)) backgroundCommit.countDown();
                    };
                    preferences.registerOnSharedPreferenceChangeListener(backgroundListener);
                    String backgroundDraft = "切后台前继续记录日期\n下一位的最后一笔";
                    try {
                        fill(".dock-input", backgroundDraft);
                        activity.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);
                        assertTrue("Backgrounding durably flushes the latest draft", backgroundCommit.await(5, TimeUnit.SECONDS));
                    } finally { preferences.unregisterOnSharedPreferenceChangeListener(backgroundListener); }
                    activity.recreate(); activity.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);
                    until("document.querySelector('.title-continue')"); viewport(390,844); click("继续游戏");
                    assertEquals("The real encrypted background checkpoint restores the final multiline edit", JSONObject.quote(backgroundDraft), js("document.querySelector('.dock-input').value"));
                    assertEquals("Background recovery keeps the complete investigation", "true", js("document.querySelectorAll('.story-message.dm').length===200&&document.querySelectorAll('.story-message.player').length===1"));
                    assertEquals(1, narratorCalls.get()); screenshot("draft-background-restored");
                }
            } finally { if (activity != null) activity.close(); }
        }
    }

    @Test public void corruptAutomaticRecordAndExitRemainUsable() throws Exception {
        fresh();
        try {
            viewport(390, 844); click("开始游戏"); click("进入游戏");
            fill(".dock-input", "继续保留手动记录里的调查安排。"); menu("保存游戏");
            until("document.querySelector('.game-notice') && document.querySelector('.game-notice').textContent==='已保存'");
            js("window.qaCorruptReady=false;Capacitor.Plugins.GameStorage.write({key:'trpg-android-session-v1',value:'NOT_JSON_INTERNAL_PRIVATE_HINT'}).then(()=>window.qaCorruptReady=true)");
            until("window.qaCorruptReady"); activity.recreate(); until("document.querySelector('.android-notice')");
            assertEquals("Corrupt automatic records show only a usable recovery message", "true", js("(()=>{const t=document.querySelector('.android-notice').textContent;return t.includes('自动续玩记录暂时无法读取')&&!/NOT_JSON|Unexpected|SyntaxError|INTERNAL|position|JSON/.test(t)})()"));
            reachable(".android-notice button"); screenshot("corrupt-session-notice"); click("知道了");
            click("继续游戏"); until("document.querySelector('.dock-input')");
            assertEquals("The independent manual record still restores the full draft", "\"继续保留手动记录里的调查安排。\"", js("document.querySelector('.dock-input').value"));
            menu("返回首页");
            for (int[] size : new int[][] {{320,568},{390,844},{430,932},{562,1000}}) {
                viewport(size[0], size[1]);
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                until("document.querySelector('.android-exit-card')");
                titlePlayback(true);
                assertEquals("Exit describes navigation rather than ending the investigation", "true", js("document.querySelector('.android-exit-card h2').textContent==='退出游戏？'&&document.activeElement.textContent==='留在游戏'"));
                reachable(".android-exit-card footer .secondary-action"); reachable(".android-exit-card footer .primary-btn");
                screenshot("exit-dialog-"+size[0]);
                viewport(size[0],300); reachable(".android-exit-card footer .secondary-action"); reachable(".android-exit-card footer .primary-btn");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                until("!document.querySelector('.android-exit-card')");
                titlePlayback(false);
                assertEquals("Cancelling exit retains the current continuation", "true", js("Boolean(document.querySelector('.title-resume-preview'))"));
            }
            byte[] tampered = Base64.decode(context.getSharedPreferences("fog-game-v1", Context.MODE_PRIVATE).getString("trpg-android-session-v1", ""), Base64.DEFAULT);
            assertTrue("Automatic record has a real encrypted payload", tampered.length >= 29);
            tampered[tampered.length - 1] ^= 1;
            for (String corruptCiphertext : new String[] { "NOT_BASE64_CIPHERTEXT_PRIVATE_HINT", Base64.encodeToString(tampered, Base64.NO_WRAP) }) {
                context.getSharedPreferences("fog-game-v1", Context.MODE_PRIVATE).edit().putString("trpg-android-session-v1", corruptCiphertext).commit();
                activity.recreate(); until("document.querySelector('.title-screen') && document.querySelector('.android-notice')");
                assertEquals("A damaged encrypted record does not block other records or reveal diagnostics", "true", js("(()=>{const t=document.querySelector('.android-notice').textContent;return t.includes('部分本机记录暂时无法读取')&&!/BASE64|CIPHERTEXT|PRIVATE|STORAGE_READ_FAILED|解密/.test(t)&&Boolean(document.querySelector('.title-resume-preview'))})()"));
                assertEquals("Unreadable encrypted data remains on disk", corruptCiphertext, context.getSharedPreferences("fog-game-v1", Context.MODE_PRIVATE).getString("trpg-android-session-v1", ""));
                viewport(390, 844); screenshot("partial-storage-recovery"); click("知道了"); click("继续游戏");
                until("document.querySelector('.dock-input')");
                assertEquals("A damaged automatic ciphertext still permits the original manual continuation", "\"继续保留手动记录里的调查安排。\"", js("document.querySelector('.dock-input').value"));
                js("window.qaHomeSavedAt=Date.now();window.qaHomeDurable=false");
                menu("返回首页");
                // Let the real home snapshot finish before injecting the next damaged payload.
                until("(()=>{Capacitor.Plugins.GameStorage.readAll().then(r=>{const raw=r.values['trpg-android-session-v1'];if(raw&&JSON.parse(raw).savedAt>=window.qaHomeSavedAt)window.qaHomeDurable=true;});return window.qaHomeDurable})()");
            }
        } finally { if (activity != null) activity.close(); }
    }

    private void readRetryCheckpoint(String name, int playerMessages, int pendingActions) throws Exception {
        js("(()=>{window.qaRetryCheckpointDone=false;const deadline=performance.now()+10000;const read=async()=>{try{const {values}=await Capacitor.Plugins.GameStorage.readAll(),s=JSON.parse(values['trpg-android-session-v1']).state;"
            + "if(s.isThinking||s.messages.filter(m=>m.type==='player').length!==" + playerMessages + "||(s.pendingDmActions?.length??0)!==" + pendingActions + "){if(performance.now()<deadline){setTimeout(read,50);return}throw new Error('Native checkpoint did not settle')}"
            + "window.qaRetry.states[" + JSONObject.quote(name) + "]={players:s.players.map(p=>({id:p.id,name:p.name})),actor:s.currentActorIndex,declarations:s.declarations,pending:s.pendingDmActions??[],playerMessages:s.messages.filter(m=>m.type==='player').map(m=>({id:m.id,player:m.playerName,text:m.text}))};"
            + "}catch(error){window.qaRetry.checkpointError=String(error)}window.qaRetryCheckpointDone=true};read()})()");
        until("window.qaRetryCheckpointDone");
        assertEquals("The real encrypted checkpoint settles without modifying game state", "null", js("window.qaRetry.checkpointError"));
    }

    private void nativeTabToRetry() throws Exception {
        for (int step = 0; step < 32; step++) {
            if ("true".equals(js("document.activeElement===document.querySelector('.check-card > button')"))) return;
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_TAB);
        }
        fail("Real Android Tab did not reach the enabled retry button: " + js("window.qaRetryTake('tab-timeout')"));
    }

    private void assertRetryImeClosed(String stage) throws Exception {
        awaitSettledIme(false);
        boolean visible = imeVisible();
        js("window.qaRetry.ime.push({stage:" + JSONObject.quote(stage) + ",visible:" + visible + "})");
        assertFalse("Retry feedback does not open the real Android input method: " + stage, visible);
        assertEquals("Retry feedback leaves the phone action input unfocused", "false", js("document.activeElement===document.querySelector('.dock-input')"));
    }

    @Test public void retryFailureRestoresOwnedNativeFocusAndRespectsAnActiveMenu() throws Exception {
        for (int party : new int[] {1, 2, 4}) {
            AtomicInteger narratorCalls = new AtomicInteger(), successAttempt = new AtomicInteger(-1);
            java.util.List<String> requests = java.util.Collections.synchronizedList(new java.util.ArrayList<>());
            AtomicReference<String> dispatchError = new AtomicReference<>();
            CountDownLatch[] gates = new CountDownLatch[8], requested = new CountDownLatch[8];
            for (int i = 0; i < gates.length; i++) { gates[i] = new CountDownLatch(1); requested[i] = new CountDownLatch(1); }
            gates[0].countDown();
            String narrative = "Android 重试后调查继续，伊莎贝拉等待调查员继续询问失踪前的经过。";
            MockWebServer server = new MockWebServer();
            server.setDispatcher(new Dispatcher() {
                @Override public MockResponse dispatch(RecordedRequest request) {
                    String body = request.getBody().readUtf8();
                    boolean narrator = body.contains("COC 第七版 AI DM Agent");
                    if (narrator) {
                        int attempt = narratorCalls.incrementAndGet();
                        try {
                            org.json.JSONArray input = new JSONObject(body).getJSONArray("input");
                            String userInput = "";
                            for (int i = 0; i < input.length(); i++) if ("user".equals(input.getJSONObject(i).optString("role"))) userInput = input.getJSONObject(i).getString("content");
                            requests.add(userInput);
                            if (attempt <= requested.length) requested[attempt - 1].countDown();
                            if (attempt > gates.length || !gates[attempt - 1].await(30, TimeUnit.SECONDS)) dispatchError.compareAndSet(null, "Narrator gate timed out at attempt " + attempt);
                        } catch (Exception error) { dispatchError.compareAndSet(null, error.getClass().getSimpleName()); }
                        if (attempt != successAttempt.get()) return new MockResponse().setResponseCode(503).setHeader("Content-Type", "application/json").setBody("{\"error\":{\"message\":\"qa connection unavailable\"}}");
                    }
                    String content = narrator ? "{\"narrative\":" + JSONObject.quote(narrative) + ",\"activeNpc\":\"伊莎贝拉·摩勒\",\"nextPrompt\":\"\",\"playerChoices\":{},\"keywords\":[]}" : "{\"facts\":[],\"nodes\":[],\"edges\":[]}";
                    return new MockResponse().setHeader("Content-Type", "application/json").setBody("{\"output_text\":" + JSONObject.quote(content) + "}");
                }
            });
            server.start();
            try {
                fresh(); viewport(390, 844); configure(server.url("/v1").toString(), "responses"); click("开始游戏");
                for (int i = 1; i < party; i++) js("document.querySelectorAll('.preset-selection-input')[" + i + "].click()");
                until("document.querySelectorAll('.preset-selection-input:checked').length===" + party); click("进入游戏");
                for (int i = 0; i < party; i++) {
                    fill(".dock-input", "接受委托\n询问失踪经过");
                    // Earlier investigators intentionally keep typing focus; dismiss only that preparation IME.
                    if (imeVisible()) { InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK); awaitSettledIme(false); }
                    nativeTap(".dock-submit");
                    if (i < party - 1) until("document.querySelectorAll('.party-compact')[" + i + "].textContent.includes('已提交')");
                }
                until("document.querySelector('.check-card > button')?.textContent==='重试本轮'&&!document.querySelector('.thinking-line')");
                assertEquals("The first real submitted turn fails exactly once", 1, narratorCalls.get());
                js("(()=>{const q=window.qaRetry={snapshots:[],clicks:[],ime:[],states:{},checkpointError:null,inputFocuses:0};let id=0;const ids=new WeakMap();"
                    + "window.qaRetryTake=label=>{const b=document.querySelector('.check-card > button'),input=document.querySelector('.dock-input'),focus=document.activeElement;if(b&&!ids.has(b))ids.set(b,++id);"
                    + "const s={label,at:performance.now(),retryId:b?ids.get(b):null,retryFocused:focus===b,bodyFocused:focus===document.body,inputFocused:focus===input,inputDisabled:input.disabled,draft:input.value,actor:input.getAttribute('aria-label'),party:Array.from(document.querySelectorAll('.party-compact strong'),e=>e.textContent),playerMessages:document.querySelectorAll('.story-message.player').length,inputFocuses:q.inputFocuses,focusLabel:focus?.getAttribute('aria-label')??focus?.textContent?.trim(),menuOpen:!!document.querySelector('.game-menu[role=dialog]')};q.snapshots.push(s);return s};"
                    + "const clicked=e=>{const b=e.target.closest?.('.check-card > button');if(b?.textContent==='重试本轮')q.clicks.push({at:performance.now(),trusted:e.isTrusted,detail:e.detail,ownedFocus:document.activeElement===b})};"
                    + "const focused=e=>{if(e.target.matches?.('.dock-input'))q.inputFocuses++};document.addEventListener('click',clicked,true);document.addEventListener('focusin',focused,true);"
                    + "window.qaRetryCleanup=()=>{document.removeEventListener('click',clicked,true);document.removeEventListener('focusin',focused,true)};window.qaRetryFirstButton=document.querySelector('.check-card > button');window.qaRetryTake('initial-failure')})()");
                assertRetryImeClosed("initial-failure"); readRetryCheckpoint("initial", party, party);
                assertEquals("Ordinary submission resets the actor/drafts but retains every actual pending action", "true", js("window.qaRetry.states.initial.actor===0&&Object.values(window.qaRetry.states.initial.declarations).every(v=>v==='')&&window.qaRetry.states.initial.pending.every(a=>a.action==='接受委托'+String.fromCharCode(10)+'询问失踪经过')"));
                nativeTap(".check-card > button"); until("document.querySelector('.thinking-line')&&window.qaRetry.clicks.length===1");
                assertTrue("The real touch reaches the local narrator gate", requested[1].await(10, TimeUnit.SECONDS));
                assertEquals("The retry uses one trusted Android touch and retires its original button", "true", js("window.qaRetry.clicks[0].trusted&&window.qaRetry.clicks[0].detail>0&&!window.qaRetryFirstButton.isConnected&&document.activeElement===document.body&&document.querySelector('.dock-input').disabled"));
                assertEquals("Native touch starts only one retry request", 2, narratorCalls.get());
                boolean touchOwnedFocus = "true".equals(js("window.qaRetry.clicks[0].ownedFocus"));
                js("window.qaRetry.touchOwnedFocus=" + touchOwnedFocus + ";window.qaRetryTake('touch-waiting')"); assertRetryImeClosed("touch-waiting");
                gates[1].countDown(); until("document.querySelector('.check-card > button')?.textContent==='重试本轮'&&!document.querySelector('.thinking-line')");
                if (touchOwnedFocus) until("document.activeElement===document.querySelector('.check-card > button')");
                js("window.qaRetryTake('touch-failed')"); assertRetryImeClosed("touch-failed");
                readRetryCheckpoint("touchFailed", party, party);
                assertEquals("A touch retry failure preserves the actual pending round without duplicate player messages", "true", js("JSON.stringify(window.qaRetry.states.initial)===JSON.stringify(window.qaRetry.states.touchFailed)&&window.qaRetry.inputFocuses===0&&window.qaRetry.snapshots[0].retryId!==window.qaRetry.snapshots.at(-1).retryId"));
                if (!touchOwnedFocus) {
                    // A WebView may leave a touched button unfocused. Record that boundary, then exercise real keyboard ownership.
                    nativeTabToRetry(); js("window.qaRetryTake('real-tab-owned')");
                    InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_ENTER);
                    until("document.querySelector('.thinking-line')&&window.qaRetry.clicks.length===2");
                    assertTrue("The real keyboard retry reaches the local narrator gate", requested[2].await(10, TimeUnit.SECONDS));
                    assertEquals("A real Enter captures focus on the actual enabled retry", "true", js("window.qaRetry.clicks.at(-1).trusted&&window.qaRetry.clicks.at(-1).ownedFocus&&document.activeElement===document.body"));
                    assertEquals(3, narratorCalls.get()); gates[2].countDown();
                    until("document.activeElement===document.querySelector('.check-card > button')&&!document.querySelector('.thinking-line')");
                    js("window.qaRetryTake('keyboard-failed')"); assertRetryImeClosed("keyboard-failed");
                    readRetryCheckpoint("keyboardFailed", party, party);
                    assertEquals("Keyboard failure restores the replacement without changing the round", "true", js("JSON.stringify(window.qaRetry.states.initial)===JSON.stringify(window.qaRetry.states.keyboardFailed)&&window.qaRetry.inputFocuses===0"));
                }
                int success = narratorCalls.get() + 1; successAttempt.set(success);
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_ENTER);
                until("document.querySelector('.thinking-line')&&document.querySelector('.dock-input').disabled");
                assertTrue("Restored Enter reaches the local success gate", requested[success - 1].await(10, TimeUnit.SECONDS));
                assertEquals("Restored retry focus alone starts the next real Enter request", success, narratorCalls.get());
                assertEquals("The retry Enter is trusted and retains focus ownership", "true", js("window.qaRetry.clicks.at(-1).trusted&&window.qaRetry.clicks.at(-1).ownedFocus"));
                gates[success - 1].countDown();
                until("Array.from(document.querySelectorAll('.story-message.dm')).some(e=>e.textContent.includes(" + JSONObject.quote(narrative) + "))&&!document.querySelector('.dock-input').disabled&&!document.querySelector('.check-card')");
                js("window.qaRetryTake('success')"); assertRetryImeClosed("success"); readRetryCheckpoint("success", party, 0);
                assertEquals("Successful retry clears only completed declarations and returns to the first actual investigator", "true", js("(()=>{const a=window.qaRetry.states.initial,b=window.qaRetry.states.success;return JSON.stringify(a.players)===JSON.stringify(b.players)&&JSON.stringify(a.playerMessages)===JSON.stringify(b.playerMessages)&&b.actor===0&&Object.values(b.declarations).every(v=>v==='')&&document.querySelector('.dock-input').value===''&&window.qaRetry.inputFocuses===0})()"));
                int menuInitial = narratorCalls.get() + 1; gates[menuInitial - 1].countDown();
                for (int i = 0; i < party; i++) {
                    fill(".dock-input", "保持安静\n记录委托人的回答");
                    if (imeVisible()) { InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK); awaitSettledIme(false); }
                    nativeTap(".dock-submit");
                    if (i < party - 1) until("document.querySelectorAll('.party-compact')[" + i + "].textContent.includes('已提交')");
                }
                until("document.querySelector('.check-card > button')?.textContent==='重试本轮'&&!document.querySelector('.thinking-line')");
                assertEquals(menuInitial, narratorCalls.get()); readRetryCheckpoint("menuBefore", party * 2, party);
                js("window.qaRetry.inputFocuses=0;window.qaRetryTake('menu-round-failed')"); assertRetryImeClosed("menu-round-failed");
                nativeTabToRetry(); int menuAttempt = narratorCalls.get() + 1;
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_ENTER);
                until("document.querySelector('.thinking-line')");
                assertTrue("The owned Enter reaches the menu attempt gate", requested[menuAttempt - 1].await(10, TimeUnit.SECONDS));
                assertEquals(menuAttempt, narratorCalls.get());
                assertEquals("The gated menu attempt really owns retry focus before opening the menu", "true", js("window.qaRetry.clicks.at(-1).trusted&&window.qaRetry.clicks.at(-1).ownedFocus"));
                nativeTap(".menu-button"); until("document.querySelector('.game-menu[role=dialog]')&&document.activeElement===document.querySelector('.game-menu-close')");
                js("window.qaRetryMenuFocus=document.activeElement;window.qaRetryTake('menu-waiting')");
                gates[menuAttempt - 1].countDown();
                until("document.querySelector('.check-card > button')?.textContent==='重试本轮'&&!document.querySelector('.thinking-line')");
                assertEquals("A retry failure cannot steal focus from the real active menu", "true", js("document.querySelector('.game-menu[role=dialog][aria-modal=true]')&&document.activeElement===window.qaRetryMenuFocus&&document.activeElement===document.querySelector('.game-menu-close')&&document.activeElement!==document.querySelector('.check-card > button')&&document.querySelector('.dock-input').disabled&&window.qaRetry.inputFocuses===0"));
                js("window.qaRetryTake('menu-failed')"); assertRetryImeClosed("menu-failed"); readRetryCheckpoint("menuFailed", party * 2, party);
                assertEquals("The menu failure preserves party, actor, draft and exact pending actions", "true", js("JSON.stringify(window.qaRetry.states.menuBefore)===JSON.stringify(window.qaRetry.states.menuFailed)"));
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                until("!document.querySelector('.game-menu[role=dialog]')&&document.activeElement===document.querySelector('.menu-button')");
                js("window.qaRetryTake('native-back')"); assertRetryImeClosed("native-back");
                assertEquals("Back keeps the menu opener rather than an unrelated retry/input", "true", js("document.activeElement!==document.querySelector('.check-card > button')&&window.qaRetry.inputFocuses===0&&document.querySelectorAll('.story-message.player').length===" + (party * 2)));
                assertEquals("No retry emits a duplicate narrator request", menuAttempt, narratorCalls.get());
                assertNull("Local native retry requests have no fixture/gate errors", dispatchError.get());
                org.json.JSONArray requestEvidence = new org.json.JSONArray();
                synchronized (requests) { for (String input : requests) requestEvidence.put(input); }
                js("window.qaRetry.requests=" + requestEvidence.toString());
                assertEquals("Every real retry sends the retained player's actual multiline action", "true", js("window.qaRetry.requests.length===" + menuAttempt + "&&window.qaRetry.requests.slice(0," + success + ").every(s=>window.qaRetry.states.initial.pending.every(a=>s.includes(a.action)))&&window.qaRetry.requests.slice(" + success + ").every(s=>window.qaRetry.states.menuBefore.pending.every(a=>s.includes(a.action)))"));
                assertNoResizeErrors(); if (party == 2) screenshot("retry-focus-native-party-2");
                System.out.println("RETRY_FOCUS_NATIVE: " + js("JSON.stringify({party:" + party + ",touchOwnedFocus:window.qaRetry.touchOwnedFocus,trustedClicks:window.qaRetry.clicks.length,requests:" + narratorCalls.get() + ",inputFocuses:window.qaRetry.inputFocuses,ime:window.qaRetry.ime,menuPreserved:window.qaRetry.snapshots.find(s=>s.label==='menu-failed').menuOpen})"));
            } finally {
                for (CountDownLatch gate : gates) gate.countDown();
                try { if (activity != null) {
                    js("window.qaRetryCleanup?.()");
                    savePanelMotionTrace("retry-focus-native-party-" + party, "({party:" + party + ",nativeContext:{native:Capacitor.isNativePlatform(),platform:Capacitor.getPlatform()},viewport:{width:innerWidth,height:innerHeight,scope:'fixed WebView CSS pixels'},evidenceSource:'Real Android touch and KeyEvent; capture listeners only observe focus/clicks; input preparation uses the existing setter helper; encrypted checkpoints are read only',trace:window.qaRetry??null,narratorCalls:" + narratorCalls.get() + ",dispatchError:" + (dispatchError.get() == null ? "null" : JSONObject.quote(dispatchError.get())) + "})");
                } } finally { try { if (activity != null) activity.close(); } finally { server.shutdown(); } }
            }
        }
    }

    @Test public void nativeCancellationStopsTheNetworkCall() throws Exception {
        try (MockWebServer server = new MockWebServer()) {
            server.enqueue(new MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE)); server.start(); fresh();
            js("window.nativeCancelResult=null;window.Capacitor.nativePromise('AiTransport','request',{id:'999-1',url:" + JSONObject.quote(server.url("/").toString()) + ",method:'POST',body:'{}',headers:{}}).then(()=>window.nativeCancelResult='completed',e=>window.nativeCancelResult=e.code)");
            assertNotNull(server.takeRequest(10, TimeUnit.SECONDS));
            js("window.Capacitor.nativePromise('AiTransport','cancel',{id:'999-1'})");
            until("window.nativeCancelResult === 'ABORTED'");
        } finally { if (activity != null) activity.close(); }
    }

    private void watchDiceReveal() throws Exception {
        js("(()=>{"
                + "window.qaDiceReveal={rolling:null,frames:[],immediate:null};"
                + "const selectors=['.dice-roll-total','.tens-die','.ones-die','.dice-roll-outcome h3','.dice-roll-confirm'];"
                + "const rects=()=>['.dice-roll-card','.dice-roll-panel','.dice-roll-card > footer'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,left:r.left,width:r.width,height:r.height}});"
                + "let frame,timer,started=false;"
                + "const take=()=>{const button=document.querySelector('.dice-roll-confirm');"
                + "window.qaDiceReveal.frames.push({rects:rects(),focused:document.activeElement===button,items:selectors.map(s=>{const e=document.querySelector(s),a=e.getAnimations().find(a=>a.animationName==='dice-result-reveal');return {opacity:Number(getComputedStyle(e).opacity),name:a?.animationName??'none',duration:a?.effect.getTiming().duration??0}})});"
                + "if(window.qaDiceReveal.frames.length<24)frame=requestAnimationFrame(take);else observer.disconnect()};"
                + "const observer=new MutationObserver(()=>{if(started||!document.querySelector('.dice-roll-overlay.revealed'))return;started=true;"
                + "const button=document.querySelector('.dice-roll-confirm'),r=button.getBoundingClientRect();"
                + "window.qaDiceReveal.immediate={enabled:!button.disabled,live:button.closest('[role=dialog][aria-modal=true]')!==null&&!button.closest('[inert],[aria-hidden=true]'),hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('.dice-roll-confirm')===button};take()});"
                + "observer.observe(document.body,{childList:true,attributes:true,attributeFilter:['class'],subtree:true});"
                + "const start=()=>{timer=setTimeout(()=>{if(document.querySelector('.dice-roll-overlay.rolling'))window.qaDiceReveal.rolling=rects()},400)};"
                + "document.addEventListener('click',start,{once:true,capture:true});"
                + "window.qaDiceRevealCleanup=()=>{observer.disconnect();clearTimeout(timer);cancelAnimationFrame(frame);document.removeEventListener('click',start,true)};"
                + "})()");
    }

    @Test public void diceRevealMotionKeepsGeometryAndImmediateConfirmationForParty() throws Exception {
        for (int party : new int[]{1, 2, 4}) {
            AtomicInteger narratorCalls = new AtomicInteger();
            try (MockWebServer server = new MockWebServer()) {
                server.setDispatcher(new Dispatcher() {
                    @Override public MockResponse dispatch(RecordedRequest request) {
                        boolean narrator = request.getBody().readUtf8().contains("COC 第七版 AI DM Agent");
                        if (narrator) narratorCalls.incrementAndGet();
                        String content = narrator
                                ? "{\"narrative\":\"调查员留在门廊，准备继续调查。\",\"activeNpc\":null,\"nextPrompt\":\"继续调查。\",\"playerChoices\":{}}"
                                : "{\"facts\":[],\"nodes\":[],\"edges\":[]}";
                        return new MockResponse().setHeader("Content-Type", "application/json")
                                .setBody("{\"output_text\":" + JSONObject.quote(content) + ",\"output\":[]}");
                    }
                });
                server.start(); fresh(); viewport(390, 844); click("开始游戏");
                for (int i = 1; i < party; i++) js("document.querySelectorAll('.preset-selection-input')[" + i + "].click()");
                click("进入游戏"); configure(server.url("/v1").toString(), "responses");
                for (int i = 0; i < party; i++) {
                    fill(".dock-input", i == 0 ? "检查门锁。" : "留在原地思考下一步。");
                    click(i == party - 1 ? "提交" : "下一位");
                }
                until("document.querySelector('.check-card > button')&&!document.querySelector('.check-card > button').disabled");
                assertEquals("The authored first check needs no remote model", 0, narratorCalls.get());
                until("document.fonts.status==='loaded'");
                js("Math.random=()=>.549");
                watchDiceReveal(); nativeTap(".check-card > button");
                until("window.qaDiceReveal.frames.length===24");
                assertEquals("The result, faces, verdict and confirmation reveal in place with their own 160ms opacity animation", "true", js("(()=>{const f=window.qaDiceReveal.frames;return f.length>=12&&f[0].items.length===5&&f[0].items.every(e=>e.name==='dice-result-reveal'&&e.duration===160&&e.opacity<1)&&f[0].items.every((_,i)=>f.some(p=>p.items[i].opacity>0&&p.items[i].opacity<.999))&&f.at(-1).items.every(e=>e.opacity>=.999)})()"));
                assertEquals("The confirmation is enabled and hit-testable at the reveal mutation, with focus in its first frames", "true", js("(()=>{const q=window.qaDiceReveal;return q.immediate.enabled&&q.immediate.live&&q.immediate.hit&&q.frames.slice(0,3).some(f=>f.focused)})()"));
                assertEquals("Stable rolling and every result frame retain card, painted panel and reserved footer geometry", "true", js("(()=>{const q=window.qaDiceReveal;return q.rolling!==null&&q.rolling[2].height>=48&&q.frames.every(f=>f.rects.every((r,i)=>['top','left','width','height'].every(k=>Math.abs(r[k]-q.rolling[i][k])<=1)))})()"));
                assertEquals("Only the authoritative 55 and one verdict are shown", "true", js("document.querySelector('.dice-roll-total').textContent==='55'&&document.querySelector('.tens-die').textContent==='50'&&document.querySelector('.ones-die').textContent==='5'&&document.querySelectorAll('.dice-roll-outcome h3').length===1"));
                System.out.println("DICE_REVEAL_NATIVE: " + js("JSON.stringify({party:" + party + ",first:window.qaDiceReveal.frames[0].items,last:window.qaDiceReveal.frames.at(-1).items.map(e=>e.opacity),intermediate:window.qaDiceReveal.frames[0].items.map((_,i)=>window.qaDiceReveal.frames.filter(f=>f.items[i].opacity>0&&f.items[i].opacity<.999).length),footer:window.qaDiceReveal.rolling[2].height,immediate:window.qaDiceReveal.immediate})"));
                if (party == 2) screenshot("dice-reveal-native");
                js("window.qaConfirmedButton=document.querySelector('.dice-roll-confirm')");
                nativeTap(".dice-roll-confirm");
                js("window.qaConfirmedButton.click()");
                until("Array.from(document.querySelectorAll('.story-message.dm')).some(message=>message.textContent.includes('调查员留在门廊，准备继续调查。'))&&!document.querySelector('.dice-roll-overlay[role=dialog]')&&!document.querySelector('.dock-input').disabled");
                assertEquals("Repeated confirmation settles the local check once", 1, narratorCalls.get());
                assertEquals("One declaration per chosen investigator is retained", String.valueOf(party), js("document.querySelectorAll('.story-message.player').length"));
                assertEquals("Portrait confirmation leaves no focus in the outgoing result and does not force the action input", "true", js("(()=>{const active=document.activeElement;return !active.closest('.dice-roll-overlay,[inert],[aria-hidden=true]')&&active!==document.querySelector('.dock-input')})()"));
                awaitSettledIme(false);
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                until("document.querySelector('.game-menu[role=dialog]')");
                assertEquals("System Back after confirmation opens the game menu, without reviving the result", "0", js("document.querySelectorAll('.dice-roll-overlay[role=dialog]').length"));
                assertNoResizeErrors();
            } finally {
                if (activity != null) {
                    try { js("window.qaDiceRevealCleanup?.();window.qaConfirmedButton=null"); }
                    catch (Exception ignored) { /* Closing the activity also releases its observer and RAF. */ }
                    activity.close();
                }
            }
        }
    }

    @Test public void diceRecoveryReducedViewportAndSystemBack() throws Exception {
        fresh();
        try {
            click("开始游戏"); click("进入游戏"); configure("http://127.0.0.1:1/v1", "responses");
            // The authored door-lock check is entirely local until the result is confirmed.
            fill(".dock-input", "检查门锁。"); click("提交");
            until("document.querySelector('.check-card') && document.querySelector('.dock-input').disabled");
            js("Math.random = () => .999"); click("掷骰");
            until("document.querySelector('.dice-roll-overlay')");
            SystemClock.sleep(300); // Acknowledged encrypted write before activity/process recreation.
            activity.recreate(); until("document.querySelector('.title-screen')"); click("继续游戏");
            until("document.querySelector('.dice-roll-overlay.revealed')");
            assertEquals("\"100\"", js("document.querySelector('.dice-roll-total').textContent"));
            assertEquals("\"大失败\"", js("document.querySelector('.dice-roll-outcome h3').textContent"));
            until("document.fonts.status==='loaded'");
            assertEquals("The actual result glyphs are centered in the painted result slot", "true", js("(()=>{const label=document.querySelector('.dice-roll-outcome h3'),range=document.createRange();range.selectNodeContents(label);const text=range.getBoundingClientRect(),slot=label.parentElement.getBoundingClientRect(),style=getComputedStyle(label),canvas=document.createElement('canvas').getContext('2d');canvas.font=style.fontWeight+' '+style.fontSize+' '+style.fontFamily;const glyph=canvas.measureText(label.textContent);return Math.abs(text.top+glyph.fontBoundingBoxAscent+(glyph.actualBoundingBoxDescent-glyph.actualBoundingBoxAscent)/2-(slot.top+slot.height/2))<=1.5})()"));
            screenshot("locked-fumble-restored");
            click("确认结果"); until("document.body.innerText.includes('本轮行动已保留')");
            assertEquals("One player action after network failure", "1", js("document.querySelectorAll('.story-message.player').length"));
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
            until("document.querySelector('.game-menu.open')");
            click("返回首页"); click("开始游戏"); click("进入游戏");
            until("document.querySelector('.dock-input') && !document.querySelector('.dock-input').disabled");
            double before = Double.parseDouble(js("innerHeight"));
            activity.onActivity(a -> {
                // Simulate the stable WebView area after a keyboard occupies half the display.
                // Emulator IMEs may route all input to the host and report a zero-height keyboard.
                WebView web = a.getBridge().getWebView();
                ViewGroup.LayoutParams params = web.getLayoutParams();
                params.height = web.getHeight() / 2;
                web.setLayoutParams(params);
            });
            until("innerHeight < " + (before * .8));
            assertEquals("Action input remains inside the resized viewport", "true", js("(()=>{const r=document.querySelector('.dock-input').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()"));
            assertEquals("Submit is not covered by another control", "true", js("(()=>{const r=document.querySelector('.dock-submit').getBoundingClientRect();return !!document.elementFromPoint(r.x+r.width/2,r.y+r.height/2).closest('.dock-submit')})()"));
            screenshot("keyboard-insets");
        } finally { activity.close(); }
    }

    @Test public void completedInvestigationKeepsRecordsPartyAndNativeReturn() throws Exception {
        int[][] cases = {{320, 568, 1}, {390, 844, 4}, {430, 932, 2}, {562, 1000, 4}};
        String[] endings = {"END_C", "END_B", "END_A", "END_C"};
        for (int index = 0; index < cases.length; index++) {
            int[] size = cases[index]; fresh();
            try {
                viewport(size[0], size[1]); click("开始游戏");
                for (int player = 1; player < size[2]; player++) js("document.querySelectorAll('.preset-card-modern strong')[" + player + "].click()");
                click("进入游戏"); configure("http://127.0.0.1:1/v1", "responses");
                SystemClock.sleep(300); menu("返回首页");
                // Seed an already-settled QA record through the actual encrypted storage port.
                int clockValue = new int[] {0, 7, 6, 3}[index];
                js("window.qaEndingReady=false;Capacitor.Plugins.GameStorage.readAll().then(async ({values})=>{"
                    + "const record=JSON.parse(values['trpg-android-session-v1']);const progress=record.state.scenarioProgress;"
                    + "progress.endingId=" + JSONObject.quote(endings[index]) + ";progress.settledEndingIds=[progress.endingId];"
                    + "progress.activeActId='A02';progress.objectiveStates.O01='completed';progress.objectiveStates.O03='active';"
                    + "progress.clocks.fusangEscape={value:" + clockValue + ",active:false,visible:true};"
                    + "record.state.currentScene='S05';record.state.activeNpcName=null;record.state.activeNpcId=null;record.roll=null;"
                    + "window.qaEndingVitals=JSON.stringify(record.state.players.map(p=>[p.currentHp,p.currentMp,p.currentSan]));"
                    + "await Capacitor.Plugins.GameStorage.write({key:'trpg-android-session-v1',value:JSON.stringify(record)});window.qaEndingReady=true;})");
                until("window.qaEndingReady");
                String vitals = js("window.qaEndingVitals");
                activity.recreate(); until("document.querySelector('.title-resume-preview')"); viewport(size[0], size[1]);
                assertEquals("Completed records offer a review", "true", js("document.querySelector('.title-resume-preview').textContent.includes('已结案')&&document.querySelector('.title-continue').textContent==='回顾调查'"));
                click("回顾调查"); until("document.querySelector('.ending-dock')");
                paintedHomeEmblem(".ending-actions .home-emblem-art");
                readableNavigation();
                assertEquals("The ending stays read-only with the original party", "true", js("!document.querySelector('.dock-input')&&!document.querySelector('.party-action-status')&&!document.querySelector('.scene-npc')&&document.querySelectorAll('.ending-dock .party-compact').length===" + size[2]));
                assertEquals("Outcome uses the drawn record mount and readable text", "true", js("getComputedStyle(document.querySelector('.ending-copy')).borderImageSource.includes('panel-frame')&&parseFloat(getComputedStyle(document.querySelector('.ending-copy p')).fontSize)>=15"));
                reachable(".ending-actions button:first-child"); reachable(".ending-actions button:last-child"); reachable(".ending-dock .party-compact:last-child");
                assertEquals("Reading and actions do not overlap", "true", js("document.querySelector('.narrative-panel').clientHeight>=140&&document.querySelector('.narrative-panel').getBoundingClientRect().bottom<=document.querySelector('.ending-dock').getBoundingClientRect().top+.5"));
                nativeTap(".ending-dock .party-compact:last-child"); until("document.querySelector('.investigator-sheet')");
                nativeTap(".investigator-close"); until("!document.querySelector('.investigator-sheet')&&document.activeElement===document.querySelector('.ending-dock .party-compact:last-child')");
                nativeTap(".ending-dock .party-compact:last-child"); until("document.querySelector('.investigator-sheet')"); viewport(size[0], 300);
                nativeTap(".investigator-close"); until("!document.querySelector('.investigator-sheet')&&document.activeElement===document.querySelector('.ending-actions button:first-child')");
                screenshot("ending-" + size[0] + "-sheet-focus-restored"); viewport(size[0], size[1]);
                nativeTap(".ending-actions button:first-child"); until("document.querySelector('.investigation-ending')");
                assertEquals("Review opens the progress page", "true", js("document.querySelector('.info-drawer-tabs button:first-child').getAttribute('aria-selected')==='true'"));
                reachable("[aria-label='关闭资料']");
                js("document.querySelector('.clock-row progress').scrollIntoView({block:'center'})");
                reachable(".clock-row progress");
                assertEquals("Public clock keeps its authored value and fits the painted track", "true", js("(()=>{const p=document.querySelector('.clock-row progress'),r=p.getBoundingClientRect();return p.value===" + clockValue + "&&p.max===7&&r.height>=24&&r.left>=0&&r.right<=innerWidth&&getComputedStyle(p).borderImageSource.includes('clock-gauge')})()"));
                js("window.qaClockArtReady=false;const image=new Image();image.onload=()=>{const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d');context.drawImage(image,0,0);window.qaClockArtReady=image.naturalWidth===512&&image.naturalHeight===72&&context.getImageData(0,0,1,1).data[3]===0;};image.src=getComputedStyle(document.querySelector('.clock-row progress')).borderImageSource.slice(4,-1).replaceAll(String.fromCharCode(34),'').replaceAll(String.fromCharCode(39),'')");
                until("window.qaClockArtReady"); screenshot("ending-" + size[0] + "-clock-gauge");
                screenshot("ending-" + size[0] + "-review");
                String authoredHistoryOpen = js("(document.querySelector('.investigation-history-toggle').getAttribute('aria-expanded')==='true')");
                viewport(size[0], 300);
                if (!"true".equals(authoredHistoryOpen)) nativeTap(".investigation-history-toggle");
                until("(document.querySelector('.investigation-history-toggle').getAttribute('aria-expanded')==='true')");
                js("const page=document.querySelector('.info-drawer-page');page.scrollTop=page.scrollHeight");
                String progressPosition = js("document.querySelector('.info-drawer-page').scrollTop");
                assertTrue("Short-screen review has independently scrollable past objectives", Double.parseDouble(progressPosition) > 0);
                nativeTap(".info-drawer-tabs button:nth-child(2)"); until("document.querySelector('.case-board-view')");
                nativeTap(".info-drawer-tabs button:first-child");
                until("(document.querySelector('.investigation-history-toggle')?.getAttribute('aria-expanded')==='true')&&document.querySelector('.info-drawer-page').scrollTop===" + progressPosition);
                reachable("[aria-label='关闭资料']"); screenshot("ending-" + size[0] + "-progress-reading");
                nativeTap(".investigation-history-toggle"); until("!(document.querySelector('.investigation-history-toggle').getAttribute('aria-expanded')==='true')");
                nativeTap(".info-drawer-tabs button:last-child"); until("document.querySelector('.action-log-archive')");
                nativeTap(".info-drawer-tabs button:first-child"); until("document.querySelector('.investigation-history')&&!(document.querySelector('.investigation-history-toggle').getAttribute('aria-expanded')==='true')");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                until("!document.querySelector('.info-drawer-react.open')&&document.activeElement===document.querySelector('.ending-actions button:first-child')");
                viewport(size[0], 300); reachable(".ending-actions button:first-child"); reachable(".ending-actions button:last-child");
                nativeTap(".ending-actions button:first-child"); until("document.querySelector('.investigation-ending')"); reachable("[aria-label='关闭资料']");
                assertEquals("A new review starts from its authored default", "true", js("(document.querySelector('.investigation-history-toggle').getAttribute('aria-expanded')==='true')===" + authoredHistoryOpen + "&&document.querySelector('.info-drawer-page').scrollTop===0"));
                nativeTap("[aria-label='关闭资料']"); until("document.activeElement===document.querySelector('.ending-actions button:first-child')"); viewport(size[0], size[1]);
                until("(()=>{const drawer=document.querySelector('.info-drawer-react');return !drawer.classList.contains('open')&&drawer.inert&&drawer.getAttribute('aria-hidden')==='true'&&!drawer.hasAttribute('role')&&!drawer.hasAttribute('data-ui-phase')&&getComputedStyle(drawer).opacity==='0'&&document.activeElement===document.querySelector('.ending-actions button:first-child')})()");
                screenshot("ending-" + size[0]); nativeTap(".ending-actions button:last-child"); until("document.querySelector('.title-screen')"); click("回顾调查"); until("document.querySelector('.ending-dock')");
                assertEquals("Offline review does not re-award player resources", "true", js("!document.querySelector('.thinking-line')&&!document.querySelector('.check-card')&&!document.querySelector('.dock-input')"));
                menu("保存游戏"); SystemClock.sleep(300);
                js("window.qaEndingRead=false;Capacitor.Plugins.GameStorage.readAll().then(({values})=>{window.qaEndingSaved=JSON.parse(values['trpg-android-session-v1']);window.qaEndingRead=true;})"); until("window.qaEndingRead");
                assertEquals("Player resources stay unchanged after home and resume", vitals, js("JSON.stringify(window.qaEndingSaved.state.players.map(p=>[p.currentHp,p.currentMp,p.currentSan]))"));
                assertEquals("The ending is settled only once", "true", js("window.qaEndingSaved.state.scenarioProgress.settledEndingIds.length===1&&window.qaEndingSaved.state.scenarioProgress.endingId===" + JSONObject.quote(endings[index])));
                nativeTap(".menu-button"); until("document.querySelector('.game-menu')"); viewport(size[0], 300);
                nativeTap(".game-menu-close"); until("!document.querySelector('.game-menu')");
                assertEquals("Closing a short-window menu returns to its visible menu entry", "true", js("document.activeElement===document.querySelector('.menu-button')"));
                viewport(size[0], size[1]); menu("读取存档"); until("document.querySelector('.save-slot-card')"); viewport(size[0], 300);
                nativeTap(".save-manager-close"); until("!document.querySelector('.save-manager-card')");
                assertEquals("Closing short-window saves returns to the visible menu opener on the read-only ending", "true", js("document.activeElement===document.querySelector('.menu-button')&&!document.querySelector('.dock-input')&&!document.querySelector('.thinking-line')"));
                viewport(size[0], size[1]); menu("AI 设置"); until("document.querySelector('.api-config-card')"); viewport(size[0], 300);
                nativeTap(".api-config-card footer .ghost-btn"); until("!document.querySelector('.api-config-card')&&document.activeElement===document.querySelector('.menu-button')");
                viewport(size[0], size[1]); screenshot("ending-" + size[0] + "-return");
            } finally { activity.close(); }
        }
    }

    @Test public void providedSafeInsetsKeepPhoneControlsReachable() throws Exception {
        fresh();
        try {
            viewport(390, 844);
            js("window.qaOriginalInsets=['top','right','bottom','left'].map(side=>document.documentElement.style.getPropertyValue('--safe-area-inset-'+side))");
            for (int[] insets : new int[][] {{40,18,28,22},{0,0,0,0},{40,18,0,22}}) {
                String values = "[" + insets[0] + "," + insets[1] + "," + insets[2] + "," + insets[3] + "]";
                js("['top','right','bottom','left'].forEach((side,index)=>document.documentElement.style.setProperty('--safe-area-inset-'+side," + values + "[index]+'px'))");
                String expected = "[" + Math.max(6,insets[0]) + "," + Math.max(10,insets[1]) + "," + Math.max(6,insets[2]) + "," + Math.max(10,insets[3]) + "]";
                assertEquals("Phone safe margins use the provided values and minimum game spacing", expected, js("(()=>{const e=document.createElement('div');e.style.cssText='position:fixed;opacity:0;pointer-events:none;padding:var(--mobile-top) var(--mobile-right) var(--mobile-bottom) var(--mobile-left)';document.body.append(e);const s=getComputedStyle(e),v=[s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft].map(parseFloat);e.remove();return v})()"));
                nativeTap("button[aria-label=声音设置]"); until("document.querySelector('.audio-settings')");
                assertEquals("The drawn sound panel stays within the safe area", "true", js("(()=>{const r=document.querySelector('.audio-settings').getBoundingClientRect(),p=" + expected + ";return r.top>=p[0]-.5&&r.right<=innerWidth-p[1]+.5&&r.bottom<=innerHeight-p[2]+.5&&r.left>=p[3]-.5})()"));
                if (insets[0] == 40 && insets[2] == 28) screenshot("provided-safe-area");
                nativeTap(".audio-close"); until("!document.querySelector('.audio-settings')&&document.activeElement===document.querySelector('button[aria-label=声音设置]')");
            }
            js("['top','right','bottom','left'].forEach((side,index)=>{const p='--safe-area-inset-'+side,v=window.qaOriginalInsets[index];if(v)document.documentElement.style.setProperty(p,v);else document.documentElement.style.removeProperty(p)})");
        } finally { activity.close(); }
    }

    @Test public void firstOpeningPlaysNaturallyAndReplayKeepsNativeSettingsAndReturn() throws Exception {
        context.getSharedPreferences("fog-game-v1", Context.MODE_PRIVATE).edit().clear().commit();
        activity = ActivityScenario.launch(MainActivity.class);
        try {
            until("document.querySelector('.opening-cinematic video')?.currentTime>.25");
            viewport(390, 844);
            watchResizeErrors();
            js("window.qaOpening={events:[],frames:[],background:[]};(()=>{const q=window.qaOpening,l=document.querySelector('.opening-cinematic'),v=l.querySelector('video');const read=()=>({at:performance.now(),phase:l.dataset.uiPhase,opacity:Number(getComputedStyle(l).opacity),inert:l.inert,role:l.getAttribute('role'),hitDisabled:getComputedStyle(l).pointerEvents==='none',time:v.currentTime,duration:v.duration,width:v.videoWidth,height:v.videoHeight,fit:getComputedStyle(v).objectFit,audio:[...l.querySelectorAll('audio')].map(a=>({time:a.currentTime,volume:a.volume,paused:a.paused}))});v.addEventListener('ended',e=>{q.naturalEnded=e.isTrusted;q.ended=read()});let started=false;const observer=new MutationObserver(()=>{if(l.dataset.uiPhase==='closing'&&!started){started=true;q.closing=read();const sample=()=>{q.frames.push(read());if(l.isConnected)requestAnimationFrame(sample);else{q.removedAt=performance.now();observer.disconnect()}};requestAnimationFrame(sample)}});observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-ui-phase']});q.playing=read();})()");
            assertEquals("The supplied portrait plays uncropped and keeps home unavailable until exit", "true", js("(()=>{const v=document.querySelector('.opening-cinematic video'),r=v.getBoundingClientRect(),s=document.querySelector('.opening-skip').getBoundingClientRect();return v.videoWidth===1080&&v.videoHeight===1920&&v.muted&&v.playsInline&&getComputedStyle(v).objectFit==='contain'&&document.querySelector('.title-screen').inert&&r.width===innerWidth&&r.height===innerHeight&&s.width>=44&&s.height>=44&&document.documentElement.scrollWidth<=innerWidth})()"));
            reachable(".opening-skip");
            java.util.Map<String, ?> before = new java.util.HashMap<>(context.getSharedPreferences("fog-game-v1", Context.MODE_PRIVATE).getAll());
            screenshot("opening-native-playing");
            until("window.qaOpening.naturalEnded&&window.qaOpening.removedAt");
            assertEquals("The real video reaches its end and dissolves while input and focus return immediately", "true", js("(()=>{const q=window.qaOpening,c=q.closing,f=q.frames.filter(x=>x.opacity>0&&x.opacity<1);return q.naturalEnded&&Math.abs(q.ended.duration-14.866667)<.01&&q.ended.time===q.ended.duration&&c.role===null&&c.inert&&c.hitDisabled&&f.length>0&&q.frames.every(x=>x.inert&&x.role===null&&x.audio.every(a=>a.paused))&&q.removedAt-c.at>=600&&q.removedAt-c.at<1500&&!document.querySelector('.title-screen').inert&&document.activeElement===document.querySelector('.title-actions button')})()"));
            SharedPreferences preferences = context.getSharedPreferences("fog-game-v1", Context.MODE_PRIVATE);
            js("window.qaOpeningPersisted=false;Capacitor.Plugins.GameStorage.readAll().then(({values})=>window.qaOpeningPersisted=values['trpg-opening-v1']==='seen')");
            until("window.qaOpeningPersisted");
            String sealed = preferences.getString("trpg-opening-v1", null);
            assertNotNull("First-view preference uses the real native store", sealed);
            assertNotEquals("First-view preference is encrypted", "seen", sealed);
            assertEquals("Encrypted preference uses the existing authenticated format", 1, Base64.decode(sealed, Base64.NO_WRAP)[0]);
            java.util.Map<String, ?> after = new java.util.HashMap<>(preferences.getAll());
            after.remove("trpg-opening-v1");
            assertEquals("Automatic viewing changes only its first-view preference", before, after);
            savePanelMotionTrace("opening-native-natural", "({scope:'Real signed APK WebView; natural video ended and compositor frames',native:Capacitor.isNativePlatform(),trace:window.qaOpening})");
            screenshot("opening-native-title");
            activity.recreate();
            until("document.querySelector('button[aria-label=回看开场]')");
            watchResizeErrors();
            assertEquals("Subsequent launches open home directly", "false", js("Boolean(document.querySelector('.opening-cinematic'))"));
            nativeTap("button[aria-label=声音设置]");
            nativeTap("[aria-label=背景音乐]");
            nativeTap(".audio-close");
            nativeTap("button[aria-label=回看开场]");
            until("document.querySelector('.opening-cinematic video')?.currentTime>1&&document.querySelector('.opening-cinematic audio:last-of-type').currentTime>.5");
            assertEquals("Music off still allows the supplied sound effects", "true", js("(()=>{const a=[...document.querySelectorAll('.opening-cinematic audio')];return a[0].paused&&a[0].volume===0&&!a[1].paused&&a[1].volume===.55})()"));
            js("window.qaOpeningPause=null;document.addEventListener('visibilitychange',()=>{if(document.hidden){const v=document.querySelector('.opening-cinematic video');window.qaOpeningPause={time:v.currentTime,paused:v.paused,audio:[...document.querySelectorAll('.opening-cinematic audio')].map(a=>a.paused)}}},{once:true})");
            activity.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);
            SystemClock.sleep(350);
            activity.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);
            until("window.qaOpeningPause&&document.querySelector('.opening-cinematic video')&&!document.querySelector('.opening-cinematic video').paused");
            assertEquals("Real Android backgrounding pauses both picture and sounds and continues their timeline", "true", js("(()=>{const q=window.qaOpeningPause,v=document.querySelector('.opening-cinematic video');return q.paused&&q.audio.every(Boolean)&&v.currentTime>=q.time&&v.currentTime-q.time<1})()"));
            savePanelMotionTrace("opening-native-effects-and-background", "({scope:'Real Android activity background and resume; effects-only replay',background:window.qaOpeningPause,current:[...document.querySelectorAll('.opening-cinematic video,.opening-cinematic audio')].map(a=>({time:a.currentTime,paused:a.paused,volume:a.volume}))})");
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
            until("!document.querySelector('.opening-cinematic')&&document.activeElement===document.querySelector('button[aria-label=回看开场]')");
            assertEquals("Replay back keeps the encrypted first-view marker", sealed, preferences.getString("trpg-opening-v1", null));
            nativeTap("button[aria-label=声音设置]");
            nativeTap("[aria-label=背景音乐]");
            nativeTap("[aria-label=游戏音效]");
            nativeTap(".audio-close");
            nativeTap("button[aria-label=回看开场]");
            until("document.querySelector('.opening-cinematic video')?.currentTime>.5&&document.querySelector('.opening-cinematic audio:first-of-type').currentTime>.25");
            assertEquals("Effects off keeps music separately available", "true", js("(()=>{const a=[...document.querySelectorAll('.opening-cinematic audio')];return !a[0].paused&&a[0].volume===.3&&a[1].paused&&a[1].volume===0})()"));
            js("window.qaOpeningInsets=['bottom','left','right'].map(n=>[n,document.documentElement.style.getPropertyValue('--safe-area-inset-'+n)]);for(const [n,v] of [['bottom','90px'],['left','30px'],['right','24px']])document.documentElement.style.setProperty('--safe-area-inset-'+n,v)");
            assertEquals("Provided safe insets keep the original skip target inside the playable area", "true", js("(()=>{const r=document.querySelector('.opening-skip').getBoundingClientRect();return r.bottom<=innerHeight-90+.5&&r.left>=30&&r.right<=innerWidth-24+.5&&r.width>=44&&r.height>=44})()"));
            screenshot("opening-native-music-only");
            nativeTap(".opening-skip");
            until("!document.querySelector('.opening-cinematic')");
            js("for(const [n,v] of window.qaOpeningInsets)document.documentElement.style.setProperty('--safe-area-inset-'+n,v)");
            nativeTap("button[aria-label=声音设置]");
            assertEquals("Replay preserves the player's independent channel choices", "true", js("document.querySelector('[aria-label=背景音乐]').getAttribute('aria-checked')==='true'&&document.querySelector('[aria-label=游戏音效]').getAttribute('aria-checked')==='false'"));
            nativeTap(".audio-close");
            assertNoResizeErrors();
        } finally { if (activity != null) activity.close(); }
    }

    @Test public void audioStartsOnTouchAndSwitchesPersist() throws Exception {
        fresh();
        try {
            viewport(390, 844);
            js("window.qaThemeFetches=0;window.qaFetch=window.fetch;window.fetch=function(...args){if(String(args[0]).includes('fog-theme'))window.qaThemeFetches++;return window.qaFetch.apply(this,args)};window.qaHoldAudio=true;window.qaAudioHolds=[];window.qaActiveLoops=0;window.AudioContext=class extends window.AudioContext { constructor(...args){super(...args);window.qaAudio=this;} decodeAudioData(...args){return super.decodeAudioData(...args).then(b=>{window.qaDecoded=(window.qaDecoded||0)+1;if(window.qaHoldAudio&&b.duration>2)return new Promise(resolve=>window.qaAudioHolds.push(()=>resolve(b)));return b;})} createBufferSource(){const s=super.createBufferSource(),start=s.start.bind(s);s.start=(...args)=>{if(s.loop){window.qaLoopStarts=(window.qaLoopStarts||0)+1;window.qaActiveLoops++;s.addEventListener('ended',()=>{window.qaActiveLoops--},{once:true});}return start(...args)};return s;} }");
            nativeTap("button[aria-label='声音设置']");
            titlePlayback(true);
            String pausedTime = js("document.querySelector('.title-backdrop video').currentTime");
            SystemClock.sleep(180);
            assertEquals("Covered title video does not advance while audio remains independent", "true", js("Math.abs(document.querySelector('.title-backdrop video').currentTime-" + pausedTime + ")<.01"));
            until("window.qaAudio && window.qaAudio.state === 'running'");
            until("window.qaAudioHolds.length === 2");
            until("document.querySelector('#audio-settings-title')");
            js("window.qaAudio.suspend()"); until("window.qaAudio.state === 'suspended'");
            js("window.qaAudioReleased=false;(async()=>{window.qaHoldAudio=false;window.qaAudioHolds.splice(0).forEach(release=>release());for(let i=0;i<16;i++)await Promise.resolve();window.qaAudioReleased=true})()");
            until("window.qaAudioReleased");
            assertEquals("Loops loaded during device suspension do not start yet", "0", js("window.qaLoopStarts||0"));
            js("window.qaAudio.resume()");
            until("window.qaLoopStarts === 2");
            js("window.qaBackgroundVolumeChanged=false;document.addEventListener('visibilitychange',()=>{if(!document.hidden||window.qaBackgroundVolumeChanged)return;const input=document.querySelector('input[aria-label=音乐音量]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'38');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));window.qaBackgroundVolumeChanged=true;})");
            js("window.qaPausedAt=null;window.qaResumeAt=null;window.qaAudio.addEventListener('statechange',()=>{if(window.qaAudio.state==='suspended')window.qaPausedAt=window.qaAudio.currentTime;else if(window.qaAudio.state==='running'&&window.qaPausedAt!==null)window.qaResumeAt=window.qaAudio.currentTime;})");
            activity.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);
            SystemClock.sleep(300);
            activity.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);
            until("window.qaAudio.state==='running'&&window.qaResumeAt!==null");
            assertEquals("Android background return continues both existing loops", "2", js("window.qaLoopStarts"));
            assertEquals("A volume update during Android backgrounding keeps both current tracks", "true", js("window.qaBackgroundVolumeChanged&&document.querySelector('input[aria-label=音乐音量]').value==='38'"));
            assertEquals("Android audio time pauses rather than seeking back to the beginning", "true", js("window.qaResumeAt>=window.qaPausedAt&&window.qaResumeAt-window.qaPausedAt<.12"));
            screenshot("audio-paused-phase-return");
            fill("input[aria-label='音乐音量']", "38"); fill("input[aria-label='音效音量']", "23");
            until("document.querySelector('input[aria-label=音乐音量]').getAttribute('aria-valuetext')==='38%' && document.querySelector('input[aria-label=音效音量]').getAttribute('aria-valuetext')==='23%'");
            // Resolve CSS URL tokens through CSSOM; WebView custom-property text can contain escapes.
            js("window.qaSoundGaugeLoaded=false;(()=>{const probe=document.createElement('span');probe.style.cssText='position:fixed;visibility:hidden;pointer-events:none;border-image-source:var(--ui-gauge-frame)';document.body.append(probe);const source=getComputedStyle(probe).borderImageSource,image=new Image();probe.remove();window.qaSoundGaugeProbe={source,done:false};image.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d');context.drawImage(image,0,0);const alpha=context.getImageData(0,0,1,1).data[3];Object.assign(window.qaSoundGaugeProbe,{width:image.naturalWidth,height:image.naturalHeight,alpha});window.qaSoundGaugeLoaded=source.includes('clock-gauge')&&image.naturalWidth===512&&image.naturalHeight===72&&alpha===0;}catch(error){window.qaSoundGaugeProbe.error=error.name;}window.qaSoundGaugeProbe.done=true;};image.onerror=()=>Object.assign(window.qaSoundGaugeProbe,{error:'load',done:true});image.src=source.slice(4,-1).replaceAll(String.fromCharCode(34),'').replaceAll(String.fromCharCode(39),'');window.qaSoundGaugeProbe.url=image.src;})()");
            until("window.qaSoundGaugeProbe?.done");
            assertEquals("Shared sound gauge decodes with transparency: " + js("window.qaSoundGaugeProbe"), "true", js("window.qaSoundGaugeLoaded"));
            assertEquals("Changing volumes keeps the two current loops running", "2", js("window.qaLoopStarts"));
            nativeTap(".audio-close"); until("!document.querySelector('.audio-settings')"); click("开始游戏"); click("进入游戏");
            until("document.querySelector('.dock-input')&&window.qaLoopStarts>=4&&window.qaActiveLoops===2");
            assertEquals("The first theme load is reused through character selection", "1", js("window.qaThemeFetches"));
            menu("返回首页"); until("document.querySelector('.title-screen')&&window.qaThemeFetches===2&&window.qaActiveLoops===2");
            click("声音设置"); until("document.querySelector('.audio-settings')");
            assertEquals("Returning home reloads the released theme without changing channel preferences", "true", js("document.querySelector('input[aria-label=音乐音量]').value==='38'&&document.querySelector('input[aria-label=音效音量]').value==='23'&&document.querySelector('[aria-label=背景音乐]').getAttribute('aria-checked')==='true'"));
            nativeTap("button[role='switch'][aria-label='背景音乐']");
            until("document.querySelector('[aria-label=背景音乐]').getAttribute('aria-checked') === 'false'");
            assertEquals("Music mute leaves the effects channel enabled", "true", js("document.querySelector('[aria-label=游戏音效]').getAttribute('aria-checked')==='true'"));
            for (int[] size : new int[][] { {320,568}, {390,844}, {430,932}, {562,1000} }) {
                viewport(size[0], size[1]);
                assertEquals("Channel artwork and volume text stay readable", "true", js("getComputedStyle(document.querySelector('.audio-channel')).borderImageSource.includes('panel-frame')&&parseFloat(getComputedStyle(document.querySelector('.audio-channel label')).fontSize)>=15"));
                js("document.querySelector('input[aria-label=音效音量]').scrollIntoView({block:'nearest'})");
                reachable("input[aria-label='音效音量']"); nativeTap("input[aria-label='音效音量']");
                until("Math.abs(Number(document.querySelector('input[aria-label=音效音量]').value)-50)<=1");
                js("document.querySelector('.audio-preview').scrollIntoView({block:'nearest'})"); reachable(".audio-preview");
                assertEquals("Preview has a touch-sized drawn control", "true", js("document.querySelector('.audio-preview').getBoundingClientRect().height>=44&&getComputedStyle(document.querySelector('.audio-preview'),'::before').borderImageSource.includes('button-secondary')"));
                nativeTap(".audio-preview");
                fill("input[aria-label='音效音量']", "0"); until("document.querySelector('.audio-preview').disabled");
                fill("input[aria-label='音效音量']", "23"); until("!document.querySelector('.audio-preview').disabled");
                js("document.querySelector('.audio-settings-body').scrollTop=0"); screenshot("audio-track-" + size[0]);
                js("document.querySelector('.audio-credits-toggle').scrollIntoView({block:'nearest'})"); reachable(".audio-credits-toggle");
                if (!"true".equals(js("(document.querySelector('.audio-credits-toggle').getAttribute('aria-expanded')==='true')"))) nativeTap(".audio-credits-toggle");
                until("(document.querySelector('.audio-credits-toggle').getAttribute('aria-expanded')==='true')");
                awaitUiMotion();
                String closeY = js("document.querySelector('.audio-close').getBoundingClientRect().y");
                js("document.querySelector('.audio-credit-links a[href*=zero]').scrollIntoView({block:'nearest'})"); reachable(".audio-credit-links a[href*=zero]");
                assertEquals("License link keeps a full touch target", "true", js("(()=>{const r=document.querySelector('.audio-credit-links a[href*=zero]').getBoundingClientRect();return r.width>=44&&r.height>=44})()"));
                assertEquals("Scrolling credits leaves close fixed", closeY, js("document.querySelector('.audio-close').getBoundingClientRect().y"));
                viewport(size[0], 300); reachable(".audio-close");
                js("document.querySelector('.audio-credit-links a[href*=zero]').scrollIntoView({block:'nearest'})"); reachable(".audio-credit-links a[href*=zero]");
                assertEquals("Focus cannot scroll the fixed panel frame", "0", js("document.querySelector('.audio-settings').scrollTop"));
                nativeTap(".audio-close"); until("!document.querySelector('.audio-settings')&&document.activeElement===document.querySelector('button[aria-label=声音设置]')");
                viewport(size[0], size[1]); nativeTap("button[aria-label=声音设置]"); until("document.querySelector('.audio-settings')");
                assertEquals("Reopen keeps settings and folds credits", "true", js("!(document.querySelector('.audio-credits-toggle').getAttribute('aria-expanded')==='true')&&document.querySelector('input[aria-label=音乐音量]').value==='38'&&document.querySelector('input[aria-label=音效音量]').value==='23'"));
            }
            screenshot("audio-controls");
            SystemClock.sleep(300);
            activity.recreate(); until("document.querySelector('.title-screen')"); click("声音设置");
            until("document.querySelector('[aria-label=背景音乐]').getAttribute('aria-checked') === 'false'");
            assertEquals("Effects stay independently enabled", "\"true\"", js("document.querySelector('[aria-label=游戏音效]').getAttribute('aria-checked')"));
            assertEquals("Both channel volumes persist through Android recreation", "true", js("document.querySelector('input[aria-label=音乐音量]').value==='38'&&document.querySelector('input[aria-label=音效音量]').value==='23'"));
        } finally { activity.close(); }
    }
}
