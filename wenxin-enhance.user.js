// ==UserScript==
// @name         文心助手 全功能增强
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  手机适配 + 输入框修复(换行/发送分离) + 按钮过滤 + 模型默认 + 任务模式 + 防撤回 + 背景设置
// @author       Enhance
// @match        https://wenxin.baidu.com/*
// @match        https://chat.baidu.com/*
// @match        *://wenxin.baidu.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_deleteValue
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================
    //  PART 0: 存储 & 工具
    // ============================================================
    var PFX = 'wx3_';
    function getV(k, d) { try { return GM_getValue(PFX + k, d); } catch(e) { return d; } }
    function setV(k, v) { try { GM_setValue(PFX + k, v); } catch(e) {} }
    function delV(k) { try { GM_deleteValue(PFX + k); } catch(e) {} }

    function getBg()   { return getV('bg', ''); }
    function setBg(v)  { setV('bg', v); }
    function delBg()   { delV('bg'); }
    function getBlur() { return getV('blur', 0); }
    function setBlur(v){ setV('blur', v); }
    function getOp()   { return getV('op', 20); }
    function setOp(v)  { setV('op', v); }
    function getAntiRecall() { return getV('recall', true); }
    function setAntiRecall(v){ setV('recall', v); }

    // 智能回填队列
    var backfillQueue = [];
    var pendingUserPrompt = '';
    var pendingSessionId = '';

    function recallKey(s, m) { return 'wx3_recall_' + (s||'') + '_' + (m||''); }
    function saveRecalled(s, m, c) { try { localStorage.setItem(recallKey(s,m), c); } catch(e){} }
    function getRecalled(s, m) { try { return localStorage.getItem(recallKey(s,m)); } catch(e){ return null; } }

    function toast(msg, type) {
        var t = document.getElementById('wx3-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'wx3-toast';
            t.style.cssText = 'position:fixed;top:12%;left:50%;transform:translateX(-50%) translateY(-150px);z-index:2147483647;padding:10px 22px;border-radius:22px;font-size:14px;pointer-events:none;transition:transform .4s cubic-bezier(.34,1.56,.64,1);white-space:nowrap;max-width:90vw;overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 20px rgba(0,0,0,.4);color:#fff;';
            (document.body || document.documentElement).appendChild(t);
        }
        var bg = 'rgba(0,0,0,.85)';
        if (type === 'warn') bg = 'rgba(180,80,0,.9)';
        else if (type === 'success') bg = 'rgba(40,140,60,.9)';
        t.style.background = bg;
        t.textContent = msg;
        t.style.transform = 'translateX(-50%) translateY(0)';
        clearTimeout(t._tid);
        t._tid = setTimeout(function(){ t.style.transform = 'translateX(-50%) translateY(-150px)'; }, 2800);
    }

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
    //  PART 1: 防撤回 — Fetch 拦截 (document-start)
    // ============================================================
    (function() {
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
                if (ls.indexOf('filter')>=0||ls.indexOf('block')>=0||ls.indexOf('recall')>=0||
                    ls.indexOf('revoke')>=0||ls.indexOf('risk')>=0||ls.indexOf('delete')>=0) return true;
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
                                ended = true; onEnd();
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

        // 拦截 fetch
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
            this._wx3_url = url || '';
            return origOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function(body) {
            var url = this._wx3_url || '';
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
    //  PART 2: CSS 注入 (仅布局修复 + 美化 + 背景, 无深色模式)
    // ============================================================
    function injectCSS() {
        var css = '';

        // 背景层
        css += '#wx3-bg-layer{position:fixed;inset:0;z-index:-2;background-size:cover;background-position:center;background-repeat:no-repeat;pointer-events:none;}';
        css += '#wx3-bg-overlay{position:fixed;inset:0;z-index:-1;pointer-events:none;}';

        // 移动端布局修复: box-sizing + max-width 防溢出, 不破坏原有布局
        css += 'html,body{margin:0!important;padding:0!important;overflow-x:hidden!important;}';
        css += '#app{max-width:100vw!important;overflow-x:hidden!important;}';
        css += '#cs-container-scroll{max-width:100vw!important;overflow-x:hidden!important;box-sizing:border-box!important;}';
        css += '#chat-input-home,.chat-input-home,.chat-input-box-newer,.chat-input-box-top{box-sizing:border-box!important;max-width:100vw!important;padding-left:6px!important;padding-right:6px!important;}';
        css += '#input-root,.input-root{box-sizing:border-box!important;max-width:100%!important;}';
        css += '.ci-root{box-sizing:border-box!important;max-width:100%!important;}';
        css += '.ci-main{box-sizing:border-box!important;max-width:100%!important;}';
        css += '.ci-wrapper,.ci-normal-wrapper{box-sizing:border-box!important;max-width:100%!important;}';
        css += '.ci-container{box-sizing:border-box!important;max-width:100%!important;}';
        css += '.ci-file-input-wrapper{box-sizing:border-box!important;max-width:100%!important;}';
        css += '#ci-area{box-sizing:border-box!important;max-width:100%!important;}';
        css += '#chat-textarea,.ci-textarea{box-sizing:border-box!important;max-width:100%!important;word-wrap:break-word!important;overflow-wrap:break-word!important;}';
        css += '.ci-tool{box-sizing:border-box!important;max-width:100%!important;flex-wrap:wrap!important;gap:4px!important;}';
        css += '.ci-left-tools-wrapper{box-sizing:border-box!important;flex-wrap:wrap!important;gap:4px!important;}';

        // 美化: 圆角 + 动画
        css += '.ci-wrapper-border{border-radius:20px!important;}';
        css += '.ci-submit-button{border-radius:50%!important;transition:transform .2s!important;}';
        css += '.ci-submit-button:active{transform:scale(.88)!important;}';
        css += '.ci-input-mode-button{border-radius:16px!important;transition:transform .15s!important;}';
        css += '.ci-input-mode-button:active{transform:scale(.95)!important;}';
        css += '.ci-panel{border-radius:14px!important;transition:transform .15s!important;}';
        css += '.ci-panel:active{transform:scale(.95)!important;}';

        // 设置面板
        css += '#wx3-settings-panel{position:fixed;top:0;right:0;width:86vw;max-width:360px;height:100vh;height:100dvh;background:rgba(16,16,24,.98);backdrop-filter:blur(20px);z-index:2147483646;transform:translateX(105%);transition:transform .35s cubic-bezier(.34,1.2,.64,1);overflow-y:auto;box-shadow:-4px 0 30px rgba(0,0,0,.5);color:#e8e8f0;}';
        css += '#wx3-settings-panel.open{transform:translateX(0);}';
        css += '#wx3-settings-panel h3{font-size:15px;font-weight:700;margin:18px 20px 10px;color:#e8e8f0;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.08);}';
        css += '#wx3-settings-panel .wx3-item{display:flex;justify-content:space-between;align-items:center;padding:11px 20px;gap:10px;}';
        css += '#wx3-settings-panel .wx3-label{font-size:14px;color:#d0d0e0;flex:1;}';
        css += '#wx3-settings-panel .wx3-desc{font-size:12px;color:#777;margin-top:3px;}';
        css += '#wx3-settings-panel input[type="text"],#wx3-settings-panel input[type="url"]{background:rgba(38,38,52,.8);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px 12px;color:#e8e8f0;font-size:14px;width:100%;box-sizing:border-box;}';
        css += '#wx3-settings-panel input[type="range"]{width:110px;accent-color:#7c6eff;}';
        css += '#wx3-settings-panel select{background:rgba(38,38,52,.8);color:#e8e8f0;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:6px 10px;font-size:13px;}';
        css += '#wx3-settings-panel button{background:#7c6eff;color:#fff;border:none;border-radius:10px;padding:8px 16px;font-size:13px;cursor:pointer;transition:opacity .2s;}';
        css += '#wx3-settings-panel button:hover{opacity:.85;}';
        css += '#wx3-settings-panel .wx3-toggle{width:44px;height:24px;background:rgba(255,255,255,.15);border-radius:12px;position:relative;cursor:pointer;transition:background .2s;flex-shrink:0;}';
        css += '#wx3-settings-panel .wx3-toggle.on{background:#7c6eff;}';
        css += '#wx3-settings-panel .wx3-toggle::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:transform .2s;}';
        css += '#wx3-settings-panel .wx3-toggle.on::after{transform:translateX(20px);}';
        css += '#wx3-settings-panel .wx3-close{position:absolute;top:14px;right:14px;font-size:22px;color:#888;cursor:pointer;background:none;border:none;padding:4px;}';
        css += '#wx3-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483645;opacity:0;pointer-events:none;transition:opacity .3s;}';
        css += '#wx3-overlay.open{opacity:1;pointer-events:auto;}';

        // 设置/换行按钮 — 尽量融入原有样式
        css += '#wx3-settings-btn,#wx3-newline-btn{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:auto!important;height:32px!important;min-width:32px!important;padding:0 8px!important;border-radius:16px!important;cursor:pointer!important;transition:transform .15s!important;flex-shrink:0!important;font-size:14px!important;gap:4px!important;background:rgba(128,128,160,.15)!important;color:inherit!important;border:1px solid rgba(128,128,160,.2)!important;}';
        css += '#wx3-settings-btn:active,#wx3-newline-btn:active{transform:scale(.92)!important;}';

        // 背景应用
        var bg = getBg();
        if (bg) {
            css += '#wx3-bg-layer{background-image:url("' + bg + '")!important;filter:blur(' + getBlur() + 'px)!important;}';
            css += '#wx3-bg-overlay{background:rgba(0,0,0,' + (getOp()/100) + ')!important;}';
        }

        var old = document.getElementById('wx3-style');
        if (old) old.remove();
        var style = document.createElement('style');
        style.id = 'wx3-style';
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    // ============================================================
    //  PART 3: 背景层
    // ============================================================
    function applyBackground() {
        var bg = getBg();
        var layer = document.getElementById('wx3-bg-layer');
        var overlay = document.getElementById('wx3-bg-overlay');
        var root = document.body || document.documentElement;
        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'wx3-bg-layer';
            root.insertBefore(layer, root.firstChild);
        }
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'wx3-bg-overlay';
            root.insertBefore(overlay, root.firstChild);
        }
        if (bg) {
            layer.style.backgroundImage = 'url("' + bg + '")';
        } else {
            layer.style.backgroundImage = 'none';
            overlay.style.background = 'transparent';
        }
        injectCSS();
    }

    // ============================================================
    //  PART 4: 输入框修复
    // ============================================================
    function fixInputBox() {
        var ta = document.querySelector('#chat-textarea') || document.querySelector('textarea');
        if (!ta) return false;
        if (ta._wx3_fixed) return true;
        ta._wx3_fixed = true;

        // enterkeyhint="send" 让键盘显示"发送"
        try { ta.setAttribute('enterkeyhint', 'send'); } catch(e) {}

        // capture 阶段拦截 Enter → 发送
        ta.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.stopImmediatePropagation();
                e.preventDefault();
                // 找发送按钮并点击
                var btn = document.querySelector('.ci-submit-button') ||
                          document.querySelector('[class*="submit"]') ||
                          document.querySelector('[class*="send"]');
                if (btn) btn.click();
            }
        }, true);

        // 允许 beforeinput 换行
        ta.addEventListener('beforeinput', function(e) {
            if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') {
                e.stopPropagation();
            }
        }, true);

        // 防止站点重置 enterkeyhint
        try {
            var obs = new MutationObserver(function() {
                if (ta.getAttribute('enterkeyhint') !== 'send') {
                    ta.setAttribute('enterkeyhint', 'send');
                }
            });
            obs.observe(ta, { attributes: true, attributeFilter: ['enterkeyhint'] });
        } catch(e) {}

        return true;
    }

    // 换行按钮 — 插入到工具栏
    function addNewlineButton() {
        if (document.getElementById('wx3-newline-btn')) return true;
        // 尝试多种选择器找到工具栏
        var toolbar = document.querySelector('#ci-left-tool') ||
                      document.querySelector('.ci-left-tool') ||
                      document.querySelector('.ci-left-tools-wrapper') ||
                      document.querySelector('.ci-tool') ||
                      document.querySelector('[class*="left-tool"]');
        if (!toolbar) return false;
        var btn = document.createElement('div');
        btn.id = 'wx3-newline-btn';
        btn.innerHTML = '↵';
        btn.title = '换行';
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            var ta = document.querySelector('#chat-textarea') || document.querySelector('textarea');
            if (!ta) return;
            var s = ta.selectionStart, end = ta.selectionEnd;
            ta.value = ta.value.substring(0, s) + '\n' + ta.value.substring(end);
            ta.selectionStart = ta.selectionEnd = s + 1;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.focus();
        });
        toolbar.appendChild(btn);
        return true;
    }

    // ============================================================
    //  PART 5: 按钮过滤 (按 data-btn-id 和文本)
    // ============================================================
    var HIDE_IDS = [
        'inputPanel_deep_research',
        'inputPanel_aippt',
        'inputPanel_zhinengchuangzuo',
        'inputPanel_aicode',
        'inputPanel_aitranslate',
        'inputPanel_minglichuangzuo',
        'inputPanel_music',
        'inputPanel_aiyuedu'
    ];
    var HIDE_TEXTS = ['PPT', '写作', '编程', '翻译', '深入研究', '测运势', '音乐', '阅读', '深度思考'];

    function filterButtons() {
        // 按 data-btn-id 隐藏
        document.querySelectorAll('[data-btn-id]').forEach(function(p) {
            var id = p.getAttribute('data-btn-id') || '';
            var text = p.textContent || '';
            var hide = false;
            for (var i = 0; i < HIDE_IDS.length; i++) {
                if (id.indexOf(HIDE_IDS[i]) >= 0) { hide = true; break; }
            }
            if (!hide) {
                for (var j = 0; j < HIDE_TEXTS.length; j++) {
                    if (text.indexOf(HIDE_TEXTS[j]) >= 0) { hide = true; break; }
                }
            }
            p.style.display = hide ? 'none' : '';
        });
        // 也处理 .ci-panel (可能没有 data-btn-id)
        document.querySelectorAll('.ci-panel').forEach(function(p) {
            if (!p.getAttribute('data-btn-id')) {
                var text = p.textContent || '';
                for (var j = 0; j < HIDE_TEXTS.length; j++) {
                    if (text.indexOf(HIDE_TEXTS[j]) >= 0) { p.style.display = 'none'; break; }
                }
            }
        });
        // 隐藏 APP 下载提示
        document.querySelectorAll('[class*="download-app"],[class*="need-app"],[class*="app-only"]').forEach(function(el) {
            el.style.display = 'none';
        });
    }

    // ============================================================
    //  PART 6: 模型默认 & 任务模式
    // ============================================================
    var modelSetAttempts = 0;
    function setDefaultModel() {
        var sel = document.querySelector('[data-testid="chat-mode-selector"]') ||
                  document.querySelector('.ci-input-mode-button');
        if (!sel) return false;
        var current = sel.textContent || '';
        if (/deepseek|ds.*v4|v4.*pro/i.test(current)) return true;

        if (modelSetAttempts > 3) return false;
        modelSetAttempts++;

        sel.click();
        var findAttempts = 0;
        function findOption() {
            findAttempts++;
            if (findAttempts > 12) return;
            // 广泛搜索下拉菜单选项
            var opts = document.querySelectorAll('[class*="dropdown"] *, [class*="popup"] *, [class*="menu"] *, [role="option"], [role="menuitem"], [class*="mode-option"], [class*="model"]');
            var v4El = null;
            for (var i = 0; i < opts.length; i++) {
                var t = opts[i].textContent || '';
                if (/deepseek.*v4.*pro|ds.*v4.*pro/i.test(t)) {
                    opts[i].click();
                    toast('✅ 已切换: DeepSeek V4 Pro', 'success');
                    return;
                }
                if (/deepseek.*v4|ds.*v4/i.test(t) && !v4El && opts[i].children.length === 0) v4El = opts[i];
            }
            if (v4El && findAttempts >= 6) {
                v4El.click();
                setTimeout(function() {
                    var toggles = document.querySelectorAll('[class*="toggle"], [class*="switch"], [class*="think"]');
                    for (var j = 0; j < toggles.length; j++) {
                        if (/深度思考|思考|think/i.test(toggles[j].textContent || '')) {
                            toggles[j].click(); break;
                        }
                    }
                    toast('✅ 已切换: DeepSeek V4 Pro + 思考', 'success');
                }, 400);
                return;
            }
            setTimeout(findOption, 300);
        }
        setTimeout(findOption, 300);
        return true;
    }

    function enableTaskMode() {
        var btns = document.querySelectorAll('.ci-panel, [data-btn-id], [class*="task"], [class*="mode"]');
        for (var i = 0; i < btns.length; i++) {
            var b = btns[i];
            var text = b.textContent || '';
            var btnId = b.getAttribute('data-btn-id') || '';
            if (/任务/i.test(text) || /task/i.test(btnId)) {
                if (!b._wx3_task) {
                    var active = /active|selected|on/i.test(b.className) || b.getAttribute('aria-selected') === 'true';
                    if (!active) b.click();
                    b._wx3_task = true;
                }
                return true;
            }
        }
        return false;
    }

    // ============================================================
    //  PART 7: 设置面板
    // ============================================================
    function createSettings() {
        if (document.getElementById('wx3-settings-panel')) return;

        var ov = document.createElement('div');
        ov.id = 'wx3-overlay';
        ov.addEventListener('click', closeSettings);
        document.body.appendChild(ov);

        var p = document.createElement('div');
        p.id = 'wx3-settings-panel';
        p.innerHTML =
            '<button class="wx3-close" id="wx3-close">✕</button>' +
            '<h3>背景设置</h3>' +
            '<div class="wx3-item" style="flex-direction:column;align-items:stretch;"><div class="wx3-label">图片 URL</div>' +
            '<input type="url" id="wx3-bg-url" placeholder="https://..." style="margin-top:6px;">' +
            '<button id="wx3-bg-set" style="margin-top:8px;align-self:flex-start;">设置背景</button></div>' +
            '<div class="wx3-item" style="flex-direction:column;align-items:stretch;"><div class="wx3-label">上传图片</div>' +
            '<input type="file" id="wx3-bg-file" accept="image/*" style="margin-top:6px;font-size:12px;color:#888;"></div>' +
            '<div class="wx3-item"><div><div class="wx3-label">模糊度</div><div class="wx3-desc" id="wx3-blur-val">' + getBlur() + 'px</div></div>' +
            '<input type="range" id="wx3-blur" min="0" max="30" value="' + getBlur() + '"></div>' +
            '<div class="wx3-item"><div><div class="wx3-label">遮罩透明度</div><div class="wx3-desc" id="wx3-op-val">' + getOp() + '%</div></div>' +
            '<input type="range" id="wx3-op" min="0" max="95" value="' + getOp() + '"></div>' +
            '<div class="wx3-item"><button id="wx3-bg-clear" style="background:rgba(200,60,60,.85);">清除背景</button></div>' +
            '<h3>功能</h3>' +
            '<div class="wx3-item"><div><div class="wx3-label">防撤回 (智能回填)</div><div class="wx3-desc">拦截撤回消息并智能回填</div></div>' +
            '<div class="wx3-toggle ' + (getAntiRecall() ? 'on' : '') + '" id="wx3-recall"></div></div>' +
            '<div class="wx3-item" style="flex-direction:column;align-items:stretch;"><div class="wx3-label">回填状态</div>' +
            '<div id="wx3-bf-status" style="font-size:12px;color:#888;margin-top:6px;">...</div></div>' +
            '<h3>关于</h3>' +
            '<div class="wx3-item" style="flex-direction:column;align-items:stretch;"><div class="wx3-label">文心助手增强 v3.0</div>' +
            '<div class="wx3-desc" style="margin-top:4px;">手机适配 / 背景 / 输入修复 / 按钮过滤 / 防撤回</div></div>';
        document.body.appendChild(p);

        document.getElementById('wx3-close').addEventListener('click', closeSettings);

        var bu = document.getElementById('wx3-bg-url');
        bu.value = getBg().indexOf('data:') === 0 ? '' : getBg();
        document.getElementById('wx3-bg-set').addEventListener('click', function() {
            var v = bu.value.trim();
            if (v) { setBg(v); applyBackground(); toast('✅ 背景已设置', 'success'); }
        });
        document.getElementById('wx3-bg-file').addEventListener('change', function(e) {
            var f = e.target.files[0]; if (!f) return;
            var r = new FileReader();
            r.onload = function(ev) { setBg(ev.target.result); applyBackground(); toast('✅ 已上传', 'success'); };
            r.readAsDataURL(f);
        });
        document.getElementById('wx3-blur').addEventListener('input', function() {
            setBlur(parseInt(this.value)); applyBackground();
            document.getElementById('wx3-blur-val').textContent = this.value + 'px';
        });
        document.getElementById('wx3-op').addEventListener('input', function() {
            setOp(parseInt(this.value)); applyBackground();
            document.getElementById('wx3-op-val').textContent = this.value + '%';
        });
        document.getElementById('wx3-bg-clear').addEventListener('click', function() {
            delBg(); applyBackground(); bu.value = ''; toast('已清除背景');
        });

        var rt = document.getElementById('wx3-recall');
        rt.addEventListener('click', function() {
            var v = !getAntiRecall(); setAntiRecall(v);
            this.classList.toggle('on', v);
            toast(v ? '✅ 防撤回已开启' : '防撤回已关闭');
        });
        updateBfStatus();
    }

    function updateBfStatus() {
        var el = document.getElementById('wx3-bf-status');
        if (!el) return;
        el.innerHTML = backfillQueue.length > 0
            ? '⚠️ 有 <b style="color:#ff9500">' + backfillQueue.length + '</b> 轮撤回待回填'
            : '✅ 无待回填消息';
    }

    function openSettings() {
        createSettings();
        updateBfStatus();
        document.getElementById('wx3-settings-panel').classList.add('open');
        document.getElementById('wx3-overlay').classList.add('open');
    }
    function closeSettings() {
        var p = document.getElementById('wx3-settings-panel');
        var o = document.getElementById('wx3-overlay');
        if (p) p.classList.remove('open');
        if (o) o.classList.remove('open');
    }

    // 设置按钮 — 插入到工具栏
    function addSettingsBtn() {
        if (document.getElementById('wx3-settings-btn')) return true;
        var toolbar = document.querySelector('#ci-left-tool') ||
                      document.querySelector('.ci-left-tool') ||
                      document.querySelector('.ci-left-tools-wrapper') ||
                      document.querySelector('.ci-tool') ||
                      document.querySelector('[class*="left-tool"]') ||
                      document.querySelector('[class*="right-tool"]');
        if (!toolbar) return false;
        var btn = document.createElement('div');
        btn.id = 'wx3-settings-btn';
        btn.innerHTML = '⚙';
        btn.title = '增强设置';
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            openSettings();
        });
        toolbar.appendChild(btn);
        return true;
    }

    // ============================================================
    //  PART 8: 轮询初始化 (setInterval, 更可靠)
    // ============================================================
    var initCount = 0;
    var maxInit = 60; // 最多轮询 60 次 (约 30 秒)

    function tryInit() {
        initCount++;
        if (initCount > maxInit) return;

        var ready = false;

        // CSS 注入 (每次都重新注入以防被覆盖)
        injectCSS();

        // 背景层
        applyBackground();

        // 输入框修复
        var ta = document.querySelector('#chat-textarea') || document.querySelector('textarea');
        if (ta) {
            fixInputBox();
            ready = true;
        }

        // 设置/换行按钮
        addSettingsBtn();
        addNewlineButton();

        // 按钮过滤
        filterButtons();

        // 模型默认
        var sel = document.querySelector('[data-testid="chat-mode-selector"]') ||
                  document.querySelector('.ci-input-mode-button');
        if (sel) {
            setDefaultModel();
            ready = true;
        }

        // 任务模式
        enableTaskMode();

        // 第一次成功时提示
        if (ready && initCount === 1) {
            // 已经在 start() 里显示了
        }
    }

    // 始终显示加载提示 (不管是否找到元素)
    function showLoaded() {
        toast('✅ 文心助手增强 v3.0 已加载', 'success');
    }

    // 启动轮询
    function start() {
        // 立即显示加载提示
        showLoaded();
        // 立即执行一次
        try { tryInit(); } catch(e) { console.error('[文心增强] init error:', e); }
        // 每 500ms 轮询, 持续 30 秒
        var interval = setInterval(function() {
            try { tryInit(); } catch(e) { console.error('[文心增强] poll error:', e); }
            if (initCount >= maxInit) {
                clearInterval(interval);
                // 之后每 2 秒检查一次按钮过滤 (页面可能动态重载)
                setInterval(function() { try { filterButtons(); } catch(e) {} }, 2000);
            }
        }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    // 窗口大小变化时重新注入 CSS
    var resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() { injectCSS(); filterButtons(); }, 300);
    });

})();
