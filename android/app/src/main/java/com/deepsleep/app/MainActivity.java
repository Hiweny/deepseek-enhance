package com.deepsleep.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
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
    private WebView web;
    private String injectJs;
    private ValueCallback<Uri[]> filePathCallback;
    private boolean splashCleared = false;

    private boolean isDark() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
    }

    /* 页面脚本之前就要跑的早期脚本：viewport 铺满安全区、主题跟随系统、Enter 发送、APK 标记 */
    private String earlyJs() {
        boolean dark = isDark();
        return "(function(){"
                + "window.__DSE_WEBVIEW__=true;"
                // viewport：必须在页面布局前生效，否则官网按错误安全区排版（顶栏错位）
                + "try{var m=document.querySelector('meta[name=viewport]');"
                + "if(!m){m=document.createElement('meta');m.name='viewport';(document.head||document.documentElement).appendChild(m);}"
                + "m.content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover';}catch(e){}"
                // 主题跟随系统：DeepSeek 主题键，document-start 写入，首帧即正确明暗
                + "try{var KEY='__appKit_@deepseek/chat_themePreference';"
                + "function dseApplyTheme(){localStorage.setItem(KEY,JSON.stringify({value:'" + (dark ? "dark" : "light") + "',__version:'0'}));}"
                + "dseApplyTheme();"
                + "window.addEventListener('storage',function(e){if(e.key===KEY)setTimeout(dseApplyTheme,0)});"
                + "}catch(e){}"
                // Enter 发送（Shift+Enter / 输入法组词期间保持换行）
                + "document.addEventListener('keydown',function(e){"
                + "if(e.key!=='Enter'||e.shiftKey||e.isComposing||e.ctrlKey||e.metaKey||e.altKey)return;"
                + "var t=e.target;if(!t||t.tagName!=='TEXTAREA')return;"
                + "var p=t;for(var i=0;i<8&&p;i++){var b=p.querySelector&&p.querySelector('div[role=button].ds-button--iconLabelPrimary,button.ds-button--iconLabelPrimary');"
                + "if(b){e.preventDefault();b.click();return;}p=p.parentElement;}"
                + "},true);"
                + "})();";
    }

    /* 完整增强脚本（幂等，SPA 内不重复执行） */
    private String fullBootstrapJs() {
        return earlyJs() + "\nif(window.__DSE_INJECTED__)return;window.__DSE_INJECTED__=true;\n" + injectJs() + "\n";
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

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        // 让内容自己处理系统栏 inset（配合 IME 监听把输入框顶起来）
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        applyImmersive();

        root = new FrameLayout(this);
        root.setBackgroundResource(R.drawable.splash_bg); // 开屏：鲸鱼居中，底色随明暗
        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        root.addView(web, lp);
        setContentView(root);

        setupInsets();

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

        // document-start 级注入（在页面任何脚本之前执行），不支持时回退到 onPageStarted
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            try {
                WebViewCompat.addDocumentStartJavaScript(web, fullBootstrapJs(),
                        Collections.singleton("*"));
            } catch (Exception e) { /* 回退 */ }
        }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                    view.evaluateJavascript(fullBootstrapJs(), null);
                } else {
                    view.evaluateJavascript(earlyJs(), null); // 兜底再跑一次（幂等）
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                clearSplash();
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

    /* 键盘弹起时给 WebView 底部留出 IME 高度，页面（含输入框）被整体顶起；
       全屏沉浸下系统不自动 resize，必须手动处理 */
    private void setupInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            Insets nav = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
            int bottom = Math.max(0, ime.bottom - nav.bottom);
            web.setPadding(0, 0, 0, bottom);
            return insets;
        });
    }

    private void clearSplash() {
        if (splashCleared) return;
        splashCleared = true;
        root.postDelayed(() -> {
            root.animate().alpha(0f).setDuration(260).withEndAction(() -> {
                root.setBackground(null);
                root.setAlpha(1f);
            }).start();
        }, 120);
    }

    /* 全屏沉浸：内容铺到状态栏/导航栏/刘海之下；不使用 FLAG_FULLSCREEN（它会导致键盘不顶布局） */
    private void applyImmersive() {
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
        getWindow().getDecorView().setSystemUiVisibility(flags);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }
        // 明暗模式对应状态栏图标深浅
        View decor = getWindow().getDecorView();
        int sys = decor.getSystemUiVisibility();
        if (!isDark()) sys |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        else sys &= ~(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        decor.setSystemUiVisibility(sys);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyImmersive();
        // 系统明暗切换：先写入对应站点主题，再刷新一次让首帧即为正确明暗
        if (web != null) {
            web.evaluateJavascript(earlyJs(), null);
            web.postDelayed(() -> { if (web != null) web.reload(); }, 60);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyImmersive();
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
