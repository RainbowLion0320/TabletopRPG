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
    private void click(String text) throws Exception {
        String match = "Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === " + JSONObject.quote(text) + " || b.getAttribute('aria-label') === " + JSONObject.quote(text) + ")";
        until(match + " && !" + match + ".disabled"); js(match + ".click()");
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
    private void fresh() throws Exception {
        context.getSharedPreferences("fog-game-v1", Context.MODE_PRIVATE).edit().clear().commit();
        activity = ActivityScenario.launch(MainActivity.class);
        until("document.querySelector('.title-screen')");
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
        reachable(selector);
        CountDownLatch painted = new CountDownLatch(1);
        activity.onActivity(a -> a.getBridge().getWebView().postVisualStateCallback(SystemClock.uptimeMillis(), new WebView.VisualStateCallback() {
            @Override public void onComplete(long requestId) { painted.countDown(); }
        }));
        assertTrue("The target DOM has been drawn before sending real touch", painted.await(10, TimeUnit.SECONDS));
        org.json.JSONArray point = new org.json.JSONArray(js("(()=>{const r=document.querySelector(" + JSONObject.quote(selector) + ").getBoundingClientRect();return [(r.x+r.width/2)*devicePixelRatio,(r.y+r.height/2)*devicePixelRatio,devicePixelRatio]})()"));
        long now = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, (float) point.getDouble(0), (float) point.getDouble(1), 0);
        float endY = (float) (point.getDouble(1) + driftCssY * point.getDouble(2));
        MotionEvent up = MotionEvent.obtain(now, now + 80, MotionEvent.ACTION_UP, (float) point.getDouble(0), endY, 0);
        InstrumentationRegistry.getInstrumentation().sendPointerSync(down);
        if (driftCssY != 0) {
            MotionEvent move = MotionEvent.obtain(now, now + 40, MotionEvent.ACTION_MOVE, (float) point.getDouble(0), endY, 0);
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
        until("document.querySelector('#api-provider').value === 'custom' && document.querySelector('.api-connection').open");
        fill("#api-protocol", protocol);
        fill("#api-endpoint", endpoint);
        fill("#api-key", "android-qa-only-token");
        fill("#api-model", "android-qa-model");
        click("保存"); until("!document.querySelector('#api-config-modal-title')");
        if (openedMenu && "true".equals(js("Boolean(document.querySelector('.game-menu'))"))) {
            click("继续调查"); until("!document.querySelector('.game-menu')");
        }
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
    }

    /** Check actual visible bounds, ancestor clipping, and touch occlusion after transitions. */
    private void reachable(String selector) throws Exception {
        until("(()=>{const e=document.querySelector(" + JSONObject.quote(selector) + ");if(!e)return false;"
            + "const r=e.getBoundingClientRect();if(r.width<1||r.height<1||r.left<0||r.top<0||r.right>innerWidth+.5||r.bottom>innerHeight+.5)return false;"
            + "for(let p=e.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();"
            + "if(/hidden|auto|scroll/.test(s.overflowY)&&(r.top<b.top-.5||r.bottom>b.bottom+.5))return false;"
            + "if(/hidden|auto|scroll/.test(s.overflowX)&&(r.left<b.left-.5||r.right>b.right+.5))return false;if(s.position==='fixed')break;}"
            + "return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()");
    }

    private void readableTurnPrompt() throws Exception {
        reachable(".check-card"); reachable(".check-card > button");
        if (Double.parseDouble(js("innerHeight")) > 300) readablePartyDossiers();
        assertEquals("Turn information uses readable text, drawn dossier and full touch controls", "true", js("(()=>{const c=document.querySelector('.check-card'),b=c.querySelector('button'),r=b.getBoundingClientRect(),d=c.closest('.action-dock').getBoundingClientRect(),s=document.querySelector('.narrative-panel').getBoundingClientRect();return Array.from(c.querySelectorAll('strong,span,button')).every(e=>parseFloat(getComputedStyle(e).fontSize)>=15)&&getComputedStyle(c).borderImageSource.includes('panel-frame')&&r.width>=44&&r.height>=44&&s.height>=140&&s.bottom<=d.top+.5&&c.scrollWidth<=c.clientWidth+1})()"));
    }

    private void readablePartyDossiers() throws Exception {
        reachable(".party-compact:last-child");
        assertEquals("Every investigator remains readable, drawn and reachable", "true", js("(()=>{const d=document.querySelector('.action-dock').getBoundingClientRect();return Array.from(document.querySelectorAll('.party-compact')).every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.top>=d.top&&r.bottom<=Math.min(d.bottom,innerHeight)+.5&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))&&getComputedStyle(e).borderImageSource.includes('panel-frame')&&getComputedStyle(e).opacity==='1'&&e.scrollWidth<=e.clientWidth+1&&Array.from(e.querySelectorAll('strong,.party-action-status,.bar-label,.bar-value')).every(t=>{const b=t.getBoundingClientRect(),s=parseFloat(getComputedStyle(t).fontSize);return s>=(t.tagName==='STRONG'?14:t.classList.contains('bar-value')?13:12)&&b.left>=r.left&&b.right<=r.right})})})()"));
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
                assertEquals("Bundled MiMo settings are quiet, masked and show the correct connection", "true", js("!document.querySelector('.api-config-card [role=alert]')&&document.querySelector('#api-provider').value==='mimo'&&document.querySelector('#api-model').value==='mimo-v2.6-pro'&&document.querySelector('#api-key').type==='password'&&document.querySelector('.api-connection').open"));
                for (String field : new String[] {"#api-provider", "#api-key", "#api-model", ".api-connection summary"}) reachable(field);
                reachable(".api-config-close");
                reachable(".api-config-card footer .primary-btn"); screenshot(prefix + "-api");
                // No real API credentials or network dependency in layout probes.
                configure("http://127.0.0.1:1/v1", "responses");
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
                assertEquals("Empty phone action hint stays inside its field", "true", js("(()=>{const e=document.querySelector('.dock-input');return e.value===''&&e.scrollHeight<=e.clientHeight+1})()"));
                readablePartyDossiers();
                if (size[0] == 360) {
                    // Wait for the non-interactive save notification to fade before testing the HUD.
                    until("!document.querySelector('.toast')");
                    reachable(".party-compact:last-child");
                    assertEquals("All four status cards fit without horizontal scrolling", "true", js("document.querySelector('.party-strip-compact').scrollWidth<=document.querySelector('.party-strip-compact').clientWidth+1"));
                    viewport(320, 568);
                    readablePartyDossiers();
                    assertEquals("Smallest four-player HUD keeps every value inside its card", "true", js("Array.from(document.querySelectorAll('.party-compact,.party-strip-compact')).every(e=>e.scrollWidth<=e.clientWidth+1)"));
                    assertEquals("Smallest four-player reading area remains usable", "true", js("document.querySelector('.narrative-panel').clientHeight>=140"));
                    assertEquals("Smallest four-player empty action hint is not clipped", "true", js("(()=>{const e=document.querySelector('.dock-input');return e.value===''&&e.scrollHeight<=e.clientHeight+1})()"));
                    screenshot("portrait-320x568-four-game");
                    viewport(size[0], size[1]);
                }
                assertEquals("Reading area keeps at least 140 CSS pixels", "true", js("document.querySelector('.narrative-panel').clientHeight>=140"));
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
                fill(".investigator-search input", "闪避");
                assertEquals("Dodge uses half of percentile DEX", "true", js("Array.from(document.querySelectorAll('.investigator-skills tbody td')).map(e=>e.textContent).join(',')==='30,15,6'"));
                if (partySize > 1) {
                    js("document.querySelector('.investigator-party button:last-child').click()");
                    assertEquals("Comparing teammates keeps the skill query", "true", js("document.querySelector('.investigator-search input').value==='闪避'"));
                    String expectedDodge = partySize == 4 ? "50,25,10" : "35,17,7";
                    assertEquals("Teammate skill uses its own corrected allocation", JSONObject.quote(expectedDodge), js("Array.from(document.querySelectorAll('.investigator-skills tbody td')).map(e=>e.textContent).join(',')"));
                    js("document.querySelector('.investigator-party button:first-child').click()");
                }
                fill(".investigator-search input", "侦查");
                assertEquals("Skill thresholds match the game rules", "true", js("Array.from(document.querySelectorAll('.investigator-skills tbody td')).map(e=>e.textContent).join(',')==='75,37,15'"));
                reachable("[aria-label='清除技能搜索']"); nativeTap("[aria-label='清除技能搜索']");
                until("document.activeElement===document.querySelector('.investigator-search input')&&document.querySelector('.investigator-search input').value===''");
                assertEquals("Clearing skills returns to the list start", "0", js("document.querySelector('.investigator-body').scrollTop"));
                assertEquals("Skills remain readable", "true", js("parseFloat(getComputedStyle(document.querySelector('.investigator-skills tbody th')).fontSize)>=15"));
                if (partySize > 1) {
                    fill(".investigator-search input", "侦查"); viewport(size[0], 300);
                    js("document.querySelector('.investigator-party button:last-child').scrollIntoView({block:'nearest',inline:'nearest'})");
                    reachable(".investigator-party button:last-child"); nativeTap(".investigator-party button:last-child");
                    until("document.querySelector('.investigator-party button:last-child').getAttribute('aria-pressed')==='true'");
                    assertEquals("Teammates can be compared above the keyboard without losing the skill query", "true", js("document.querySelector('.investigator-search input').value==='侦查'&&document.querySelector('.investigator-body').clientHeight>=75"));
                    assertEquals("Filtered skill and threshold headings remain fully readable above the keyboard", "true", js("(()=>{const b=document.querySelector('.investigator-body').getBoundingClientRect(),r=document.querySelector('.investigator-skills tbody tr').getBoundingClientRect();return r.top>=b.top&&r.bottom<=b.bottom&&Array.from(document.querySelectorAll('.investigator-skills thead th')).every(e=>parseFloat(getComputedStyle(e).fontSize)>=13)})()"));
                    screenshot(prefix + "-skills-short");
                    js("document.querySelector('.investigator-party button:first-child').scrollIntoView({block:'nearest',inline:'nearest'})");
                    nativeTap(".investigator-party button:first-child"); nativeTap("[aria-label='清除技能搜索']");
                    until("document.activeElement===document.querySelector('.investigator-search input')");
                    viewport(size[0], size[1]);
                }
                js("document.querySelector('.investigator-body').scrollTop=99999");
                String skillsReadingPosition = js("document.querySelector('.investigator-body').scrollTop");
                reachable(".investigator-search input"); reachable(".investigator-close"); screenshot(prefix + "-skills");
                click("随身与背景");
                js("document.querySelector('.investigator-background dd').textContent='长篇角色背景记录。'.repeat(150);document.querySelector('.investigator-body').scrollTop=99999");
                reachable(".investigator-close");
                click("技能");
                assertEquals("Returning to skills restores the reading position", skillsReadingPosition, js("document.querySelector('.investigator-body').scrollTop"));
                // Real focus and settled insets make both system-return steps deterministic.
                nativeTap(".investigator-search input"); awaitSettledIme(true);
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                awaitSettledIme(false);
                assertEquals("Dismissing the keyboard keeps the dossier open", "true", js("Boolean(document.querySelector('.investigator-sheet'))"));
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                until("!document.querySelector('.investigator-sheet')");
                assertEquals("Inspecting a teammate preserves the current action and actor", "true", js("document.querySelector('.dock-input').value==='查看属性时保留这段行动草稿'&&document.querySelector('.party-compact.active strong').textContent==='亨利·格雷'"));
                js("document.querySelector('.party-compact:last-child').click()"); until("document.querySelector('.investigator-sheet')");
                assertEquals("Status cards inspect their own player", "true", js("document.querySelector('.investigator-identity h2').textContent===document.querySelector('.party-compact:last-child strong').textContent"));
                click("技能"); viewport(size[0], 300);
                js("document.querySelector('.investigator-search input').focus()");
                reachable(".investigator-search input"); reachable(".investigator-close"); screenshot(prefix + "-sheet-keyboard");
                js("document.querySelector('.investigator-close').click()"); viewport(size[0], size[1]); fill(".dock-input", "");
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
                assertEquals("Native portrait entry stays a fixed button after slight touch drift", "true", js("document.querySelector('.drawer-tab').style.top===''&&!document.querySelector('.drawer-tab').classList.contains('dragging')&&document.querySelector('.drawer-tab').title==='资料'"));
                assertEquals("Phone archive does not construct a hidden graph", "true", js("!document.querySelector('.react-flow')&&!document.querySelector('.case-board-flow-wrap')"));
                until("Array.from(document.querySelectorAll('.case-record-photo img')).every(i=>i.complete&&i.naturalWidth>0)");
                assertEquals("Archive tabs announce the active page", "true", js("document.querySelector('[role=tab][aria-selected=true]').textContent==='案件板'&&document.querySelector('[role=tabpanel]').getAttribute('aria-labelledby')===document.querySelector('[role=tab][aria-selected=true]').id"));
                fill(".case-board-search input", "伊莎贝拉");
                until("document.querySelectorAll('.case-board-mobile-card').length===2");
                assertEquals("Search keeps the matched person and related scene without unrelated records", "true", js("Array.from(document.querySelectorAll('.case-board-mobile-card')).map(e=>e.textContent).join(',').includes('伊莎贝拉')&&document.querySelector('.case-board-mobile-card.scene')&&!Array.from(document.querySelectorAll('.case-board-mobile-card')).some(e=>e.textContent.includes('埃里克'))"));
                viewport(size[0], 300); reachable("[aria-label='关闭资料']"); reachable(".case-search-clear");
                until("(()=>{const r=document.querySelector('.case-search-clear').getBoundingClientRect();return r.width>=44&&r.height>=44})()");
                JSONObject clearSize = new JSONObject(js("(()=>{const e=document.querySelector('.case-search-clear'),r=e.getBoundingClientRect(),s=getComputedStyle(e);return {width:r.width,height:r.height,cssWidth:s.width,minHeight:s.minHeight,viewport:[innerWidth,innerHeight]}})()"));
                assertTrue("Search can be cleared with a full phone touch target: " + clearSize, clearSize.getDouble("width") >= 44 && clearSize.getDouble("height") >= 44);
                js("document.querySelector('.case-search-clear').click()");
                assertEquals("Clearing search keeps typing focus", "true", js("document.activeElement===document.querySelector('.case-board-search input')&&document.activeElement.value===''") );
                viewport(size[0], size[1]);
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
                screenshot(prefix + "-inspector");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                until("!document.querySelector('.case-board-inspector') && document.querySelector('.info-drawer-react.open')"); click("进度");
                assertEquals("Progress does not expose the script's undiscovered clue total", "true", js("!document.querySelector('.scenario-progress').textContent.match(/已发现\\s+0\\s*\\/\\s*8/)") );
                assertEquals("Current objectives use readable text and omit empty clue statistics", "true", js("parseFloat(getComputedStyle(document.querySelector('.objective-row strong')).fontSize)>=15&&!document.querySelector('.progress-stat')"));
                reachable("[aria-label='关闭资料']"); screenshot(prefix + "-progress"); click("日志");
                until("document.querySelector('.record-log-search input')"); reachable(".record-log-search input");
                assertEquals("The log body uses readable text", "true", js("parseFloat(getComputedStyle(document.querySelector('.action-log-list p')).fontSize)>=15"));
                fill(".record-log-search input", "摩勒住宅");
                until("document.querySelector('.action-log-list p')&&document.querySelector('.action-log-list p').textContent.includes('摩勒住宅')");
                click("进度"); click("日志");
                assertEquals("Log queries survive switching reference tabs", "true", js("document.querySelector('.record-log-search input').value==='摩勒住宅'"));
                fill(".record-log-search input", "没有这条QA记录"); until("document.querySelector('.action-log-empty')");
                viewport(size[0], 300); reachable("[aria-label='关闭资料']"); reachable(".record-log-search input");
                reachable("[aria-label='清空日志搜索']"); nativeTap("[aria-label='清空日志搜索']");
                until("document.activeElement===document.querySelector('.record-log-search input')&&document.querySelector('.record-log-search input').value===''");
                assertEquals("Only the log list scrolls beneath its controls above the keyboard", "true", js("(()=>{const l=document.querySelector('.action-log-list').getBoundingClientRect(),s=document.querySelector('.record-log-search').getBoundingClientRect();return l.top>=s.bottom&&l.bottom<=innerHeight+1&&l.height>60})()"));
                viewport(size[0], size[1]); screenshot(prefix + "-log"); reachable("[aria-label='关闭资料']");
                js("document.querySelector('[aria-label=关闭资料]').click()");
                menu("声音设置"); reachable("[role='switch'][aria-label='背景音乐']"); reachable("[role='switch'][aria-label='游戏音效']");
                screenshot(prefix + "-audio");
                js("document.querySelector('.audio-credits').open=true;document.querySelector('.audio-settings-body').scrollTop=99999");
                reachable(".audio-close"); js("document.querySelector('.audio-close').click()");
                until("document.querySelector('.game-menu').contains(document.activeElement)");
                reachable(".game-menu-close"); reachable(".game-menu footer button"); screenshot(prefix + "-menu");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                until("!document.querySelector('.game-menu') && document.activeElement===document.querySelector('.menu-button')");
                String currentDraft = js("document.querySelector('.dock-input').value");
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
                menu("读取存档"); until("document.querySelector('.save-manager-card')");
                reachable(".save-manager-card footer button");
                assertEquals("Opening the reader keeps the current draft", currentDraft, js("document.querySelector('.dock-input').value"));
                assertEquals("Save dates and party names remain readable", "true", js("Array.from(document.querySelectorAll('.save-slot-time,.save-slot-party>span')).every(e=>parseFloat(getComputedStyle(e).fontSize)>=14&&e.scrollWidth<=e.clientWidth+1)"));
                js("document.querySelector('.save-list').scrollTop=99999");
                reachable(".save-slot-card:last-child .save-slot-delete"); screenshot(prefix + "-saves");
                js("document.querySelector('.save-slot-card:last-child .save-slot-delete').click()");
                until("document.querySelector('.save-delete-confirmation')");
                reachable(".save-delete-confirmation .danger");
                assertEquals("Deletion first focuses the safe choice", "true", js("document.activeElement.innerText==='保留存档'"));
                click("保留存档");
                assertEquals("Cancelling keeps every save", "4", js("document.querySelectorAll('.save-slot-card').length"));
                js("document.querySelector('.save-slot-card:last-child .save-slot-delete').click()");
                until("document.querySelector('.save-delete-confirmation')");
                click("确认删除");
                until("document.querySelectorAll('.save-slot-card').length===3");
                assertEquals("Deleting a record focuses a remaining Load action", "true", js("document.activeElement.classList.contains('save-slot-load')"));
                click("关闭");
                assertEquals("Cancelling the reader keeps the current draft", currentDraft, js("document.querySelector('.dock-input').value"));
                js("document.querySelector('.menu-button').click()");
                until("document.querySelector('.game-menu')");
                assertEquals("KP notes are not in the player menu", "false", js("document.querySelector('.game-menu').innerText.includes('KP 笔记')"));
                assertEquals("The menu has one explicit reader instead of duplicate load entries", "false", js("document.querySelector('.game-menu').innerText.includes('存档管理')"));
                click("继续调查");
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
                js("document.querySelector('.api-connection summary').click()");
                nativeTap(".api-config-card footer .primary-btn");
                until("document.activeElement===document.querySelector('#api-model')&&document.querySelector('#api-model').getAttribute('aria-invalid')==='true'");
                assertEquals("Model correction leaves unrelated connection fields collapsed", "false", js("document.querySelector('.api-connection').open"));
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
                until("document.activeElement===document.querySelector('#api-endpoint')&&document.querySelector('.api-connection').open");
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
                until("document.querySelector('.action-dock [role=status]')");
                assertEquals(expected, calls.get());
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
                for (int i = 0; i < party; i++) {
                    fill(".dock-input", "接受委托\n询问失踪经过");
                    click(i == party - 1 ? "提交" : "下一位");
                    if (i < party - 1) {
                        assertEquals("Next investigator can keep typing immediately", "true", js("document.activeElement===document.querySelector('.dock-input')"));
                        assertEquals("Completed actor is indicated", "true", js("document.querySelectorAll('.party-compact')[" + i + "].textContent.includes('已提交')"));
                        readablePartyDossiers();
                    }
                }
                if (party == 1) {
                    until("document.querySelector('.thinking-line-text')");
                    js("window.qaWaitingFirst=document.querySelector('.thinking-line-text').textContent;window.qaWaitingHeight=document.querySelector('.thinking-line').getBoundingClientRect().height");
                    until("document.querySelector('.thinking-line-text') && document.querySelector('.thinking-line-text').textContent!==window.qaWaitingFirst");
                    assertEquals("Waiting captions change without moving the story or exceeding the phone", "true", js("(()=>{const e=document.querySelector('.thinking-line-text'),r=e.getBoundingClientRect();return parseFloat(getComputedStyle(e).fontSize)>=15&&r.left>=0&&r.right<=innerWidth&&document.querySelector('.thinking-line').getBoundingClientRect().height===window.qaWaitingHeight})()"));
                    screenshot("varied-wait-phone");
                }
                until("document.body.innerText.includes('Android 调查继续')");
                assertEquals(1, narratorCalls.get());
                until("document.querySelectorAll('.story-message.player').length === " + party);
                assertEquals("Multiline player action is preserved in the actual turn", "true", js("document.querySelector('.story-message.player .player-message-text').textContent.includes('接受委托'+String.fromCharCode(10)+'询问失踪经过')"));
                assertNoResizeErrors();
                until("document.querySelectorAll('.suggestion-row button').length===3");
                assertEquals("Distinct choices remain beside the existing story route", "true", js("Array.from(document.querySelectorAll('.suggestion-row button')).map(e=>e.textContent).join('|')==='前往老赫特酒吧继续调查|检查门锁|观察窗边'"));
                nativeTap(".suggestion-row button:first-child");
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
                    nativeTap(".narrative-toggle-btn");
                    js("window.qaHistoryText=JSON.stringify(Array.from(document.querySelectorAll('.story-message.dm p'),e=>e.textContent));window.qaHistoryColors=JSON.stringify(Array.from(document.querySelector('.story-message.dm').querySelectorAll('.narrative-mark-person'),e=>e.style.getPropertyValue('--person-color')));document.querySelector('.narrative-scroll').scrollTop=100");
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
                assertEquals("Exit describes navigation rather than ending the investigation", "true", js("document.querySelector('.android-exit-card h2').textContent==='退出游戏？'&&document.activeElement.textContent==='留在游戏'"));
                reachable(".android-exit-card footer .secondary-action"); reachable(".android-exit-card footer .primary-btn");
                screenshot("exit-dialog-"+size[0]);
                viewport(size[0],300); reachable(".android-exit-card footer .secondary-action"); reachable(".android-exit-card footer .primary-btn");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                until("!document.querySelector('.android-exit-card')");
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

    @Test public void nativeCancellationStopsTheNetworkCall() throws Exception {
        try (MockWebServer server = new MockWebServer()) {
            server.enqueue(new MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE)); server.start(); fresh();
            js("window.nativeCancelResult=null;window.Capacitor.nativePromise('AiTransport','request',{id:'999-1',url:" + JSONObject.quote(server.url("/").toString()) + ",method:'POST',body:'{}',headers:{}}).then(()=>window.nativeCancelResult='completed',e=>window.nativeCancelResult=e.code)");
            assertNotNull(server.takeRequest(10, TimeUnit.SECONDS));
            js("window.Capacitor.nativePromise('AiTransport','cancel',{id:'999-1'})");
            until("window.nativeCancelResult === 'ABORTED'");
        } finally { if (activity != null) activity.close(); }
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
                js("window.qaEndingReady=false;Capacitor.Plugins.GameStorage.readAll().then(async ({values})=>{"
                    + "const record=JSON.parse(values['trpg-android-session-v1']);const progress=record.state.scenarioProgress;"
                    + "progress.endingId=" + JSONObject.quote(endings[index]) + ";progress.settledEndingIds=[progress.endingId];"
                    + "progress.activeActId='A02';progress.objectiveStates.O01='completed';progress.objectiveStates.O03='active';"
                    + "record.state.currentScene='S05';record.state.activeNpcName=null;record.state.activeNpcId=null;record.roll=null;"
                    + "window.qaEndingVitals=JSON.stringify(record.state.players.map(p=>[p.currentHp,p.currentMp,p.currentSan]));"
                    + "await Capacitor.Plugins.GameStorage.write({key:'trpg-android-session-v1',value:JSON.stringify(record)});window.qaEndingReady=true;})");
                until("window.qaEndingReady");
                String vitals = js("window.qaEndingVitals");
                activity.recreate(); until("document.querySelector('.title-resume-preview')"); viewport(size[0], size[1]);
                assertEquals("Completed records offer a review", "true", js("document.querySelector('.title-resume-preview').textContent.includes('已结案')&&document.querySelector('.title-continue').textContent==='回顾调查'"));
                click("回顾调查"); until("document.querySelector('.ending-dock')");
                assertEquals("The ending stays read-only with the original party", "true", js("!document.querySelector('.dock-input')&&!document.querySelector('.party-action-status')&&!document.querySelector('.scene-npc')&&document.querySelectorAll('.ending-dock .party-compact').length===" + size[2]));
                assertEquals("Outcome uses the drawn record mount and readable text", "true", js("getComputedStyle(document.querySelector('.ending-copy')).borderImageSource.includes('panel-frame')&&parseFloat(getComputedStyle(document.querySelector('.ending-copy p')).fontSize)>=15"));
                reachable(".ending-actions button:first-child"); reachable(".ending-actions button:last-child"); reachable(".ending-dock .party-compact:last-child");
                assertEquals("Reading and actions do not overlap", "true", js("document.querySelector('.narrative-panel').clientHeight>=140&&document.querySelector('.narrative-panel').getBoundingClientRect().bottom<=document.querySelector('.ending-dock').getBoundingClientRect().top+.5"));
                nativeTap(".ending-dock .party-compact:last-child"); until("document.querySelector('.investigator-sheet')");
                nativeTap(".investigator-close"); until("!document.querySelector('.investigator-sheet')&&document.activeElement===document.querySelector('.ending-dock .party-compact:last-child')");
                nativeTap(".ending-actions button:first-child"); until("document.querySelector('.investigation-ending')");
                assertEquals("Review opens the progress page", "true", js("document.querySelector('.info-drawer-tabs button:first-child').getAttribute('aria-selected')==='true'"));
                screenshot("ending-" + size[0] + "-review");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                until("!document.querySelector('.info-drawer-react.open')&&document.activeElement===document.querySelector('.ending-actions button:first-child')");
                viewport(size[0], 300); reachable(".ending-actions button:first-child"); reachable(".ending-actions button:last-child");
                nativeTap(".ending-actions button:first-child"); until("document.querySelector('.investigation-ending')"); reachable("[aria-label='关闭资料']");
                nativeTap("[aria-label='关闭资料']"); until("document.activeElement===document.querySelector('.ending-actions button:first-child')"); viewport(size[0], size[1]);
                until("document.querySelector('.info-drawer-react').getBoundingClientRect().left>=innerWidth-.5");
                screenshot("ending-" + size[0]); nativeTap(".ending-actions button:last-child"); until("document.querySelector('.title-screen')"); click("回顾调查"); until("document.querySelector('.ending-dock')");
                assertEquals("Offline review does not re-award player resources", "true", js("!document.querySelector('.thinking-line')&&!document.querySelector('.check-card')&&!document.querySelector('.dock-input')"));
                menu("保存游戏"); SystemClock.sleep(300);
                js("window.qaEndingRead=false;Capacitor.Plugins.GameStorage.readAll().then(({values})=>{window.qaEndingSaved=JSON.parse(values['trpg-android-session-v1']);window.qaEndingRead=true;})"); until("window.qaEndingRead");
                assertEquals("Player resources stay unchanged after home and resume", vitals, js("JSON.stringify(window.qaEndingSaved.state.players.map(p=>[p.currentHp,p.currentMp,p.currentSan]))"));
                assertEquals("The ending is settled only once", "true", js("window.qaEndingSaved.state.scenarioProgress.settledEndingIds.length===1&&window.qaEndingSaved.state.scenarioProgress.endingId===" + JSONObject.quote(endings[index])));
            } finally { activity.close(); }
        }
    }

    @Test public void audioStartsOnTouchAndSwitchesPersist() throws Exception {
        fresh();
        try {
            viewport(390, 844);
            js("window.qaThemeFetches=0;window.qaFetch=window.fetch;window.fetch=function(...args){if(String(args[0]).includes('fog-theme'))window.qaThemeFetches++;return window.qaFetch.apply(this,args)};window.qaHoldAudio=true;window.qaAudioHolds=[];window.qaActiveLoops=0;window.AudioContext=class extends window.AudioContext { constructor(...args){super(...args);window.qaAudio=this;} decodeAudioData(...args){return super.decodeAudioData(...args).then(b=>{window.qaDecoded=(window.qaDecoded||0)+1;if(window.qaHoldAudio&&b.duration>2)return new Promise(resolve=>window.qaAudioHolds.push(()=>resolve(b)));return b;})} createBufferSource(){const s=super.createBufferSource(),start=s.start.bind(s);s.start=(...args)=>{if(s.loop){window.qaLoopStarts=(window.qaLoopStarts||0)+1;window.qaActiveLoops++;s.addEventListener('ended',()=>{window.qaActiveLoops--},{once:true});}return start(...args)};return s;} }");
            nativeTap("button[aria-label='声音设置']");
            until("window.qaAudio && window.qaAudio.state === 'running'");
            until("window.qaAudioHolds.length === 2");
            until("document.querySelector('#audio-settings-title')");
            js("window.qaAudio.suspend()"); until("window.qaAudio.state === 'suspended'");
            js("window.qaAudioReleased=false;(async()=>{window.qaHoldAudio=false;window.qaAudioHolds.splice(0).forEach(release=>release());for(let i=0;i<16;i++)await Promise.resolve();window.qaAudioReleased=true})()");
            until("window.qaAudioReleased");
            assertEquals("Loops loaded during device suspension do not start yet", "0", js("window.qaLoopStarts||0"));
            js("window.qaAudio.resume()");
            until("window.qaLoopStarts === 2");
            fill("input[aria-label='音乐音量']", "38"); fill("input[aria-label='音效音量']", "23");
            until("document.querySelector('input[aria-label=音乐音量]').getAttribute('aria-valuetext')==='38%' && document.querySelector('input[aria-label=音效音量]').getAttribute('aria-valuetext')==='23%'");
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
                js("document.querySelector('.audio-preview').scrollIntoView({block:'nearest'})"); reachable(".audio-preview");
                assertEquals("Preview has a touch-sized drawn control", "true", js("document.querySelector('.audio-preview').getBoundingClientRect().height>=44&&getComputedStyle(document.querySelector('.audio-preview'),'::before').borderImageSource.includes('button-secondary')"));
                nativeTap(".audio-preview");
                fill("input[aria-label='音效音量']", "0"); until("document.querySelector('.audio-preview').disabled");
                fill("input[aria-label='音效音量']", "23"); until("!document.querySelector('.audio-preview').disabled");
                js("document.querySelector('.audio-credits summary').scrollIntoView({block:'nearest'})"); reachable(".audio-credits summary");
                if (!"true".equals(js("document.querySelector('.audio-credits').open"))) nativeTap(".audio-credits summary");
                until("document.querySelector('.audio-credits').open");
                String closeY = js("document.querySelector('.audio-close').getBoundingClientRect().y");
                js("document.querySelector('.audio-credit-links a[href*=zero]').scrollIntoView({block:'nearest'})"); reachable(".audio-credit-links a[href*=zero]");
                assertEquals("License link keeps a full touch target", "true", js("(()=>{const r=document.querySelector('.audio-credit-links a[href*=zero]').getBoundingClientRect();return r.width>=44&&r.height>=44})()"));
                assertEquals("Scrolling credits leaves close fixed", closeY, js("document.querySelector('.audio-close').getBoundingClientRect().y"));
                viewport(size[0], 300); reachable(".audio-close");
                js("document.querySelector('.audio-credit-links a[href*=zero]').scrollIntoView({block:'nearest'})"); reachable(".audio-credit-links a[href*=zero]");
                assertEquals("Focus cannot scroll the fixed panel frame", "0", js("document.querySelector('.audio-settings').scrollTop"));
                nativeTap(".audio-close"); until("!document.querySelector('.audio-settings')&&document.activeElement===document.querySelector('button[aria-label=声音设置]')");
                viewport(size[0], size[1]); nativeTap("button[aria-label=声音设置]"); until("document.querySelector('.audio-settings')");
                assertEquals("Reopen keeps settings and folds credits", "true", js("!document.querySelector('.audio-credits').open&&document.querySelector('input[aria-label=音乐音量]').value==='38'&&document.querySelector('input[aria-label=音效音量]').value==='23'"));
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
