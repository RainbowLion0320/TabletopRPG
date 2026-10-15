package com.rainbowlion.fogtrpg;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.EOFException;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.HttpUrl;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;
import okio.Buffer;

/** Only AI requests use this bridge; bundled media continues through the local WebView origin. */
@CapacitorPlugin(name = "AiTransport")
public class AiTransportPlugin extends Plugin {
    private final Map<String, Call> requests = new ConcurrentHashMap<>();
    private final OkHttpClient client = new OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS).readTimeout(180, TimeUnit.SECONDS).callTimeout(180, TimeUnit.SECONDS)
        .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false).build();

    @PluginMethod
    public void request(PluginCall pluginCall) {
        send(pluginCall, false);
    }

    @PluginMethod(returnType = PluginMethod.RETURN_CALLBACK)
    public void stream(PluginCall pluginCall) {
        pluginCall.setKeepAlive(true);
        send(pluginCall, true);
    }

    private void send(PluginCall pluginCall, boolean streaming) {
        String id = pluginCall.getString("id", "");
        String address = pluginCall.getString("url", "");
        String method = pluginCall.getString("method", "POST");
        String body = pluginCall.getString("body", "");
        HttpUrl url = HttpUrl.parse(address);
        if (!id.matches("[0-9-]{1,80}") || url == null || !url.username().isEmpty() || !url.password().isEmpty()
            || !"POST".equals(method) || body.length() > 2000000) {
            reject(pluginCall, "模型请求格式无效。", "INVALID_REQUEST"); return;
        }
        try {
            Request.Builder builder = new Request.Builder().url(url)
                .post(RequestBody.create(body, MediaType.get("application/json; charset=utf-8")));
            JSObject headers = pluginCall.getObject("headers", new JSObject());
            Iterator<String> names = headers.keys();
            while (names.hasNext()) {
                String name = names.next();
                if (name.equalsIgnoreCase("authorization") || name.equalsIgnoreCase("content-type") || name.equalsIgnoreCase("accept"))
                    builder.header(name, headers.getString(name));
            }
            Call request = client.newCall(builder.build());
            if (requests.putIfAbsent(id, request) != null) { reject(pluginCall, "重复请求。", "DUPLICATE_REQUEST"); return; }
            request.enqueue(new Callback() {
                @Override public void onFailure(Call call, IOException error) {
                    requests.remove(id, call);
                    reject(pluginCall, call.isCanceled() ? "请求已取消。" : "无法连接模型服务，请检查网络与 API 地址。",
                        call.isCanceled() ? "ABORTED" : "CONNECTION_ERROR");
                }
                @Override public void onResponse(Call call, Response response) {
                    try (response) {
                        ResponseBody content = response.body();
                        if (streaming) {
                            JSObject header = new JSObject(); header.put("status", response.code());
                            header.put("contentType", response.header("Content-Type", "application/json"));
                            pluginCall.resolve(header);
                            if (content != null) {
                                long total = 0;
                                while (!content.source().exhausted()) {
                                    String line;
                                    try { line = content.source().readUtf8LineStrict(Math.max(0, 4000000 - total)); line += "\n"; }
                                    catch (EOFException end) {
                                        if (content.source().buffer().size() > 4000000 - total) throw new IOException("Response exceeds limit");
                                        line = content.source().readUtf8();
                                    }
                                    total += line.getBytes(StandardCharsets.UTF_8).length;
                                    if (total > 4000000) throw new IOException("Response exceeds limit");
                                    JSObject part = new JSObject(); part.put("chunk", line); pluginCall.resolve(part);
                                }
                            }
                            pluginCall.setKeepAlive(false);
                            JSObject done = new JSObject(); done.put("done", true); pluginCall.resolve(done);
                            return;
                        }
                        String text = "";
                        if (content != null) {
                            Buffer buffer = new Buffer();
                            long total = 0, read;
                            while ((read = content.source().read(buffer, 8192)) != -1) {
                                total += read;
                                if (total > 4000000) throw new IOException("Response exceeds limit");
                            }
                            text = buffer.readUtf8();
                        }
                        JSObject result = new JSObject(); result.put("status", response.code()); result.put("body", text);
                        pluginCall.resolve(result);
                    } catch (Exception error) { reject(pluginCall, "模型响应读取失败，请重试。", "RESPONSE_READ_FAILED"); }
                    finally { requests.remove(id, call); }
                }
            });
        } catch (Exception error) { reject(pluginCall, "无法发送模型请求，请检查 API 配置。", "INVALID_REQUEST"); }
    }

    private void reject(PluginCall call, String message, String code) {
        call.setKeepAlive(false);
        call.reject(message, code);
    }

    @PluginMethod public void cancel(PluginCall call) {
        Call request = requests.remove(call.getString("id", ""));
        if (request != null) request.cancel();
        call.resolve();
    }
    @Override protected void handleOnDestroy() {
        requests.clear();
        // TLS socket close can send close_notify. Android destroys Activities
        // on the UI thread, so cancel and release sockets on a worker instead.
        new Thread(() -> {
            client.dispatcher().cancelAll();
            try { client.connectionPool().evictAll(); }
            finally { client.dispatcher().executorService().shutdown(); }
        }, "fog-ai-http-cleanup").start();
    }
}
