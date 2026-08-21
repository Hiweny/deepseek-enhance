// ==UserScript==
// @name         文心助手 全功能增强
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  手机适配 + 深色模式 + 全局背景 + 输入框修复(换行/发送分离) + 按钮过滤 + 模型默认 + 任务模式 + 防撤回(智能回填)
// @author       Enhance
// @match        https://wenxin.baidu.com/*
// @match        https://chat.baidu.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_deleteValue
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================
    //  PART 0: 存储 & 工具
    // ============================================================
    var PFX = 'wx2_';
    function getV(k, d) { return GM_getValue(PFX + k, d); }
    function setV(k, v) { GM_setValue(PFX + k, v); }
    function delV(k) { GM_deleteValue(PFX + k); }

    // 背景存储
    function getBg()   { return getV('bg', ''); }
    function setBg(v)  { setV('bg', v); }
    function delBg()   { delV('bg'); }
    function getBlur() { return getV('blur', 0); }
    function setBlur(v){ setV('blur', v); }
    function getOp()   { return getV('op', 20); }
    function setOp(v)  { setV('op', v); }

    // 主题
    function getThemeMode() { return getV('theme', 'auto'); }
    function setThemeMode(v){ setV('theme', v); }

    // 防撤回
    function getAntiRecall() { return getV('recall', true); }
    function setAntiRecall(v){ setV('recall', v); }

    // 智能回填队列 (内存)
    var backfillQueue = [];
    var pendingUserPrompt = '';
    var pendingSessionId = '';

    // 撤回缓存
    function recallKey(s, m) { return 'wx2_recall_' + (s||'') + '_' + (m||''); }
    function saveRecalled(s, m, c) { try { localStorage.setItem(recallKey(s,m), c); } catch(e){} }
    function getRecalled(s, m) { try { return localStorage.getItem(recallKey(s,m)); } catch(e){ return null; } }

    function toast(msg, type) {
        var t = document.getElementById('wx2-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'wx2-toast';
            t.style.cssText = 'position:fixed;top:12%;left:50%;transform:translateX(-50%) translateY(-120px);z-index:2147483647;padding:10px 22px;border-radius:22px;font-size:14px;pointer-events:none;transition:transform .4s cubic-bezier(.34,1.56,.64,1);white-space:nowrap;max-width:90vw;overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 20px rgba(0,0,0,.3);';
            document.documentElement.appendChild(t);
        }
        t.textContent = msg;
        var bg = 'rgba(0,0,0,.82)';
        if (type === 'warn') bg = 'rgba(180,80,0,.88)';
        else if (type === 'success') bg = 'rgba(40,140,60,.88)';
        t.style.background = bg;
        t.style.color = '#fff';
        t.style.transform = 'translateX(-50%) translateY(0)';
        clearTimeout(t._tid);
        t._tid = setTimeout(function(){ t.style.transform = 'translateX(-50%) translateY(-120px)'; }, 2600);
    }

    function debounce(fn, delay) {
        var timer;
        return function() {
            var ctx = this, args = arguments;
            clearTimeout(timer);
            timer = setTimeout(function(){ fn.apply(ctx, args); }, delay);
        };
    }

    function systemPrefersDark() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    function shouldUseDark() {
        var m = getThemeMode();
        if (m === 'dark') return true;
        if (m === 'light') return false;
        return systemPrefersDark();
    }

    // 从嵌套对象提取文本
    function extractText(obj) {
        if (!obj) return '';
        if (typeof obj === 'string') return obj;
        if (typeof obj === 'object') {
            var keys = ['text','content','question','prompt','message','data','generator','answer','response'];
            for (var i = 0; i < keys.length; i++) {
                if (obj[keys[i]]) {
                    if (typeof obj[keys[i]] === 'string') return obj[keys[i]];
                    if (typeof obj[keys[i]] === 'object') return extractText(obj[keys[i]]);
                }
            }
        }
        return '';
    }

    // 在对象中查找用户输入文本路径
    function findPromptField(obj, depth) {
        depth = depth || 0;
        if (depth > 6 || !obj || typeof obj !== 'object') return null;
        var keys = ['prompt','query','question','content','text','message','input','q'];
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (k in obj) {
                if (typeof obj[k] === 'string' && obj[k].length > 0) return k;
                if (Array.isArray(obj[k]) && obj[k].length > 0) {
                    for (var j = 0; j < obj[k].length; j++) {
                        var inner = findPromptField(obj[k][j], depth+1);
                        if (inner) return k + '/' + j + '/' + inner;
                    }
                }
            }
        }
        for (var key in obj) {
            if (obj.hasOwnProperty(key) && typeof obj[key] === 'object') {
                var found = findPromptField(obj[key], depth+1);
                if (found) return key + '/' + found;
            }
        }
        return null;
    }

    function setValueByPath(obj, path, value) {
        var parts = path.split('/');
        var current = obj;
        for (var i = 0; i < parts.length-1; i++) {
            var p = parts[i];
            if (/^\d+$/.test(p)) p = parseInt(p);
            if (!current[p]) return false;
            current = current[p];
        }
        var last = parts[parts.length-1];
        if (/^\d+$/.test(last)) last = parseInt(last);
        if (typeof current[last] === 'string') current[last] = value;
        else if (typeof current[last] === 'object') {
            var ip = findPromptField(current[last]);
            if (ip) setValueByPath(current[last], ip, value);
        }
        return true;
    }

    function getValueByPath(obj, path) {
        if (!path) return '';
        var parts = path.split('/');
        var current = obj;
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            if (/^\d+$/.test(p)) p = parseInt(p);
            if (!current) return '';
            current = current[p];
        }
        return typeof current === 'string' ? current : extractText(current);
    }

    // ============================================================
    //  PART 1: 防撤回 — Fetch 拦截
    // ============================================================
    (function() {
        if (!getAntiRecall()) return;

        var RECALL_KW = [
            '由于相关法律法规','内容已被过滤','内容已被删除','此内容已被撤回',
            '该消息已被撤回','消息已撤回','content_filter','content filter',
            'risk_control','已被系统撤回','此回复已被撤回','该回复不可用',
            '由于安全','内容不可用','已被移除','violation','内容违规',
            '因违反','无法显示','内容审核'
        ];

        function isRecallSignal(data) {
            if (!data) return false;
            if (data.type === 'error' || data.type === 'recall' || data.type === 'revoke') return true;
            if (data.error) {
                var msg = typeof data.error === 'string' ? data.error : (data.error.message || '');
                for (var i = 0; i < RECALL_KW.length; i++) if (msg.indexOf(RECALL_KW[i]) >= 0) return true;
            }
            var status = data.status || (data.options && data.options.status) || '';
            if (typeof status === 'string') {
                var ls = status.toLowerCase();
                if (ls.indexOf('filter')>=0 || ls.indexOf('block')>=0 || ls.indexOf('recall')>=0 ||
                    ls.indexOf('revoke')>=0 || ls.indexOf('risk')>=0 || ls.indexOf('delete')>=0) return true;
            }
            var content = extractText(data.content || data);
            if (content) {
                for (var j = 0; j < RECALL_KW.length; j++) if (content.indexOf(RECALL_KW[j]) >= 0) return true;
            }
            return false;
        }

        function buildBackfillPrompt(original) {
            if (backfillQueue.length === 0) return original;
            var parts = ['[当前时间: ' + new Date().toLocaleString('zh-CN') + ']'];
            parts.push('[以下为之前被系统撤回的完整对话轮次，请将其作为对话上下文的一部分]');
            for (var i = 0; i < backfillQueue.length; i++) {
                var r = backfillQueue[i];
                if (r.user) parts.push('用户: ' + r.user);
                if (r.assistant) parts.push('助手: ' + r.assistant);
            }
            parts.push('[撤回对话结束]');
            parts.push('用户: ' + original);
            return parts.join('\n\n');
        }

        function createSSEStream(originalBody) {
            var reader = originalBody.getReader();
            var decoder = new TextDecoder();
            var buffer = '';
            var fullContent = '';
            var messageId = '';
            var sessionId = pendingSessionId || '';
            var isRecalled = false;
            var ended = false;

            return new ReadableStream({
                start: function(controller) {
                    function pump() {
                        reader.read().then(function(result) {
                            if (result.done) {
                                if (buffer.trim()) processLine(buffer);
                                buffer = '';
                                ended = true;
                                onEnd();
                                controller.close();
                                return;
                            }
                            var chunk = decoder.decode(result.value, { stream: true });
                            buffer += chunk;
                            var lines = buffer.split(/\r?\n/);
                            buffer = lines.pop() || '';
                            for (var i = 0; i < lines.length; i++) processLine(lines[i]);
                            controller.enqueue(result.value);
                            pump();
                        }).catch(function(e) {
                            ended = true; onEnd(); controller.error(e);
                        });
                    }
                    function processLine(line) {
                        line = line.trim();
                        if (!line || line.indexOf('data:') !== 0) return;
                        var jsonStr = line.replace(/^data:\s*/, '');
                        if (!jsonStr || jsonStr === '[DONE]') return;
                        try {
                            var data = JSON.parse(jsonStr);
                            if (data.options) {
                                if (data.options.qid) messageId = data.options.qid;
                                if (data.options.message_id) messageId = data.options.message_id;
                                if (data.options.session_id) sessionId = data.options.session_id;
                            }
                            var text = '';
                            if (data.content) {
                                if (typeof data.content.generator === 'string') text = data.content.generator;
                                else if (data.content.generator && typeof data.content.generator === 'object') text = data.content.generator.text || data.content.generator.content || '';
                                else if (typeof data.content.text === 'string') text = data.content.text;
                                else if (typeof data.content === 'string') text = data.content;
                            }
                            if (text) fullContent += text;
                            if (isRecallSignal(data)) isRecalled = true;
                        } catch(e) {}
                    }
                    function onEnd() {
                        if (ended) return;
                        ended = true;
                        if (fullContent && messageId) saveRecalled(sessionId, messageId, fullContent);
                        if (getAntiRecall()) {
                            if (isRecalled) {
                                backfillQueue.push({ user: pendingUserPrompt, assistant: fullContent });
                                toast('⚠️ 已拦截撤回消息，将在下次对话回填', 'warn');
                            } else {
                                if (backfillQueue.length > 0) {
                                    backfillQueue = [];
                                    toast('✅ 对话正常，已清空回填队列', 'success');
                                }
                            }
                        }
                        pendingUserPrompt = '';
                    }
                    pump();
                }
            });
        }

        var origFetch = window.fetch;
        window.fetch = function(input, init) {
            var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
            var isChat = url.indexOf('/aichat/api/conversation') >= 0;
            var isHistory = url.indexOf('/aichat/api/messages') >= 0;

            if (!isChat && !isHistory) return origFetch.apply(this, arguments);

            if (isChat && init && init.body) {
                try {
                    var bodyObj = JSON.parse(init.body);
                    pendingSessionId = bodyObj.session_id || bodyObj.sessionId || bodyObj.conversation_id || '';
                    var pp = findPromptField(bodyObj);
                    if (pp) {
                        pendingUserPrompt = getValueByPath(bodyObj, pp);
                        if (backfillQueue.length > 0 && pendingUserPrompt) {
                            var bf = buildBackfillPrompt(pendingUserPrompt);
                            setValueByPath(bodyObj, pp, bf);
                            init = Object.assign({}, init, { body: JSON.stringify(bodyObj) });
                            toast('📤 已注入 ' + backfillQueue.length + ' 轮撤回上下文');
                        }
                    }
                } catch(e) {}
            }

            var promise = origFetch.call(this, input, init);

            if (isChat) {
                return promise.then(function(resp) {
                    if (!resp.body) return resp;
                    return new Response(createSSEStream(resp.body), {
                        status: resp.status, statusText: resp.statusText, headers: resp.headers
                    });
                });
            }
            if (isHistory) {
                return promise.then(function(resp) {
                    return resp.text().then(function(text) {
                        try {
                            var json = JSON.parse(text);
                            var modified = false;
                            function processMsgs(msgs, sid) {
                                if (!Array.isArray(msgs)) return;
                                for (var i = 0; i < msgs.length; i++) {
                                    var msg = msgs[i]; if (!msg) continue;
                                    var st = msg.status || (msg.options && msg.options.status) || '';
                                    var ct = extractText(msg.content || msg.fragments || msg);
                                    var recalled = false;
                                    if (typeof st === 'string') {
                                        var ls = st.toLowerCase();
                                        if (ls.indexOf('filter')>=0||ls.indexOf('block')>=0||ls.indexOf('recall')>=0||ls.indexOf('risk')>=0) recalled = true;
                                    }
                                    if (!recalled && ct) {
                                        for (var k = 0; k < RECALL_KW.length; k++) { if (ct.indexOf(RECALL_KW[k])>=0) { recalled = true; break; } }
                                    }
                                    if (recalled) {
                                        var mid = msg.message_id || msg.id || msg.qid || '';
                                        var cached = getRecalled(sid, mid);
                                        if (cached) {
                                            if (msg.content && typeof msg.content === 'object') {
                                                if (msg.content.generator !== undefined) msg.content.generator = cached;
                                                else if (msg.content.text !== undefined) msg.content.text = cached;
                                            } else if (msg.fragments && Array.isArray(msg.fragments)) {
                                                msg.fragments = [{ type: 'RESPONSE', content: cached }];
                                            } else if (typeof msg.content === 'string') {
                                                msg.content = cached;
                                            }
                                            if (msg.status) msg.status = 'FINISHED';
                                            modified = true;
                                        }
                                    }
                                }
                            }
                            if (json.data) {
                                if (json.data.messages) processMsgs(json.data.messages, json.data.session_id);
                                if (json.data.chat_messages) processMsgs(json.data.chat_messages, json.data.session_id);
                                if (json.data.biz_data && json.data.biz_data.chat_messages) processMsgs(json.data.biz_data.chat_messages, json.data.biz_data.chat_session_id);
                                if (json.data.list) processMsgs(json.data.list, json.data.session_id);
                            }
                            if (json.messages) processMsgs(json.messages, json.session_id);
                            if (json.list) processMsgs(json.list, json.session_id);
                            if (modified) return new Response(JSON.stringify(json), { status: resp.status, statusText: resp.statusText, headers: resp.headers });
                        } catch(e) {}
                        return new Response(text, { status: resp.status, statusText: resp.statusText, headers: resp.headers });
                    });
                });
            }
            return promise;
        };

        // XHR 兼容
        var origOpen = XMLHttpRequest.prototype.open;
        var origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(method, url) {
            this._wx2_url = url || '';
            return origOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function(body) {
            var url = this._wx2_url || '';
            if (url.indexOf('/aichat/api/conversation') >= 0 && body) {
                try {
                    var bo = JSON.parse(body);
                    pendingSessionId = bo.session_id || bo.sessionId || '';
                    var pp = findPromptField(bo);
                    if (pp) {
                        pendingUserPrompt = getValueByPath(bo, pp);
                        if (backfillQueue.length > 0 && pendingUserPrompt) {
                            setValueByPath(bo, pp, buildBackfillPrompt(pendingUserPrompt));
                            body = JSON.stringify(bo);
                            toast('📤 已注入 ' + backfillQueue.length + ' 轮撤回上下文');
                        }
                    }
                } catch(e) {}
            }
            return origSend.call(this, body);
        };
    })();

    // ============================================================
    //  PART 2: CSS 注入
    // ============================================================
    function injectCSS() {
        var dark = shouldUseDark();
        var bg = getBg();
        var blur = getBlur();
        var op = getOp();

        var css = '';

        // === 背景层 ===
        css += '#wx2-bg-layer{position:fixed;inset:0;z-index:-2;background-size:cover;background-position:center;background-repeat:no-repeat;pointer-events:none;}';
        css += '#wx2-bg-overlay{position:fixed;inset:0;z-index:-1;pointer-events:none;}';

        // === 移动端布局修复 (不破坏原有布局, 只修复溢出) ===
        // 使用 box-sizing 和 max-width 防止溢出, 不强制 width
        css += '#chat-input-home,.chat-input-home,.chat-input-box-newer,.chat-input-box-top{box-sizing:border-box!important;max-width:100vw!important;padding-left:8px!important;padding-right:8px!important;}';
        css += '#input-root,.input-root{box-sizing:border-box!important;max-width:100%!important;}';
        css += '.ci-root{box-sizing:border-box!important;max-width:100%!important;}';
        css += '.ci-main{box-sizing:border-box!important;max-width:100%!important;}';
        css += '.ci-wrapper,.ci-normal-wrapper{box-sizing:border-box!important;max-width:100%!important;}';
        css += '.ci-container{box-sizing:border-box!important;max-width:100%!important;}';
        css += '.ci-file-input-wrapper{box-sizing:border-box!important;max-width:100%!important;}';
        css += '#ci-area{box-sizing:border-box!important;max-width:100%!important;}';
        css += '#chat-textarea,.ci-textarea{box-sizing:border-box!important;max-width:100%!important;word-wrap:break-word!important;overflow-wrap:break-word!important;}';
        css += '.ci-tool{box-sizing:border-box!important;max-width:100%!important;flex-wrap:wrap!important;gap:4px!important;}';
        css += '#ci-left-tool,.ci-left-tool{box-sizing:border-box!important;}';
        css += '#ci-right-tool,.ci-right-tool{box-sizing:border-box!important;flex-shrink:0!important;}';
        css += '.ci-left-tools-wrapper{box-sizing:border-box!important;flex-wrap:wrap!important;gap:4px!important;}';

        // 防止整体页面横向滚动
        css += 'html,body{overflow-x:hidden!important;}';
        css += '#app{overflow-x:hidden!important;max-width:100vw!important;}';
        css += '#cs-container-scroll{max-width:100vw!important;overflow-x:hidden!important;box-sizing:border-box!important;}';

        // === 美化 (不破坏原有设计, 只增强) ===
        css += '.ci-wrapper-border{border-radius:20px!important;}';
        css += '.ci-submit-button{border-radius:50%!important;transition:transform .2s ease!important;}';
        css += '.ci-submit-button:active{transform:scale(.88)!important;}';
        css += '.ci-input-mode-button{border-radius:16px!important;transition:background-color .2s ease,transform .15s ease!important;}';
        css += '.ci-input-mode-button:active{transform:scale(.95)!important;}';
        css += '.ci-panel{border-radius:14px!important;transition:background-color .2s ease,transform .15s ease!important;}';
        css += '.ci-panel:active{transform:scale(.95)!important;}';

        // === 深色模式 ===
        if (dark) {
            document.documentElement.setAttribute('data-wx2-theme', 'dark');
            // 根元素
            css += 'html[data-wx2-theme="dark"]{color-scheme:dark;background-color:#0d0d12!important;}';
            css += 'html[data-wx2-theme="dark"] body{background-color:#0d0d12!important;color:#e8e8f0!important;}';
            css += 'html[data-wx2-theme="dark"] #app{background-color:#0d0d12!important;color:#e8e8f0!important;}';
            css += 'html[data-wx2-theme="dark"] #cs-container-scroll{background-color:#0d0d12!important;}';

            // 顶部导航
            css += 'html[data-wx2-theme="dark"] .chat-search-page-header{background-color:rgba(18,18,26,.88)!important;backdrop-filter:blur(14px)!important;color:#e8e8f0!important;border-bottom:1px solid rgba(255,255,255,.06)!important;}';
            css += 'html[data-wx2-theme="dark"] .chat-search-page-header *{color:inherit!important;}';

            // 滚动内容区
            css += 'html[data-wx2-theme="dark"] #conversation-flow-container,html[data-wx2-theme="dark"] #conversation-flow-content{background:transparent!important;color:#e8e8f0!important;}';

            // 底部
            css += 'html[data-wx2-theme="dark"] .cs-footer{background-color:rgba(18,18,26,.92)!important;backdrop-filter:blur(14px)!important;border-top:1px solid rgba(255,255,255,.06)!important;}';

            // 输入框容器
            css += 'html[data-wx2-theme="dark"] .chat-input-home,html[data-wx2-theme="dark"] .chat-input-background{background-color:transparent!important;}';
            css += 'html[data-wx2-theme="dark"] .ci-root{background-color:transparent!important;}';
            css += 'html[data-wx2-theme="dark"] .ci-wrapper-border{border-color:rgba(124,110,255,.3)!important;box-shadow:0 0 0 1px rgba(124,110,255,.15),0 2px 16px rgba(0,0,0,.2)!important;}';
            css += 'html[data-wx2-theme="dark"] .ci-container{background-color:rgba(24,24,34,.92)!important;}';
            css += 'html[data-wx2-theme="dark"] .ci-wrapper{background-color:transparent!important;}';
            css += 'html[data-wx2-theme="dark"] #ci-area{background-color:transparent!important;}';
            css += 'html[data-wx2-theme="dark"] #chat-textarea,html[data-wx2-theme="dark"] .ci-textarea{background-color:transparent!important;color:#e8e8f0!important;caret-color:#7c6eff!important;}';
            css += 'html[data-wx2-theme="dark"] #chat-textarea::placeholder{color:rgba(255,255,255,.28)!important;}';

            // 模式按钮
            css += 'html[data-wx2-theme="dark"] .ci-input-mode-button{background-color:rgba(38,38,52,.85)!important;color:#c0c0d8!important;}';
            css += 'html[data-wx2-theme="dark"] .ci-input-mode-button-text{color:#c0c0d8!important;}';
            css += 'html[data-wx2-theme="dark"] .ci-input-mode-arrow{color:#888!important;}';
            css += 'html[data-wx2-theme="dark"] .ci-panel{background-color:rgba(38,38,52,.85)!important;color:#c0c0d8!important;}';
            css += 'html[data-wx2-theme="dark"] .ci-tool{background-color:transparent!important;}';

            // 消息区域
            css += 'html[data-wx2-theme="dark"] .ai-entry{background-color:rgba(22,22,32,.88)!important;color:#e8e8f0!important;}';
            css += 'html[data-wx2-theme="dark"] .ai-entry-block{background-color:rgba(28,28,40,.8)!important;color:#d8d8e8!important;}';
            css += 'html[data-wx2-theme="dark"] .ai-entry *,html[data-wx2-theme="dark"] .ai-entry-block *{color:inherit;}';
            css += 'html[data-wx2-theme="dark"] .cs-rank-container{background-color:transparent!important;color:#e8e8f0!important;}';

            // 链接和代码
            css += 'html[data-wx2-theme="dark"] a{color:#6c8eff!important;}';
            css += 'html[data-wx2-theme="dark"] code,html[data-wx2-theme="dark"] pre{background-color:rgba(0,0,0,.35)!important;color:#e8e8f0!important;}';

            // 下拉/弹出菜单
            css += 'html[data-wx2-theme="dark"] [class*="dropdown"],html[data-wx2-theme="dark"] [class*="popup"],html[data-wx2-theme="dark"] [class*="popover"],html[data-wx2-theme="dark"] [class*="menu-list"]{background-color:rgba(28,28,40,.97)!important;color:#e8e8f0!important;backdrop-filter:blur(18px)!important;box-shadow:0 8px 32px rgba(0,0,0,.4)!important;}';
            css += 'html[data-wx2-theme="dark"] [class*="dropdown"] *,html[data-wx2-theme="dark"] [class*="popup"] *,html[data-wx2-theme="dark"] [class*="popover"] *{color:inherit!important;}';

            // 通用文字覆盖 (兜底)
            css += 'html[data-wx2-theme="dark"] .cos-chat,html[data-wx2-theme="dark"] .cos-pc,html[data-wx2-theme="dark"] .cos-h5{color:#e8e8f0!important;}';
            css += 'html[data-wx2-theme="dark"] .pc-fresh-wrapper,html[data-wx2-theme="dark"] .pc-fresh-title-con{background-color:#0d0d12!important;color:#e8e8f0!important;}';

            // 滚动条
            css += 'html[data-wx2-theme="dark"] ::-webkit-scrollbar{width:5px;height:5px;}';
            css += 'html[data-wx2-theme="dark"] ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:3px;}';
            css += 'html[data-wx2-theme="dark"] ::-webkit-scrollbar-track{background:transparent;}';

            // 背景遮罩
            var overlayColor = dark ? 'rgba(13,13,18,' + (op/100) + ')' : 'rgba(255,255,255,' + (op/100) + ')';
            if (bg) {
                css += '#wx2-bg-layer{background-image:url("' + bg + '")!important;filter:blur(' + blur + 'px)!important;}';
                css += '#wx2-bg-overlay{background:' + overlayColor + '!important;}';
            }
        } else {
            document.documentElement.setAttribute('data-wx2-theme', 'light');
            if (bg) {
                css += '#wx2-bg-layer{background-image:url("' + bg + '")!important;filter:blur(' + blur + 'px)!important;}';
                css += '#wx2-bg-overlay{background:rgba(255,255,255,' + (op/100) + ')!important;}';
            }
        }

        // === 设置面板 ===
        css += '#wx2-settings-panel{position:fixed;top:0;right:0;width:86vw;max-width:360px;height:100vh;height:100dvh;background:rgba(16,16,24,.98);backdrop-filter:blur(20px);z-index:2147483646;transform:translateX(100%);transition:transform .35s cubic-bezier(.34,1.2,.64,1);overflow-y:auto;box-shadow:-4px 0 30px rgba(0,0,0,.5);color:#e8e8f0;}';
        css += '#wx2-settings-panel.open{transform:translateX(0);}';
        css += '#wx2-settings-panel h3{font-size:15px;font-weight:700;margin:18px 20px 10px;color:#e8e8f0;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.08);}';
        css += '#wx2-settings-panel .wx2-item{display:flex;justify-content:space-between;align-items:center;padding:11px 20px;gap:10px;}';
        css += '#wx2-settings-panel .wx2-label{font-size:14px;color:#d0d0e0;flex:1;}';
        css += '#wx2-settings-panel .wx2-desc{font-size:12px;color:#777;margin-top:3px;}';
        css += '#wx2-settings-panel input[type="text"],#wx2-settings-panel input[type="url"]{background:rgba(38,38,52,.8);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px 12px;color:#e8e8f0;font-size:14px;width:100%;box-sizing:border-box;}';
        css += '#wx2-settings-panel input[type="range"]{width:110px;accent-color:#7c6eff;}';
        css += '#wx2-settings-panel select{background:rgba(38,38,52,.8);color:#e8e8f0;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:6px 10px;font-size:13px;}';
        css += '#wx2-settings-panel button{background:#7c6eff;color:#fff;border:none;border-radius:10px;padding:8px 16px;font-size:13px;cursor:pointer;transition:opacity .2s;}';
        css += '#wx2-settings-panel button:hover{opacity:.85;}';
        css += '#wx2-settings-panel .wx2-toggle{width:44px;height:24px;background:rgba(255,255,255,.15);border-radius:12px;position:relative;cursor:pointer;transition:background .2s;flex-shrink:0;}';
        css += '#wx2-settings-panel .wx2-toggle.on{background:#7c6eff;}';
        css += '#wx2-settings-panel .wx2-toggle::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:transform .2s;}';
        css += '#wx2-settings-panel .wx2-toggle.on::after{transform:translateX(20px);}';
        css += '#wx2-settings-panel .wx2-close{position:absolute;top:14px;right:14px;font-size:22px;color:#888;cursor:pointer;background:none;border:none;padding:4px;}';
        css += '#wx2-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483645;opacity:0;pointer-events:none;transition:opacity .3s;}';
        css += '#wx2-overlay.open{opacity:1;pointer-events:auto;}';

        // 设置/换行按钮 (添加到工具栏)
        css += '#wx2-settings-btn,#wx2-newline-btn{display:inline-flex;align-items:center;justify-content:center;width:auto;height:32px;min-width:32px;padding:0 8px;border-radius:16px;cursor:pointer;transition:background-color .2s,transform .15s;flex-shrink:0;font-size:13px;gap:4px;}';
        css += '#wx2-settings-btn:active,#wx2-newline-btn:active{transform:scale(.92);}';
        // 深色模式下的按钮样式
        css += 'html[data-wx2-theme="dark"] #wx2-settings-btn,html[data-wx2-theme="dark"] #wx2-newline-btn{background:rgba(38,38,52,.85);color:#c0c0d8;border:1px solid rgba(255,255,255,.05);}';
        css += 'html:not([data-wx2-theme="dark"]) #wx2-settings-btn,html:not([data-wx2-theme="dark"]) #wx2-newline-btn{background:rgba(240,240,248,.9);color:#555;border:1px solid rgba(0,0,0,.06);}';

        // 移除原有样式标签再注入
        var old = document.getElementById('wx2-style');
        if (old) old.remove();
        var style = document.createElement('style');
        style.id = 'wx2-style';
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    // ============================================================
    //  PART 3: 背景层
    // ============================================================
    function applyBackground() {
        var bg = getBg();
        var layer = document.getElementById('wx2-bg-layer');
        var overlay = document.getElementById('wx2-bg-overlay');
        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'wx2-bg-layer';
            (document.body || document.documentElement).insertBefore(layer, (document.body || document.documentElement).firstChild);
        }
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'wx2-bg-overlay';
            (document.body || document.documentElement).insertBefore(overlay, (document.body || document.documentElement).firstChild);
        }
        if (bg) {
            layer.style.backgroundImage = 'url("' + bg + '")';
        } else {
            layer.style.backgroundImage = 'none';
            overlay.style.background = 'transparent';
        }
        injectCSS(); // 重新注入CSS以更新遮罩
    }

    // ============================================================
    //  PART 4: 输入框修复
    // ============================================================
    function fixInputBox() {
        var ta = document.querySelector('#chat-textarea');
        if (!ta || ta._wx2_fixed) return;
        ta._wx2_fixed = true;

        // enterkeyhint="send" → 键盘显示"发送"
        ta.setAttribute('enterkeyhint', 'send');

        // capture 阶段拦截 Enter
        ta.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.stopImmediatePropagation();
                e.preventDefault();
                var btn = document.querySelector('.ci-submit-button');
                if (btn) btn.click();
            }
        }, true);

        // 允许 beforeinput 的换行
        ta.addEventListener('beforeinput', function(e) {
            if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') {
                e.stopPropagation();
            }
        }, true);

        // 监听属性变化, 防止站点重置
        var obs = new MutationObserver(function() {
            if (ta.getAttribute('enterkeyhint') !== 'send') {
                ta.setAttribute('enterkeyhint', 'send');
            }
        });
        obs.observe(ta, { attributes: true, attributeFilter: ['enterkeyhint'] });
    }

    // 换行按钮
    function addNewlineButton() {
        var toolbar = document.querySelector('#ci-left-tool, .ci-left-tool, .ci-left-tools-wrapper');
        if (!toolbar) return;
        if (document.getElementById('wx2-newline-btn')) return;
        var btn = document.createElement('div');
        btn.id = 'wx2-newline-btn';
        btn.innerHTML = '↵';
        btn.title = '换行';
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var ta = document.querySelector('#chat-textarea');
            if (!ta) return;
            var s = ta.selectionStart, end = ta.selectionEnd;
            ta.value = ta.value.substring(0, s) + '\n' + ta.value.substring(end);
            ta.selectionStart = ta.selectionEnd = s + 1;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.focus();
        });
        toolbar.appendChild(btn);
    }

    // ============================================================
    //  PART 5: 按钮过滤
    // ============================================================
    var HIDE_BTN_IDS = [
        'inputPanel_deep_research',    // 深度思考 (与模型选择冲突)
        'inputPanel_aippt',            // AI PPT
        'inputPanel_zhinengchuangzuo', // AI写作
        'inputPanel_aicode',           // AI编程
        'inputPanel_aitranslate',      // AI翻译
        'inputPanel_minglichuangzuo',  // 测运势
        'inputPanel_music',            // AI音乐
        'inputPanel_aiyuedu'           // AI阅读
    ];
    var HIDE_TEXT = [/ppt/i, /写作/i, /编程/i, /翻译/i, /深度思考/i, /深入研究/i, /测运势/i, /音乐/i, /阅读/i];

    function filterButtons() {
        // 隐藏 ci-panel 按钮
        document.querySelectorAll('.ci-panel').forEach(function(p) {
            var id = p.getAttribute('data-btn-id') || '';
            var text = p.textContent || '';
            var hide = false;
            for (var i = 0; i < HIDE_BTN_IDS.length; i++) {
                if (id.indexOf(HIDE_BTN_IDS[i]) >= 0) { hide = true; break; }
            }
            if (!hide) {
                for (var j = 0; j < HIDE_TEXT.length; j++) {
                    if (HIDE_TEXT[j].test(text)) { hide = true; break; }
                }
            }
            p.style.display = hide ? 'none' : '';
        });
        // 隐藏APP下载提示
        document.querySelectorAll('[class*="download-app"],[class*="need-app"],[class*="app-only"],[class*="app-required"]').forEach(function(el) {
            el.style.display = 'none';
        });
    }

    // ============================================================
    //  PART 6: 模型默认 & 任务模式
    // ============================================================
    function setDefaultModel() {
        var sel = document.querySelector('[data-testid="chat-mode-selector"], .ci-input-mode-button');
        if (!sel || sel._wx2_model_set) return;
        var current = sel.textContent || '';
        // 已经是 DeepSeek 相关
        if (/deepseek|ds.*v4|v4.*pro/i.test(current)) { sel._wx2_model_set = true; return; }

        sel.click();
        var attempts = 0;
        function findOption() {
            attempts++;
            if (attempts > 15) return;
            var opts = document.querySelectorAll('[class*="dropdown"] [class*="item"],[class*="menu"] [class*="item"],[role="option"],[class*="mode-option"],[class*="model-item"],[class*="dropdown"] div,[class*="popup"] div,[class*="menu-item"]');
            var v4El = null;
            for (var i = 0; i < opts.length; i++) {
                var t = opts[i].textContent || '';
                if (/deepseek.*v4.*pro|ds.*v4.*pro/i.test(t)) {
                    opts[i].click();
                    sel._wx2_model_set = true;
                    toast('✅ 已切换: DeepSeek V4 Pro', 'success');
                    return;
                }
                if (/deepseek.*v4|ds.*v4/i.test(t) && !v4El) v4El = opts[i];
            }
            if (v4El && attempts >= 8) {
                v4El.click();
                setTimeout(function() {
                    var toggles = document.querySelectorAll('[class*="toggle"],[class*="switch"],[class*="think"],[class*="deep"]');
                    for (var j = 0; j < toggles.length; j++) {
                        if (/深度思考|思考模式|deep.*think|thinking/i.test(toggles[j].textContent || '')) {
                            toggles[j].click(); break;
                        }
                    }
                    sel._wx2_model_set = true;
                    toast('✅ 已切换: DeepSeek V4 Pro + 思考', 'success');
                }, 400);
                return;
            }
            setTimeout(findOption, 300);
        }
        setTimeout(findOption, 300);
    }

    function enableTaskMode() {
        var btns = document.querySelectorAll('.ci-panel,.ci-input-mode-button,[data-btn-id],[class*="task"]');
        for (var i = 0; i < btns.length; i++) {
            var b = btns[i];
            if (/任务|task/i.test(b.textContent || '') || /task/i.test(b.getAttribute('data-btn-id') || '')) {
                if (!b._wx2_task) {
                    var active = /active|selected|on/i.test(b.className) || b.getAttribute('aria-selected') === 'true';
                    if (!active) b.click();
                    b._wx2_task = true;
                    toast('✅ 任务模式已开启', 'success');
                }
                return;
            }
        }
    }

    // ============================================================
    //  PART 7: 设置面板
    // ============================================================
    function createSettings() {
        if (document.getElementById('wx2-settings-panel')) return;

        var ov = document.createElement('div');
        ov.id = 'wx2-overlay';
        ov.addEventListener('click', closeSettings);
        document.body.appendChild(ov);

        var p = document.createElement('div');
        p.id = 'wx2-settings-panel';
        p.innerHTML =
            '<button class="wx2-close" id="wx2-close">✕</button>' +
            '<h3>外观</h3>' +
            '<div class="wx2-item"><div><div class="wx2-label">深色模式</div><div class="wx2-desc">跟随系统或手动切换</div></div>' +
            '<select id="wx2-theme"><option value="auto">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></div>' +
            '<h3>背景</h3>' +
            '<div class="wx2-item" style="flex-direction:column;align-items:stretch;"><div class="wx2-label">图片 URL</div>' +
            '<input type="url" id="wx2-bg-url" placeholder="https://..." style="margin-top:6px;">' +
            '<button id="wx2-bg-set" style="margin-top:8px;align-self:flex-start;">设置</button></div>' +
            '<div class="wx2-item" style="flex-direction:column;align-items:stretch;"><div class="wx2-label">上传图片</div>' +
            '<input type="file" id="wx2-bg-file" accept="image/*" style="margin-top:6px;font-size:12px;color:#888;"></div>' +
            '<div class="wx2-item"><div><div class="wx2-label">模糊度</div><div class="wx2-desc" id="wx2-blur-val">' + getBlur() + 'px</div></div>' +
            '<input type="range" id="wx2-blur" min="0" max="30" value="' + getBlur() + '"></div>' +
            '<div class="wx2-item"><div><div class="wx2-label">遮罩透明度</div><div class="wx2-desc" id="wx2-op-val">' + getOp() + '%</div></div>' +
            '<input type="range" id="wx2-op" min="0" max="95" value="' + getOp() + '"></div>' +
            '<div class="wx2-item"><button id="wx2-bg-clear" style="background:rgba(200,60,60,.85);">清除背景</button></div>' +
            '<h3>功能</h3>' +
            '<div class="wx2-item"><div><div class="wx2-label">防撤回 (智能回填)</div><div class="wx2-desc">拦截撤回消息并智能回填</div></div>' +
            '<div class="wx2-toggle ' + (getAntiRecall() ? 'on' : '') + '" id="wx2-recall"></div></div>' +
            '<div class="wx2-item" style="flex-direction:column;align-items:stretch;"><div class="wx2-label">回填状态</div>' +
            '<div id="wx2-bf-status" style="font-size:12px;color:#888;margin-top:6px;">...</div></div>' +
            '<h3>关于</h3>' +
            '<div class="wx2-item" style="flex-direction:column;align-items:stretch;"><div class="wx2-label">文心助手增强 v2.0</div>' +
            '<div class="wx2-desc" style="margin-top:4px;">手机适配 / 深色模式 / 背景 / 输入修复 / 按钮过滤 / 防撤回</div></div>';
        document.body.appendChild(p);

        document.getElementById('wx2-close').addEventListener('click', closeSettings);
        var ts = document.getElementById('wx2-theme');
        ts.value = getThemeMode();
        ts.addEventListener('change', function() { setThemeMode(this.value); injectCSS(); });

        var bu = document.getElementById('wx2-bg-url');
        bu.value = getBg().indexOf('data:') === 0 ? '' : getBg();
        document.getElementById('wx2-bg-set').addEventListener('click', function() {
            var v = bu.value.trim();
            if (v) { setBg(v); applyBackground(); toast('✅ 背景已设置', 'success'); }
        });
        document.getElementById('wx2-bg-file').addEventListener('change', function(e) {
            var f = e.target.files[0]; if (!f) return;
            var r = new FileReader();
            r.onload = function(ev) { setBg(ev.target.result); applyBackground(); toast('✅ 已上传', 'success'); };
            r.readAsDataURL(f);
        });
        var bl = document.getElementById('wx2-blur');
        bl.addEventListener('input', function() { setBlur(parseInt(this.value)); applyBackground(); document.getElementById('wx2-blur-val').textContent = this.value + 'px'; });
        var op = document.getElementById('wx2-op');
        op.addEventListener('input', function() { setOp(parseInt(this.value)); applyBackground(); document.getElementById('wx2-op-val').textContent = this.value + '%'; });
        document.getElementById('wx2-bg-clear').addEventListener('click', function() { delBg(); applyBackground(); bu.value = ''; toast('已清除'); });

        var rt = document.getElementById('wx2-recall');
        rt.addEventListener('click', function() {
            var v = !getAntiRecall(); setAntiRecall(v);
            this.classList.toggle('on', v);
            toast(v ? '✅ 防撤回已开启' : '防撤回已关闭');
        });
        updateBfStatus();
    }

    function updateBfStatus() {
        var el = document.getElementById('wx2-bf-status');
        if (!el) return;
        if (backfillQueue.length > 0) {
            el.innerHTML = '⚠️ 有 <b style="color:#ff9500">' + backfillQueue.length + '</b> 轮撤回待回填';
        } else {
            el.innerHTML = '✅ 无待回填消息';
        }
    }

    function openSettings() { createSettings(); updateBfStatus(); document.getElementById('wx2-settings-panel').classList.add('open'); document.getElementById('wx2-overlay').classList.add('open'); }
    function closeSettings() { var p = document.getElementById('wx2-settings-panel'); var o = document.getElementById('wx2-overlay'); if(p) p.classList.remove('open'); if(o) o.classList.remove('open'); }

    function addSettingsBtn() {
        var tb = document.querySelector('#ci-left-tool, .ci-left-tool, .ci-left-tools-wrapper, #ci-right-tool, .ci-right-tool, .right-tools-wrapper');
        if (!tb || document.getElementById('wx2-settings-btn')) return;
        var btn = document.createElement('div');
        btn.id = 'wx2-settings-btn';
        btn.innerHTML = '⚙';
        btn.title = '增强设置';
        btn.addEventListener('click', function(e) { e.stopPropagation(); openSettings(); });
        tb.appendChild(btn);
    }

    // ============================================================
    //  PART 8: 初始化
    // ============================================================
    var done = {};
    function tryInit() {
        if (!done.css) { injectCSS(); applyBackground(); done.css = true; }
        var ta = document.querySelector('#chat-textarea');
        if (ta && !done.input) { fixInputBox(); done.input = true; }
        var tb = document.querySelector('#ci-left-tool, .ci-left-tool, .ci-left-tools-wrapper, #ci-right-tool, .ci-right-tool');
        if (tb && !done.btns) { addSettingsBtn(); addNewlineButton(); done.btns = true; }
        if (!done.filter) { filterButtons(); done.filter = true; }
        var sel = document.querySelector('[data-testid="chat-mode-selector"], .ci-input-mode-button');
        if (sel && !done.model) { setDefaultModel(); done.model = true; }
        if (!done.task) { enableTaskMode(); done.task = true; }
    }

    var mo = new MutationObserver(debounce(function() { tryInit(); filterButtons(); }, 200));

    function start() {
        tryInit();
        if (document.body) mo.observe(document.body, { childList: true, subtree: true });
        else {
            var c = setInterval(function() {
                if (document.body) { clearInterval(c); tryInit(); mo.observe(document.body, { childList: true, subtree: true }); }
            }, 50);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();

    if (window.matchMedia) {
        var mq = window.matchMedia('(prefers-color-scheme: dark)');
        var fn = function() { if (getThemeMode() === 'auto') injectCSS(); };
        if (mq.addEventListener) mq.addEventListener('change', fn);
        else if (mq.addListener) mq.addListener(fn);
    }

    window.addEventListener('resize', debounce(function() { injectCSS(); filterButtons(); }, 300));
})();
