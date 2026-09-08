package com.deepsleep.app;

/**
 * 纯 JVM、无 Android 依赖的内联脚本构造器。
 * 抽成独立类是为了让构建校验（Gen）能用真实 javac 编译并拼出最终注入串做 node --check，
 * 而不是用正则猜字符串，避免拼接语法错误静默上线（v8.3.0 的教训）。
 */
final class InlineJs {

    private InlineJs() {}

    /** document-start 早期脚本：视口/首帧底色/出厂默认/主题跟随/性能 CSS/分享填槽 */
    static String earlyInner(boolean dark, String bg) {
        return "window.__DSE_WEBVIEW__=true;"
                + "try{var m=document.querySelector('meta[name=viewport]');"
                + "if(!m){m=document.createElement('meta');m.name='viewport';(document.head||document.documentElement).appendChild(m);}"
                + "m.content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover';}catch(e){}"
                // 首帧底色，压住官网默认白底；必须等官网主题类真正落定（body 含 light/dark 且去掉 change-theme）
                // 才能交还，否则 load 早于主题应用会白闪。MutationObserver + 6s 兜底双保险。
                + "try{var ss=document.getElementById('__dse_firstpaint')||document.createElement('style');"
                + "ss.id='__dse_firstpaint';ss.textContent='html,body{background:" + bg + "!important}';"
                + "(document.head||document.documentElement).appendChild(ss);"
                + "function dseRmFP(){var b=document.body;if(b&&(b.classList.contains('dark')||b.classList.contains('light'))&&!b.classList.contains('change-theme')){var e=document.getElementById('__dse_firstpaint');if(e)e.remove();return true;}return false;}"
                + "if(!dseRmFP()){var dseFpObs=new MutationObserver(function(){if(dseRmFP())dseFpObs.disconnect();});"
                + "dseFpObs.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});"
                + "setTimeout(function(){try{dseFpObs.disconnect();}catch(e){}var e=document.getElementById('__dse_firstpaint');if(e)e.remove();},6000);}"
                + "}catch(e){}"
                // APK 专属出厂默认：版本化迁移，只强制一次（老版本装过也会纠正），之后用户自改不覆盖
                + "try{var DMK='dse_apk_def_v2';"
                + "if(!localStorage.getItem(DMK)){"
                + "var dc=JSON.parse(localStorage.getItem('dse_config_v1')||'{}');"
                + "dc.fixTopbar=true;dc.topbarStyle='transparent';dc.fullscreenBtn=false;dc.timeInject=true;"
                + "localStorage.setItem('dse_config_v1',JSON.stringify(dc));"
                + "localStorage.setItem(DMK,'1');}}catch(e){}"
                // APK 专属 CSS：①背景层钉住大视口，键盘弹起不缩放闪烁；②合成层/降重绘，滚动与长文本输入更流畅
                + "(function(){"
                + "var st=document.createElement('style');st.id='__dse_apk_css';"
                + "st.textContent='"
                + "#dse-bg-layer,#dse-bg-mask{inset:auto 0 auto 0!important;top:0!important;height:var(--dse-stable-h,100vh)!important;will-change:auto!important}"
                // 气泡独立合成层，滚动时不整屏重绘；去掉气泡上的属性过渡动画
                + ".fbb737a4,.ds-markdown.ds-assistant-message-main-content{transform:translateZ(0);backface-visibility:hidden}"
                + ".fbb737a4{transition:none!important}"
                // 虚拟列表禁止过度滚动连锁（避免误触刷新/露底）
                + ".ds-virtual-list{overscroll-behavior:contain}"
                // 输入聚焦（含长文本粘贴）期间暂停输入框磨砂实时采样，改近不透明底色兜底，失焦恢复，避免逐帧重采样卡死
                + "body.dse-input-frosted ._77cefa5:focus-within{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background:rgba(246,248,252,.97)!important}"
                + "body.dark.dse-input-frosted ._77cefa5:focus-within{background:rgba(33,35,43,.97)!important}"
                + "';"
                + "var stableH=0;"
                + "function dseSyncH(force){var h=window.visualViewport?window.visualViewport.height:window.innerHeight;"
                // 常规：只在视口变大（键盘收起）时更新基准，键盘弹起变小则保持，背景不动；
                // force 仅来自初始沉降与 orientationchange（旋屏），避免把大键盘误判成旋屏
                + "if(force||!stableH||h>=stableH-2)stableH=h;"
                + "var de=document.documentElement;if(de)de.style.setProperty('--dse-stable-h',stableH+'px');}"
                + "if(window.visualViewport)window.visualViewport.addEventListener('resize',function(){dseSyncH(false)});"
                + "window.addEventListener('resize',function(){dseSyncH(false)});"
                + "window.addEventListener('orientationchange',function(){setTimeout(function(){dseSyncH(true)},350)});"
                // document-start 极早期 head/documentElement 可能尚未建立，轮询挂载；400ms 后视口沉降再校准一次
                + "(function mount(){var p=document.head||document.documentElement;if(!p){setTimeout(mount,4);return;}p.appendChild(st);dseSyncH(false);setTimeout(function(){dseSyncH(true)},400);})();"
                + "})();"
                // 主题跟随系统
                + "try{var KEY='__appKit_@deepseek/chat_themePreference';"
                + "function dseApplyTheme(){localStorage.setItem(KEY,JSON.stringify({value:'" + (dark ? "dark" : "light") + "',__version:'0'}));}"
                + "dseApplyTheme();"
                + "window.addEventListener('storage',function(e){if(e.key===KEY)setTimeout(dseApplyTheme,0)});"
                + "}catch(e){}"
                // 回车只换行（不拦截 Enter、不注入 IME 发送动作），发送由网页自身按钮完成
                // 分享文本填槽
                + "(function(){function dseFill(t){"
                + "var ta=document.querySelector('textarea');if(!ta)return false;"
                + "var setter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;"
                + "setter.call(ta,t);ta.dispatchEvent(new Event('input',{bubbles:true}));ta.focus();return true;}"
                + "var n=0;var timer=setInterval(function(){n++;"
                + "var t='';try{if(window.DSENative)t=DSENative.consumeShared()||'';}catch(e){}"
                + "if(t)dseFill(t);if(n>40)clearInterval(timer);},300);"
                + "window.__dseFillShared=dseFill;})();";
    }

    static String early(boolean dark, String bg) {
        return "(function(){" + earlyInner(dark, bg) + "})();";
    }

    /** 完整引导：早期脚本 + 增强脚本本体，__DSE_INJECTED__ 保证多次调用幂等 */
    static String fullBootstrap(boolean dark, String bg, String injectJs) {
        return "(function(){"
                + earlyInner(dark, bg)
                + "if(window.__DSE_INJECTED__)return;window.__DSE_INJECTED__=true;"
                + "\n" + injectJs + "\n"
                + "})();";
    }
}
