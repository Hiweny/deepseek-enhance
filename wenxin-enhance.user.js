// ==UserScript==
// @name         文心助手 全功能增强
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  手机适配 + 深色模式 + 全局背景 + 输入框修复(换行/发送分离) + 按钮过滤 + 模型默认(DeepSeek V4 Pro思考) + 任务模式默认开启 + 防撤回(智能回填)
// @author       Enhance
// @match        https://wenxin.baidu.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_deleteValue
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================
    //  PART 0: 全局常量 & 工具函数
    // ============================================================
    var PFX = 'wx_g_';

    // --- 背景存储 ---
    function bgKey()    { return PFX + 'bg_global'; }
    function blurKey()  { return PFX + 'blur_global'; }
    function opKey()    { return PFX + 'op_global'; }
    function getBg()    { return GM_getValue(bgKey(), ''); }
    function setBg(v)   { GM_setValue(bgKey(), v); }
    function delBg()    { GM_deleteValue(bgKey()); }
    function getBlur()  { return GM_getValue(blurKey(), 0); }
    function setBlur(v) { GM_setValue(blurKey(), v); }
    function getOp()    { return GM_getValue(opKey(), 15); }
    function setOp(v)   { GM_setValue(opKey(), v); }

    // --- 主题存储 ---
    function themeModeKey() { return PFX + 'theme_mode'; }
    function getThemeMode() { return GM_getValue(themeModeKey(), 'auto'); }
    function setThemeMode(v) { GM_setValue(themeModeKey(), v); }

    // --- 防撤回存储 ---
    function antiRecallKey() { return PFX + 'anti_recall'; }
    function getAntiRecall() { return GM_getValue(antiRecallKey(), true); }
    function setAntiRecall(v) { GM_setValue(antiRecallKey(), v); }

    // --- 模型默认存储 ---
    function modelKey() { return PFX + 'default_model'; }
    function getModel() { return GM_getValue(modelKey(), 'deepseek-v4-pro-thinking'); }
    function setModel(v) { GM_setValue(modelKey(), v); }

    // --- 智能回填队列 (内存, 不持久化) ---
    var backfillQueue = []; // [{user: string, assistant: string}]
    var pendingUserPrompt = '';
    var pendingSessionId = '';
    var currentModelName = '';

    // --- 撤回消息缓存 (localStorage) ---
    function recallKey(sid, mid) { return 'wx_recall_' + (sid||'') + '_' + (mid||''); }
    function saveRecalled(sid, mid, content) {
        try { localStorage.setItem(recallKey(sid, mid), content); } catch(e) {}
    }
    function getRecalled(sid, mid) {
        try { return localStorage.getItem(recallKey(sid, mid)); } catch(e) { return null; }
    }

    // --- Toast ---
    function toast(msg, type) {
        var t = document.getElementById('wx-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'wx-toast';
            t.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%) translateY(-120px);z-index:999999;padding:10px 24px;border-radius:20px;background:rgba(0,0,0,0.82);color:#fff;font-size:14px;pointer-events:none;transition:transform 0.4s cubic-bezier(0.34,1.56,0.64,1);white-space:nowrap;max-width:88vw;overflow:hidden;text-overflow:ellipsis;backdrop-filter:blur(8px);';
            document.documentElement.appendChild(t);
        }
        t.textContent = msg;
        if (type === 'warn') t.style.background = 'rgba(180,80,0,0.85)';
        else if (type === 'success') t.style.background = 'rgba(40,140,60,0.85)';
        else t.style.background = 'rgba(0,0,0,0.82)';
        t.style.transform = 'translateX(-50%) translateY(0)';
        clearTimeout(t._tid);
        t._tid = setTimeout(function(){ t.style.transform = 'translateX(-50%) translateY(-120px)'; }, 2500);
    }

    function debounce(fn, delay) {
        var timer = null;
        return function() {
            var ctx = this, args = arguments;
            clearTimeout(timer);
            timer = setTimeout(function(){ fn.apply(ctx, args); }, delay);
        };
    }

    function isMobile() { return window.innerWidth < 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }

    // 检测系统深色模式
    function systemPrefersDark() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    // 判断当前是否应该使用深色模式
    function shouldUseDark() {
        var mode = getThemeMode();
        if (mode === 'dark') return true;
        if (mode === 'light') return false;
        return systemPrefersDark(); // auto
    }

    // 从嵌套对象中提取文本内容
    function extractText(obj) {
        if (!obj) return '';
        if (typeof obj === 'string') return obj;
        if (typeof obj === 'object') {
            // 常见字段名
            var fields = ['text', 'content', 'question', 'prompt', 'message', 'data', 'generator', 'answer', 'response'];
            for (var i = 0; i < fields.length; i++) {
                if (obj[fields[i]]) {
                    if (typeof obj[fields[i]] === 'string') return obj[fields[i]];
                    if (typeof obj[fields[i]] === 'object') return extractText(obj[fields[i]]);
                }
            }
        }
        return '';
    }

    // 从请求体中找到用户输入文本字段路径
    function findPromptField(obj, depth) {
        depth = depth || 0;
        if (depth > 5 || !obj || typeof obj !== 'object') return null;
        // 直接匹配常见字段名
        var directKeys = ['prompt', 'query', 'question', 'content', 'text', 'message', 'input', 'q'];
        for (var i = 0; i < directKeys.length; i++) {
            var k = directKeys[i];
            if (k in obj) {
                if (typeof obj[k] === 'string' && obj[k].length > 0) return k;
                if (Array.isArray(obj[k]) && obj[k].length > 0) {
                    // query数组: [{type:'TEXT', data:{question:'...'}}]
                    for (var j = 0; j < obj[k].length; j++) {
                        var inner = findPromptField(obj[k][j], depth + 1);
                        if (inner) return k + '/' + j + '/' + inner;
                    }
                }
            }
        }
        // 递归搜索
        for (var key in obj) {
            if (obj.hasOwnProperty(key) && typeof obj[key] === 'object') {
                var found = findPromptField(obj[key], depth + 1);
                if (found) return key + '/' + found;
            }
        }
        return null;
    }

    // 按路径设置值
    function setValueByPath(obj, path, value) {
        var parts = path.split('/');
        var current = obj;
        for (var i = 0; i < parts.length - 1; i++) {
            var p = parts[i];
            if (/^\d+$/.test(p)) p = parseInt(p);
            if (!current[p]) return false;
            current = current[p];
        }
        var last = parts[parts.length - 1];
        if (/^\d+$/.test(last)) last = parseInt(last);
        if (typeof current[last] === 'string') {
            current[last] = value;
        } else if (typeof current[last] === 'object') {
            // 找到最内层的文本字段
            var innerPath = findPromptField(current[last]);
            if (innerPath) {
                setValueByPath(current[last], innerPath, value);
            } else {
                current[last] = value;
            }
        }
        return true;
    }

    // 按路径获取值
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
    //  PART 1: 防撤回 — Fetch/XHR 拦截 (document-start)
    // ============================================================
    (function() {
        if (!getAntiRecall()) return;

        // 撤回检测关键词
        var RECALL_KEYWORDS = [
            '由于相关法律法规', '内容已被过滤', '内容已被删除', '此内容已被撤回',
            '该消息已被撤回', '消息已撤回', 'content_filter', 'content filter',
            'risk_control', '已被系统撤回', '此回复已被撤回', '该回复不可用',
            '由于安全', '内容不可用', '已被移除', 'violation', '内容违规'
        ];

        // 判断是否为撤回信号
        function isRecallSignal(data) {
            if (!data) return false;
            // 检查 type
            if (data.type === 'error' || data.type === 'recall' || data.type === 'revoke') return true;
            // 检查 error 字段
            if (data.error) {
                var errMsg = typeof data.error === 'string' ? data.error : (data.error.message || '');
                for (var i = 0; i < RECALL_KEYWORDS.length; i++) {
                    if (errMsg.indexOf(RECALL_KEYWORDS[i]) >= 0) return true;
                }
            }
            // 检查 status
            var status = data.status || (data.options && data.options.status) || '';
            if (typeof status === 'string') {
                var lowerStatus = status.toLowerCase();
                if (lowerStatus.indexOf('filter') >= 0 || lowerStatus.indexOf('block') >= 0 ||
                    lowerStatus.indexOf('recall') >= 0 || lowerStatus.indexOf('revoke') >= 0 ||
                    lowerStatus.indexOf('risk') >= 0 || lowerStatus.indexOf('delete') >= 0) return true;
            }
            // 检查 content 中的关键词
            var contentText = extractText(data.content || data);
            if (contentText) {
                for (var j = 0; j < RECALL_KEYWORDS.length; j++) {
                    if (contentText.indexOf(RECALL_KEYWORDS[j]) >= 0) return true;
                }
            }
            return false;
        }

        // 构建回填注入文本
        function buildBackfillPrompt(originalPrompt) {
            if (backfillQueue.length === 0) return originalPrompt;
            var parts = [];
            parts.push('[当前时间: ' + new Date().toLocaleString('zh-CN') + ']');
            parts.push('[以下为之前被系统撤回的完整对话轮次，请将其作为对话上下文的一部分]');
            for (var i = 0; i < backfillQueue.length; i++) {
                var round = backfillQueue[i];
                if (round.user) parts.push('用户: ' + round.user);
                if (round.assistant) parts.push('助手: ' + round.assistant);
            }
            parts.push('[撤回对话结束]');
            parts.push('用户: ' + originalPrompt);
            return parts.join('\n\n');
        }

        // 处理 SSE 流并缓存内容
        function createSSEInterceptor(originalBody, requestBody) {
            var reader = originalBody.getReader();
            var decoder = new TextDecoder();
            var buffer = '';
            var fullContent = '';
            var messageId = '';
            var sessionId = pendingSessionId || '';
            var isRecalled = false;
            var streamEnded = false;

            return new ReadableStream({
                start: function(controller) {
                    function pump() {
                        reader.read().then(function(result) {
                            if (result.done) {
                                // 处理缓冲区剩余数据
                                if (buffer.trim()) processLine(buffer, true);
                                buffer = '';
                                streamEnded = true;
                                onStreamEnd();
                                controller.close();
                                return;
                            }
                            var chunk = decoder.decode(result.value, { stream: true });
                            buffer += chunk;
                            // 按 SSE 分隔符分割 (双换行或单换行)
                            var lines = buffer.split(/\r?\n/);
                            buffer = lines.pop() || '';
                            for (var i = 0; i < lines.length; i++) {
                                processLine(lines[i], false);
                            }
                            // 原样传递给页面
                            controller.enqueue(result.value);
                            pump();
                        }).catch(function(e) {
                            streamEnded = true;
                            onStreamEnd();
                            controller.error(e);
                        });
                    }

                    function processLine(line, isFinal) {
                        line = line.trim();
                        if (!line || line.indexOf('data:') !== 0) return;
                        var jsonStr = line.replace(/^data:\s*/, '');
                        if (!jsonStr || jsonStr === '[DONE]') return;
                        try {
                            var data = JSON.parse(jsonStr);
                            // 提取 message_id
                            if (data.options) {
                                if (data.options.qid) messageId = data.options.qid;
                                if (data.options.message_id) messageId = data.options.message_id;
                                if (data.options.session_id) sessionId = data.options.session_id;
                            }
                            // 提取内容
                            var text = '';
                            if (data.content) {
                                if (typeof data.content.generator === 'string') {
                                    text = data.content.generator;
                                } else if (data.content.generator && typeof data.content.generator === 'object') {
                                    text = data.content.generator.text || data.content.generator.content || '';
                                } else if (typeof data.content.text === 'string') {
                                    text = data.content.text;
                                } else if (typeof data.content === 'string') {
                                    text = data.content;
                                }
                            }
                            if (text) fullContent += text;
                            // 检测撤回
                            if (isRecallSignal(data)) {
                                isRecalled = true;
                            }
                            // 提取模型名
                            if (data.options && data.options.speedInfo && data.options.speedInfo.labels) {
                                if (data.options.speedInfo.labels.modelName) {
                                    currentModelName = data.options.speedInfo.labels.modelName;
                                }
                            }
                        } catch(e) {}
                    }

                    function onStreamEnd() {
                        if (streamEnded) return;
                        streamEnded = true;
                        // 缓存完整内容
                        if (fullContent && messageId) {
                            saveRecalled(sessionId, messageId, fullContent);
                        }
                        // 智能回填逻辑
                        if (getAntiRecall()) {
                            if (isRecalled) {
                                // 被撤回: 加入回填队列
                                backfillQueue.push({
                                    user: pendingUserPrompt,
                                    assistant: fullContent
                                });
                                toast('⚠️ 已拦截撤回消息，将在下次对话中回填', 'warn');
                            } else {
                                // 未被撤回: 清空回填队列 (上下文已永久保存)
                                if (backfillQueue.length > 0) {
                                    backfillQueue = [];
                                    toast('✅ 对话正常，已清空回填队列', 'success');
                                }
                            }
                        }
                        // 重置待处理状态
                        pendingUserPrompt = '';
                    }

                    pump();
                }
            });
        }

        // 拦截 fetch
        var origFetch = window.fetch;
        window.fetch = function(input, init) {
            var url = '';
            if (typeof input === 'string') url = input;
            else if (input && input.url) url = input.url;

            var isChatApi = url.indexOf('/aichat/api/conversation') >= 0;
            var isHistoryApi = url.indexOf('/aichat/api/messages/list') >= 0 ||
                               url.indexOf('/aichat/api/messages') >= 0;

            if (!isChatApi && !isHistoryApi) {
                return origFetch.apply(this, arguments);
            }

            // 捕获请求体 (聊天API)
            if (isChatApi && init && init.body) {
                try {
                    var bodyObj = JSON.parse(init.body);
                    pendingSessionId = bodyObj.session_id || bodyObj.sessionId || bodyObj.conversation_id || '';
                    // 提取用户输入
                    var promptPath = findPromptField(bodyObj);
                    if (promptPath) {
                        pendingUserPrompt = getValueByPath(bodyObj, promptPath);
                        // 应用回填
                        if (backfillQueue.length > 0 && pendingUserPrompt) {
                            var backfilled = buildBackfillPrompt(pendingUserPrompt);
                            setValueByPath(bodyObj, promptPath, backfilled);
                            init = Object.assign({}, init, { body: JSON.stringify(bodyObj) });
                            toast('📤 已注入 ' + backfillQueue.length + ' 轮撤回上下文');
                        }
                    }
                } catch(e) {}
            }

            // 调用原始 fetch (使用 call 确保使用修改后的 init)
            var fetchPromise = origFetch.call(this, input, init);

            if (isChatApi) {
                return fetchPromise.then(function(response) {
                    if (!response.body) return response;
                    var interceptedStream = createSSEInterceptor(response.body, init);
                    return new Response(interceptedStream, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers
                    });
                });
            }

            if (isHistoryApi) {
                return fetchPromise.then(function(response) {
                    return response.text().then(function(text) {
                        try {
                            var json = JSON.parse(text);
                            // 查找被撤回的消息并替换
                            var modified = false;
                            function processMessages(messages, sid) {
                                if (!Array.isArray(messages)) return;
                                for (var i = 0; i < messages.length; i++) {
                                    var msg = messages[i];
                                    if (!msg) continue;
                                    // 检测撤回状态
                                    var status = msg.status || (msg.options && msg.options.status) || '';
                                    var content = extractText(msg.content || msg.fragments || msg);
                                    var isRecalled = false;
                                    if (typeof status === 'string') {
                                        var ls = status.toLowerCase();
                                        if (ls.indexOf('filter') >= 0 || ls.indexOf('block') >= 0 ||
                                            ls.indexOf('recall') >= 0 || ls.indexOf('risk') >= 0) {
                                            isRecalled = true;
                                        }
                                    }
                                    // 关键词检测
                                    if (!isRecalled && content) {
                                        for (var k = 0; k < RECALL_KEYWORDS.length; k++) {
                                            if (content.indexOf(RECALL_KEYWORDS[k]) >= 0) {
                                                isRecalled = true;
                                                break;
                                            }
                                        }
                                    }
                                    if (isRecalled) {
                                        var mid = msg.message_id || msg.id || msg.qid || '';
                                        var cached = getRecalled(sid, mid);
                                        if (cached) {
                                            // 替换内容
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
                            // 尝试多种可能的数据路径
                            if (json.data) {
                                if (json.data.messages) processMessages(json.data.messages, json.data.session_id || json.data.chat_session_id);
                                if (json.data.chat_messages) processMessages(json.data.chat_messages, json.data.session_id || json.data.chat_session_id);
                                if (json.data.biz_data && json.data.biz_data.chat_messages) processMessages(json.data.biz_data.chat_messages, json.data.biz_data.chat_session_id);
                                if (json.data.list) processMessages(json.data.list, json.data.session_id);
                            }
                            if (json.messages) processMessages(json.messages, json.session_id);
                            if (json.list) processMessages(json.list, json.session_id);
                            if (modified) {
                                return new Response(JSON.stringify(json), {
                                    status: response.status,
                                    statusText: response.statusText,
                                    headers: response.headers
                                });
                            }
                        } catch(e) {}
                        return new Response(text, {
                            status: response.status,
                            statusText: response.statusText,
                            headers: response.headers
                        });
                    });
                });
            }

            return fetchPromise;
        };

        // 同时拦截 XHR (兼容性)
        var origXhrOpen = XMLHttpRequest.prototype.open;
        var origXhrSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(method, url) {
            this._wx_url = url || '';
            this._wx_method = method;
            return origXhrOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function(body) {
            var xhr = this;
            var url = xhr._wx_url || '';
            if (url.indexOf('/aichat/api/conversation') >= 0 && body) {
                try {
                    var bodyObj = JSON.parse(body);
                    pendingSessionId = bodyObj.session_id || bodyObj.sessionId || bodyObj.conversation_id || '';
                    var promptPath = findPromptField(bodyObj);
                    if (promptPath) {
                        pendingUserPrompt = getValueByPath(bodyObj, promptPath);
                        if (backfillQueue.length > 0 && pendingUserPrompt) {
                            var backfilled = buildBackfillPrompt(pendingUserPrompt);
                            setValueByPath(bodyObj, promptPath, backfilled);
                            body = JSON.stringify(bodyObj);
                            toast('📤 已注入 ' + backfillQueue.length + ' 轮撤回上下文');
                        }
                    }
                } catch(e) {}
            }
            return origXhrSend.call(this, body);
        };
    })();

    // ============================================================
    //  PART 2: CSS 注入 (移动端适配 + 深色模式 + 美化 + 背景)
    // ============================================================
    function injectCSS() {
        var css = '';

        // === 背景层 ===
        css += '#wx-bg-layer{position:fixed;inset:0;z-index:-2;background-size:cover;background-position:center;background-repeat:no-repeat;pointer-events:none;}';
        css += '#wx-bg-overlay{position:fixed;inset:0;z-index:-1;pointer-events:none;}';

        // === 移动端布局修复 ===
        css += 'html,body{margin:0!important;padding:0!important;overflow-x:hidden!important;width:100%!important;}';
        css += '#app{width:100%!important;max-width:100vw!important;overflow-x:hidden!important;}';
        css += '.chat-search-page-header{width:100%!important;max-width:100vw!important;box-sizing:border-box!important;}';
        css += '#conversation-flow-container,#conversation-flow-content{max-width:100vw!important;overflow-x:hidden!important;box-sizing:border-box!important;}';
        css += '.cs-footer{width:100%!important;max-width:100vw!important;box-sizing:border-box!important;}';

        // === 输入框区域修复 ===
        css += '#chat-input-home,.chat-input-home,.chat-input-box-newer,.chat-input-box-top{width:100%!important;max-width:100vw!important;box-sizing:border-box!important;overflow:hidden!important;}';
        css += '.ci-container,.ci-wrapper-border{max-width:100%!important;box-sizing:border-box!important;}';
        css += '#ci-area{max-width:100%!important;box-sizing:border-box!important;}';
        css += '#chat-textarea,.ci-textarea{max-width:100%!important;box-sizing:border-box!important;word-wrap:break-word!important;overflow-wrap:break-word!important;}';

        // === 整体美化 ===
        css += '#app{transition:background-color 0.3s ease,color 0.3s ease;}';
        css += '.ci-container{border-radius:18px!important;}';
        css += '.ci-submit-button{border-radius:50%!important;transition:transform 0.2s ease,opacity 0.2s ease!important;}';
        css += '.ci-submit-button:active{transform:scale(0.9)!important;}';
        css += '.ci-input-mode-button,.ci-panel{border-radius:14px!important;transition:background-color 0.2s ease,transform 0.15s ease!important;}';
        css += '.ci-input-mode-button:active,.ci-panel:active{transform:scale(0.96)!important;}';
        css += '.ci-tool{gap:6px!important;}';
        css += '.ai-entry{border-radius:16px!important;}';
        css += '.ai-entry-block{border-radius:12px!important;}';

        // === 深色模式 ===
        css += 'html[data-wx-theme="dark"]{color-scheme:dark;}';
        css += 'html[data-wx-theme="dark"] body{background-color:#0f0f14!important;color:#e8e8f0!important;}';
        css += 'html[data-wx-theme="dark"] #app{background-color:#0f0f14!important;color:#e8e8f0!important;}';
        css += 'html[data-wx-theme="dark"] .chat-search-page-header{background-color:rgba(20,20,30,0.85)!important;backdrop-filter:blur(12px)!important;color:#e8e8f0!important;border-bottom:1px solid rgba(255,255,255,0.06)!important;}';
        css += 'html[data-wx-theme="dark"] #conversation-flow-container,#conversation-flow-container{background:transparent!important;}';
        css += 'html[data-wx-theme="dark"] .cs-footer{background-color:rgba(20,20,30,0.9)!important;backdrop-filter:blur(12px)!important;border-top:1px solid rgba(255,255,255,0.06)!important;}';
        // 输入框区域
        css += 'html[data-wx-theme="dark"] .ci-container,html[data-wx-theme="dark"] .ci-wrapper-border{background-color:rgba(30,30,42,0.9)!important;border:1px solid rgba(255,255,255,0.08)!important;}';
        css += 'html[data-wx-theme="dark"] #chat-textarea,html[data-wx-theme="dark"] .ci-textarea{background-color:transparent!important;color:#e8e8f0!important;caret-color:#7c6eff!important;}';
        css += 'html[data-wx-theme="dark"] #chat-textarea::placeholder{color:rgba(255,255,255,0.3)!important;}';
        // 模式按钮
        css += 'html[data-wx-theme="dark"] .ci-input-mode-button,html[data-wx-theme="dark"] .ci-panel{background-color:rgba(40,40,56,0.8)!important;color:#c0c0d0!important;border:1px solid rgba(255,255,255,0.05)!important;}';
        css += 'html[data-wx-theme="dark"] .ci-input-mode-button:active,html[data-wx-theme="dark"] .ci-panel:active{background-color:rgba(60,60,80,0.9)!important;}';
        // 消息卡片
        css += 'html[data-wx-theme="dark"] .ai-entry{background-color:rgba(26,26,38,0.85)!important;color:#e8e8f0!important;}';
        css += 'html[data-wx-theme="dark"] .ai-entry-block{background-color:rgba(32,32,46,0.8)!important;color:#d8d8e8!important;}';
        // 文字颜色
        css += 'html[data-wx-theme="dark"] .ai-entry *,html[data-wx-theme="dark"] .ai-entry-block *{color:inherit;}';
        css += 'html[data-wx-theme="dark"] a{color:#6c8eff!important;}';
        css += 'html[data-wx-theme="dark"] code,html[data-wx-theme="dark"] pre{background-color:rgba(0,0,0,0.3)!important;color:#e8e8f0!important;}';
        // 下拉菜单
        css += 'html[data-wx-theme="dark"] [class*="dropdown"],html[data-wx-theme="dark"] [class*="popup"],html[data-wx-theme="dark"] [class*="menu"]{background-color:rgba(30,30,42,0.95)!important;color:#e8e8f0!important;backdrop-filter:blur(16px)!important;}';
        // 滚动条
        css += 'html[data-wx-theme="dark"] ::-webkit-scrollbar{width:6px;height:6px;}';
        css += 'html[data-wx-theme="dark"] ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:3px;}';
        css += 'html[data-wx-theme="dark"] ::-webkit-scrollbar-track{background:transparent;}';

        // === 设置面板样式 ===
        css += '#wx-settings-panel{position:fixed;top:0;right:0;width:88vw;max-width:380px;height:100vh;height:100dvh;background:rgba(18,18,26,0.98);backdrop-filter:blur(20px);z-index:999998;transform:translateX(100%);transition:transform 0.35s cubic-bezier(0.34,1.2,0.64,1);overflow-y:auto;box-shadow:-4px 0 30px rgba(0,0,0,0.4);color:#e8e8f0;}';
        css += '#wx-settings-panel.open{transform:translateX(0);}';
        css += '#wx-settings-panel h3{font-size:16px;font-weight:700;margin:20px 20px 12px;color:#e8e8f0;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.08);}';
        css += '#wx-settings-panel .wx-setting-item{display:flex;justify-content:space-between;align-items:center;padding:12px 20px;gap:12px;}';
        css += '#wx-settings-panel .wx-setting-label{font-size:14px;color:#d0d0e0;flex:1;}';
        css += '#wx-settings-panel .wx-setting-desc{font-size:12px;color:#888;margin-top:4px;}';
        css += '#wx-settings-panel input[type="text"],#wx-settings-panel input[type="url"]{background:rgba(40,40,56,0.8);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:8px 12px;color:#e8e8f0;font-size:14px;width:100%;box-sizing:border-box;}';
        css += '#wx-settings-panel input[type="range"]{width:120px;accent-color:#7c6eff;}';
        css += '#wx-settings-panel button{background:#7c6eff;color:#fff;border:none;border-radius:10px;padding:8px 16px;font-size:13px;cursor:pointer;transition:opacity 0.2s;}';
        css += '#wx-settings-panel button:hover{opacity:0.85;}';
        css += '#wx-settings-panel .wx-toggle{width:44px;height:24px;background:rgba(255,255,255,0.15);border-radius:12px;position:relative;cursor:pointer;transition:background 0.2s;flex-shrink:0;}';
        css += '#wx-settings-panel .wx-toggle.on{background:#7c6eff;}';
        css += '#wx-settings-panel .wx-toggle::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:transform 0.2s;}';
        css += '#wx-settings-panel .wx-toggle.on::after{transform:translateX(20px);}';
        css += '#wx-settings-panel .wx-close{position:absolute;top:16px;right:16px;font-size:24px;color:#888;cursor:pointer;background:none;border:none;}';
        css += '#wx-settings-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:999997;opacity:0;pointer-events:none;transition:opacity 0.3s;}';
        css += '#wx-settings-overlay.open{opacity:1;pointer-events:auto;}';
        // 设置按钮
        css += '#wx-settings-btn{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:14px;background:rgba(40,40,56,0.8);color:#c0c0d0;border:1px solid rgba(255,255,255,0.05);cursor:pointer;transition:background 0.2s,transform 0.15s;flex-shrink:0;}';
        css += '#wx-settings-btn:active{transform:scale(0.92);}';
        css += 'html:not([data-wx-theme="dark"]) #wx-settings-btn{background:rgba(240,240,245,0.9);color:#555;border:1px solid rgba(0,0,0,0.06);}';
        // 换行按钮
        css += '#wx-newline-btn{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:14px;background:rgba(40,40,56,0.8);color:#c0c0d0;border:1px solid rgba(255,255,255,0.05);cursor:pointer;transition:background 0.2s,transform 0.15s;flex-shrink:0;}';
        css += '#wx-newline-btn:active{transform:scale(0.92);}';
        css += 'html:not([data-wx-theme="dark"]) #wx-newline-btn{background:rgba(240,240,245,0.9);color:#555;border:1px solid rgba(0,0,0,0.06);}';

        if (typeof GM_addStyle === 'function') {
            GM_addStyle(css);
        } else {
            var style = document.createElement('style');
            style.textContent = css;
            (document.head || document.documentElement).appendChild(style);
        }
    }

    // ============================================================
    //  PART 3: 背景层管理
    // ============================================================
    function applyBackground() {
        var bg = getBg();
        var blur = getBlur();
        var op = getOp();
        var dark = shouldUseDark();

        var layer = document.getElementById('wx-bg-layer');
        var overlay = document.getElementById('wx-bg-overlay');
        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'wx-bg-layer';
            document.body.insertBefore(layer, document.body.firstChild);
        }
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'wx-bg-overlay';
            document.body.insertBefore(overlay, document.body.firstChild);
        }
        if (bg) {
            layer.style.backgroundImage = 'url("' + bg + '")';
            layer.style.filter = 'blur(' + blur + 'px)';
            overlay.style.background = dark
                ? 'rgba(15,15,20,' + (op / 100) + ')'
                : 'rgba(255,255,255,' + (op / 100) + ')';
        } else {
            layer.style.backgroundImage = 'none';
            overlay.style.background = 'transparent';
        }
    }

    // ============================================================
    //  PART 4: 主题切换
    // ============================================================
    function applyTheme() {
        var dark = shouldUseDark();
        document.documentElement.setAttribute('data-wx-theme', dark ? 'dark' : 'light');
        applyBackground();
    }

    // 监听系统深色模式变化
    if (window.matchMedia) {
        var darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
        var darkListener = function() {
            if (getThemeMode() === 'auto') applyTheme();
        };
        if (darkMQ.addEventListener) darkMQ.addEventListener('change', darkListener);
        else if (darkMQ.addListener) darkMQ.addListener(darkListener);
    }

    // ============================================================
    //  PART 5: 输入框修复 (换行/发送分离)
    // ============================================================
    function fixInputBox() {
        var textarea = document.querySelector('#chat-textarea');
        if (!textarea || textarea._wx_fixed) return;
        textarea._wx_fixed = true;

        // 设置 enterkeyhint="send" 让键盘显示"发送"按钮
        textarea.setAttribute('enterkeyhint', 'send');

        // 拦截 keydown: Enter 发送, 阻止站点原始处理器
        // 使用 stopImmediatePropagation 阻止同元素的其他 capture 监听器
        textarea.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !e._wx_sent) {
                // 阻止站点原始处理器 (它会发送或插入换行)
                e.stopImmediatePropagation();
                e.preventDefault();
                // 通过点击发送按钮来发送消息
                var submitBtn = document.querySelector('.ci-submit-button');
                if (submitBtn) {
                    submitBtn.click();
                }
            }
        }, true); // capture phase

        // 监听 enterkeyhint 属性变化 (站点可能动态重置)
        var attrObserver = new MutationObserver(function() {
            if (textarea.getAttribute('enterkeyhint') !== 'send') {
                textarea.setAttribute('enterkeyhint', 'send');
            }
        });
        attrObserver.observe(textarea, { attributes: true, attributeFilter: ['enterkeyhint'] });

        // 拦截 beforeinput: 允许换行按钮插入换行
        textarea.addEventListener('beforeinput', function(e) {
            if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') {
                // 这是键盘"换行"按钮触发的事件, 允许通过
                e.stopPropagation();
                // 不阻止默认行为, 让换行插入
            }
        }, true);
    }

    // 添加换行按钮
    function addNewlineButton() {
        var toolbar = document.querySelector('.ci-left-tool, .ci-tool, .ci-right-tool');
        if (!toolbar) return;
        if (document.getElementById('wx-newline-btn')) return;

        var btn = document.createElement('div');
        btn.id = 'wx-newline-btn';
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3v6a2 2 0 002 2h8M9 5l2 2-2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(0,-1)"/></svg>';
        btn.title = '换行';
        btn.addEventListener('click', function() {
            var ta = document.querySelector('#chat-textarea');
            if (!ta) return;
            var start = ta.selectionStart;
            var end = ta.selectionEnd;
            var text = ta.value;
            ta.value = text.substring(0, start) + '\n' + text.substring(end);
            ta.selectionStart = ta.selectionEnd = start + 1;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.focus();
        });
        toolbar.insertBefore(btn, toolbar.firstChild);
    }

    // ============================================================
    //  PART 6: 按钮过滤
    // ============================================================
    function filterButtons() {
        // 根据用户要求: 保留 模型选择/任务/AI修图, 隐藏深度思考(与模型选择冲突)及其他需APP的功能
        // 深度思考与模型选择中的思考模式冲突 → 隐藏深度思考, 保留模型选择
        var HIDE_BTN_IDS = [
            'inputPanel_deep_research',   // 深度思考 (与模型选择冲突)
            'inputPanel_aippt',            // AI PPT (需APP)
            'inputPanel_zhinengchuangzuo', // 智能创作 (需APP)
            'inputPanel_aicode',           // AI代码 (需APP)
            'inputPanel_aitranslate'       // AI翻译 (需APP)
        ];

        // 需要隐藏的文本关键词 (用于无 data-btn-id 的按钮)
        var HIDE_TEXT_PATTERNS = [
            /ppt/i, /创作/i, /代码/i, /翻译/i, /深度思考/i, /deep.?research/i,
            /下载.*app/i, /需要.*app/i, /仅.*app/i
        ];

        // 处理 ci-panel 按钮
        var panels = document.querySelectorAll('.ci-panel[data-btn-id], .ci-panel');
        panels.forEach(function(panel) {
            var btnId = panel.getAttribute('data-btn-id') || '';
            var text = panel.textContent || '';
            var shouldHide = false;

            // 检查 data-btn-id
            for (var i = 0; i < HIDE_BTN_IDS.length; i++) {
                if (btnId.indexOf(HIDE_BTN_IDS[i]) >= 0) {
                    shouldHide = true;
                    break;
                }
            }

            // 检查文本关键词
            if (!shouldHide) {
                for (var j = 0; j < HIDE_TEXT_PATTERNS.length; j++) {
                    if (HIDE_TEXT_PATTERNS[j].test(text)) {
                        shouldHide = true;
                        break;
                    }
                }
            }

            if (shouldHide) {
                panel.style.display = 'none';
            } else {
                panel.style.display = '';
            }
        });

        // 隐藏需要下载APP的提示元素和浮层
        document.querySelectorAll('[class*="download-app"], [class*="need-app"], [class*="app-only"], [class*="app-required"]').forEach(function(el) {
            el.style.display = 'none';
        });
    }

    // ============================================================
    //  PART 7: 模型默认 & 任务模式
    // ============================================================
    function setDefaultModel() {
        var selector = document.querySelector('[data-testid="chat-mode-selector"], .ci-input-mode-button');
        if (!selector) return;
        if (selector._wx_model_set) return;

        var currentText = selector.textContent || '';
        // 检查是否已经是 DeepSeek V4 Pro
        if (/deepseek|ds.*v4|v4.*pro/i.test(currentText)) {
            selector._wx_model_set = true;
            return;
        }

        // 点击打开下拉菜单
        selector.click();

        // 等待下拉菜单出现
        var attempts = 0;
        var maxAttempts = 10;
        function tryFindOption() {
            attempts++;
            if (attempts > maxAttempts) return;

            // 查找下拉菜单中的选项
            var options = document.querySelectorAll('[class*="dropdown"] [class*="item"], [class*="menu"] [class*="item"], [role="option"], [class*="mode-option"], [class*="model-item"]');
            if (!options.length) {
                // 尝试更广泛的搜索
                options = document.querySelectorAll('[class*="dropdown"] div, [class*="popup"] div, [class*="menu-item"]');
            }

            for (var i = 0; i < options.length; i++) {
                var text = options[i].textContent || '';
                if (/deepseek.*v4.*pro|ds.*v4.*pro|v4.*pro.*思考|deepseek.*思考/i.test(text)) {
                    options[i].click();
                    selector._wx_model_set = true;
                    toast('✅ 已设置默认模型: DeepSeek V4 Pro 思考模式', 'success');
                    return;
                }
                if (/deepseek.*v4/i.test(text) && !selector._wx_found_v4) {
                    selector._wx_found_v4 = options[i];
                }
            }

            // 如果找到 V4 但没有直接带"思考"的, 点击 V4 然后查找思考开关
            if (!selector._wx_model_set && selector._wx_found_v4 && attempts >= 5) {
                selector._wx_found_v4.click();
                // 查找思考模式开关
                setTimeout(function() {
                    var toggles = document.querySelectorAll('[class*="toggle"], [class*="switch"], [class*="think"], [class*="deep"]');
                    for (var j = 0; j < toggles.length; j++) {
                        var t = toggles[j].textContent || '';
                        if (/深度思考|思考模式|deep.*think|thinking/i.test(t)) {
                            toggles[j].click();
                            break;
                        }
                    }
                    selector._wx_model_set = true;
                    toast('✅ 已设置默认模型: DeepSeek V4 Pro + 思考模式', 'success');
                }, 500);
                return;
            }

            setTimeout(tryFindOption, 300);
        }
        setTimeout(tryFindOption, 300);
    }

    // 任务模式默认开启
    function enableTaskMode() {
        // 查找任务模式按钮
        var taskBtn = null;
        var allBtns = document.querySelectorAll('.ci-panel, .ci-input-mode-button, [data-btn-id], [class*="task"]');
        for (var i = 0; i < allBtns.length; i++) {
            var text = allBtns[i].textContent || '';
            var btnId = allBtns[i].getAttribute('data-btn-id') || '';
            if (/任务|task/i.test(text) || /task/i.test(btnId)) {
                taskBtn = allBtns[i];
                break;
            }
        }
        if (taskBtn && !taskBtn._wx_task_set) {
            // 检查是否已激活
            var isActive = taskBtn.classList.contains('active') ||
                          taskBtn.getAttribute('aria-selected') === 'true' ||
                          /active|selected|on/i.test(taskBtn.className);
            if (!isActive) {
                taskBtn.click();
                taskBtn._wx_task_set = true;
                toast('✅ 任务模式已开启', 'success');
            } else {
                taskBtn._wx_task_set = true;
            }
        }
    }

    // ============================================================
    //  PART 8: 设置面板
    // ============================================================
    function createSettingsPanel() {
        if (document.getElementById('wx-settings-panel')) return;

        var overlay = document.createElement('div');
        overlay.id = 'wx-settings-overlay';
        overlay.addEventListener('click', function() {
            closeSettings();
        });
        document.body.appendChild(overlay);

        var panel = document.createElement('div');
        panel.id = 'wx-settings-panel';
        panel.innerHTML = '\
            <button class="wx-close" id="wx-close-settings">✕</button>\
            <h3>外观设置</h3>\
            <div class="wx-setting-item">\
                <div><div class="wx-setting-label">深色模式</div><div class="wx-setting-desc">自动/手动切换深色主题</div></div>\
                <select id="wx-theme-select" style="background:rgba(40,40,56,0.8);color:#e8e8f0;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:6px 10px;font-size:13px;">\
                    <option value="auto">跟随系统</option>\
                    <option value="light">浅色</option>\
                    <option value="dark">深色</option>\
                </select>\
            </div>\
            <h3>背景设置</h3>\
            <div class="wx-setting-item" style="flex-direction:column;align-items:stretch;">\
                <div class="wx-setting-label">背景图片 URL</div>\
                <input type="url" id="wx-bg-url" placeholder="https://example.com/bg.jpg" style="margin-top:6px;">\
                <button id="wx-bg-url-btn" style="margin-top:8px;align-self:flex-start;">设置背景</button>\
            </div>\
            <div class="wx-setting-item" style="flex-direction:column;align-items:stretch;">\
                <div class="wx-setting-label">上传背景图片</div>\
                <input type="file" id="wx-bg-file" accept="image/*" style="margin-top:6px;font-size:12px;color:#888;">\
            </div>\
            <div class="wx-setting-item">\
                <div><div class="wx-setting-label">背景模糊</div><div class="wx-setting-desc">' + getBlur() + 'px</div></div>\
                <input type="range" id="wx-bg-blur" min="0" max="30" value="' + getBlur() + '">\
            </div>\
            <div class="wx-setting-item">\
                <div><div class="wx-setting-label">遮罩透明度</div><div class="wx-setting-desc">' + getOp() + '%</div></div>\
                <input type="range" id="wx-bg-opacity" min="0" max="95" value="' + getOp() + '">\
            </div>\
            <div class="wx-setting-item">\
                <button id="wx-bg-clear" style="background:rgba(200,60,60,0.8);">清除背景</button>\
            </div>\
            <h3>功能设置</h3>\
            <div class="wx-setting-item">\
                <div><div class="wx-setting-label">防撤回 (智能回填)</div><div class="wx-setting-desc">拦截被撤回消息并智能回填</div></div>\
                <div class="wx-toggle ' + (getAntiRecall() ? 'on' : '') + '" id="wx-toggle-recall"></div>\
            </div>\
            <div class="wx-setting-item" style="flex-direction:column;align-items:stretch;">\
                <div class="wx-setting-label">回填队列状态</div>\
                <div id="wx-backfill-status" style="font-size:12px;color:#888;margin-top:6px;">加载中...</div>\
            </div>\
            <h3>关于</h3>\
            <div class="wx-setting-item" style="flex-direction:column;align-items:stretch;">\
                <div class="wx-setting-label">文心助手 全功能增强 v1.0</div>\
                <div class="wx-setting-desc" style="margin-top:4px;">手机适配 / 深色模式 / 全局背景 / 输入框修复 / 按钮过滤 / 防撤回</div>\
            </div>\
        ';
        document.body.appendChild(panel);

        // 关闭按钮
        document.getElementById('wx-close-settings').addEventListener('click', closeSettings);

        // 主题选择
        var themeSelect = document.getElementById('wx-theme-select');
        themeSelect.value = getThemeMode();
        themeSelect.addEventListener('change', function() {
            setThemeMode(this.value);
            applyTheme();
        });

        // 背景 URL
        var bgUrlInput = document.getElementById('wx-bg-url');
        bgUrlInput.value = getBg().indexOf('data:') === 0 ? '' : getBg();
        document.getElementById('wx-bg-url-btn').addEventListener('click', function() {
            var url = bgUrlInput.value.trim();
            if (url) {
                setBg(url);
                applyBackground();
                toast('✅ 背景已设置', 'success');
            }
        });

        // 背景文件上传
        document.getElementById('wx-bg-file').addEventListener('change', function(e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function(ev) {
                setBg(ev.target.result);
                applyBackground();
                toast('✅ 背景图片已上传', 'success');
            };
            reader.readAsDataURL(file);
        });

        // 模糊滑块
        var blurSlider = document.getElementById('wx-bg-blur');
        blurSlider.addEventListener('input', function() {
            setBlur(parseInt(this.value));
            applyBackground();
            this.previousElementSibling.querySelector('.wx-setting-desc').textContent = this.value + 'px';
        });

        // 透明度滑块
        var opSlider = document.getElementById('wx-bg-opacity');
        opSlider.addEventListener('input', function() {
            setOp(parseInt(this.value));
            applyBackground();
            this.previousElementSibling.querySelector('.wx-setting-desc').textContent = this.value + '%';
        });

        // 清除背景
        document.getElementById('wx-bg-clear').addEventListener('click', function() {
            delBg();
            applyBackground();
            bgUrlInput.value = '';
            toast('已清除背景');
        });

        // 防撤回开关
        var recallToggle = document.getElementById('wx-toggle-recall');
        recallToggle.addEventListener('click', function() {
            var newVal = !getAntiRecall();
            setAntiRecall(newVal);
            if (newVal) {
                this.classList.add('on');
            } else {
                this.classList.remove('on');
            }
            toast(newVal ? '✅ 防撤回已开启' : '防撤回已关闭');
        });

        // 回填状态
        updateBackfillStatus();
    }

    function updateBackfillStatus() {
        var el = document.getElementById('wx-backfill-status');
        if (!el) return;
        if (backfillQueue.length > 0) {
            el.innerHTML = '⚠️ 当前有 <b style="color:#ff9500">' + backfillQueue.length + '</b> 轮撤回对话待回填<br>下次发送消息时将自动注入';
        } else {
            el.innerHTML = '✅ 无待回填的撤回消息<br>回填队列为空';
        }
    }

    function openSettings() {
        createSettingsPanel();
        updateBackfillStatus();
        document.getElementById('wx-settings-panel').classList.add('open');
        document.getElementById('wx-settings-overlay').classList.add('open');
    }

    function closeSettings() {
        var panel = document.getElementById('wx-settings-panel');
        var overlay = document.getElementById('wx-settings-overlay');
        if (panel) panel.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
    }

    // 添加设置按钮到工具栏
    function addSettingsButton() {
        var toolbar = document.querySelector('.ci-left-tool, .ci-tool, .ci-right-tool');
        if (!toolbar) return;
        if (document.getElementById('wx-settings-btn')) return;

        var btn = document.createElement('div');
        btn.id = 'wx-settings-btn';
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" stroke="currentColor" stroke-width="1.3"/><path d="M8 1.5v1.5M8 13v1.5M14.5 8H13M3 8H1.5M12.6 3.4l-1 1M4.4 11.6l-1 1M12.6 12.6l-1-1M4.4 4.4l-1-1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
        btn.title = '增强设置';
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            openSettings();
        });
        toolbar.appendChild(btn);
    }

    // ============================================================
    //  PART 9: DOM 观察器 & 初始化
    // ============================================================
    var initDone = {
        css: false,
        theme: false,
        input: false,
        buttons: false,
        settings: false,
        model: false,
        task: false
    };

    function tryInit() {
        // 注入 CSS (只需一次)
        if (!initDone.css) {
            injectCSS();
            initDone.css = true;
        }

        // 应用主题
        if (!initDone.theme) {
            applyTheme();
            initDone.theme = true;
        }

        // 等待关键元素出现
        var textarea = document.querySelector('#chat-textarea');
        var toolbar = document.querySelector('.ci-left-tool, .ci-tool, .ci-right-tool');

        if (textarea && !initDone.input) {
            fixInputBox();
            initDone.input = true;
        }

        if (toolbar && !initDone.settings) {
            addSettingsButton();
            addNewlineButton();
            initDone.settings = true;
        }

        // 按钮过滤
        if (!initDone.buttons) {
            filterButtons();
            // 持续检查 (动态加载)
            setTimeout(function() { filterButtons(); }, 1000);
            setTimeout(function() { filterButtons(); }, 3000);
            initDone.buttons = true;
        }

        // 模型默认设置
        var selector = document.querySelector('[data-testid="chat-mode-selector"], .ci-input-mode-button');
        if (selector && !initDone.model) {
            setDefaultModel();
            initDone.model = true;
        }

        // 任务模式
        if (!initDone.task) {
            enableTaskMode();
            setTimeout(function() { enableTaskMode(); }, 2000);
            initDone.task = true;
        }
    }

    // 使用 MutationObserver 监听 DOM 变化
    var observer = new MutationObserver(debounce(function() {
        tryInit();
        // 持续应用按钮过滤 (页面可能动态重载按钮)
        filterButtons();
    }, 200));

    // 启动
    function start() {
        tryInit();
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        } else {
            // body 尚未就绪, 等待
            var bodyCheck = setInterval(function() {
                if (document.body) {
                    clearInterval(bodyCheck);
                    tryInit();
                    observer.observe(document.body, { childList: true, subtree: true });
                }
            }, 50);
        }
    }

    // 在 document-start 时立即执行可执行的部分
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    // 窗口大小变化时重新适配
    window.addEventListener('resize', debounce(function() {
        applyTheme();
        filterButtons();
    }, 300));

})();
