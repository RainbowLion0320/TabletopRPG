package com.rainbowlion.fogtrpg;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
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
        String id = pluginCall.getString("id", "");
        String address = pluginCall.getString("url", "");
        String method = pluginCall.getString("method", "POST");
        String body = pluginCall.getString("body", "");
        HttpUrl url = HttpUrl.parse(address);
        if (!id.matches("[0-9-]{1,80}") || url == null || !url.username().isEmpty() || !url.password().isEmpty()
            || !"POST".equals(method) || body.length() > 2000000) {
            pluginCall.reject("模型请求格式无效。", "INVALID_REQUEST"); return;
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
            if (requests.putIfAbsent(id, request) != null) { pluginCall.reject("重复请求。", "DUPLICATE_REQUEST"); return; }
            request.enqueue(new Callback() {
                @Override public void onFailure(Call call, IOException error) {
                    requests.remove(id, call);
                    pluginCall.reject(call.isCanceled() ? "请求已取消。" : "无法连接模型服务，请检查网络与 API 地址。",
                        call.isCanceled() ? "ABORTED" : "CONNECTION_ERROR");
                }
                @Override public void onResponse(Call call, Response response) {
                    try (response) {
                        ResponseBody content = response.body();
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
                    } catch (Exception error) { pluginCall.reject("模型响应读取失败，请重试。", "RESPONSE_READ_FAILED"); }
                    finally { requests.remove(id, call); }
                }
            });
        } catch (Exception error) { pluginCall.reject("无法发送模型请求，请检查 API 配置。", "INVALID_REQUEST"); }
    }

    @PluginMethod public void cancel(PluginCall call) {
        Call request = requests.remove(call.getString("id", ""));
        if (request != null) request.cancel();
        call.resolve();
    }
    @Override protected void handleOnDestroy() {
        for (Call request : requests.values()) request.cancel();
        requests.clear();
        client.dispatcher().executorService().shutdown();
        client.connectionPool().evictAll();
    }
}
