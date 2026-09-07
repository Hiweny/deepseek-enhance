package com.deepsleep.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputConnectionWrapper;
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
    private DseWebView web;
    private String injectJs;
    private ValueCallback<Uri[]> filePathCallback;
    private boolean splashCleared = false;
    private String sharedText = null;

    private boolean isDark() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
    }

    /** WebView 首屏底色（避免加载/重载瞬间露白，跟随系统明暗） */
    private int pageBgColor() { return isDark() ? 0xFF0D0F15 : 0xFFF4F6FB; }
    private String pageBgCss() { return isDark() ? "#0D0F15" : "#F4F6FB"; }

    /* 早期脚本“内部代码”（不含 IIFE 外壳，方便组合） */
    private String earlyInner() {
        boolean dark = isDark();
        String bg = pageBgCss();
        return "window.__DSE_WEBVIEW__=true;"
                // viewport：必须在页面布局前生效
                + "try{var m=document.querySelector('meta[name=viewport]');"
                + "if(!m){m=document.createElement('meta');m.name='viewport';(document.head||document.documentElement).appendChild(m);}"
                + "m.content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover';}catch(e){}"
                // 首帧底色：在页面任何样式生效前压住 html/body，杜绝深色下官网默认白底闪烁
                + "try{var ss=document.getElementById('__dse_firstpaint')||document.createElement('style');"
                + "ss.id='__dse_firstpaint';ss.textContent='html,body{background:" + bg + "!important}';"
                + "(document.head||document.documentElement).appendChild(ss);"
                + "window.addEventListener('load',function(){var e=document.getElementById('__dse_firstpaint');if(e)e.remove();});"
                + "}catch(e){}"
                // APK 专属出厂默认（仅首次、用户未改过配置时写入；不影响油猴脚本）
                + "try{if(!localStorage.getItem('dse_config_v1')){"
                + "localStorage.setItem('dse_config_v1',JSON.stringify({topbarStyle:'transparent',fullscreenBtn:false,timeInject:true}));}}catch(e){}"
                // 主题跟随系统
                + "try{var KEY='__appKit_@deepseek/chat_themePreference';"
                + "function dseApplyTheme(){localStorage.setItem(KEY,JSON.stringify({value:'" + (dark ? "dark" : "light") + "',__version':'0'}));}"
                + "dseApplyTheme();"
                + "window.addEventListener('storage',function(e){if(e.key===KEY)setTimeout(dseApplyTheme,0)});"
                + "}catch(e){}"
                // 物理/外接键盘 Enter 发送（Shift 或组词期间换行）
                + "document.addEventListener('keydown',function(e){"
                + "if(e.key!=='Enter'||e.shiftKey||e.isComposing||e.ctrlKey||e.metaKey||e.altKey)return;"
                + "var t=e.target;if(!t||t.tagName!=='TEXTAREA')return;e.preventDefault();window.__dseClickSend&&window.__dseClickSend();"
                + "},true);"
                // 系统分享文本填槽
                + "(function(){function dseFill(t){"
                + "var ta=document.querySelector('textarea');if(!ta)return false;"
                + "var setter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;"
                + "setter.call(ta,t);ta.dispatchEvent(new Event('input',{bubbles:true}));ta.focus();return true;}"
                + "var n=0;var timer=setInterval(function(){n++;"
                + "var t='';try{if(window.DSENative)t=DSENative.consumeShared()||'';}catch(e){}"
                + "if(t)dseFill(t);if(n>40)clearInterval(timer);},300);"
                + "window.__dseFillShared=dseFill;})();";
    }

    /** 只含早期脚本（onPageStarted 兜底用，必须是合法独立脚本） */
    private String earlyJs() { return "(function(){" + earlyInner() + "})();"; }

    /** 早期脚本 + 完整增强脚本，整体包在同一个 IIFE 里 */
    private String fullBootstrapJs() {
        return "(function(){"
                + earlyInner()
                + "if(window.__DSE_INJECTED__)return;window.__DSE_INJECTED__=true;"
                + "\n" + injectJs() + "\n"
                + "})();";
    }

    /**
     * 点击网页发送按钮。DeepSeek 移动端工具栏从左到右为：附件/语音（iconLabelPrimary 胶囊键）
     * 与最右侧蓝色实心圆发送键（ds-button--primary.ds-button--filled）。
     * 绝不能点 iconLabelPrimary（旧实现误点成了上传）。
     */
    private String clickSendJs() {
        return "(function(){window.__dseClickSend=function(){"
                + "var ta=document.querySelector('textarea');if(!ta)return;"
                + "var p=ta;for(var i=0;i<8&&p;i++){"
                + "var b=p.querySelector('div[role=button].ds-button--primary.ds-button--filled,button.ds-button--primary.ds-button--filled');"
                + "if(b){if(b.getAttribute('aria-disabled')!=='true'&&!b.classList.contains('ds-button--disabled'))b.click();return;}"
                + "p=p.parentElement;}};window.__dseClickSend();})();";
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

    /* WebView 子类：输入法同时保留“换行”并多出“发送”动作键 */
    private class DseWebView extends WebView {
        DseWebView(android.content.Context c) { super(c); }

        @Override
        public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
            InputConnection ic = super.onCreateInputConnection(outAttrs);
            if (ic == null) return null;
            outAttrs.inputType |= InputType.TYPE_TEXT_FLAG_MULTI_LINE;
            outAttrs.imeOptions &= ~EditorInfo.IME_FLAG_NO_ENTER_ACTION;
            outAttrs.imeOptions = (outAttrs.imeOptions & ~EditorInfo.IME_MASK_ACTION) | EditorInfo.IME_ACTION_SEND;
            outAttrs.actionLabel = "发送";
            final WebView host = this;
            return new InputConnectionWrapper(ic, false) {
                @Override
                public boolean performEditorAction(int actionCode) {
                    if (actionCode == EditorInfo.IME_ACTION_SEND) {
                        // IME binder 线程，必须回主线程
                        runOnUiThread(() -> host.evaluateJavascript(clickSendJs(), null));
                        return true;
                    }
                    return super.performEditorAction(actionCode);
                }
            };
        }
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

        // 经典全屏方案（不用 edge-to-edge decorFitsSystemWindows）：
        // 内容靠 LAYOUT_* 标志铺到状态栏/导航栏之下，同时 adjustResize 仍能在键盘弹起时
        // 由系统直接缩放窗口——WebView 固定底栏因此被键盘自然顶起，比手动补 IME padding 可靠。
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        applyImmersive();

        // root（明暗底色常驻）→ 开屏 logo（加载完淡出）→ WebView（同色底，不露白）
        root = new FrameLayout(this);
        root.setBackgroundColor(pageBgColor());

        splashLogo = new ImageView(this);
        splashLogo.setImageResource(R.drawable.splash_logo);
        FrameLayout.LayoutParams logoLp = new FrameLayout.LayoutParams(dp(108), dp(108));
        logoLp.gravity = Gravity.CENTER;
        root.addView(splashLogo, logoLp);

        web = new DseWebView(this);
        web.setBackgroundColor(pageBgColor());
        web.addJavascriptInterface(new ShareBridge(), "DSENative");
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

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

        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            try {
                WebViewCompat.addDocumentStartJavaScript(web, fullBootstrapJs(),
                        Collections.singleton("*"));
            } catch (Exception e) { /* 回退 */ }
        }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                    view.evaluateJavascript(earlyJs(), null);
                } else {
                    view.evaluateJavascript(fullBootstrapJs(), null);
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                clearSplash();
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

    private void clearSplash() {
        if (splashCleared) return;
        splashCleared = true;
        if (splashLogo != null) {
            splashLogo.postDelayed(() -> splashLogo.animate().alpha(0f).setDuration(260)
                    .withEndAction(() -> splashLogo.setVisibility(View.GONE)).start(), 120);
        }
    }

    /* 经典沉浸：透明系统栏 + 内容铺到其下；禁用 FLAG_FULLSCREEN（它会让 adjustResize 失效） */
    private void applyImmersive() {
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        w.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        w.setStatusBarColor(0x00000000);
        w.setNavigationBarColor(0x00000000);
        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
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
        if (hasFocus) applyImmersive();
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
