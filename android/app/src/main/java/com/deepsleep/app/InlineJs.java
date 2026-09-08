package com.deepsleep.app;

/**
 * 纯 JVM、无 Android 依赖的内联脚本构造器。
 * 抽成独立类是为了让构建校验（Gen）能用真实 javac 编译并拼出最终注入串做 node --check，
 * 而不是用正则猜字符串，避免拼接语法错误静默上线（v8.3.0 的教训）。
 */
final class InlineJs {

    private InlineJs() {}

    /** document-start 早期脚本：视口/首帧底色/出厂默认/主题跟随/回车发送/分享填槽 */
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
                // 键盘弹起 WebView 收缩时，把背景层钉在“键盘收起时的大视口高度”，
                // 避免 background-size:cover 随视口逐帧重算造成的背景缩放闪烁；同时去掉常驻 will-change 省 GPU
                + "(function(){"
                + "var st=document.createElement('style');st.id='__dse_apk_css';"
                + "st.textContent='#dse-bg-layer,#dse-bg-mask{inset:auto 0 auto 0!important;top:0!important;height:var(--dse-stable-h,100vh)!important;will-change:auto!important}';"
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
                // 物理键盘 Enter 发送
                + "document.addEventListener('keydown',function(e){"
                + "if(e.key!=='Enter'||e.shiftKey||e.isComposing||e.ctrlKey||e.metaKey||e.altKey)return;"
                + "var t=e.target;if(!t||t.tagName!=='TEXTAREA')return;e.preventDefault();window.__dseClickSend&&window.__dseClickSend();"
                + "},true);"
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

    /** 发送键 = 最右侧蓝色实心圆（.ds-button--primary.ds-button--filled），左侧 iconLabelPrimary 是附件键 */
    static String clickSend() {
        return "(function(){window.__dseClickSend=function(){"
                + "var ta=document.querySelector('textarea');if(!ta)return;"
                + "var p=ta;for(var i=0;i<8&&p;i++){"
                + "var b=p.querySelector('div[role=button].ds-button--primary.ds-button--filled,button.ds-button--primary.ds-button--filled');"
                + "if(b){if(b.getAttribute('aria-disabled')!=='true'&&!b.classList.contains('ds-button--disabled'))b.click();return;}"
                + "p=p.parentElement;}};window.__dseClickSend();})();";
    }
}
