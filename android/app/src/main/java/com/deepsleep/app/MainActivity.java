package com.deepsleep.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Rect;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsAnimationCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

public class MainActivity extends Activity {

    private static final String HOME = "https://chat.deepseek.com/";
    private static final int FILE_CHOOSER_CODE = 1001;
    private static final int PERM_CODE = 1002;

    private FrameLayout root;
    private ImageView splashLogo;
    private WebView web;
    private String injectJs;
    private ValueCallback<Uri[]> filePathCallback;
    private boolean splashCleared = false;
    private String sharedText = null;

    // 键盘三通道：IME 动画期只做 GPU 位移（不逐帧 resize，杜绝卡顿/黑缝），动画结束落一次布局；
    // 现代 insets 与全局布局测量为无动画 ROM 兜底
    private int navBarH = 0;
    private int imePadModern = 0;
    private int imePadLegacy = 0;
    private int lastAnimH = 0;         // IME 动画最后一帧高度，onEnd 作为终值
    private boolean imeAnimating = false;
    private int settledMargin = 0;     // 动画结束后真正压缩 WebView 高度的 bottomMargin
    private final Rect visibleRect = new Rect();
    private final Runnable applyRunnable = this::applyTargetPadding;

    private boolean isDark() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
    }

    // 与官网 body 最终底色严格一致（实测：深色 rgb(21,21,23)、浅色 rgb(255,255,255)），避免交接瞬间色差
    private int pageBgColor() { return isDark() ? 0xFF151517 : 0xFFFFFFFF; }
    private String pageBgCss() { return isDark() ? "#151517" : "#ffffff"; }

    private String earlyJs() { return InlineJs.early(isDark(), pageBgCss()); }

    private String fullBootstrapJs() {
        return InlineJs.fullBootstrap(isDark(), pageBgCss(), injectJs());
    }

    private String injectJs() {
        if (injectJs != null) return injectJs;
        StringBuilder sb = new StringBuilder();
        try (InputStream is = getAssets().open("inject.js");
             BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) sb.append(line).append('\n');
        } catch (Exception e) {
            return "";
        }
        injectJs = sb.toString();
        return injectJs;
    }

    private class ShareBridge {
        @JavascriptInterface
        public synchronized String consumeShared() {
            String t = sharedText;
            sharedText = null;
            return t == null ? "" : t;
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        if (Intent.ACTION_SEND.equals(getIntent().getAction()) && getIntent().getType() != null
                && getIntent().getType().startsWith("text/")) {
            sharedText = getIntent().getStringExtra(Intent.EXTRA_TEXT);
        }

        // edge-to-edge：内容铺到系统栏之下；键盘高度由我们按 insets 补 padding
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        // 窗口底色与页面严格一致，键盘动画/resize 露出的任何缝隙都不是黑色
        getWindow().setBackgroundDrawable(new ColorDrawable(pageBgColor()));
        applyImmersive();

        root = new FrameLayout(this);
        root.setBackgroundColor(pageBgColor());
        root.setClipToPadding(false);

        splashLogo = new ImageView(this);
        splashLogo.setImageResource(R.drawable.splash_logo);
        FrameLayout.LayoutParams logoLp = new FrameLayout.LayoutParams(dp(108), dp(108));
        logoLp.gravity = Gravity.CENTER;
        root.addView(splashLogo, logoLp);

        applyChromiumTuning();
        web = new WebView(this);
        // 渲染进程保持重要优先级，长对话滚动/输入时不被系统降频
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
        }
        web.setBackgroundColor(pageBgColor());
        web.setClipToPadding(false);
        web.addJavascriptInterface(new ShareBridge(), "DSENative");
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        setupKeyboard();

        WebView.setWebContentsDebuggingEnabled(true);
        // 流畅度：显式硬件层 + 离屏预光栅化（滚动不白块/掉帧）+ 去掉边缘回弹开销
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setSupportMultipleWindows(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setOffscreenPreRaster(true); // 视口外预光栅化，滚动/resize 更丝滑
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);

        // document-start 注入；无论注册成功与否，onPageStarted 都再补一次完整脚本（__DSE_INJECTED__ 幂等）
        boolean docStartOk = false;
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            try {
                WebViewCompat.addDocumentStartJavaScript(web, fullBootstrapJs(),
                        Collections.singleton("*"));
                docStartOk = true;
            } catch (Exception e) {
                docStartOk = false;
            }
        }
        final boolean hasDocStart = docStartOk;

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                // 永远补跑完整引导：document-start 已跑过则 guard 直接返回；没跑成则在这里兜底，绝不漏注入
                view.evaluateJavascript(fullBootstrapJs(), null);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                clearSplash();
                view.evaluateJavascript(fullBootstrapJs(), null); // 最后一次幂等兜底
                view.evaluateJavascript(
                        "(function(){try{var t=window.DSENative?DSENative.consumeShared():'';"
                        + "if(t&&window.__dseFillShared)window.__dseFillShared(t);}catch(e){}})();", null);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String scheme = u.getScheme() == null ? "" : u.getScheme();
                if (scheme.equals("http") || scheme.equals("https")) {
                    if (u.getHost() != null && u.getHost().endsWith("deepseek.com")) return false;
                    try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                    return true;
                }
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = cb;
                Intent intent = params.createIntent();
                try {
                    startActivityForResult(Intent.createChooser(intent, "选择文件"), FILE_CHOOSER_CODE);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    String[] wanted = request.getResources();
                    boolean needPerm = false;
                    for (String r : wanted) {
                        if (r.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                                && checkSelfPermission(android.Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) needPerm = true;
                        if (r.equals(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                                && checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) needPerm = true;
                    }
                    if (needPerm) {
                        request.deny();
                        requestPermissions(new String[]{android.Manifest.permission.CAMERA, android.Manifest.permission.RECORD_AUDIO}, PERM_CODE);
                    } else {
                        request.grant(wanted);
                    }
                });
            }
        });

        if (savedInstanceState == null) {
            web.loadUrl(HOME);
        } else {
            web.restoreState(savedInstanceState);
        }
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    /**
     * Chromium 引擎调优：必须在第一个 WebView 实例化之前调用。
     * 通过反射访问 WebView 内置的 org.chromium.base.CommandLine（随 WebView provider 加载，
     * 不在系统隐藏 API 灰名单内），打开 GPU 光栅化/零拷贝等开关；任何机型不支持都静默跳过。
     */
    private void applyChromiumTuning() {
        String[] switches = {
                "--ignore-gpu-blocklist",
                "--enable-gpu-rasterization",
                "--enable-zero-copy",
                "--enable-quic",
                "--force-gpu-mem-available-mb=512"
        };
        try {
            Class<?> cmd = Class.forName("org.chromium.base.CommandLine");
            try {
                cmd.getMethod("init", java.io.File.class).invoke(null, (Object) null);
            } catch (Throwable ignored) { }
            Object instance = cmd.getMethod("getInstance").invoke(null);
            if (instance == null) return;
            java.lang.reflect.Method append = cmd.getMethod("appendSwitch", String.class);
            for (String sw : switches) {
                try { append.invoke(instance, sw); } catch (Throwable ignored) { }
            }
        } catch (Throwable ignored) { }
    }

    /**
     * 动画结束后真正压缩一次 WebView【布局高度】（bottomMargin，而非 padding）：
     * Chromium WebView 内 fixed 元素锚定自身视口底边，只有 View 高度变小，
     * 网页 visualViewport 才收缩、fixed 输入框才稳定停在键盘上方。
     */
    private void setSettledMargin(int bottom) {
        if (web == null) return;
        settledMargin = bottom;
        ViewGroup.LayoutParams lp = web.getLayoutParams();
        if (lp instanceof FrameLayout.LayoutParams) {
            FrameLayout.LayoutParams flp = (FrameLayout.LayoutParams) lp;
            if (flp.bottomMargin != bottom) {
                flp.bottomMargin = bottom;
                web.setLayoutParams(flp);
            }
        }
    }

    /** 非动画通道去抖合并 */
    private void scheduleApply() {
        if (root == null) return;
        root.removeCallbacks(applyRunnable);
        root.postDelayed(applyRunnable, 60);
    }

    private void applyTargetPadding() {
        if (imeAnimating) return; // IME 动画期间由位移接管
        if (web != null) web.setTranslationY(0f);
        setSettledMargin(Math.max(imePadModern, imePadLegacy));
    }

    /**
     * 键盘三通道。核心策略：IME 动画期间【不改布局】，只用 translationY 平移 WebView
     * （GPU 合成，丝滑且不会因逐帧 resize 露出黑缝）；动画结束同一时刻清零位移、落一次布局，
     * 首尾位置严格相等所以无跳变。收起方向在 onStart 先放开布局、改用位移承接。
     * 注意：绝不使用 HIDE_NAVIGATION/IMMERSIVE/FULLSCREEN（会让 IME insets 失效）。
     */
    private void setupKeyboard() {
        ViewCompat.setWindowInsetsAnimationCallback(root,
                new WindowInsetsAnimationCompat.Callback(
                        WindowInsetsAnimationCompat.Callback.DISPATCH_MODE_STOP) {
                    @Override
                    public WindowInsetsAnimationCompat.BoundsCompat onStart(
                            WindowInsetsAnimationCompat anim,
                            WindowInsetsAnimationCompat.BoundsCompat bounds) {
                        if ((anim.getTypeMask() & WindowInsetsCompat.Type.ime()) != 0) {
                            imeAnimating = true;
                            if (settledMargin > 0) {
                                // 收起：先放开布局高度，用等值位移承接，画面不动
                                web.setTranslationY(-settledMargin);
                                setSettledMargin(0);
                            } else {
                                web.setTranslationY(0f);
                            }
                        }
                        return bounds;
                    }

                    @Override
                    public WindowInsetsCompat onProgress(WindowInsetsCompat insets,
                                                        java.util.List<WindowInsetsAnimationCompat> anims) {
                        for (WindowInsetsAnimationCompat a : anims) {
                            if ((a.getTypeMask() & WindowInsetsCompat.Type.ime()) != 0) {
                                Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
                                Insets nav = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
                                navBarH = nav.bottom;
                                lastAnimH = Math.max(0, ime.bottom - nav.bottom);
                                web.setTranslationY(-lastAnimH);
                            }
                        }
                        return insets;
                    }

                    @Override
                    public void onEnd(WindowInsetsAnimationCompat anim) {
                        if ((anim.getTypeMask() & WindowInsetsCompat.Type.ime()) != 0) {
                            imeAnimating = false;
                            web.setTranslationY(0f);
                            setSettledMargin(lastAnimH);
                            scheduleApply();
                        }
                    }
                });
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            Insets nav = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
            navBarH = nav.bottom;
            imePadModern = Math.max(0, ime.bottom - nav.bottom);
            scheduleApply();
            return insets;
        });
        root.getViewTreeObserver().addOnGlobalLayoutListener(new ViewTreeObserver.OnGlobalLayoutListener() {
            @Override
            public void onGlobalLayout() {
                if (root == null) return;
                root.getWindowVisibleDisplayFrame(visibleRect);
                int screenH = root.getRootView().getHeight();
                int covered = screenH - visibleRect.bottom;
                imePadLegacy = Math.max(0, covered - navBarH);
                scheduleApply();
            }
        });
        root.post(() -> ViewCompat.requestApplyInsets(root));
    }

    private void clearSplash() {
        if (splashCleared) return;
        splashCleared = true;
        if (splashLogo != null) {
            splashLogo.postDelayed(() -> splashLogo.animate().alpha(0f).setDuration(260)
                    .withEndAction(() -> splashLogo.setVisibility(View.GONE)).start(), 120);
        }
    }

    /** 透明系统栏 + 内容铺到其下；绝不使用 HIDE_NAVIGATION/IMMERSIVE/FULLSCREEN（会导致键盘不顶布局） */
    private void applyImmersive() {
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        w.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        w.setStatusBarColor(0x00000000);
        w.setNavigationBarColor(0x00000000);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) w.setNavigationBarContrastEnforced(false);
        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
        View decor = w.getDecorView();
        if (!isDark()) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        decor.setSystemUiVisibility(flags);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyImmersive();
        getWindow().setBackgroundDrawable(new ColorDrawable(pageBgColor()));
        if (root != null) root.setBackgroundColor(pageBgColor());
        if (web != null) {
            web.setBackgroundColor(pageBgColor());
            web.evaluateJavascript(earlyJs(), null);
            web.postDelayed(() -> { if (web != null) web.reload(); }, 60);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyImmersive();
            ViewCompat.requestApplyInsets(root);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (Intent.ACTION_SEND.equals(intent.getAction()) && intent.getType() != null
                && intent.getType().startsWith("text/")) {
            sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (web != null) web.evaluateJavascript(earlyJs(), null);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_CODE) {
            if (filePathCallback == null) return;
            Uri[] result = (data == null || resultCode != RESULT_OK) ? null
                    : WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            filePathCallback.onReceiveValue(result);
            filePathCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            if (web.getParent() instanceof ViewGroup) ((ViewGroup) web.getParent()).removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
