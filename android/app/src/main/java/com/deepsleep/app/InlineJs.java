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
                // APK 专属出厂默认：版本化迁移，只强制一次（老版本装过也会纠正），之后用户自改不覆盖。
                // ⚠️ 配置存储位置：WebView 模式下脚本经 bootstrap 的 Bridge 读写 localStorage['dse_bridge_store']
                //    里的键 'dse_config_v1'（不是顶层 key 'dse_config_v1'；写错位置没人读 = 空操作，v2 的历史 bug）。
                + "try{var DMK='dse_apk_def_v3';"
                + "if(!localStorage.getItem(DMK)){"
                + "var bs={};try{bs=JSON.parse(localStorage.getItem('dse_bridge_store')||'{}')||{};}catch(e){bs={};}"
                + "var dc=(bs&&bs['dse_config_v1']&&typeof bs['dse_config_v1']==='object')?bs['dse_config_v1']:{};"
                + "dc.fixTopbar=true;dc.topbarStyle='transparent';dc.fullscreenBtn=false;dc.timeInject=true;"
                + "bs['dse_config_v1']=dc;"
                + "localStorage.setItem('dse_bridge_store',JSON.stringify(bs));"
                + "localStorage.setItem(DMK,'1');}}catch(e){}"
                // APK 专属 CSS：①背景层钉住大视口，键盘弹起不缩放闪烁；②合成层/降重绘，滚动与长文本输入更流畅
                + "(function(){"
                + "var st=document.createElement('style');st.id='__dse_apk_css';"
                + "st.textContent='"
                + "#dse-bg-layer,#dse-bg-mask{inset:auto 0 auto 0!important;top:0!important;height:var(--dse-stable-h,100vh)!important;will-change:auto!important}"
                // 气泡独立合成层，滚动时不整屏重绘；去掉气泡上的属性过渡动画
                + ".fbb737a4,.ds-markdown.ds-assistant-message-main-content{transform:translateZ(0);backface-visibility:hidden}"
                + ".fbb737a4{transition:none!important}"
                // 虚拟列表禁止过度滚动连锁（避免误触刷新/露底）；整页也禁止回弹露底
                + ".ds-virtual-list{overscroll-behavior:contain}"
                + "html,body{overscroll-behavior:none}"
                // 输入框磨砂：默认聚焦也保留真磨砂；仅当检测到持续掉帧时才降级为近不透明底（见下方自适应脚本）
                + "body.dse-frost-lite.dse-input-frosted ._77cefa5{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background:rgba(246,248,252,.97)!important}"
                + "body.dark.dse-frost-lite.dse-input-frosted ._77cefa5{background:rgba(33,35,43,.97)!important}"
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
                // 输入框磨砂自适应：打字时采样帧间隔，持续掉帧（>32ms 累计 8 帧/1.2s）才降级，避免弱机卡顿
                + "(function(){if(window.__DSE_FROST_ADAPT__)return;window.__DSE_FROST_ADAPT__=true;"
                + "var armed=false,degraded=false,lastT=0,slow=0,startT=0,hits=0;"
                + "function fb(){if(degraded)return;degraded=true;try{document.body.classList.add('dse-frost-lite');}catch(e){}}"
                + "function tick(t){if(!armed)return;if(lastT&&(t-lastT)>32)slow++;lastT=t;"
                + "if(t-startT>1200){armed=false;lastT=0;if(slow>=8){hits++;if(hits>=2)fb();}else{hits=0;}slow=0;return;}requestAnimationFrame(tick);}"
                + "function arm(){if(degraded||armed)return;armed=true;slow=0;lastT=0;startT=performance.now();requestAnimationFrame(tick);}"
                + "document.addEventListener('input',function(e){var t=e.target;"
                + "if(t&&t.tagName==='TEXTAREA'&&!(t.closest&&t.closest('#dse-panel')))arm();},true);"
                + "})();"
                // APK 专属：给页面里的文件输入框补上 multiple，原生多选才能真正生效
                + "(function(){if(window.__DSE_FILEMULTI__)return;window.__DSE_FILEMULTI__=true;"
                + "function fix(){var f=document.querySelectorAll('input[type=file]');"
                + "for(var i=0;i<f.length;i++){if(!f[i].multiple)f[i].multiple=true;}}"
                + "fix();setInterval(fix,1200);"
                + "document.addEventListener('click',function(){setTimeout(fix,60);},true);})();"
                // APK 专属：把「当前所在对话」上报给原生（启动恢复用）。SPA 切换走 history，靠 1s 轮询 + 隐藏兜底
                + "(function(){if(window.__DSE_SESSION_SYNC__)return;window.__DSE_SESSION_SYNC__=true;var last=null;"
                + "function cur(){try{var m=location.pathname.match(/\\/a\\/chat\\/s\\/([\\w-]+)/);return m?m[1]:'';}catch(e){return '';}}"
                + "function up(){var v=cur();if(v===last)return;last=v;"
                + "try{if(window.DSENative&&DSENative.saveSession)DSENative.saveSession(v);}catch(e){}}"
                + "up();setInterval(up,1000);window.addEventListener('popstate',up);"
                + "document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')up();});"
                + "window.addEventListener('pagehide',up);})();"
                // APK 专属设置项：注入到设置面板「其他」页 → 启动时恢复上次对话（默认关闭）
                + "(function(){if(window.__DSE_APK_RESUME_UI__)return;window.__DSE_APK_RESUME_UI__=true;"
                + "function isEn(){try{return !!(window.DSE&&DSE.i18n&&DSE.i18n.lang&&DSE.i18n.lang()==='en');}catch(e){return false;}}"
                + "function on(){try{return !!(window.DSENative&&DSENative.resumeEnabled&&DSENative.resumeEnabled());}catch(e){return false;}}"
                + "function setv(v){try{if(window.DSENative&&DSENative.setResume)DSENative.setResume(!!v);}catch(e){}}"
                + "function build(){var page=document.querySelector('#dse-panel .dse-p-page[data-page=\"more\"]');if(!page)return;"
                + "var old=document.getElementById('dse-apk-resume');if(old&&old.parentNode===page)return;"
                + "if(old&&old.parentNode)old.parentNode.removeChild(old);"
                + "var E=isEn();var w=document.createElement('div');w.id='dse-apk-resume';"
                + "w.innerHTML='<div class=\"dse-p-sec\">'+(E?'Startup':'启动行为')+'</div>'"
                + "+'<div class=\"dse-row\"><span><div class=\"dse-row-label\">'"
                + "+(E?'Resume last chat':'启动时恢复上次对话')+'</div>'"
                + "+'<div class=\"dse-row-desc\">'"
                + "+(E?'Off: open a new chat every launch (APK only)':'关闭则每次打开都是新对话（仅 APK）')+'</div></span>'"
                + "+'<span class=\"dse-switch dse-apk-sw\" role=\"switch\"></span>';"
                + "var sw=w.querySelector('.dse-apk-sw');if(on())sw.classList.add('dse-on');"
                + "w.addEventListener('click',function(e){var t=e.target;"
                + "if(!(t&&t.closest&&t.closest('.dse-apk-sw')))return;"
                + "var v=!sw.classList.contains('dse-on');sw.classList.toggle('dse-on',v);setv(v);"
                + "try{if(window.DSE&&DSE.utils&&DSE.utils.toast)DSE.utils.toast("
                + "v?(E?'Resume last chat: on':'已开启：启动恢复上次对话'):(E?'Always a new chat':'已关闭：启动进入新对话'));}catch(e2){}});"
                + "var a=page.querySelector('.dse-seg[data-seg=\"lang\"]');"
                + "if(a&&a.previousElementSibling&&a.previousElementSibling.classList"
                + "&&a.previousElementSibling.classList.contains('dse-p-sec'))a=a.previousElementSibling;"
                + "if(a&&a.parentNode===page)page.insertBefore(w,a);else page.appendChild(w);}"
                + "setInterval(build,1000);})();"
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
