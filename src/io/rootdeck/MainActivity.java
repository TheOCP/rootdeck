package io.rootdeck;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Base64;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Hosts the RootDeck web UI (assets/) in a full-screen WebView and exposes a small
 * bridge as {@code window.Native}. Async calls answer through {@code RD_cb(id, code, out)}.
 */
public class MainActivity extends Activity {

    private static final int BG = 0xFF050608;
    // PackageManager.MATCH_UNINSTALLED_PACKAGES | MATCH_DISABLED_COMPONENTS (API 24 names, same bits).
    private static final int MATCH_ALL = 0x00002000 | 0x00000200;
    private static final int FLAG_INSTALLED = 0x00800000;

    private WebView web;
    private FrameLayout root;
    // Lane 0 serves the UI; lane 1 runs long jobs (terminal, maintenance) so the dashboard never stalls.
    private final RootShell[] shells = {new RootShell(), new RootShell()};
    private final ExecutorService pool = Executors.newCachedThreadPool();
    private final ExecutorService iconPool = Executors.newFixedThreadPool(3);
    private volatile String insets = "{\"t\":0,\"b\":0,\"l\":0,\"r\":0,\"ime\":false}";

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        disableContrastScrim(w, "setNavigationBarContrastEnforced");
        disableContrastScrim(w, "setStatusBarContrastEnforced");

        root = new FrameLayout(this);
        root.setBackgroundColor(BG);
        web = new WebView(this);
        web.setBackgroundColor(BG);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets in) {
                onInsets(in);
                return in.consumeSystemWindowInsets();
            }
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setTextZoom(100);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.addJavascriptInterface(new Bridge(), "Native");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                Uri u = Uri.parse(url);
                if ("file".equals(u.getScheme())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                }
                return true;
            }
        });
        web.loadUrl("file:///android_asset/index.html");
    }

    /** Draw edge-to-edge and hand the bar sizes to CSS; only the keyboard actually shrinks the page. */
    private void onInsets(WindowInsets in) {
        float d = getResources().getDisplayMetrics().density;
        int bottom = in.getSystemWindowInsetBottom();
        boolean ime = bottom > 160 * d;
        root.setPadding(0, 0, 0, ime ? bottom : 0);
        insets = String.format(Locale.US, "{\"t\":%.1f,\"b\":%.1f,\"l\":%.1f,\"r\":%.1f,\"ime\":%b}",
                in.getSystemWindowInsetTop() / d, ime ? 0f : bottom / d,
                in.getSystemWindowInsetLeft() / d, in.getSystemWindowInsetRight() / d, ime);
        js("window.RD_insets&&RD_insets(" + insets + ")");
    }

    private static void disableContrastScrim(Window w, String method) {
        try {
            Window.class.getMethod(method, boolean.class).invoke(w, false);
        } catch (Exception ignored) {
            // Not available before API 29.
        }
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.RD_back?RD_back():false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) MainActivity.super.onBackPressed();
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        js("window.RD_vis&&RD_vis(true)");
    }

    @Override
    protected void onPause() {
        js("window.RD_vis&&RD_vis(false)");
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        for (RootShell sh : shells) sh.kill();
        pool.shutdownNow();
        iconPool.shutdownNow();
        web.destroy();
        super.onDestroy();
    }

    private void js(final String code) {
        if (web == null) return;
        web.post(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript(code, null);
            }
        });
    }

    private void reply(String id, int code, String out) {
        js("RD_cb(" + JSONObject.quote(id) + "," + code + "," + JSONObject.quote(out == null ? "" : out) + ")");
    }

    private String listApps() throws Exception {
        PackageManager pm = getPackageManager();
        List<PackageInfo> list = pm.getInstalledPackages(MATCH_ALL);
        JSONArray arr = new JSONArray();
        for (PackageInfo pi : list) {
            ApplicationInfo ai = pi.applicationInfo;
            if (ai == null) continue;
            CharSequence label = null;
            try {
                label = ai.loadLabel(pm);
            } catch (Exception ignored) {
            }
            JSONObject o = new JSONObject();
            o.put("p", pi.packageName);
            o.put("n", label == null ? pi.packageName : label.toString());
            o.put("v", pi.versionName == null ? "" : pi.versionName);
            o.put("s", (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0);
            o.put("u", (ai.flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0);
            o.put("e", ai.enabled);
            o.put("i", (ai.flags & FLAG_INSTALLED) != 0);
            o.put("d", ai.sourceDir == null ? "" : ai.sourceDir);
            o.put("sp", ai.splitSourceDirs == null ? 0 : ai.splitSourceDirs.length);
            o.put("uid", ai.uid);
            o.put("t", pi.firstInstallTime);
            o.put("up", pi.lastUpdateTime);
            arr.put(o);
        }
        return arr.toString();
    }

    private String iconData(String pkg, int px) throws Exception {
        PackageManager pm = getPackageManager();
        Drawable d = pm.getApplicationInfo(pkg, MATCH_ALL).loadIcon(pm);
        int size = Math.max(48, Math.min(px, 192));
        Bitmap b = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        d.setBounds(0, 0, size, size);
        d.draw(new Canvas(b));
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.PNG, 100, bos);
        b.recycle();
        return "data:image/png;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
    }

    /** Downloads into the app cache (root then copies it where it needs to go). */
    private String fetch(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(60000);
        c.setRequestProperty("User-Agent", "RootDeck/1.0 (Android)");
        int code = c.getResponseCode();
        if (code / 100 != 2) throw new Exception("HTTP " + code);
        File f = new File(getCacheDir(), "dl-" + System.currentTimeMillis());
        InputStream in = c.getInputStream();
        OutputStream out = new FileOutputStream(f);
        try {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        } finally {
            in.close();
            out.close();
            c.disconnect();
        }
        return f.getAbsolutePath();
    }

    private final class Bridge {

        @JavascriptInterface
        public void exec(final String id, final String cmd, final int timeout, final int lane) {
            pool.execute(new Runnable() {
                @Override
                public void run() {
                    RootShell.Result r = shells[lane == 1 ? 1 : 0].run(cmd, timeout);
                    reply(id, r.code, r.out);
                }
            });
        }

        @JavascriptInterface
        public void apps(final String id) {
            pool.execute(new Runnable() {
                @Override
                public void run() {
                    try {
                        reply(id, 0, listApps());
                    } catch (Exception e) {
                        reply(id, -1, String.valueOf(e.getMessage()));
                    }
                }
            });
        }

        @JavascriptInterface
        public void icon(final String id, final String pkg, final int px) {
            iconPool.execute(new Runnable() {
                @Override
                public void run() {
                    try {
                        reply(id, 0, iconData(pkg, px));
                    } catch (Exception e) {
                        reply(id, -1, "");
                    }
                }
            });
        }

        @JavascriptInterface
        public void download(final String id, final String url) {
            pool.execute(new Runnable() {
                @Override
                public void run() {
                    try {
                        reply(id, 0, fetch(url));
                    } catch (Exception e) {
                        reply(id, -1, String.valueOf(e.getMessage()));
                    }
                }
            });
        }

        @JavascriptInterface
        public boolean launch(String pkg) {
            final Intent i = getPackageManager().getLaunchIntentForPackage(pkg);
            if (i == null) return false;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    startActivity(i);
                }
            });
            return true;
        }

        @JavascriptInterface
        public void appInfo(String pkg) {
            final Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    startActivity(i);
                }
            });
        }

        @JavascriptInterface
        public void copy(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                    cm.setPrimaryClip(ClipData.newPlainText("RootDeck", text));
                }
            });
        }

        @JavascriptInterface
        public void share(String text) {
            final Intent i = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    startActivity(Intent.createChooser(i, null));
                }
            });
        }

        @JavascriptInterface
        public void haptic(final int kind) {
            web.post(new Runnable() {
                @Override
                public void run() {
                    web.performHapticFeedback(kind == 1 ? HapticFeedbackConstants.LONG_PRESS
                            : kind == 2 ? HapticFeedbackConstants.CONTEXT_CLICK
                            : HapticFeedbackConstants.KEYBOARD_TAP);
                }
            });
        }

        @JavascriptInterface
        public String insets() {
            return insets;
        }

        @JavascriptInterface
        public int sdk() {
            return Build.VERSION.SDK_INT;
        }

        @JavascriptInterface
        public String version() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "?";
            }
        }
    }
}
