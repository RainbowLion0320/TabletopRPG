package com.rainbowlion.fogtrpg;

import android.content.Context;
import android.graphics.Bitmap;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.ViewGroup;
import android.webkit.WebView;
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
    private void click(String text) throws Exception {
        String match = "Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === " + JSONObject.quote(text) + ")";
        until(match + " && !" + match + ".disabled"); js(match + ".click()");
    }
    private void fill(String selector, String value) throws Exception {
        js("(()=>{const e=document.querySelector(" + JSONObject.quote(selector) + ");Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e," + JSONObject.quote(value) + ");e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()");
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
    }
    private void nativeTap(String selector) throws Exception {
        org.json.JSONArray point = new org.json.JSONArray(js("(()=>{const r=document.querySelector(" + JSONObject.quote(selector) + ").getBoundingClientRect();return [(r.x+r.width/2)*devicePixelRatio,(r.y+r.height/2)*devicePixelRatio]})()"));
        long now = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, (float) point.getDouble(0), (float) point.getDouble(1), 0);
        MotionEvent up = MotionEvent.obtain(now, now + 80, MotionEvent.ACTION_UP, (float) point.getDouble(0), (float) point.getDouble(1), 0);
        InstrumentationRegistry.getInstrumentation().sendPointerSync(down);
        InstrumentationRegistry.getInstrumentation().sendPointerSync(up);
        down.recycle(); up.recycle();
    }
    private void configure(String endpoint, String protocol) throws Exception {
        until("document.querySelector('#api-config-modal-title')");
        fill(".modal-card select", "custom");
        until("document.querySelector('.modal-card select').value === 'custom'");
        // Each select is nested in its own label.
        js("(()=>{const e=document.querySelectorAll('.modal-card select')[1];Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e," + JSONObject.quote(protocol) + ");e.dispatchEvent(new Event('change',{bubbles:true}));})()");
        fill(".modal-card input:not([type=password])", endpoint);
        fill(".modal-card input[type=password]", "android-qa-only-token");
        fill(".modal-card label:last-of-type input", "android-qa-model");
        click("保存"); until("!document.querySelector('#api-config-modal-title')");
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

    private void menu(String label) throws Exception {
        if (!"true".equals(js("Boolean(document.querySelector('.game-menu.open'))")))
            js("document.querySelector('.menu-button').click()");
        click(label);
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
                assertEquals("Home video does not create a page scrollbar", "true", js("document.querySelector('.title-screen').scrollHeight<=document.querySelector('.title-screen').clientHeight+1"));
                click("AI 设置");
                until("document.querySelector('.api-config-fields')");
                for (int i = 1; i <= 5; i++) reachable(".api-config-fields label:nth-child(" + i + ") > :is(input,select)");
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
                if (size[0] == 360) {
                    // Wait for the non-interactive save notification to fade before testing the HUD.
                    until("!document.querySelector('.toast')");
                    reachable(".party-compact:last-child");
                    assertEquals("All four status cards fit without horizontal scrolling", "true", js("document.querySelector('.party-strip-compact').scrollWidth<=document.querySelector('.party-strip-compact').clientWidth+1"));
                    viewport(320, 568);
                    assertEquals("Smallest four-player HUD keeps every value inside its card", "true", js("Array.from(document.querySelectorAll('.party-compact,.party-strip-compact')).every(e=>e.scrollWidth<=e.clientWidth+1)"));
                    assertEquals("Smallest four-player reading area remains usable", "true", js("document.querySelector('.narrative-panel').clientHeight>=140"));
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
                js("document.querySelector('.narrative-toggle-btn').click()"); reachable(".narrative-toggle-btn");
                assertEquals("Expanded reading stays below navigation and above the dock", "true", js("(()=>{const p=document.querySelector('.narrative-panel').getBoundingClientRect(),d=document.querySelector('.action-dock').getBoundingClientRect(),n=document.querySelector('.game-top').getBoundingClientRect();return p.top>=n.bottom&&p.bottom<=d.top+.5&&p.width>innerWidth*.9&&p.left===d.left&&p.right===d.right})()"));
                js("(()=>{const e=document.createElement('div');e.id='qa-long-story';e.className='story-message dm';e.textContent='调查员沿着门廊仔细查看，斑驳的木板上留下了一道浅浅的划痕。伊莎贝拉回忆起那天走廊里急促的脚步声。'.repeat(40);document.querySelector('.narrative-scroll').appendChild(e)})()");
                String headerTop = js("document.querySelector('.narrative-header').getBoundingClientRect().top");
                for (double fraction : new double[] {0, .5, 1}) {
                    js("(()=>{const s=document.querySelector('.narrative-scroll');s.scrollTop=(s.scrollHeight-s.clientHeight)*" + fraction + "})()");
                    assertEquals("Story header stays fixed when history scrolls", headerTop, js("document.querySelector('.narrative-header').getBoundingClientRect().top"));
                    assertEquals("Only the story body scrolls below the header", "true", js("(()=>{const p=document.querySelector('.narrative-panel'),s=document.querySelector('.narrative-scroll'),h=document.querySelector('.narrative-header').getBoundingClientRect();return p.scrollTop===0&&s.scrollHeight>s.clientHeight&&s.getBoundingClientRect().top>=h.bottom})()"));
                    reachable(".narrative-toggle-btn"); reachable(".menu-button"); reachable(".drawer-tab"); reachable(".dock-input");
                }
                screenshot(prefix + "-expanded");
                js("document.querySelector('#qa-long-story').remove();document.querySelector('.narrative-scroll').scrollTop=0");
                js("document.querySelector('.narrative-toggle-btn').click();document.querySelector('.npc-nameplate').click()");
                reachable(".entity-detail-close"); screenshot(prefix + "-entity");
                // Long unlocked descriptions scroll without moving the close control.
                js("document.querySelector('.entity-detail-known p').textContent='长篇调查记录。'.repeat(150);document.querySelector('.entity-detail-body').scrollTop=99999");
                reachable(".entity-detail-close"); js("document.querySelector('.entity-detail-close').click()");
                js("document.querySelector('.drawer-tab').click()");
                until("document.querySelector('.case-board-mobile-card')"); reachable("[aria-label='关闭资料']");
                reachable(".case-board-mobile-card"); screenshot(prefix + "-board");
                js("document.querySelector('.case-board-mobile-card').click()"); reachable("[aria-label='关闭资料详情']");
                until("document.querySelector('.case-board-inspector').contains(document.activeElement)");
                screenshot(prefix + "-inspector");
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
                until("!document.querySelector('.case-board-inspector') && document.querySelector('.info-drawer-react.open')"); click("进度");
                reachable("[aria-label='关闭资料']"); click("日志"); reachable("[aria-label='关闭资料']");
                js("document.querySelector('[aria-label=关闭资料]').click()");
                menu("声音设置"); reachable("[role='switch'][aria-label='背景音乐']"); reachable("[role='switch'][aria-label='游戏音效']");
                screenshot(prefix + "-audio");
                js("document.querySelector('.audio-credits').open=true;document.querySelector('.audio-settings-body').scrollTop=99999");
                reachable(".audio-close"); js("document.querySelector('.audio-close').click()");
                for (int i = 0; i < 4; i++) { menu("保存游戏"); SystemClock.sleep(100); }
                menu("存档管理"); reachable(".save-manager-card footer button");
                js("document.querySelector('.save-list').scrollTop=99999");
                reachable(".save-slot-card:last-child .danger"); screenshot(prefix + "-saves"); click("关闭");
                menu("KP 笔记"); reachable(".dm-journal-card footer button"); click("关闭");
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
            } finally { activity.close(); }
        }
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
                        String content = narrator ? "{\"narrative\":\"Android 调查继续，伊莎贝拉说明父亲失踪的经过。\",\"activeNpc\":\"伊莎贝拉·摩勒\",\"nextPrompt\":\"继续调查。\",\"playerChoices\":{}}" : "{\"facts\":[],\"nodes\":[],\"edges\":[]}";
                        String response = request.getPath().endsWith("/responses") ? "{\"output_text\":" + JSONObject.quote(content) + "}" : "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":" + JSONObject.quote(content) + "}}]}";
                        return new MockResponse().setHeader("Content-Type", "application/json").setBody(response);
                    }
                });
                server.start(); fresh();
                click("开始游戏"); until("document.querySelectorAll('.preset-card-modern.selected').length === 1");
                for (int i = 1; i < party; i++) js("document.querySelectorAll('.preset-card-modern strong')[" + i + "].click()");
                until("document.querySelectorAll('.preset-card-modern.selected').length === " + party);
                click("进入游戏"); configure(server.url("/v1").toString(), party == 1 ? "responses" : "chat-completions");
                until("document.querySelectorAll('.party-compact').length === " + party);
                screenshot("party-" + party);
                assertEquals("Readable narrative", "true", js("document.querySelector('.narrative-panel').clientHeight > 90"));
                for (int i = 0; i < party; i++) {
                    fill(".dock-input", "接受委托并询问失踪经过");
                    click(i == party - 1 ? "提交" : "下一位");
                }
                until("document.body.innerText.includes('Android 调查继续')");
                assertEquals(1, narratorCalls.get());
                until("document.querySelectorAll('.story-message.player').length === " + party);
                assertEquals("No API token in WebView storage", "null", js("localStorage.getItem('trpg-api')"));
                assertFalse(context.getSharedPreferences("fog-game-v1", Context.MODE_PRIVATE).getAll().toString().contains("android-qa-only-token"));
                assertTrue(context.getSharedPreferences("fog-game-v1", Context.MODE_PRIVATE).contains("trpg-api"));
                SystemClock.sleep(300);
                activity.recreate(); until("document.querySelector('.title-screen')"); click("继续游戏");
                until("document.body.innerText.includes('Android 调查继续')");
                assertEquals("No repeated API prompt", "false", js("Boolean(document.querySelector('#api-config-modal-title'))"));
                screenshot("restored-" + party);
                if (party == 1) {
                    js("document.querySelector('.drawer-tab').click()");
                    until("document.querySelector('.info-drawer-react.open .case-board-mobile-card')");
                    assertEquals("Case information is reachable on a short display", "true", js("innerWidth>900 || document.querySelector('.case-board-mobile-card').getBoundingClientRect().top < innerHeight-60"));
                    screenshot("caseboard");
                    js("document.querySelector('[aria-label=关闭资料]').click()");
                }
            } finally { if (activity != null) activity.close(); }
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

    @Test public void audioStartsOnTouchAndSwitchesPersist() throws Exception {
        fresh();
        try {
            js("window.AudioContext=class extends window.AudioContext { constructor(...args){super(...args);window.qaAudio=this;} decodeAudioData(...args){return super.decodeAudioData(...args).then(b=>{window.qaDecoded=(window.qaDecoded||0)+1;return b;})} }");
            nativeTap("button[aria-label='声音设置']");
            until("window.qaAudio && window.qaAudio.state === 'running'");
            until("window.qaDecoded > 0");
            until("document.querySelector('#audio-settings-title')");
            nativeTap("button[role='switch'][aria-label='背景音乐']");
            until("document.querySelector('[aria-label=背景音乐]').getAttribute('aria-checked') === 'false'");
            SystemClock.sleep(300);
            activity.recreate(); until("document.querySelector('.title-screen')"); click("声音设置");
            until("document.querySelector('[aria-label=背景音乐]').getAttribute('aria-checked') === 'false'");
            assertEquals("Effects stay independently enabled", "\"true\"", js("document.querySelector('[aria-label=游戏音效]').getAttribute('aria-checked')"));
        } finally { activity.close(); }
    }
}
