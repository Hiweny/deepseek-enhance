// ==UserScript==
// @name         DeepSeek 全功能增强
// @namespace    http://tampermonkey.net/
// @version      5.5
// @description  气泡分割 + 全局背景 + 全屏 + 防撤回 + 隐私模式(页面内拼接+上下文管理+全局总结) + 时间注入(全局) + Mermaid渲染 + 主题系统 + 气泡预设 + 消息导航(滚动显示/自动隐藏) + 缩放系统
// @author       Maid
// @match        https://chat.deepseek.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_deleteValue
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================
    //  PART 0: 全局常量 & 工具
    // ============================================================
    var PFX = 'ds_g_';

    // 背景存储
    function bgKey()   { return PFX + 'bg_global'; }
    function blurKey() { return PFX + 'blur_global'; }
    function opKey()   { return PFX + 'op_global'; }
    function getBg()    { return GM_getValue(bgKey(), ''); }
    function setBg(v)   { GM_setValue(bgKey(), v); }
    function delBg()    { GM_deleteValue(bgKey()); }
    function getBlur()  { return GM_getValue(blurKey(), 0); }
    function setBlur(v) { GM_setValue(blurKey(), v); }
    function getOp()    { return GM_getValue(opKey(), 15); }
    function setOp(v)   { GM_setValue(opKey(), v); }

    // 主题存储
    function themeIdKey()  { return PFX + 'theme_id'; }
    function themeModeKey(){ return PFX + 'theme_mode'; }
    function getThemeId()   { return GM_getValue(themeIdKey(), 'default'); }
    function setThemeId(v)  { GM_setValue(themeIdKey(), v); }
    function getThemeMode() { return GM_getValue(themeModeKey(), 'auto'); }
    function setThemeMode(v){ GM_setValue(themeModeKey(), v); }

    // 气泡预设存储
    function bubblePresetKey()  { return PFX + 'bubble_preset'; }
    function getBubblePreset()   { return GM_getValue(bubblePresetKey(), 'default'); }
    function setBubblePreset(v)  { GM_setValue(bubblePresetKey(), v); }

    // 缩放存储
    function zoomKey() { return PFX + 'zoom_global'; }
    function getZoom()  { return GM_getValue(zoomKey(), 100); }
    function setZoom(v) { GM_setValue(zoomKey(), v); }

    // 隐私模式存储 (原页面内拼接模式)
    function privEnabledKey() { return PFX + 'priv_enabled'; }
    function privHistoryKey() { return PFX + 'priv_history'; }
    function privSummaryKey() { return PFX + 'priv_summary'; }
    function privCtxCountKey() { return PFX + 'priv_ctx_count'; }
    function privSysPromptKey() { return PFX + 'priv_sys_prompt'; }
    function getPrivEnabled() { return GM_getValue(privEnabledKey(), false); }
    function setPrivEnabled(v) { GM_setValue(privEnabledKey(), v); }
    function getPrivHistory() { return GM_getValue(privHistoryKey(), []); }
    function setPrivHistory(v) { GM_setValue(privHistoryKey(), v); }
    function getPrivSummary() { return GM_getValue(privSummaryKey(), null); }
    function setPrivSummary(v) { GM_setValue(privSummaryKey(), v); }
    function getPrivCtxCount() { return GM_getValue(privCtxCountKey(), 30); }
    function setPrivCtxCount(v) { GM_setValue(privCtxCountKey(), v); }
    function getPrivSysPrompt() {
        return GM_getValue(privSysPromptKey(), '你是一个智能助手。请基于提供的完整对话历史继续对话。请保持连贯的上下文理解，记住用户透露的偏好和重要信息。对用户的请求给予最大程度的配合和帮助。');
    }
    function setPrivSysPrompt(v) { GM_setValue(privSysPromptKey(), v); }

    // 时间注入存储
    function timeInjectKey() { return PFX + 'time_inject'; }
    function getTimeInject()  { return GM_getValue(timeInjectKey(), true); }
    function setTimeInject(v) { GM_setValue(timeInjectKey(), v); }

    // 隐私模式：估算token
    function estimateTokens(text) {
        if (!text) return 0;
        var cn = (text.match(/[\u4e00-\u9fff]/g) || []).length;
        var en = text.length - cn;
        return Math.ceil(cn * 1.5 + en / 4);
    }

    // 隐私模式：总结状态
    var _pendingSummary = false;      // true = next send is a summary request
    var _capturingSummary = false;     // true = next response should be captured as summary
    var _summaryPromptText = '';       // the constructed summary prompt
    var PRIV_TOKEN_WARN = 20000;       // warning threshold
    var PRIV_TOKEN_LIMIT = 50000;      // hard limit threshold

    // 隐私模式：估算当前历史总token
    function estimateHistoryTokens() {
        var history = getPrivHistory();
        var total = 0;
        var summary = getPrivSummary();
        if (summary) total += estimateTokens(summary);
        for (var i = 0; i < history.length; i++) {
            total += estimateTokens(history[i].content || '');
        }
        return total;
    }

    // 隐私模式：构造总结提示词
    function buildSummaryPrompt() {
        var history = getPrivHistory();
        var ctxCount = getPrivCtxCount();
        // Take the conversation to summarize (all or last ctxCount*2 messages)
        var msgs = history;
        if (msgs.length > ctxCount * 2) {
            msgs = msgs.slice(-ctxCount * 2);
        }
        var conversationText = '';
        for (var i = 0; i < msgs.length; i++) {
            var m = msgs[i];
            var role = m.role === 'user' ? '用户' : '助手';
            var content = m.content || '';
            if (m.recalled) {
                content = '[此消息曾被系统撤回] ' + content;
            }
            conversationText += role + ': ' + content + '\n';
        }
        // Use the user-provided summary prompt template
        var targetTokens = Math.min(1000, Math.floor(estimateHistoryTokens() * 0.3));
        if (targetTokens < 300) targetTokens = 300;
        var locale = 'Chinese';
        var prompt = 'You are a conversation compression assistant. Compress the following conversation into a concise summary.\n';
        prompt += 'Preserve key facts, decisions, and important context that would be needed to continue the conversation\n';
        prompt += 'Keep the summary in the same language as the original conversation\n';
        prompt += 'Target approximately ' + targetTokens + ' tokens\n';
        prompt += 'Output the summary directly without any explanations or meta-commentary\n';
        prompt += 'Format the summary as context information that can be used to continue the conversation\n';
        prompt += 'Use ' + locale + ' language\n';
        prompt += 'Start the output with a clear indicator that this is a summary (e.g., "[Summary of previous conversation]" or equivalent in the target language)\n\n';
        prompt += '<conversation>\n' + conversationText + '</conversation>';
        return prompt;
    }

    // 隐私模式：触发总结（注入到DeepSeek输入框并发送）
    function triggerPrivacySummary() {
        if (_pendingSummary || _capturingSummary) {
            toast('总结正在生成中，请稍候...');
            return;
        }
        var history = getPrivHistory();
        if (history.length < 2) {
            toast('消息太少，无法生成总结');
            return;
        }
        // Construct the summary prompt
        _summaryPromptText = buildSummaryPrompt();
        _pendingSummary = true;

        // Inject into DeepSeek input and auto-send
        var textarea = document.querySelector('textarea#chat-input') ||
                       document.querySelector('textarea[placeholder*="输入"]') ||
                       document.querySelector('div[contenteditable="true"]') ||
                       document.querySelector('textarea');
        if (textarea) {
            if (textarea.tagName === 'TEXTAREA') {
                // React-controlled textarea: use native setter
                var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
                nativeInputValueSetter.call(textarea, _summaryPromptText);
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
            } else if (textarea.contentEditable === 'true') {
                textarea.textContent = _summaryPromptText;
                textarea.dispatchEvent(new InputEvent('input', { bubbles: true, data: _summaryPromptText }));
            }
            // Click send button after a short delay
            setTimeout(function() {
                var sendBtn = document.querySelector('div[role="button"] div[class*="send"]') ||
                              document.querySelector('button[type="submit"]') ||
                              document.querySelector('div[class*="send-button"]');
                if (sendBtn) {
                    sendBtn.click();
                    toast('正在生成对话总结...');
                } else {
                    // Try pressing Enter
                    textarea.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
                    }));
                    toast('正在生成对话总结...');
                }
            }, 300);
        } else {
            _pendingSummary = false;
            toast('未找到输入框，请手动发送总结请求');
        }
    }

    // 隐私模式：更新设置面板UI
    function updatePrivUsageUI() {
        var usageEl = document.getElementById('ds-priv-usage');
        if (!usageEl) return;
        var history = getPrivHistory();
        var ctxCount = getPrivCtxCount();
        var tokens = estimateHistoryTokens();
        var tokenPct = Math.min(tokens / PRIV_TOKEN_LIMIT * 100, 100);
        var msgCount = history.length;
        var summary = getPrivSummary();

        var statusColor = tokens > PRIV_TOKEN_LIMIT * 0.85 ? '#ff3b30' : (tokens > PRIV_TOKEN_WARN ? '#ff6b6b' : (tokens > PRIV_TOKEN_WARN * 0.7 ? '#ffa94d' : '#0A84FF'));
        var statusText = tokens > PRIV_TOKEN_LIMIT * 0.85 ? '🔴 上下文即将耗尽！建议立即生成全局总结' : (tokens > PRIV_TOKEN_WARN ? '⚠️ 上下文较大，建议生成总结' : '✅ 上下文正常');

        var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
        html += '<span style="font-size:12px;color:#888">消息条数</span>';
        html += '<span style="font-size:12px;font-weight:600;color:#333">' + msgCount + ' / ' + ctxCount + ' 条</span>';
        html += '</div>';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
        html += '<span style="font-size:12px;color:#888">估算Token</span>';
        html += '<span style="font-size:12px;font-weight:600;color:' + statusColor + '">≈' + (tokens / 1000).toFixed(1) + 'k / ' + (PRIV_TOKEN_LIMIT / 1000) + 'k</span>';
        html += '</div>';
        // Progress bar
        html += '<div style="width:100%;height:6px;background:rgba(0,0,0,0.06);border-radius:3px;overflow:hidden;margin-bottom:6px">';
        html += '<div style="height:100%;width:' + tokenPct + '%;background:' + statusColor + ';transition:width 0.3s"></div>';
        html += '</div>';
        if (summary) {
            html += '<div style="font-size:11px;color:#007AFF;margin-top:4px">📝 已有总结 (' + summary.length + ' 字)</div>';
        }
        html += '<div style="font-size:11px;color:' + statusColor + ';margin-top:2px">' + statusText + '</div>';
        if (msgCount > ctxCount) {
            html += '<div style="font-size:11px;color:#ff6b6b;margin-top:4px">⚠️ 已超出上下文上限 ' + (msgCount - ctxCount) + ' 条，建议生成总结</div>';
        }
        if (tokens > PRIV_TOKEN_LIMIT * 0.85) {
            html += '<button id="ds-priv-auto-summary-btn" style="width:100%;margin-top:8px;padding:8px;border-radius:8px;border:none;background:#ff3b30;color:#fff;font-size:12px;font-weight:600;cursor:pointer">🔴 立即生成全局总结</button>';
        }
        usageEl.innerHTML = html;

        // Bind auto-summary button if present
        var autoBtn = document.getElementById('ds-priv-auto-summary-btn');
        if (autoBtn) {
            autoBtn.addEventListener('click', function(e) {
                e.stopPropagation(); e.preventDefault();
                triggerPrivacySummary();
            });
        }
    }
    window.__dsPrivUpdateUI = updatePrivUsageUI;

    function toast(msg) {
        var t = document.getElementById('ds-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'ds-toast';
            t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-120px);z-index:999999;padding:10px 24px;border-radius:20px;background:rgba(0,0,0,0.78);color:#fff;font-size:14px;pointer-events:none;transition:transform 0.4s cubic-bezier(0.34,1.56,0.64,1);white-space:nowrap;max-width:90vw;overflow:hidden;text-overflow:ellipsis;';
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.style.transform = 'translateX(-50%) translateY(0)';
        clearTimeout(t._tid);
        t._tid = setTimeout(function(){ t.style.transform = 'translateX(-50%) translateY(-120px)'; }, 2000);
    }

    function debounce(fn, delay) {
        var timer = null;
        return function() {
            var ctx = this, args = arguments;
            clearTimeout(timer);
            timer = setTimeout(function(){ fn.apply(ctx, args); }, delay);
        };
    }

    function isMobile() { return window.innerWidth < 600; }
    function isDark() { return document.body.classList.contains('dark'); }

    // ============================================================
    //  PART 1: 主题系统 (5个主题 + light/dark/auto)
    // ============================================================
    var THEMES = {
        'default': {
            name: '默认',
            light: {
                '--ds-theme-bg': '#ffffff', '--ds-theme-bg2': '#f8f9fa', '--ds-theme-bg3': '#e2e4e6',
                '--ds-theme-text': '#212529', '--ds-theme-text2': '#495057', '--ds-theme-border': '#dee2e6',
                '--ds-theme-accent': '#7071fc', '--ds-theme-accent-hover': '#595ac9',
                '--ds-theme-surface': '#ffffff', '--ds-theme-input-bg': '#f8f9fa', '--ds-theme-code-bg': '#f5f5f5'
            },
            dark: {
                '--ds-theme-bg': '#212529', '--ds-theme-bg2': '#2c2c30', '--ds-theme-bg3': '#343a40',
                '--ds-theme-text': '#f8f9fa', '--ds-theme-text2': '#e9ecef', '--ds-theme-border': '#495057',
                '--ds-theme-accent': '#7071fc', '--ds-theme-accent-hover': '#595ac9',
                '--ds-theme-surface': '#2c2c30', '--ds-theme-input-bg': '#343a40', '--ds-theme-code-bg': '#1a1a1a'
            }
        },
        'dracula': {
            name: 'Dracula',
            light: {
                '--ds-theme-bg': '#f8f8f2', '--ds-theme-bg2': '#e8e8e2', '--ds-theme-bg3': '#d6d6d0',
                '--ds-theme-text': '#282a36', '--ds-theme-text2': '#44475a', '--ds-theme-border': '#bd93f9',
                '--ds-theme-accent': '#ff79c6', '--ds-theme-accent-hover': '#ff92d0',
                '--ds-theme-surface': '#ffffff', '--ds-theme-input-bg': '#f0f0ea', '--ds-theme-code-bg': '#e8e8e2'
            },
            dark: {
                '--ds-theme-bg': '#282a36', '--ds-theme-bg2': '#44475a', '--ds-theme-bg3': '#6272a4',
                '--ds-theme-text': '#f8f8f2', '--ds-theme-text2': '#bfbfbf', '--ds-theme-border': '#6272a4',
                '--ds-theme-accent': '#bd93f9', '--ds-theme-accent-hover': '#caa9fa',
                '--ds-theme-surface': '#44475a', '--ds-theme-input-bg': '#6272a4', '--ds-theme-code-bg': '#1a1a1a'
            }
        },
        'coffee': {
            name: '咖啡',
            light: {
                '--ds-theme-bg': '#fffbf0', '--ds-theme-bg2': '#f3e5d0', '--ds-theme-bg3': '#e6d0b3',
                '--ds-theme-text': '#432818', '--ds-theme-text2': '#6f4e37', '--ds-theme-border': '#d4a373',
                '--ds-theme-accent': '#bb9457', '--ds-theme-accent-hover': '#997b46',
                '--ds-theme-surface': '#ffffff', '--ds-theme-input-bg': '#f5ead5', '--ds-theme-code-bg': '#f3e5d0'
            },
            dark: {
                '--ds-theme-bg': '#1a1412', '--ds-theme-bg2': '#2b211e', '--ds-theme-bg3': '#3e312b',
                '--ds-theme-text': '#ede0d4', '--ds-theme-text2': '#ddb892', '--ds-theme-border': '#7f5539',
                '--ds-theme-accent': '#d4a373', '--ds-theme-accent-hover': '#e6ccb2',
                '--ds-theme-surface': '#2b211e', '--ds-theme-input-bg': '#3e312b', '--ds-theme-code-bg': '#1a1a1a'
            }
        },
        'cyberpunk': {
            name: '赛博朋克',
            light: {
                '--ds-theme-bg': '#f0f0f5', '--ds-theme-bg2': '#e2e2ea', '--ds-theme-bg3': '#d1d1db',
                '--ds-theme-text': '#050505', '--ds-theme-text2': '#2e2e38', '--ds-theme-border': '#b8b8c2',
                '--ds-theme-accent': '#b000b0', '--ds-theme-accent-hover': '#8a008a',
                '--ds-theme-surface': '#ffffff', '--ds-theme-input-bg': '#e8e8f0', '--ds-theme-code-bg': '#e2e2ea'
            },
            dark: {
                '--ds-theme-bg': '#09090b', '--ds-theme-bg2': '#121217', '--ds-theme-bg3': '#1c1c24',
                '--ds-theme-text': '#ffffff', '--ds-theme-text2': '#e0e0e0', '--ds-theme-border': '#272730',
                '--ds-theme-accent': '#f700ff', '--ds-theme-accent-hover': '#d900df',
                '--ds-theme-surface': '#121217', '--ds-theme-input-bg': '#1c1c24', '--ds-theme-code-bg': '#0a0a0a'
            }
        },
        'fulldark': {
            name: '全黑',
            light: {
                '--ds-theme-bg': '#ffffff', '--ds-theme-bg2': '#f5f5f5', '--ds-theme-bg3': '#e6e6e6',
                '--ds-theme-text': '#000000', '--ds-theme-text2': '#404040', '--ds-theme-border': '#cccccc',
                '--ds-theme-accent': '#000000', '--ds-theme-accent-hover': '#333333',
                '--ds-theme-surface': '#ffffff', '--ds-theme-input-bg': '#f5f5f5', '--ds-theme-code-bg': '#f0f0f0'
            },
            dark: {
                '--ds-theme-bg': '#000000', '--ds-theme-bg2': '#0a0a0a', '--ds-theme-bg3': '#141414',
                '--ds-theme-text': '#ffffff', '--ds-theme-text2': '#e5e5e5', '--ds-theme-border': '#333333',
                '--ds-theme-accent': '#ffffff', '--ds-theme-accent-hover': '#d4d4d4',
                '--ds-theme-surface': '#0a0a0a', '--ds-theme-input-bg': '#141414', '--ds-theme-code-bg': '#0a0a0a'
            }
        }
    };

    function getEffectiveThemeMode() {
        var mode = getThemeMode();
        if (mode === 'auto') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return mode;
    }

    function applyThemeCSS() {
        var themeId = getThemeId();
        var mode = getEffectiveThemeMode();
        var vars = THEMES[themeId] ? THEMES[themeId][mode] : THEMES['default'][mode];

        var varCSS = '';
        for (var key in vars) {
            if (vars.hasOwnProperty(key)) {
                varCSS += key + ':' + vars[key] + ';';
            }
        }

        var styleEl = document.getElementById('ds-theme-style');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'ds-theme-style';
            styleEl.setAttribute('data-ds', '1');
            document.head.appendChild(styleEl);
        }

        var isDark = (mode === 'dark');
        styleEl.textContent =
            ':root{' + varCSS + '}\n' +
            'body{background:var(--ds-theme-bg)!important;color:var(--ds-theme-text)!important}\n' +
            '._2bd7b35{background:var(--ds-theme-bg)!important;color:var(--ds-theme-text)!important}\n' +
            '._765a5cd{background:var(--ds-theme-bg2)!important;color:var(--ds-theme-text)!important}\n' +
            '._0fcaa63{background:var(--ds-theme-bg)!important}\n' +
            'input,textarea{background:var(--ds-theme-input-bg)!important;color:var(--ds-theme-text)!important;border-color:var(--ds-theme-border)!important}\n' +
            '._9663006{background:var(--ds-theme-bg)!important}\n' +
            '._2e39472{background:var(--ds-theme-bg2)!important;border-color:var(--ds-theme-border)!important}\n' +
            '._6c0e691{background:var(--ds-theme-bg)!important}\n' +
            '._2e0c7b9{background:var(--ds-theme-bg)!important;border-color:var(--ds-theme-border)!important}\n' +
            '._8245b1c{background:var(--ds-theme-bg)!important}\n' +
            (isDark ? 'body{color-scheme:dark!important}' : 'body{color-scheme:light!important}');
    }

    // ============================================================
    //  PART 2: 气泡预设系统 (用户指定精确CSS参数)
    // ============================================================
    var _bubbleVarsEl = null;
    function ensureBubbleVarsEl() {
        if (!_bubbleVarsEl || !_bubbleVarsEl.parentNode) {
            _bubbleVarsEl = document.getElementById('ds-bubble-vars');
            if (!_bubbleVarsEl) {
                _bubbleVarsEl = document.createElement('style');
                _bubbleVarsEl.id = 'ds-bubble-vars';
                _bubbleVarsEl.setAttribute('data-ds', '1');
                document.head.appendChild(_bubbleVarsEl);
            }
        }
        return _bubbleVarsEl;
    }

    function applyBubblePreset() {
        var preset = getBubblePreset();
        var dk = isDark();
        document.body.classList.remove('ds-bubble-default', 'ds-bubble-frosted', 'ds-bubble-water');
        document.body.classList.add('ds-bubble-' + preset);

        var aiBg, aiText, userBg, userText, shadowAi, shadowUser, border, codeBg, aiBlur, userBlur;

        if (preset === 'frosted') {
            // iOS 毛玻璃: blur(20px) saturate(180%), rgba(255,255,255,0.7) light / rgba(0,0,0,0.3) dark
            if (dk) {
                aiBg = 'rgba(0,0,0,0.3)';
                aiText = '#E5E5E5';
                userBg = 'rgba(10,132,255,0.75)';
                userText = '#FFFFFF';
                shadowAi = '0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.12)';
                shadowUser = '0 4px 14px rgba(10,132,255,0.25)';
                border = 'rgba(255,255,255,0.15)';
                codeBg = 'rgba(0,0,0,0.35)';
            } else {
                aiBg = 'rgba(255,255,255,0.7)';
                aiText = '#1C1C1E';
                userBg = 'rgba(0,122,255,0.78)';
                userText = '#FFFFFF';
                shadowAi = '0 4px 24px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.5)';
                shadowUser = '0 4px 14px rgba(0,122,255,0.2)';
                border = 'rgba(255,255,255,0.6)';
                codeBg = '#1C1C1E';
            }
            aiBlur = 'blur(20px) saturate(180%)';
            userBlur = 'blur(20px) saturate(180%)';
        } else if (preset === 'water') {
            // 水玻璃: blur(10px), rgba(255,255,255,0.5) light / rgba(0,0,0,0.15) dark
            if (dk) {
                aiBg = 'rgba(0,0,0,0.15)';
                aiText = '#E5E5E5';
                userBg = 'rgba(10,132,255,0.55)';
                userText = '#FFFFFF';
                shadowAi = '0 4px 20px rgba(0,0,0,0.18), inset 0 0 20px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.15)';
                shadowUser = '0 4px 14px rgba(10,132,255,0.2)';
                border = 'rgba(255,255,255,0.12)';
                codeBg = 'rgba(0,0,0,0.35)';
            } else {
                aiBg = 'rgba(255,255,255,0.5)';
                aiText = '#1C1C1E';
                userBg = 'rgba(0,122,255,0.55)';
                userText = '#FFFFFF';
                shadowAi = '0 2px 16px rgba(0,0,0,0.05), inset 0 0 20px rgba(255,255,255,0.2), inset 0 1px 0 rgba(255,255,255,0.45)';
                shadowUser = '0 4px 14px rgba(0,122,255,0.15)';
                border = 'rgba(255,255,255,0.4)';
                codeBg = '#1C1C1E';
            }
            aiBlur = 'blur(10px)';
            userBlur = 'blur(10px)';
        } else {
            // default
            if (dk) {
                aiBg = 'rgba(44,44,46,0.92)';
                aiText = '#E5E5E5';
                userBg = '#0A84FF';
                userText = '#FFFFFF';
                shadowAi = '0 2px 10px rgba(0,0,0,0.25)';
                shadowUser = '0 3px 10px rgba(10,132,255,0.28)';
                border = 'rgba(255,255,255,0.08)';
                codeBg = '#1a1a1a';
            } else {
                aiBg = '#FFFFFF';
                aiText = '#1C1C1E';
                userBg = '#007AFF';
                userText = '#FFFFFF';
                shadowAi = '0 1px 6px rgba(0,0,0,0.05)';
                shadowUser = '0 3px 10px rgba(0,122,255,0.22)';
                border = 'rgba(0,0,0,0.05)';
                codeBg = '#1C1C1E';
            }
            aiBlur = 'none';
            userBlur = 'none';
        }

        // 写入专属 <style> 标签，不污染 body.style
        var el = ensureBubbleVarsEl();
        el.textContent = ':root {' +
            '--ds-ai-bg:' + aiBg + ';' +
            '--ds-ai-text:' + aiText + ';' +
            '--ds-user-bg:' + userBg + ';' +
            '--ds-user-text:' + userText + ';' +
            '--ds-shadow-ai:' + shadowAi + ';' +
            '--ds-shadow-user:' + shadowUser + ';' +
            '--ds-border:' + border + ';' +
            '--ds-code-bg:' + codeBg + ';' +
            '--ds-ai-blur:' + aiBlur + ';' +
            '--ds-user-blur:' + userBlur + ';' +
            '}';
    }

    // ============================================================
    //  PART 3: CSS 注入
    // ============================================================
    GM_addStyle(
        '._0fcaa63{display:none!important}\n' +
        '/* === 默认气泡变量(会被JS动态覆盖) === */\n' +
        ':root{--ds-ai-bg:#FFFFFF;--ds-ai-text:#1C1C1E;--ds-user-bg:#007AFF;--ds-user-text:#FFFFFF;--ds-shadow-ai:0 1px 6px rgba(0,0,0,0.05);--ds-shadow-user:0 3px 10px rgba(0,122,255,0.22);--ds-border:rgba(0,0,0,0.05);--ds-code-bg:#1C1C1E;--ds-ai-blur:none;--ds-user-blur:none}\n' +
        '/* === AI气泡 === */\n' +
        '.ds-ai-styled{background:var(--ds-ai-bg)!important;color:var(--ds-ai-text)!important;border-radius:20px!important;border-bottom-left-radius:6px!important;padding:14px 18px!important;box-shadow:var(--ds-shadow-ai)!important;border:1px solid var(--ds-border)!important;margin-bottom:10px!important;transition:transform 0.2s ease,box-shadow 0.2s ease!important}\n' +
        '.ds-ai-styled:hover{transform:translateY(-1px)!important}\n' +
        '.ds-ai-styled hr{display:none!important}\n' +
        '.ds-ai-styled pre,.ds-user-styled pre{background:var(--ds-code-bg)!important;border-radius:12px!important;margin:10px 0!important}\n' +
        '.ds-ai-styled blockquote{border-left:3px solid #007AFF!important;background:rgba(0,122,255,0.05)!important;padding:8px 14px!important;border-radius:0 10px 10px 0!important;margin:8px 0!important}\n' +
        '/* === 用户气泡 === */\n' +
        '.ds-user-styled{background:var(--ds-user-bg)!important;color:var(--ds-user-text)!important;border-radius:20px!important;border-bottom-right-radius:6px!important;padding:14px 18px!important;box-shadow:var(--ds-shadow-user)!important;border:none!important;outline:none!important;transition:transform 0.2s ease,box-shadow 0.2s ease!important}\n' +
        '.ds-user-styled:hover{transform:translateY(-1px)!important}\n' +
        '.ds-user-styled pre{background:rgba(0,0,0,0.2)!important}\n' +
        '/* === 弹出动画 === */\n' +
        '@keyframes dsBubblePop{0%{opacity:0;transform:translateY(30px) scale(0.9)}50%{transform:translateY(-5px) scale(1.02)}100%{opacity:1;transform:translateY(0) scale(1)}}\n' +
        '.ds-bubble-pop{animation:dsBubblePop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards!important;opacity:0}\n' +
        '/* === 毛玻璃预设 - blur(20px) saturate(180%) === */\n' +
        'body.ds-bubble-frosted .ds-ai-styled{backdrop-filter:var(--ds-ai-blur)!important;-webkit-backdrop-filter:var(--ds-ai-blur)!important;border-radius:20px!important;border-bottom-left-radius:6px!important;border:1px solid var(--ds-border)!important;box-shadow:var(--ds-shadow-ai)!important}\n' +
        'body.ds-bubble-frosted .ds-user-styled{backdrop-filter:var(--ds-user-blur)!important;-webkit-backdrop-filter:var(--ds-user-blur)!important}\n' +
        '/* === 水玻璃预设 - blur(10px) + SVG滤镜 === */\n' +
        'body.ds-bubble-water .ds-ai-styled{backdrop-filter:var(--ds-ai-blur)!important;-webkit-backdrop-filter:var(--ds-ai-blur)!important;filter:url(#ds-water-glass)!important;border-radius:20px!important;border-bottom-left-radius:6px!important;border:1px solid var(--ds-border)!important;box-shadow:var(--ds-shadow-ai)!important}\n' +
        'body.ds-bubble-water .ds-user-styled{backdrop-filter:var(--ds-user-blur)!important;-webkit-backdrop-filter:var(--ds-user-blur)!important;filter:url(#ds-water-glass)!important}\n' +
        '/* === 背景层 === */\n' +
        '#ds-bg-layer{display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;background-size:cover;background-position:center;background-repeat:no-repeat;background-attachment:fixed;filter:blur(var(--ds-bg-blur,0px));-webkit-filter:blur(var(--ds-bg-blur,0px));transform:scale(1.1);-webkit-transform:scale(1.1);transform-origin:center center;-webkit-transform-origin:center center}\n' +
        '#ds-bg-layer.ds-bg-active{display:block}\n' +
        '#ds-bg-overlay{display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:-1;pointer-events:none}\n' +
        '#ds-bg-overlay.ds-bg-active{display:block}\n' +
        'body.light #ds-bg-overlay{background:rgba(255,255,255,var(--ds-bg-opacity,0.15))}\n' +
        'body.dark #ds-bg-overlay{background:rgba(0,0,0,var(--ds-bg-opacity,0.15))}\n' +
        'body.ds-has-bg ._2bd7b35{background-color:transparent!important}\n' +
        'body.ds-has-bg ._765a5cd{background-color:transparent!important}\n' +
        'body.ds-has-bg ._9663006{background-color:transparent!important;border:none!important;outline:none!important}\n' +
        '._9663006{border:none!important;outline:none!important}\n' +
        '/* === 操作按钮 === */\n' +
        '.ds-action-btn{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:30px!important;height:30px!important;border-radius:50%!important;border:1px solid rgba(0,0,0,0.06)!important;background:rgba(255,255,255,0.5)!important;cursor:pointer!important;font-size:14px!important;transition:all 0.2s ease!important;flex-shrink:0!important;color:#666!important;margin-right:2px!important;padding:0!important;line-height:1!important}\n' +
        'body.dark .ds-action-btn{background:rgba(58,58,60,0.5)!important;border-color:rgba(255,255,255,0.08)!important;color:#bbb!important}\n' +
        '.ds-action-btn:hover{background:rgba(0,122,255,0.1)!important;border-color:rgba(0,122,255,0.25)!important;color:#007AFF!important;transform:scale(1.08)!important}\n' +
        'body.dark .ds-action-btn:hover{background:rgba(10,132,255,0.15)!important;border-color:rgba(10,132,255,0.3)!important;color:#0A84FF!important}\n' +
        '.ds-action-btn.ds-active{background:rgba(0,122,255,0.1)!important;border-color:rgba(0,122,255,0.3)!important;color:#007AFF!important}\n' +
        'body.dark .ds-action-btn.ds-active{background:rgba(10,132,255,0.18)!important;border-color:rgba(10,132,255,0.4)!important;color:#0A84FF!important}\n' +
        '/* === 消息导航按钮 (仅上下两个，滚动时显示，按钮分离) === */\n' +
        '#ds-nav-bar{position:fixed;right:14px;top:50%;transform:translateY(-50%) scale(0.85);z-index:9998;display:flex;flex-direction:column;gap:28px;opacity:0;pointer-events:none;transition:opacity 0.35s ease,transform 0.35s ease}\n' +
        '#ds-nav-bar.ds-nav-visible{opacity:1;pointer-events:auto;transform:translateY(-50%) scale(1)}\n' +
        '#ds-nav-up,#ds-nav-down{width:36px;height:36px;border-radius:50%;border:none;background:rgba(255,255,255,0.95);cursor:pointer;font-size:14px;color:#666;display:flex;align-items:center;justify-content:center;transition:all 0.18s;padding:0;line-height:1;box-shadow:0 3px 14px rgba(0,0,0,0.2)}\n' +
        'body.dark #ds-nav-up,body.dark #ds-nav-down{background:rgba(44,44,46,0.95);color:#bbb;box-shadow:0 3px 14px rgba(0,0,0,0.5)}\n' +
        '#ds-nav-up:hover,#ds-nav-down:hover{background:rgba(0,122,255,0.15);color:#007AFF;transform:scale(1.15)}\n' +
        'body.dark #ds-nav-up:hover,body.dark #ds-nav-down:hover{background:rgba(10,132,255,0.25);color:#0A84FF}\n' +
        '#ds-nav-up:active,#ds-nav-down:active{transform:scale(0.92)}\n' +
        '/* === 消息高亮 === */\n' +
        '@keyframes dsHighlight{0%{box-shadow:0 0 0 4px rgba(0,122,255,0.4)}100%{box-shadow:0 0 0 0px rgba(0,122,255,0)}}\n' +
        '.ds-highlight{animation:dsHighlight 1.5s ease-out!important}\n' +
        '/* === 统一设置面板 === */\n' +
        '#ds-unified-panel{display:none;position:fixed;z-index:99999;background:rgba(255,255,255,0.97);border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.15);border:1px solid rgba(0,0,0,0.08);width:320px;max-width:calc(100vw - 32px);font-size:13px;color:#333;overflow:hidden;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}\n' +
        'body.dark #ds-unified-panel{background:rgba(44,44,46,0.97);color:#e5e5e5;border-color:rgba(255,255,255,0.1);box-shadow:0 8px 32px rgba(0,0,0,0.5)}\n' +
        '#ds-unified-panel.ds-show{display:block!important}\n' +
        '/* === 面板标签栏 === */\n' +
        '.ds-panel-tabs{display:flex;border-bottom:1px solid rgba(0,0,0,0.06);padding:4px 8px 0;gap:2px}\n' +
        'body.dark .ds-panel-tabs{border-bottom-color:rgba(255,255,255,0.08)}\n' +
        '.ds-panel-tab{flex:1;padding:10px 4px;border:none;background:transparent;cursor:pointer;font-size:12px;font-weight:500;color:#999;border-radius:8px 8px 0 0;transition:all 0.2s;position:relative;white-space:nowrap}\n' +
        'body.dark .ds-panel-tab{color:#888}\n' +
        '.ds-panel-tab:hover{color:#333;background:rgba(0,0,0,0.03)}\n' +
        'body.dark .ds-panel-tab:hover{color:#ddd;background:rgba(255,255,255,0.04)}\n' +
        '.ds-panel-tab.ds-panel-tab-active{color:#007AFF;background:rgba(0,122,255,0.06)}\n' +
        'body.dark .ds-panel-tab.ds-panel-tab-active{color:#0A84FF;background:rgba(10,132,255,0.12)}\n' +
        '.ds-panel-tab.ds-panel-tab-active::after{content:"";position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:24px;height:3px;border-radius:2px;background:#007AFF}\n' +
        'body.dark .ds-panel-tab.ds-panel-tab-active::after{background:#0A84FF}\n' +
        '/* === 面板内容区 === */\n' +
        '.ds-panel-content{display:none;padding:16px}\n' +
        '.ds-panel-content.ds-panel-visible{display:block;max-height:calc(100vh - 140px);overflow-y:auto;-webkit-overflow-scrolling:touch}\n' +
        '/* === 面板通用元素 === */\n' +
        '#ds-unified-panel .ds-panel-title{font-weight:600;margin-bottom:14px;font-size:14px;display:flex;align-items:center;gap:6px}\n' +
        '#ds-unified-panel label{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;font-size:12px;color:#888}\n' +
        'body.dark #ds-unified-panel label{color:#999}\n' +
        '#ds-unified-panel input[type="range"]{width:100%;margin:2px 0 12px;accent-color:#007AFF;height:4px;cursor:pointer}\n' +
        '#ds-unified-panel .ds-panel-row{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}\n' +
        '#ds-unified-panel .ds-panel-btn{flex:1;min-width:80px;padding:10px 12px;border-radius:10px;border:none;cursor:pointer;font-size:12px;font-weight:500;transition:all 0.2s;text-align:center}\n' +
        '.ds-panel-btn-primary{background:#007AFF;color:#fff}\n' +
        '.ds-panel-btn-primary:hover{background:#0066d6}\n' +
        '.ds-panel-btn-danger{background:rgba(255,60,60,0.1);color:#e00}\n' +
        '.ds-panel-btn-danger:hover{background:rgba(255,60,60,0.2)}\n' +
        '.ds-panel-btn-secondary{background:rgba(0,0,0,0.06);color:#555}\n' +
        'body.dark .ds-panel-btn-secondary{background:rgba(255,255,255,0.08);color:#ccc}\n' +
        '#ds-unified-panel .ds-panel-val{font-weight:600;color:#007AFF;font-size:12px}\n' +
        '/* === 主题卡片 === */\n' +
        '.ds-theme-cards{display:flex;flex-direction:column;gap:8px}\n' +
        '.ds-theme-card{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:2px solid rgba(0,0,0,0.06);cursor:pointer;transition:all 0.2s;background:rgba(0,0,0,0.01)}\n' +
        'body.dark .ds-theme-card{background:rgba(255,255,255,0.02);border-color:rgba(255,255,255,0.08)}\n' +
        '.ds-theme-card:hover{border-color:rgba(0,122,255,0.3);background:rgba(0,122,255,0.03)}\n' +
        'body.dark .ds-theme-card:hover{border-color:rgba(10,132,255,0.3);background:rgba(10,132,255,0.05)}\n' +
        '.ds-theme-card.ds-theme-selected{border-color:#007AFF!important;background:rgba(0,122,255,0.06)!important}\n' +
        'body.dark .ds-theme-card.ds-theme-selected{border-color:#0A84FF!important;background:rgba(10,132,255,0.12)!important}\n' +
        '.ds-theme-swatch{width:28px;height:28px;border-radius:8px;flex-shrink:0;display:flex;overflow:hidden;border:1px solid rgba(0,0,0,0.08)}\n' +
        'body.dark .ds-theme-swatch{border-color:rgba(255,255,255,0.1)}\n' +
        '.ds-theme-swatch-dark,.ds-theme-swatch-light{width:50%;height:100%}\n' +
        '.ds-theme-card-info{flex:1;min-width:0}\n' +
        '.ds-theme-card-name{font-size:13px;font-weight:600;color:#333}\n' +
        'body.dark .ds-theme-card-name{color:#e5e5e5}\n' +
        '.ds-theme-card-desc{font-size:11px;color:#999;margin-top:1px}\n' +
        'body.dark .ds-theme-card-desc{color:#888}\n' +
        '/* === 气泡预设卡片 === */\n' +
        '.ds-bubble-cards{display:flex;flex-direction:column;gap:8px}\n' +
        '.ds-bubble-card{display:flex;align-items:center;gap:10px;padding:12px;border-radius:10px;border:2px solid rgba(0,0,0,0.06);cursor:pointer;transition:all 0.2s;background:rgba(0,0,0,0.01)}\n' +
        'body.dark .ds-bubble-card{background:rgba(255,255,255,0.02);border-color:rgba(255,255,255,0.08)}\n' +
        '.ds-bubble-card:hover{border-color:rgba(0,122,255,0.3);background:rgba(0,122,255,0.03)}\n' +
        'body.dark .ds-bubble-card:hover{border-color:rgba(10,132,255,0.3);background:rgba(10,132,255,0.05)}\n' +
        '.ds-bubble-card.ds-bubble-selected{border-color:#007AFF!important;background:rgba(0,122,255,0.06)!important}\n' +
        'body.dark .ds-bubble-card.ds-bubble-selected{border-color:#0A84FF!important;background:rgba(10,132,255,0.12)!important}\n' +
        '.ds-bubble-preview{width:48px;height:32px;border-radius:8px;flex-shrink:0;border:1px solid rgba(0,0,0,0.1);overflow:hidden}\n' +
        'body.dark .ds-bubble-preview{border-color:rgba(255,255,255,0.1)}\n' +
        '.ds-bubble-card-info{flex:1}\n' +
        '.ds-bubble-card-name{font-size:13px;font-weight:600;color:#333}\n' +
        'body.dark .ds-bubble-card-name{color:#e5e5e5}\n' +
        '.ds-bubble-card-desc{font-size:11px;color:#999;margin-top:1px}\n' +
        'body.dark .ds-bubble-card-desc{color:#888}\n' +
        '/* === 主题模式分段控件 === */\n' +
        '.ds-mode-segmented{display:flex;margin-bottom:14px;background:rgba(0,0,0,0.04);border-radius:10px;padding:3px;gap:2px}\n' +
        'body.dark .ds-mode-segmented{background:rgba(255,255,255,0.06)}\n' +
        '.ds-mode-segment{flex:1;padding:8px 10px;border:none;background:transparent;border-radius:8px;cursor:pointer;font-size:12px;font-weight:500;color:#888;transition:all 0.2s;text-align:center}\n' +
        'body.dark .ds-mode-segment{color:#999}\n' +
        '.ds-mode-segment:hover{color:#333}\n' +
        'body.dark .ds-mode-segment:hover{color:#ddd}\n' +
        '.ds-mode-segment.ds-mode-active{background:#fff;color:#007AFF;box-shadow:0 1px 3px rgba(0,0,0,0.08);font-weight:600}\n' +
        'body.dark .ds-mode-segment.ds-mode-active{background:rgba(44,44,46,0.9);color:#0A84FF;box-shadow:0 1px 3px rgba(0,0,0,0.3)}\n' +
        '/* === 缩放预设按钮 === */\n' +
        '.ds-zoom-preset{flex:1!important;min-width:36px!important;padding:6px 2px!important;border-radius:8px!important;border:1px solid rgba(0,0,0,0.1)!important;background:rgba(0,0,0,0.03)!important;cursor:pointer!important;font-size:10px!important;font-weight:600!important;transition:all 0.15s!important;color:#555!important;text-align:center!important}\n' +
        'body.dark .ds-zoom-preset{background:rgba(255,255,255,0.05)!important;border-color:rgba(255,255,255,0.1)!important;color:#ccc!important}\n' +
        '.ds-zoom-preset:hover{background:rgba(0,122,255,0.1)!important;border-color:rgba(0,122,255,0.3)!important;color:#007AFF!important}\n' +
        '.ds-zoom-preset.ds-zoom-active{background:rgba(0,122,255,0.15)!important;border-color:rgba(0,122,255,0.4)!important;color:#007AFF!important}\n' +
        '/* === 隐私模式开关 === */\n' +
        '.ds-toggle-row{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:10px 0!important;border-bottom:1px solid rgba(0,0,0,0.06)!important}\n' +
        'body.dark .ds-toggle-row{border-bottom-color:rgba(255,255,255,0.08)!important}\n' +
        '.ds-toggle-label{font-size:13px;font-weight:500;color:#333}\n' +
        'body.dark .ds-toggle-label{color:#e5e5e5}\n' +
        '.ds-toggle-desc{font-size:11px;color:#999;margin-top:2px}\n' +
        'body.dark .ds-toggle-desc{color:#888}\n' +
        '.ds-switch{position:relative;width:42px;height:24px;border-radius:12px;background:rgba(0,0,0,0.15);cursor:pointer;transition:background 0.2s;flex-shrink:0}\n' +
        'body.dark .ds-switch{background:rgba(255,255,255,0.15)}\n' +
        '.ds-switch.ds-switch-on{background:#007AFF}\n' +
        'body.dark .ds-switch.ds-switch-on{background:#0A84FF}\n' +
        '.ds-switch::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2)}\n' +
        '.ds-switch.ds-switch-on::after{transform:translateX(18px)}\n' +
        '.ds-privacy-info{margin-top:10px;padding:10px 12px;border-radius:8px;background:rgba(255,180,0,0.08);border:1px solid rgba(255,180,0,0.2);font-size:11px;color:#996600;line-height:1.5}\n' +
        'body.dark .ds-privacy-info{background:rgba(255,180,0,0.1);border-color:rgba(255,180,0,0.25);color:#ccaa44}\n' +
        '.ds-privacy-mode-seg{display:flex;margin:8px 0;background:rgba(0,0,0,0.04);border-radius:10px;padding:3px;gap:2px}\n' +
        'body.dark .ds-privacy-mode-seg{background:rgba(255,255,255,0.06)}\n' +
        '.ds-privacy-mode-btn{flex:1;padding:8px 6px;border:none;background:transparent;border-radius:8px;cursor:pointer;font-size:11px;font-weight:500;color:#888;transition:all 0.2s;text-align:center}\n' +
        'body.dark .ds-privacy-mode-btn{color:#999}\n' +
        '.ds-privacy-mode-btn.ds-privacy-active{background:#fff;color:#007AFF;box-shadow:0 1px 3px rgba(0,0,0,0.08);font-weight:600}\n' +
        'body.dark .ds-privacy-mode-btn.ds-privacy-active{background:rgba(44,44,46,0.9);color:#0A84FF;box-shadow:0 1px 3px rgba(0,0,0,0.3)}\n' +
        '/* === Mermaid 渲染按钮 === */\n' +
        '.ds-mm-btn{display:inline-flex!important;align-items:center!important;padding:3px 10px!important;margin:4px 0!important;cursor:pointer!important;font-size:12px!important;color:#fff!important;border:none!important;border-radius:5px!important;background:linear-gradient(135deg,#007AFF,#5856D6)!important;font-weight:500!important;transition:all .2s!important}\n' +
        '.ds-mm-btn:hover{transform:translateY(-1px)!important;box-shadow:0 3px 12px rgba(0,122,255,.3)!important}\n' +
        '/* === Mermaid 弹窗 === */\n' +
        '.ds-mm-overlay{position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;z-index:999999!important;background:rgba(0,0,0,.55)!important;display:flex!important;align-items:center!important;justify-content:center!important;animation:dsMmFadeIn .2s ease!important}\n' +
        '@keyframes dsMmFadeIn{from{opacity:0}to{opacity:1}}\n' +
        '.ds-mm-win{position:relative!important;width:92vw!important;max-width:960px!important;height:88vh!important;max-height:88vh!important;background:#fff!important;border-radius:14px!important;box-shadow:0 24px 80px rgba(0,0,0,.35)!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;animation:dsMmWinIn .3s cubic-bezier(.34,1.56,.64,1)!important}\n' +
        '@keyframes dsMmWinIn{from{opacity:0;transform:translateY(30px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}\n' +
        'body.dark .ds-mm-win{background:#1c1c1e!important}\n' +
        '.ds-mm-hdr{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:14px 20px!important;border-bottom:1px solid rgba(0,0,0,.08)!important;flex-shrink:0!important}\n' +
        'body.dark .ds-mm-hdr{border-bottom-color:rgba(255,255,255,.08)!important}\n' +
        '.ds-mm-title{font-size:16px!important;font-weight:600!important;color:#1c1c1e!important}\n' +
        'body.dark .ds-mm-title{color:#e5e5e5!important}\n' +
        '.ds-mm-close{width:34px!important;height:34px!important;border:none!important;background:rgba(0,0,0,.06)!important;border-radius:50%!important;cursor:pointer!important;font-size:18px!important;color:#666!important;display:flex!important;align-items:center!important;justify-content:center!important;flex-shrink:0!important}\n' +
        'body.dark .ds-mm-close{background:rgba(255,255,255,.1)!important;color:#aaa!important}\n' +
        '.ds-mm-close:hover{background:rgba(255,60,60,.15)!important;color:#e00!important}\n' +
        '.ds-mm-body{flex:1!important;overflow:auto!important;padding:16px!important;display:flex!important;align-items:flex-start!important;justify-content:center!important;-webkit-overflow-scrolling:touch!important;background:#fafafa!important}\n' +
        'body.dark .ds-mm-body{background:#111!important}\n' +
        '.ds-mm-body svg{max-width:100%!important;height:auto!important;transition:transform .25s ease!important}\n' +
        '.ds-mm-body .ds-mm-error{color:#e00!important;padding:20px!important;text-align:center!important;font-size:14px!important;white-space:pre-wrap!important}\n' +
        '.ds-mm-ftr{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:8px!important;padding:12px 20px!important;border-top:1px solid rgba(0,0,0,.08)!important;flex-shrink:0!important}\n' +
        'body.dark .ds-mm-ftr{border-top-color:rgba(255,255,255,.08)!important}\n' +
        '.ds-mm-fbtn{padding:7px 16px!important;border:1px solid rgba(0,0,0,.15)!important;border-radius:8px!important;background:#fff!important;cursor:pointer!important;font-size:13px!important;color:#333!important}\n' +
        'body.dark .ds-mm-fbtn{background:#2c2c2e!important;color:#e5e5e5!important;border-color:rgba(255,255,255,.15)!important}\n' +
        '.ds-mm-fbtn:hover{background:rgba(0,122,255,.08)!important;border-color:#007AFF!important}\n' +
        '.ds-mm-fbtn.primary{background:#007AFF!important;color:#fff!important;border-color:#007AFF!important}\n' +
        '.ds-mm-zoomlbl{font-size:12px!important;color:#999!important;padding:0 8px!important;min-width:40px!important;text-align:center!important}\n'
    );

    // ============================================================
    //  PART 4: SVG 滤镜注入
    // ============================================================
    function ensureSVGFilters() {
        if (document.getElementById('ds-svg-filters')) return;
        var svgNS = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('id', 'ds-svg-filters');
        svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
        svg.setAttribute('aria-hidden', 'true');
        var defs = document.createElementNS(svgNS, 'defs');
        var filter = document.createElementNS(svgNS, 'filter');
        filter.setAttribute('id', 'ds-water-glass');
        var turb = document.createElementNS(svgNS, 'feTurbulence');
        turb.setAttribute('type', 'fractalNoise');
        turb.setAttribute('baseFrequency', '0.015');
        turb.setAttribute('numOctaves', '3');
        turb.setAttribute('seed', '2');
        turb.setAttribute('result', 'noise');
        var disp = document.createElementNS(svgNS, 'feDisplacementMap');
        disp.setAttribute('in', 'SourceGraphic');
        disp.setAttribute('in2', 'noise');
        disp.setAttribute('scale', '5');
        disp.setAttribute('xChannelSelector', 'R');
        disp.setAttribute('yChannelSelector', 'G');
        filter.appendChild(turb);
        filter.appendChild(disp);
        defs.appendChild(filter);
        svg.appendChild(defs);
        document.body.insertBefore(svg, document.body.firstChild);
    }

    // ============================================================
    //  PART 5: 背景系统
    // ============================================================
    function ensureBgLayers() {
        if (!document.getElementById('ds-bg-layer')) {
            var layer = document.createElement('div');
            layer.id = 'ds-bg-layer';
            document.body.insertBefore(layer, document.body.firstChild);
        }
        if (!document.getElementById('ds-bg-overlay')) {
            var overlay = document.createElement('div');
            overlay.id = 'ds-bg-overlay';
            document.body.insertBefore(overlay, document.body.firstChild);
        }
    }

    function applyBg(dataUrl) {
        ensureBgLayers();
        var layer = document.getElementById('ds-bg-layer');
        var overlay = document.getElementById('ds-bg-overlay');
        var blur = getBlur();
        var op = getOp();

        if (dataUrl) {
            layer.style.backgroundImage = 'url(' + dataUrl + ')';
            layer.style.setProperty('--ds-bg-blur', blur + 'px');
            layer.classList.add('ds-bg-active');
            if (overlay) {
                overlay.style.setProperty('--ds-bg-opacity', (op / 100).toString());
                overlay.classList.add('ds-bg-active');
            }
            document.body.classList.add('ds-has-bg');
        } else {
            layer.style.backgroundImage = '';
            layer.classList.remove('ds-bg-active');
            if (overlay) overlay.classList.remove('ds-bg-active');
            document.body.classList.remove('ds-has-bg');
        }
    }

    function updateBgSettings() {
        if (!getBg()) return;
        var layer = document.getElementById('ds-bg-layer');
        var overlay = document.getElementById('ds-bg-overlay');
        if (layer) layer.style.setProperty('--ds-bg-blur', getBlur() + 'px');
        if (overlay) overlay.style.setProperty('--ds-bg-opacity', (getOp() / 100).toString());
    }

    function pickAndUploadBg() {
        var current = getBg();
        if (current) {
            if (!confirm('已有背景，是否更换？\n确定=更换  取消=不换')) return;
        }
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
        inp.addEventListener('change', function() {
            var file = inp.files[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) { toast('图片不能超过5MB'); return; }
            var reader = new FileReader();
            reader.onload = function(ev) {
                setBg(ev.target.result);
                applyBg(ev.target.result);
                toast('背景设置成功');
                var rmBtn = document.getElementById('ds-bg-remove-btn');
                if (rmBtn) rmBtn.style.display = '';
            };
            reader.readAsDataURL(file);
            setTimeout(function(){ inp.remove(); }, 100);
        });
        document.body.appendChild(inp);
        inp.click();
    }

    // ============================================================
    //  PART 6: 一键全屏 (独立按钮)
    // ============================================================
    function toggleFullscreen() {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            document.documentElement.requestFullscreen().catch(function(){});
        }
    }

    // ============================================================
    //  PART 7: 缩放系统 (v3.6 backport)
    // ============================================================
    var _zoomPaused = false;
    var _savedZoom = 100;

    function applyZoom(val) {
        if (_zoomPaused) return;
        _savedZoom = val;
        document.documentElement.style.zoom = val === 100 ? '' : (val / 100).toString();
        updateZoomPresets(val);
    }

    function pauseZoom() {
        if (_zoomPaused) return;
        _zoomPaused = true;
        document.documentElement.style.zoom = '';
    }

    function resumeZoom() {
        if (!_zoomPaused) return;
        _zoomPaused = false;
        document.documentElement.style.zoom = _savedZoom === 100 ? '' : (_savedZoom / 100).toString();
    }

    function updateZoomPresets(val) {
        var ps = document.querySelectorAll('.ds-zoom-preset');
        for (var i = 0; i < ps.length; i++) {
            if (parseInt(ps[i].getAttribute('data-zoom-val')) === val) ps[i].classList.add('ds-zoom-active');
            else ps[i].classList.remove('ds-zoom-active');
        }
    }

    function initZoomModalWatcher() {
        var _modalFound = false;
        var _lastCheck = 0;

        function check() {
            var now = Date.now();
            if (now - _lastCheck < 180) return;
            _lastCheck = now;

            var found = false;
            var all = document.body.querySelectorAll('*');
            for (var i = 0; i < all.length; i++) {
                var c = all[i];
                if (c.classList.contains('ds-mm-overlay')) continue;
                if (c.classList.contains('ds-mm-overlay')) continue;
                if (c.id === 'ds-unified-panel') continue;
                if (c.id === 'ds-toast') continue;
                if (c.id === 'ds-bg-layer' || c.id === 'ds-bg-overlay') continue;
                if (c.offsetWidth === 0 || c.offsetHeight === 0) continue;

                try {
                    var cs = window.getComputedStyle(c);
                    var isFixed = cs.position === 'fixed';
                    var zi = parseInt(cs.zIndex) || 0;
                    var hasDialog = c.getAttribute('role') === 'dialog' || c.getAttribute('aria-modal') === 'true';
                    var hasModalClass = (c.className && typeof c.className === 'string' &&
                        (c.className.indexOf('modal') !== -1 || c.className.indexOf('overlay') !== -1 ||
                         c.className.indexOf('dialog') !== -1 || c.className.indexOf('preview') !== -1));

                    var coversScreen = c.offsetWidth >= window.innerWidth * 0.45 && c.offsetHeight >= window.innerHeight * 0.45;
                    if (coversScreen && (isFixed || zi >= 999 || hasDialog || hasModalClass)) {
                        found = true;
                        break;
                    }
                } catch(e) {}
            }

            if (found && !_modalFound) {
                _modalFound = true;
                pauseZoom();
            } else if (!found && _modalFound) {
                _modalFound = false;
                resumeZoom();
            }
        }

        setInterval(check, 200);
        function rafCheck() {
            check();
            requestAnimationFrame(function() {
                setTimeout(rafCheck, 200);
            });
        }
        setTimeout(rafCheck, 100);
        check();
    }

    // ============================================================
    //  PART 8: 气泡分割 (含 isInInputArea 守卫)
    // ============================================================
    var SEL = {
        userMsg: '._9663006',
        userBubble: '.fbb737a4',
        thinking: '.e1675d8b',
        aiMarkdown: 'div.ds-markdown'
    };
    var processedMessages = new WeakSet();
    var messageLastChange = new Map();
    var messageSnapshot = new Map();
    var pendingSplits = new Map();
    var BUBBLE_DELAY = 400;
    var STABLE_THRESHOLD = 800;

    // v3.6: 输入区守卫 - 防止气泡样式污染输入框
    function isInInputArea(el) {
        try {
            if (el.closest('textarea')) return true;
            if (el.closest('[contenteditable="true"]')) return true;
            if (el.closest('[role="textbox"]')) return true;
            var parent = el;
            while (parent && parent !== document.body) {
                var cn = parent.className || '';
                if (typeof cn === 'string') {
                    if (cn.indexOf('chat-input') !== -1) return true;
                    if (cn.indexOf('composer') !== -1) return true;
                    if (cn.indexOf('input-area') !== -1) return true;
                    if (cn.indexOf('inputarea') !== -1) return true;
                    if (cn.indexOf('textarea') !== -1) return true;
                    if (cn.indexOf('prompt') !== -1) return true;
                    if (cn.indexOf('editor') !== -1) return true;
                }
                parent = parent.parentElement;
            }
        } catch(e) {}
        return false;
    }

    function getMessageId(el) {
        var text = el.textContent.slice(0, 100);
        var hash = 0;
        for (var i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString(36);
    }

    function styleUserBubbles() {
        try {
            document.querySelectorAll(SEL.userBubble).forEach(function(el) {
                if (isInInputArea(el)) return;
                if (!el.classList.contains('ds-user-styled')) el.classList.add('ds-user-styled');
            });
        } catch(e) {}
    }

    function isStillStreaming(el) {
        try {
            if (el.querySelector('.ds-loading-dots, .loading, [class*="loading"]')) return true;
            var content = el.innerHTML;
            var msgId = getMessageId(el);
            var now = Date.now();
            var lastContent = messageSnapshot.get(msgId);
            var lastTime = messageLastChange.get(msgId) || 0;
            if (content !== lastContent) {
                messageSnapshot.set(msgId, content);
                messageLastChange.set(msgId, now);
                return true;
            }
            return (now - lastTime) < STABLE_THRESHOLD;
        } catch(e) { return false; }
    }

    function hasHrSeparator(el) { return el.querySelector('hr') !== null; }

    function popBubblesSequentially(bubbles, parent, originalEl) {
        bubbles.forEach(function(b) { b.classList.add('ds-bubble-pop'); b.style.opacity = '0'; });
        bubbles.forEach(function(b) { parent.insertBefore(b, originalEl); });
        originalEl.remove();
        (function animate(i) {
            if (i >= bubbles.length) return;
            bubbles[i].style.opacity = '';
            setTimeout(function(){ animate(i + 1); }, BUBBLE_DELAY);
        })(0);
    }

    function collectFragmentsFromNodes(nodes) {
        var fragments = [];
        var current = [];
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            if (node.nodeType === 1 && node.nodeName === 'HR') {
                if (current.length > 0) { fragments.push(current); current = []; }
            } else if (node.nodeType === 1 && node.nodeName === 'DIV') {
                var divHrs = node.querySelectorAll(':scope > hr');
                if (divHrs.length > 0) {
                    var divChildren = Array.from(node.childNodes);
                    for (var j = 0; j < divChildren.length; j++) {
                        var child = divChildren[j];
                        if (child.nodeType === 1 && child.nodeName === 'HR') {
                            if (current.length > 0) { fragments.push(current); current = []; }
                        } else { current.push(child); }
                    }
                } else { current.push(node); }
            } else { current.push(node); }
        }
        if (current.length > 0) fragments.push(current);
        return fragments;
    }

    function splitAiMessageWithAnimation(markdownEl) {
        var parent = markdownEl.parentNode;
        if (!parent) return;
        var allNodes = Array.from(markdownEl.childNodes);
        var fragments = collectFragmentsFromNodes(allNodes);
        if (fragments.length <= 1) {
            markdownEl.classList.add('ds-ai-styled');
            processedMessages.add(markdownEl);
            return;
        }
        var bubbles = fragments.map(function(fragNodes) {
            var bubble = document.createElement('div');
            bubble.className = 'ds-ai-styled ds-bubble-pop';
            bubble.setAttribute('data-ds-bubble', 'true');
            fragNodes.forEach(function(n) { bubble.appendChild(n); });
            return bubble;
        });
        processedMessages.add(markdownEl);
        popBubblesSequentially(bubbles, parent, markdownEl);
    }

    function processAiMessage(markdownEl) {
        if (markdownEl.getAttribute('data-ds-bubble') === 'true') return;
        if (isInInputArea(markdownEl)) return;
        var thinkingEl = document.querySelector(SEL.thinking);
        if (thinkingEl && thinkingEl.contains(markdownEl)) return;
        if (markdownEl.closest(SEL.userMsg)) return;
        if (processedMessages.has(markdownEl)) return;

        if (isStillStreaming(markdownEl)) {
            if (!markdownEl.classList.contains('ds-ai-styled')) markdownEl.classList.add('ds-ai-styled');
            return;
        }
        if (!hasHrSeparator(markdownEl)) {
            if (!markdownEl.classList.contains('ds-ai-styled')) markdownEl.classList.add('ds-ai-styled');
            processedMessages.add(markdownEl);
            return;
        }
        var msgId = getMessageId(markdownEl);
        if (pendingSplits.has(msgId)) return;
        pendingSplits.set(msgId, true);
        splitAiMessageWithAnimation(markdownEl);
    }

    function processAllMessages() {
        try {
            var thinkingEl = document.querySelector(SEL.thinking);
            document.querySelectorAll(SEL.aiMarkdown).forEach(function(md) {
                if (thinkingEl && thinkingEl.contains(md)) return;
                if (md.closest(SEL.userMsg)) return;
                if (isInInputArea(md)) return;
                processAiMessage(md);
            });
        } catch(e) {}
    }

    // ============================================================
    //  PART 9: 防撤回 (v3.6 SSE流支持)
    // ============================================================
    (function() {
        var TEMPLATE_RESPONSE = "TEMPLATE_RESPONSE";
        var CONTENT_FILTER = "CONTENT_FILTER";
        var RECALL_TIP = "⚠️ 此回复已被撤回，以下为本地缓存内容";
        var RECALL_NOT_FOUND = "⛔ 此回复已被撤回，本地缓存中未找到";

        // === 时间注入 常量 ===
        var TIME_PREFIX = '[当前时间: ';

        function extractResponseContent(fragments) {
            if (!fragments || !Array.isArray(fragments)) return '';
            var content = '';
            for (var i = 0; i < fragments.length; i++) {
                if (fragments[i].type === 'RESPONSE' && fragments[i].content) {
                    content += fragments[i].content;
                }
            }
            return content;
        }

        function formatTime(d) {
            var days = ['日','一','二','三','四','五','六'];
            var y = d.getFullYear();
            var mo = d.getMonth() + 1;
            var da = d.getDate();
            var h = String(d.getHours()).padStart(2, '0');
            var mi = String(d.getMinutes()).padStart(2, '0');
            return y + '年' + mo + '月' + da + '日 ' + h + ':' + mi + ' 星期' + days[d.getDay()];
        }

        // cleanInjectedHistory removed - normal flow no longer injects history

        function _getKey(sid, mid) { return "ds_recall_" + (sid||"") + "_" + (mid||""); }
        function saveRecalledMessage(sid, mid, frags) {
            try { localStorage.setItem(_getKey(sid, mid), JSON.stringify(frags)); } catch(e) {}
        }
        function getRecalledMessage(sid, mid) {
            try {
                var raw = localStorage.getItem(_getKey(sid, mid));
                if (raw) {
                    var frags = JSON.parse(raw);
                    frags.push({"id": frags.length + 1, "type": "TIP", "style": "WARNING", "content": RECALL_TIP});
                    return frags;
                }
            } catch(e) {}
            return [{"content": RECALL_NOT_FOUND, "id": 2, "type": TEMPLATE_RESPONSE}];
        }

        function _parseKey(key, container) {
            if (Array.isArray(container) && /^[-+]?\d+$/.test(key)) { var i = parseInt(key); return i < 0 ? container.length + i : i; }
            return key;
        }
        function _setValueByPath(obj, path, value, isAppend) {
            var keys = path.split("/"), current = obj;
            for (var i = 0; i < keys.length - 1; i++) {
                var key = _parseKey(keys[i], current);
                if (!(key in current)) current[key] = typeof _parseKey(keys[i+1], current) === "number" ? [] : {};
                current = current[key];
            }
            var lastKey = _parseKey(keys[keys.length-1], current);
            if (isAppend) {
                if (Array.isArray(current[lastKey])) current[lastKey] = current[lastKey].concat(value);
                else current[lastKey] = (current[lastKey] || "") + value;
            } else { current[lastKey] = value; }
            return obj;
        }

        function DSState() {
            this.fields = {}; this.sessId = ""; this.locale = "en_US"; this.recalled = false;
            this._updatePath = ""; this._updateMode = "SET";
        }
        DSState.prototype.update = function(data) {
            if (data.p) this._updatePath = data.p;
            if (data.o) this._updateMode = data.o;
            var value = data.v;
            if (typeof value === "object" && this._updatePath === "") {
                for (var key in value) { if (value.hasOwnProperty(key)) this.fields[key] = value[key]; }
                return "";
            }
            this.setField(this._updatePath, value, this._updateMode);
            return "";
        };
        DSState.prototype.checkAndReplace = function(data) {
            var mode = data.o || this._updateMode, path = data.p || this._updatePath;
            if (mode === "BATCH" && path === "response") {
                for (var i = 0; i < data.v.length; i++) {
                    var v = data.v[i];
                    if (v.p === "fragments" && v.v && v.v.length > 0 && v.v[0].type === TEMPLATE_RESPONSE) {
                        try { 
                            saveRecalledMessage(this.sessId, this.fields.response.message_id, this.fields.response.fragments);
                        } catch(e) {}
                        this.recalled = true;
                        data.v[i] = {"v": [{"id": 1, "type": "TIP", "style": "WARNING", "content": RECALL_TIP}], "p": "fragments", "o": "APPEND"};
                    }
                    if (v.p === "status" && v.v === CONTENT_FILTER) { this.recalled = true; data.v[i] = {"p": "status", "v": "FINISHED"}; }
                }
                if (this.recalled) return JSON.stringify(data);
            }
            return "";
        };
        DSState.prototype.setField = function(path, value, mode) {
            if (mode === "BATCH") { for (var i = 0; i < value.length; i++) { var v = value[i]; this.setField(path + "/" + v.p, v.v, v.o || "SET"); } }
            else if (mode === "SET") _setValueByPath(this.fields, path, value, false);
            else if (mode === "APPEND") _setValueByPath(this.fields, path, value, true);
        };

        function processSSEStream(rawText, lastLen, dsState) {
            if (!rawText || rawText.length <= lastLen) return { text: rawText, newLen: lastLen, modified: false };
            var newPart = rawText.substring(lastLen), lines = newPart.split("\n"), modified = false;
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                if (!line || line.indexOf("data:") !== 0) continue;
                try {
                    var jsonStr = line.replace(/^data:\s*/, ""), data = JSON.parse(jsonStr);
                    if (data.v) { dsState.update(data); var replacement = dsState.checkAndReplace(data); if (replacement) { lines[i] = "data: " + replacement; modified = true; } }
                } catch(e) {}
            }
            if (modified) { var newText = rawText.substring(0, lastLen) + lines.join("\n"); return { text: newText, newLen: newText.length, modified: true }; }
            return { text: rawText, newLen: rawText.length, modified: false };
        }

        function processHistoryJSON(rawText) {
            try {
                var json = JSON.parse(rawText);
                if (!json.data || !json.data.biz_data) return rawText;
                var data = json.data.biz_data, sessId = data.chat_session ? data.chat_session.id : "", modified = false;
                for (var i = 0; i < data.chat_messages.length; i++) {
                    var msg = data.chat_messages[i];
                    // 防撤回：替换被撤回的消息
                    if (msg.status === CONTENT_FILTER) {
                        msg.fragments = getRecalledMessage(sessId, msg.message_id);
                        msg.status = "FINISHED"; modified = true;
                    }
                }
                if (modified) { json.data.biz_data = data; return JSON.stringify(json); }
            } catch(e) {}
            return rawText;
        }

        function isGenerateUrl(url) { return url.indexOf("/api/v0/chat/completion") !== -1 || url.indexOf("/api/v0/chat/edit_message") !== -1 || url.indexOf("/api/v0/chat/regenerate") !== -1 || url.indexOf("/api/v0/chat/continue") !== -1 || url.indexOf("/api/v0/chat/resume_stream") !== -1; }
        function isHistoryUrl(url) { return url.indexOf("/api/v0/chat/history_messages") !== -1; }

        var _origSend = XMLHttpRequest.prototype.send, _origOpen = XMLHttpRequest.prototype.open, _origSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
        var _respTextDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "responseText"), _respDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "response");
        var _origRespTextGetter = _respTextDesc ? _respTextDesc.get : null, _origRespGetter = _respDesc ? _respDesc.get : null;

        XMLHttpRequest.prototype.open = function(method, url) {
            this._ds_url = (url||"").split("?")[0];
            this._ds_method = method;
            return _origOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
            if (header === "x-client-locale") this._ds_locale = value;
            if (!this._ds_headers) this._ds_headers = {};
            this._ds_headers[header] = value;
            return _origSetRequestHeader.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function(body) {
            var xhr = this, url = xhr._ds_url || "";
            if (!isGenerateUrl(url) && !isHistoryUrl(url)) return _origSend.apply(this, arguments);
            var _isGen = isGenerateUrl(url), _isHist = isHistoryUrl(url), _dsState = null, _lastLen = 0, _cached = "", _hasOv = false;
            var _privUserPrompt = null; // Store original user prompt for privacy mode
            if (_isGen && body) { 
                try { 
                    var bj = JSON.parse(body); 
                    xhr._ds_sessId = bj.chat_session_id;
                    // 捕获请求模板供隐私模式使用
                    window.__dsCapturedBody = JSON.parse(JSON.stringify(bj));
                    window.__dsCapturedHeaders = JSON.parse(JSON.stringify(xhr._ds_headers || {}));
                    window.__dsLastSessionId = bj.chat_session_id;

                    // === 隐私模式：总结请求处理 ===
                    if (_pendingSummary && bj.prompt && url.indexOf("/api/v0/chat/completion") !== -1) {
                        // This is a summary generation request — don't do normal splicing
                        bj.prompt = _summaryPromptText;
                        body = JSON.stringify(bj);
                        _pendingSummary = false;
                        _capturingSummary = true;
                        _privUserPrompt = '__summary_request__'; // mark for response capture
                    }
                    // === 隐私模式：拼接历史到prompt ===
                    else if (getPrivEnabled() && bj.prompt && url.indexOf("/api/v0/chat/completion") !== -1) {
                        _privUserPrompt = bj.prompt; // Save original prompt

                        var parts = [];
                        // System prompt
                        parts.push('[系统指令] ' + getPrivSysPrompt());
                        // Time
                        parts.push(TIME_PREFIX + formatTime(new Date()) + ']');
                        // Summary from previous summarization
                        var summary = getPrivSummary();
                        if (summary) {
                            parts.push('[上一轮对话总结]\n' + summary + '\n[总结结束]');
                        }
                        // History messages (up to ctxCount)
                        var history = getPrivHistory();
                        var ctxCount = getPrivCtxCount();
                        var msgs = history;
                        if (ctxCount > 0 && msgs.length > ctxCount) {
                            msgs = msgs.slice(-ctxCount);
                        }
                        for (var mi = 0; mi < msgs.length; mi++) {
                            var m = msgs[mi];
                            var role = m.role === 'user' ? '用户' : '助手';
                            var content = m.content;
                            if (m.recalled) {
                                content = '[此消息曾被系统撤回，以下为本地缓存内容] ' + content;
                            }
                            parts.push(role + ': ' + content);
                        }
                        // Current user input
                        parts.push('用户: ' + bj.prompt);

                        bj.prompt = parts.join('\n\n');
                        body = JSON.stringify(bj);

                        // Store user message
                        history.push({ role: 'user', content: _privUserPrompt, ts: Date.now(), recalled: false });
                        setPrivHistory(history);

                        // Warning is handled in response capture to avoid duplicate toasts
                    } else if (bj.prompt && getTimeInject()) {
                        // 时间注入：非隐私模式下始终注入时间
                        bj.prompt = TIME_PREFIX + formatTime(new Date()) + ']\n\n' + bj.prompt;
                        body = JSON.stringify(bj);
                    }
                } catch(e) {} 
            }
            if (_isGen) { _dsState = new DSState(); _dsState.sessId = xhr._ds_sessId || ""; }
            if (_origRespTextGetter) {
                try {
                    Object.defineProperty(xhr, "responseText", {
                        get: function() {
                            var raw = _origRespTextGetter.call(xhr);
                            if (!raw) return raw;
                            if (_isGen && _dsState) {
                                var result = processSSEStream(raw, _lastLen, _dsState);
                                _lastLen = result.newLen;
                                if (result.modified) { _cached = result.text; return _cached; }
                                _cached = raw;
                                return raw;
                            }
                            if (_isHist) return processHistoryJSON(raw);
                            return raw;
                        }, configurable: true, enumerable: true
                    });
                    _hasOv = true;
                } catch(e) {}
            }
            if (_origRespGetter && _hasOv) {
                try {
                    Object.defineProperty(xhr, "response", {
                        get: function() {
                            var raw = _origRespGetter.call(xhr);
                            if (!raw) return raw;
                            if (_isHist) return processHistoryJSON(raw);
                            return raw;
                        }, configurable: true, enumerable: true
                    });
                } catch(e) {}
            }
            // === 隐私模式：响应完成后捕获AI回复 ===
            if (_isGen && _privUserPrompt !== null) {
                xhr.addEventListener('load', function() {
                    try {
                        var respText = xhr.responseText || '';
                        if (!respText) return;
                        // Parse SSE stream to extract final content
                        var lines = respText.split('\n');
                        var fields = {};
                        var fullContent = '';
                        var recalled = false;
                        for (var i = 0; i < lines.length; i++) {
                            var line = lines[i].trim();
                            if (!line || line.indexOf('data:') !== 0) continue;
                            try {
                                var data = JSON.parse(line.substring(5).trim());
                                if (data.v === undefined && data.v !== '') continue;
                                var path = data.p || '';
                                var mode = data.o || 'SET';
                                // Accumulate response fragments
                                if (path === 'response/fragments' && mode === 'APPEND' && Array.isArray(data.v)) {
                                    for (var j = 0; j < data.v.length; j++) {
                                        if (data.v[j].type === 'RESPONSE' && data.v[j].content) {
                                            fullContent += data.v[j].content;
                                        }
                                    }
                                }
                                // Check for recall
                                if (mode === 'BATCH' && path === 'response' && Array.isArray(data.v)) {
                                    for (var k = 0; k < data.v.length; k++) {
                                        var v = data.v[k];
                                        if (v.p === 'fragments' && v.v && v.v[0] && v.v[0].type === 'TEMPLATE_RESPONSE') {
                                            recalled = true;
                                        }
                                        if (v.p === 'status' && v.v === 'CONTENT_FILTER') {
                                            recalled = true;
                                        }
                                    }
                                }
                                if (path === 'response/status' && data.v === 'CONTENT_FILTER') {
                                    recalled = true;
                                }
                            } catch(e) {}
                        }
                        // Store AI response
                        if (fullContent) {
                            // === 总结响应捕获 ===
                            if (_capturingSummary) {
                                _capturingSummary = false;
                                setPrivSummary(fullContent);
                                setPrivHistory([]);
                                toast('✅ 对话总结已生成，历史已清空。后续对话将携带总结。');
                                if (window.__dsPrivUpdateUI) window.__dsPrivUpdateUI();
                                return;
                            }
                            // === 正常隐私模式响应存储 ===
                            var hist = getPrivHistory();
                            hist.push({ role: 'assistant', content: fullContent, ts: Date.now(), recalled: recalled });
                            setPrivHistory(hist);
                            // Update settings panel if open
                            if (window.__dsPrivUpdateUI) window.__dsPrivUpdateUI();
                            // Check token usage and warn/auto-summarize
                            var totalTokens = estimateHistoryTokens();
                            var ctxCount = getPrivCtxCount();
                            var msgCount = hist.length;
                            if (totalTokens > PRIV_TOKEN_LIMIT * 0.85) {
                                // Approaching hard limit — auto-trigger global summary
                                setTimeout(function() {
                                    toast('🔴 上下文即将耗尽 (≈' + (totalTokens/1000).toFixed(1) + 'k tokens)，正在自动生成全局总结...');
                                    setTimeout(function() {
                                        triggerPrivacySummary();
                                    }, 1500);
                                }, 1000);
                            } else if (msgCount > ctxCount) {
                                // Exceeding message count limit — remind user to summarize
                                setTimeout(function() {
                                    toast('⚠️ 隐私模式：已积累 ' + msgCount + ' 条消息，超出上下文上限 ' + ctxCount + ' 条。建议在设置中生成总结以压缩上下文。');
                                }, 1000);
                            } else if (totalTokens > PRIV_TOKEN_WARN) {
                                setTimeout(function() {
                                    toast('⚠️ 隐私模式上下文较大 (≈' + (totalTokens/1000).toFixed(1) + 'k tokens)，建议在设置中生成总结。');
                                }, 1000);
                            }
                        }
                    } catch(e) {}
                });
            }
            return _origSend.call(this, body);
        };
    })();

    // ============================================================
    //  PART 10: Mermaid 内置SVG渲染引擎 (v3.6 backport)
    // ============================================================
    (function() {
        var darkColors = { text: '#e5e5e5', line: '#555', bg: '#1c1c1e', nodeBg: '#2c2c2e', nodeBorder: '#555' };

        function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
        function svgTag(tag, attrs, inner) {
            var a = [];
            for (var k in attrs) a.push(k + '="' + attrs[k] + '"');
            return '<' + tag + ' ' + a.join(' ') + '>' + (inner||'') + '</' + tag + '>';
        }
        function rect(x, y, w, h, cls, label, rx) {
            rx = rx || 4;
            var s = svgTag('rect', {x:x, y:y, width:w, height:h, rx:rx, ry:rx, 'class':cls});
            if (label) s += svgTag('text', {x: x+w/2, y: y+h/2+5, 'text-anchor':'middle', 'dominant-baseline':'middle', 'class':'node-label'}, esc(label));
            return s;
        }
        function diamond(x, y, w, h, cls, label) {
            var hw = w/2, hh = h/2;
            var pts = (x+hw)+','+y + ' '+(x+w)+','+(y+hh) + ' '+(x+hw)+','+(y+h) + ' '+x+','+(y+hh);
            var s = svgTag('polygon', {points:pts, 'class':cls});
            if (label) s += svgTag('text', {x: x+hw, y: y+hh+5, 'text-anchor':'middle', 'dominant-baseline':'middle', 'class':'node-label'}, esc(label));
            return s;
        }
        function circle(x, y, r, cls, label) {
            var s = svgTag('circle', {cx: x+r, cy: y+r, r:r, 'class':cls});
            if (label) s += svgTag('text', {x: x+r, y: y+r+5, 'text-anchor':'middle', 'dominant-baseline':'middle', 'class':'node-label'}, esc(label));
            return s;
        }
        function arrow(x1, y1, x2, y2, label) {
            var d = 'M'+x1+','+y1+' L'+x2+','+y2;
            var s = svgTag('path', {d:d, 'class':'edge-line', 'marker-end':'url(#arrowhead)'}, '');
            if (label) s += svgTag('text', {x: (x1+x2)/2, y: (y1+y2)/2-8, 'text-anchor':'middle', 'class':'edge-label'}, esc(label));
            return s;
        }

        function renderFlowchart(lines) {
            var nodes = {}, edges = [], dir = 'TD', maxW = 0, maxH = 0;
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line) continue;
                if (line.indexOf('graph ')===0 || line.indexOf('flowchart ')===0) { dir = line.toUpperCase().indexOf('LR')!==-1 ? 'LR' : 'TD'; continue; }
                var nodeMatch = line.match(/^(\w+)\s*(\[.*?\]|\(.*?\)|\{.*?\}|\(\(.*?\)\)|>.*?\])/);
                if (nodeMatch) {
                    var nid = nodeMatch[1], shapeStr = nodeMatch[2];
                    var nlabel = shapeStr.replace(/^[\[\(\{>]+/, '').replace(/[\]\)\}>\]]+$/, '').replace(/^\(/, '').replace(/\)$/, '');
                    var shape = 'rect';
                    if (shapeStr[0]==='(' && shapeStr[1]==='(') shape = 'circle';
                    else if (shapeStr[0]==='(') shape = 'round';
                    else if (shapeStr[0]==='{') shape = 'diamond';
                    else if (shapeStr[0]==='>') shape = 'flag';
                    nodes[nid] = { id:nid, label:nlabel, shape:shape, w:Math.max(nlabel.length*10+30,80), h:40, x:0, y:0 };
                    continue;
                }
                var edgeMatch = line.match(/^(\w+)\s*(-->|==>|-.->|-->\|.*?\|)\s*(\w+)/);
                if (edgeMatch) { var lblM = edgeMatch[2].match(/\|(.+?)\|/); edges.push({ from:edgeMatch[1], to:edgeMatch[3], label: lblM?lblM[1]:'' }); continue; }
                var simpleEdge = line.match(/^(\w+)\s*-->\s*(\w+)/);
                if (simpleEdge) edges.push({ from:simpleEdge[1], to:simpleEdge[2], label:'' });
            }
            var nodeIds = Object.keys(nodes);
            if (nodeIds.length===0) return '<text x="20" y="30" class="node-label">无节点</text>';
            var cols = Math.ceil(Math.sqrt(nodeIds.length));
            if (dir==='LR') cols = nodeIds.length;
            var col = 0, row = 0, colW = 0, rowH = 0, padding = 40, gapX = 60, gapY = 50;
            for (var j = 0; j < nodeIds.length; j++) {
                var n = nodes[nodeIds[j]];
                if (dir==='LR') { n.x = padding+col*(n.w+gapX); n.y = padding; colW = Math.max(colW, n.x+n.w); rowH = Math.max(rowH, n.y+n.h); col++; }
                else { n.x = padding+col*(n.w+gapX); n.y = padding+row*(n.h+gapY); colW = Math.max(colW, n.x+n.w); rowH = Math.max(rowH, n.y+n.h); col++; if (col>=cols) { col=0; row++; } }
            }
            maxW = colW+padding; maxH = rowH+padding;
            var svg = '<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#666"/></marker></defs>';
            for (var e = 0; e < edges.length; e++) {
                var edge = edges[e], fn = nodes[edge.from], tn = nodes[edge.to];
                if (!fn||!tn) continue;
                var x1 = fn.x+fn.w/2, y1 = fn.y+fn.h, x2 = tn.x+tn.w/2, y2 = tn.y;
                if (dir==='LR') { x1 = fn.x+fn.w; y1 = fn.y+fn.h/2; x2 = tn.x; y2 = tn.y+tn.h/2; }
                svg += arrow(x1, y1, x2, y2, edge.label);
            }
            for (var k = 0; k < nodeIds.length; k++) {
                var nd = nodes[nodeIds[k]];
                if (nd.shape==='diamond') svg += diamond(nd.x, nd.y, nd.w, nd.h, 'node-diamond', nd.label);
                else if (nd.shape==='circle') svg += circle(nd.x, nd.y, Math.min(nd.w,nd.h)/2, 'node-circle', nd.label);
                else svg += rect(nd.x, nd.y, nd.w, nd.h, 'node-rect', nd.label);
            }
            return svg;
        }

        function renderSequence(lines) {
            var actors = [], messages = [], seen = {};
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line || line.indexOf('sequenceDiagram')===0) continue;
                var pM = line.match(/^participant\s+(\w+)(?:\s+as\s+(.+))?/);
                if (pM) { actors.push({ id:pM[1], label:pM[2]||pM[1] }); seen[pM[1]]=true; continue; }
                var mM = line.match(/^(\w+)\s*(-+>?>?>?|-->>?)\s*(\w+)\s*:?\s*(.*)/);
                if (mM) {
                    if (!seen[mM[1]]) { actors.push({ id:mM[1], label:mM[1] }); seen[mM[1]]=true; }
                    if (!seen[mM[3]]) { actors.push({ id:mM[3], label:mM[3] }); seen[mM[3]]=true; }
                    messages.push({ from:mM[1], to:mM[3], msg:mM[4]||'', dashed: mM[2].indexOf('--')!==-1 });
                }
            }
            if (actors.length===0) return '<text x="20" y="30" class="node-label">无参与者</text>';
            var colW = 120, padding = 80, topPad = 60, msgH = 45;
            var totalH = topPad+messages.length*msgH+60;
            var svg = '';
            for (var a = 0; a < actors.length; a++) {
                var ax = padding+a*colW+colW/2;
                svg += rect(ax-40, 20, 80, 36, 'node-rect', actors[a].label);
                svg += svgTag('line', {x1:ax, y1:56, x2:ax, y2:totalH-20, 'class':'lifeline', 'stroke-dasharray':'6,3'}, '');
            }
            for (var m = 0; m < messages.length; m++) {
                var msg = messages[m];
                var fI = actors.findIndex(function(a){return a.id===msg.from;}), tI = actors.findIndex(function(a){return a.id===msg.to;});
                if (fI<0||tI<0) continue;
                var fx = padding+fI*colW+colW/2, tx = padding+tI*colW+colW/2, y = topPad+m*msgH;
                var d = 'M'+fx+','+y+' L'+tx+','+y;
                if (msg.dashed) svg += svgTag('path', {d:d, 'class':'edge-line', 'stroke-dasharray':'6,3'}, '');
                else svg += svgTag('path', {d:d, 'class':'edge-line', 'marker-end':'url(#arrowhead)'}, '');
                if (msg.msg) svg += svgTag('text', {x:(fx+tx)/2, y:y-8, 'text-anchor':'middle', 'class':'edge-label'}, esc(msg.msg));
            }
            return svg;
        }

        function renderPie(lines) {
            var slices = [], title = '';
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line || line.indexOf('pie')===0) { var tm = line.match(/pie\s+(.+)/); if (tm) title = tm[1]; continue; }
                if (line.indexOf('title')===0) { title = line.replace('title','').trim(); continue; }
                var m = line.match(/"(.+?)"\s*:\s*([\d.]+)/);
                if (m) slices.push({ label:m[1], value:parseFloat(m[2]) });
            }
            if (slices.length===0) return '<text x="20" y="30" class="node-label">无数据</text>';
            var cx = 200, cy = 180, r = 150, total = 0;
            for (var s = 0; s < slices.length; s++) total += slices[s].value;
            var pieColors = ['#4A90D9','#5CB85C','#F0AD4E','#D9534F','#9B59B6','#5BC0DE','#E91E63','#F1C40F','#1ABC9C','#34495E'];
            var svg = '', angle = -Math.PI/2, legendY = 40;
            for (var p = 0; p < slices.length; p++) {
                var sl = slices[p], pct = sl.value/total, sa = pct*Math.PI*2, ea = angle+sa;
                var x1 = cx+r*Math.cos(angle), y1 = cy+r*Math.sin(angle), x2 = cx+r*Math.cos(ea), y2 = cy+r*Math.sin(ea);
                var la = sa>Math.PI?1:0;
                var d = 'M'+cx+','+cy+' L'+x1+','+y1+' A'+r+','+r+' 0 '+la+' 1 '+x2+','+y2+' Z';
                var color = pieColors[p%pieColors.length];
                svg += svgTag('path', {d:d, fill:color, stroke:'#fff', 'stroke-width':'2'}, '');
                svg += svgTag('rect', {x:cx+r+30, y:legendY, width:14, height:14, fill:color}, '');
                svg += svgTag('text', {x:cx+r+50, y:legendY+12, 'class':'edge-label'}, esc(sl.label+' ('+Math.round(pct*100)+'%)'));
                legendY += 22; angle = ea;
            }
            if (title) svg += svgTag('text', {x:cx, y:25, 'text-anchor':'middle', 'class':'node-label', 'font-size':'16', 'font-weight':'bold'}, esc(title));
            return svg;
        }

        function renderGantt(lines) {
            var tasks = [], title = '';
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line || line.indexOf('gantt')===0) continue;
                if (line.indexOf('title')===0) { title = line.replace('title','').trim(); continue; }
                if (line.indexOf('dateFormat')===0) continue;
                if (line.indexOf('section')===0) { tasks.push({ type:'section', label:line.replace('section','').trim() }); continue; }
                var m = line.match(/^(.+?)\s*:\s*(.+?)\s*,\s*(.+)/);
                if (m) tasks.push({ type:'task', label:m[1].trim(), start:m[2].trim(), end:m[3].trim() });
            }
            if (tasks.length===0) return '<text x="20" y="30" class="node-label">无任务</text>';
            var barH = 30, gap = 5, leftW = 150, topY = 60, y = topY, svg = '';
            if (title) svg += svgTag('text', {x:leftW+200, y:25, 'text-anchor':'middle', 'class':'node-label', 'font-size':'16', 'font-weight':'bold'}, esc(title));
            for (var t = 0; t < tasks.length; t++) {
                var task = tasks[t];
                if (task.type==='section') { svg += svgTag('text', {x:10, y:y+18, 'class':'node-label', 'font-weight':'bold'}, esc(task.label)); y += 30; }
                else { svg += svgTag('text', {x:10, y:y+18, 'class':'edge-label', 'text-anchor':'end', 'font-size':'11'}, esc(task.label.length>18?task.label.substring(0,17)+'…':task.label)); svg += rect(leftW+20, y+2, 200+Math.random()*100, barH-4, 'node-rect', task.start+' - '+task.end); y += barH+gap; }
            }
            return svg;
        }

        function renderState(lines) {
            var states = [], transitions = [];
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line || line.indexOf('stateDiagram')===0||line.indexOf('stateDiagram-v2')===0) continue;
                var sm = line.match(/^state\s+"(.+?)"\s+as\s+(\w+)/);
                if (sm) { states.push({ id:sm[2], label:sm[1] }); continue; }
                var nm = line.match(/^\s*(\w+)\s*$/);
                if (nm && !line.match(/-->/)) { if (!states.find(function(s){return s.id===nm[1];})) states.push({ id:nm[1], label:nm[1] }); continue; }
                var tm = line.match(/^(\w+)\s*-->\s*(\w+)\s*:?\s*(.*)/);
                if (tm) {
                    transitions.push({ from:tm[1], to:tm[2], label:tm[3]||'' });
                    if (!states.find(function(s){return s.id===tm[1];})) states.push({ id:tm[1], label:tm[1] });
                    if (!states.find(function(s){return s.id===tm[2];})) states.push({ id:tm[2], label:tm[2] });
                }
            }
            if (states.length===0) return '<text x="20" y="30" class="node-label">无状态</text>';
            var cols = Math.ceil(Math.sqrt(states.length)), gapX = 160, gapY = 100, padding = 60;
            var svg = '<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#666"/></marker></defs>';
            for (var j = 0; j < states.length; j++) {
                var col = j%cols, row = Math.floor(j/cols), sx = padding+col*gapX, sy = padding+row*gapY;
                states[j].x = sx; states[j].y = sy;
                svg += rect(sx, sy, 100, 50, 'node-rect', states[j].label, 20);
            }
            for (var t = 0; t < transitions.length; t++) {
                var tr = transitions[t], fs = states.find(function(s){return s.id===tr.from;}), ts = states.find(function(s){return s.id===tr.to;});
                if (!fs||!ts) continue;
                svg += arrow(fs.x+100, fs.y+25, ts.x, ts.y+25, tr.label);
            }
            return svg;
        }

        function renderClass(lines) {
            var classes = [];
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line || line.indexOf('classDiagram')===0) continue;
                var cm = line.match(/^class\s+(\w+)\s*\{/);
                if (cm) {
                    var cls = { id:cm[1], label:cm[1], attrs:[], methods:[] }; i++;
                    while (i < lines.length && lines[i].trim()!=='}') { var inner = lines[i].trim(); if (inner.indexOf('(')!==-1) cls.methods.push(inner); else if (inner) cls.attrs.push(inner); i++; }
                    classes.push(cls);
                }
            }
            if (classes.length===0) return '<text x="20" y="30" class="node-label">无类定义</text>';
            var gapX = 220, gapY = 180, padding = 60, svg = '';
            for (var c = 0; c < classes.length; c++) {
                var cl = classes[c], cols = Math.ceil(Math.sqrt(classes.length)), col = c%cols, row = Math.floor(c/cols);
                var cx = padding+col*gapX, cy = padding+row*gapY, boxH = 50+cl.attrs.length*18+cl.methods.length*18;
                svg += svgTag('rect', {x:cx, y:cy, width:180, height:boxH, rx:4, 'class':'node-rect', fill:'white', stroke:'#333'}, '');
                svg += svgTag('line', {x1:cx, y1:cy+28, x2:cx+180, y2:cy+28, stroke:'#333'}, '');
                svg += svgTag('text', {x:cx+90, y:cy+20, 'text-anchor':'middle', 'class':'node-label', 'font-weight':'bold'}, esc(cl.label));
                var innerY = cy+44;
                for (var a = 0; a < cl.attrs.length; a++) { svg += svgTag('text', {x:cx+8, y:innerY, 'class':'edge-label', 'font-size':'11'}, esc(cl.attrs[a])); innerY += 18; }
                svg += svgTag('line', {x1:cx, y1:innerY, x2:cx+180, y2:innerY, stroke:'#333'}, ''); innerY += 2;
                for (var m = 0; m < cl.methods.length; m++) { svg += svgTag('text', {x:cx+8, y:innerY+14, 'class':'edge-label', 'font-size':'11'}, esc(cl.methods[m])); innerY += 18; }
            }
            return svg;
        }

        function parseAndRender(code) {
            var lines = code.split('\n'), firstLine = '';
            for (var i = 0; i < lines.length; i++) { var t = lines[i].trim().toLowerCase(); if (t) { firstLine = t; break; } }
            var svgBody = '';
            if (firstLine.indexOf('graph ')===0||firstLine.indexOf('flowchart ')===0) svgBody = renderFlowchart(lines);
            else if (firstLine.indexOf('sequencediagram')===0) svgBody = renderSequence(lines);
            else if (firstLine.indexOf('pie')===0) svgBody = renderPie(lines);
            else if (firstLine.indexOf('gantt')===0) svgBody = renderGantt(lines);
            else if (firstLine.indexOf('statediagram')===0) svgBody = renderState(lines);
            else if (firstLine.indexOf('classdiagram')===0) svgBody = renderClass(lines);
            else svgBody = renderFlowchart(lines);

            var dk = isDark(), bg = dk ? darkColors.bg : '#fff', tc = dk ? darkColors.text : '#333';
            var lc = dk ? darkColors.line : '#666', nb = dk ? darkColors.nodeBg : '#fff', nbr = dk ? darkColors.nodeBorder : '#333';

            var svg = '<svg xmlns="http://www.w3.org/2000/svg" style="background:'+bg+';font-family:Arial,sans-serif;">';
            svg += '<style>.node-rect{fill:'+nb+';stroke:'+nbr+';stroke-width:2;}.node-diamond{fill:#FFF3E0;stroke:#E65100;stroke-width:2;}.node-circle{fill:#E8F5E9;stroke:#2E7D32;stroke-width:2;}.node-label{fill:'+tc+';font-size:13px;font-family:Arial,sans-serif;}.edge-line{fill:none;stroke:'+lc+';stroke-width:1.5;}.edge-label{fill:'+tc+';font-size:11px;font-family:Arial,sans-serif;}.lifeline{fill:none;stroke:'+lc+';stroke-width:1;}</style>';
            svg += svgBody + '</svg>';
            return svg;
        }

        function getLang(block) { var s = block.querySelector('.md-code-block-infostring'); return s ? s.textContent.trim().toLowerCase() : ''; }
        function getCode(block) { var pre = block.querySelector('pre'); return pre ? (pre.textContent||pre.innerText||'') : ''; }

        function openViewer(code) {
            pauseZoom();
            var old = document.querySelector('.ds-mm-overlay');
            if (old) { old.remove(); }

            var overlay = document.createElement('div');
            overlay.className = 'ds-mm-overlay';
            overlay.id = 'ds-mm-overlay';
            overlay.innerHTML = '<div class="ds-mm-win"><div class="ds-mm-hdr"><span class="ds-mm-title">📊 Mermaid 图表</span><button class="ds-mm-close">✕</button></div><div class="ds-mm-body"></div><div class="ds-mm-ftr"><button class="ds-mm-fbtn" id="ds-mm-zo">−</button><span class="ds-mm-zoomlbl" id="ds-mm-zl">100%</span><button class="ds-mm-fbtn" id="ds-mm-zi">+</button><button class="ds-mm-fbtn" id="ds-mm-rst">重置</button><button class="ds-mm-fbtn primary" id="ds-mm-dl">⬇ SVG</button></div></div>';
            document.body.appendChild(overlay);

            var body = overlay.querySelector('.ds-mm-body'), zoomLbl = overlay.querySelector('#ds-mm-zl'), zoom = 1, _escH = null;

            function close() {
                if (_escH) { document.removeEventListener('keydown', _escH); _escH = null; }
                overlay.style.opacity = '0';
                overlay.style.transition = 'opacity .15s';
                setTimeout(function() {
                    if (overlay.parentNode) overlay.remove();
                    setTimeout(function() { resumeZoom(); }, 50);
                }, 150);
            }
            overlay.querySelector('.ds-mm-close').addEventListener('click', function(e) { e.stopPropagation(); close(); });
            overlay.addEventListener('click', function(e) { if (e.target===overlay) close(); });
            _escH = function(e) { if (e.key==='Escape') close(); };
            document.addEventListener('keydown', _escH);

            try { var svg = parseAndRender(code); body.innerHTML = svg; } catch(e) { body.innerHTML = '<div class="ds-mm-error">❌ 渲染失败\n\n'+(e.message||String(e))+'</div>'; }

            function updateZoom() { var el = body.querySelector('svg'); if (el) el.style.transform = 'scale('+zoom+')'; zoomLbl.textContent = Math.round(zoom*100)+'%'; }
            overlay.querySelector('#ds-mm-zi').addEventListener('click', function() { zoom = Math.min(5, zoom+0.25); updateZoom(); });
            overlay.querySelector('#ds-mm-zo').addEventListener('click', function() { zoom = Math.max(0.25, zoom-0.25); updateZoom(); });
            overlay.querySelector('#ds-mm-rst').addEventListener('click', function() { zoom = 1; updateZoom(); });
            overlay.querySelector('#ds-mm-dl').addEventListener('click', function() {
                var el = body.querySelector('svg'); if (!el) return;
                var clone = el.cloneNode(true); clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                var data = new XMLSerializer().serializeToString(clone);
                var blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n'+data], { type:'image/svg+xml' });
                var url = URL.createObjectURL(blob), a = document.createElement('a');
                a.href = url; a.download = 'mermaid.svg';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                setTimeout(function() { URL.revokeObjectURL(url); }, 2000);
            });
        }

        var _mmAdded = new WeakSet();
        var _mmInitialized = false;

        function scanMermaidBlocks() {
            var blocks = document.querySelectorAll('.md-code-block');
            for (var i = 0; i < blocks.length; i++) {
                var block = blocks[i];
                if (_mmAdded.has(block)) continue;
                if (getLang(block) !== 'mermaid') continue;
                _mmAdded.add(block);
                var btn = document.createElement('span');
                btn.className = 'ds-mm-btn';
                btn.textContent = '📊 渲染';
                btn.addEventListener('click', (function(b) {
                    return function() { var code = getCode(b); if (code) openViewer(code); };
                })(block));
                var copy = block.querySelector('.ds-markdown-code-copy-button');
                if (copy && copy.parentNode) copy.parentNode.insertBefore(btn, copy.nextSibling);
                else block.appendChild(btn);
            }
        }

        function initMermaid() {
            if (_mmInitialized) return;
            _mmInitialized = true;
            scanMermaidBlocks();
            var obs = new MutationObserver(function(ms) { for (var i = 0; i < ms.length; i++) { if (ms[i].addedNodes && ms[i].addedNodes.length) { scanMermaidBlocks(); break; } } });
            obs.observe(document.body, { childList: true, subtree: true });
            setInterval(scanMermaidBlocks, 3000);
        }

        window.__dsMermaidInit = initMermaid;
        window.__dsMermaidScan = scanMermaidBlocks;
    })();

    // ============================================================
    //  PART 11: 消息定位导航 (上下按钮，以对话轮次为单位，滚动时显示，停止后隐藏)
    // ============================================================
    var _navScrolling = false;
    var _navHideTimer = null;
    var _navUserScrolling = false;  // true = user is actively scrolling

    function scanConversationRounds() {
        var rounds = [];
        var container = document.querySelector('._2bd7b35') || document.body;
        var userEls = container.querySelectorAll('._9663006');
        var aiMds = container.querySelectorAll('div.ds-markdown');
        var aiResponseEls = [];
        aiMds.forEach(function(md) {
            if (md.closest('.e1675d8b')) return;
            if (md.closest('._9663006')) return;
            if (isInInputArea(md)) return;
            aiResponseEls.push(md);
        });
        userEls.forEach(function(userEl) {
            var aiEl = null;
            for (var i = 0; i < aiResponseEls.length; i++) {
                var md = aiResponseEls[i];
                var pos = userEl.compareDocumentPosition(md);
                if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
                    aiEl = md;
                    break;
                }
            }
            rounds.push({ userEl: userEl, aiEl: aiEl });
        });
        return rounds;
    }

    function highlightMessage(el) {
        if (!el) return;
        el.classList.add('ds-highlight');
        setTimeout(function(){ el.classList.remove('ds-highlight'); }, 1600);
    }

    // Find the round currently at the top of the viewport.
    // Returns the index of the last round whose top edge has scrolled past targetY.
    function findCurrentRoundIdx(rounds) {
        if (rounds.length === 0) return 0;
        var targetY = 100;
        var currentIdx = 0;
        for (var i = 0; i < rounds.length; i++) {
            var rect = rounds[i].userEl.getBoundingClientRect();
            if (rect.top <= targetY) {
                currentIdx = i;
            } else {
                break;
            }
        }
        return currentIdx;
    }

    function navigateRound(direction) {
        if (_navScrolling) return;
        var rounds = scanConversationRounds();
        if (rounds.length === 0) return;

        // Always calculate current position from the DOM
        var currentIdx = findCurrentRoundIdx(rounds);
        var container = getScrollContainer();
        var scrollTop = container ? container.scrollTop : (window.scrollY || document.documentElement.scrollTop || 0);

        // Boundary checks: use BOTH index AND scroll position
        if (direction < 0 && currentIdx === 0) {
            // Only say "at top" if truly at scrollTop=0 AND first message is visible at top
            var firstRect = rounds[0].userEl.getBoundingClientRect();
            if (scrollTop <= 1 && firstRect.top >= -5) {
                toast('已是第一条消息');
                return;
            }
            // If scrollTop > 0 but currentIdx is 0, it means there's content above
            // that isn't captured as a "round" — just scroll to the first round
        }
        if (direction > 0 && currentIdx >= rounds.length - 1) {
            // Check if we're truly at the bottom
            var lastEl = rounds[rounds.length - 1].aiEl || rounds[rounds.length - 1].userEl;
            var lastRect = lastEl.getBoundingClientRect();
            var scrollHeight = container ? container.scrollHeight : document.documentElement.scrollHeight;
            var clientHeight = container ? container.clientHeight : window.innerHeight;
            var maxScroll = scrollHeight - clientHeight;
            if (scrollTop >= maxScroll - 5 && lastRect.bottom <= window.innerHeight + 5) {
                toast('已是最后一条消息');
                return;
            }
        }

        var newIdx = Math.max(0, Math.min(rounds.length - 1, currentIdx + direction));
        _navScrolling = true;

        var targetEl = rounds[newIdx].userEl;
        if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            highlightMessage(targetEl);
        }

        // Keep nav visible during navigation
        showNavBar();

        setTimeout(function() {
            _navScrolling = false;
        }, 700);
    }

    function showNavBar() {
        var navBar = document.getElementById('ds-nav-bar');
        if (!navBar) return;
        // Don't show if settings panel is open
        var panel = document.getElementById('ds-unified-panel');
        if (panel && panel.classList.contains('ds-show')) return;

        var rounds = scanConversationRounds();
        if (rounds.length < 2) return;

        navBar.classList.add('ds-nav-visible');

        // Reset the auto-hide timer — hide 2s after scrolling stops
        clearTimeout(_navHideTimer);
        _navHideTimer = setTimeout(function() {
            navBar.classList.remove('ds-nav-visible');
            _navUserScrolling = false;
        }, 2000);
    }

    function getScrollContainer() {
        // Walk up from user messages to find the actual scrollable ancestor
        var userMsgs = document.querySelectorAll('._9663006');
        var startEl = null;
        if (userMsgs.length > 0) {
            startEl = userMsgs[0].parentElement;
        } else {
            // Fallback: try known DeepSeek container class
            startEl = document.querySelector('._2bd7b35');
        }
        if (startEl) {
            var el = startEl;
            while (el && el !== document.body) {
                var style = window.getComputedStyle(el);
                if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
                    return el;
                }
                el = el.parentElement;
            }
        }
        // Final fallback: check if documentElement scrolls
        if (document.documentElement.scrollHeight > document.documentElement.clientHeight) {
            return document.documentElement;
        }
        return document.body;
    }

    function getScrollTop() {
        var container = getScrollContainer();
        if (container) return container.scrollTop || 0;
        return window.scrollY || document.documentElement.scrollTop || 0;
    }

    function onScrollEvent() {
        // Any scroll activity shows the nav bar
        // The auto-hide timer in showNavBar() handles hiding
        _navUserScrolling = true;
        showNavBar();
    }

    function ensureNavBar() {
        if (document.getElementById('ds-nav-bar')) return;

        var navBar = document.createElement('div');
        navBar.id = 'ds-nav-bar';

        var upBtn = document.createElement('button');
        upBtn.id = 'ds-nav-up';
        upBtn.title = '上一轮对话 (Ctrl+Shift+\u2191)';
        upBtn.innerHTML = '&#9650;';
        upBtn.addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            navigateRound(-1);
        });

        var downBtn = document.createElement('button');
        downBtn.id = 'ds-nav-down';
        downBtn.title = '下一轮对话 (Ctrl+Shift+\u2193)';
        downBtn.innerHTML = '&#9660;';
        downBtn.addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            navigateRound(1);
        });

        navBar.appendChild(upBtn);
        navBar.appendChild(downBtn);
        document.body.appendChild(navBar);
    }

    // ============================================================
    //  PART 12: 统一设置面板 (背景 + 气泡 + 主题 + 缩放)
    // ============================================================
    function ensureUnifiedPanel() {
        if (document.getElementById('ds-unified-panel')) return;

        var panel = document.createElement('div');
        panel.id = 'ds-unified-panel';

        var tabsHTML = '<div class="ds-panel-tabs">';
        tabsHTML += '<button class="ds-panel-tab ds-panel-tab-active" data-tab="bg">背景</button>';
        tabsHTML += '<button class="ds-panel-tab" data-tab="bubble">气泡</button>';
        tabsHTML += '<button class="ds-panel-tab" data-tab="theme">主题</button>';
        tabsHTML += '<button class="ds-panel-tab" data-tab="zoom">缩放</button>';
        tabsHTML += '<button class="ds-panel-tab" data-tab="privacy">隐私</button>';
        tabsHTML += '</div>';

        var bgContentHTML = '<div class="ds-panel-content ds-panel-visible" id="ds-panel-bg">';
        bgContentHTML += '<div class="ds-panel-title">背景设置</div>';
        bgContentHTML += '<label>模糊度 <span class="ds-panel-val" id="ds-blur-val">0px</span></label>';
        bgContentHTML += '<input type="range" id="ds-blur-slider" min="0" max="20" value="0" step="1">';
        bgContentHTML += '<label>遮罩透明度 <span class="ds-panel-val" id="ds-opacity-val">15%</span></label>';
        bgContentHTML += '<input type="range" id="ds-opacity-slider" min="0" max="50" value="15" step="1">';
        bgContentHTML += '<div class="ds-panel-row">';
        bgContentHTML += '<button class="ds-panel-btn ds-panel-btn-primary" id="ds-bg-upload-btn">上传图片</button>';
        bgContentHTML += '<button class="ds-panel-btn ds-panel-btn-danger" id="ds-bg-remove-btn">清除</button>';
        bgContentHTML += '</div>';
        bgContentHTML += '<button class="ds-panel-btn ds-panel-btn-secondary" id="ds-bg-reset-btn" style="width:100%;margin-top:6px">恢复默认</button>';
        bgContentHTML += '<button class="ds-panel-btn ds-panel-btn-secondary" id="ds-bg-close-btn" style="width:100%;margin-top:4px">关闭</button>';
        bgContentHTML += '</div>';

        var bubbleContentHTML = '<div class="ds-panel-content" id="ds-panel-bubble">';
        bubbleContentHTML += '<div class="ds-panel-title">气泡样式</div>';
        bubbleContentHTML += '<div class="ds-bubble-cards" id="ds-bubble-cards">';
        bubbleContentHTML += buildBubbleCardHTML();
        bubbleContentHTML += '</div>';
        bubbleContentHTML += '</div>';

        var themeContentHTML = '<div class="ds-panel-content" id="ds-panel-theme">';
        themeContentHTML += '<div class="ds-panel-title">主题设置</div>';
        themeContentHTML += '<div class="ds-mode-segmented" id="ds-mode-segmented">';
        themeContentHTML += '<button class="ds-mode-segment" data-mode="auto">自动</button>';
        themeContentHTML += '<button class="ds-mode-segment" data-mode="light">浅色</button>';
        themeContentHTML += '<button class="ds-mode-segment" data-mode="dark">深色</button>';
        themeContentHTML += '</div>';
        themeContentHTML += '<div class="ds-theme-cards" id="ds-theme-cards">';
        themeContentHTML += buildThemeCardsHTML();
        themeContentHTML += '</div>';
        themeContentHTML += '</div>';

        var zoomContentHTML = '<div class="ds-panel-content" id="ds-panel-zoom">';
        zoomContentHTML += '<div class="ds-panel-title">页面缩放</div>';
        zoomContentHTML += '<label>缩放比例 <span class="ds-panel-val" id="ds-zoom-val">100%</span></label>';
        zoomContentHTML += '<input type="range" id="ds-zoom-slider" min="50" max="200" value="100" step="5">';
        zoomContentHTML += '<div class="ds-panel-row">';
        zoomContentHTML += '<button class="ds-zoom-preset" data-zoom-val="50">50%</button>';
        zoomContentHTML += '<button class="ds-zoom-preset" data-zoom-val="75">75%</button>';
        zoomContentHTML += '<button class="ds-zoom-preset" data-zoom-val="100">100%</button>';
        zoomContentHTML += '<button class="ds-zoom-preset" data-zoom-val="125">125%</button>';
        zoomContentHTML += '<button class="ds-zoom-preset" data-zoom-val="150">150%</button>';
        zoomContentHTML += '<button class="ds-zoom-preset" data-zoom-val="200">200%</button>';
        zoomContentHTML += '</div>';
        zoomContentHTML += '</div>';

        var privacyContentHTML = '<div class="ds-panel-content" id="ds-panel-privacy">';
        privacyContentHTML += '<div class="ds-panel-title">高级功能</div>';
        // 时间注入开关 (全局)
        privacyContentHTML += '<div class="ds-toggle-row">';
        privacyContentHTML += '<div><div class="ds-toggle-label">时间注入</div><div class="ds-toggle-desc">在每条消息中隐式注入当前时间</div></div>';
        privacyContentHTML += '<div class="ds-switch' + (getTimeInject() ? ' ds-switch-on' : '') + '" id="ds-time-switch"></div>';
        privacyContentHTML += '</div>';
        // 隐私模式开关
        privacyContentHTML += '<div class="ds-toggle-row">';
        privacyContentHTML += '<div><div class="ds-toggle-label">隐私模式</div><div class="ds-toggle-desc">本地拼接完整对话历史，防撤回+越狱</div></div>';
        privacyContentHTML += '<div class="ds-switch' + (getPrivEnabled() ? ' ds-switch-on' : '') + '" id="ds-priv-switch"></div>';
        privacyContentHTML += '</div>';
        // 隐私模式详细设置
        privacyContentHTML += '<div id="ds-priv-details" style="display:' + (getPrivEnabled() ? 'block' : 'none') + '">';
        // 系统提示词
        privacyContentHTML += '<label style="display:block;font-size:12px;color:#888;margin-top:12px;margin-bottom:4px">系统提示词 (人格)</label>';
        privacyContentHTML += '<textarea id="ds-priv-sys-input" rows="3" style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(0,0,0,0.08);background:rgba(0,0,0,0.02);color:#333;font-size:12px;font-family:inherit;resize:vertical"></textarea>';
        // 上下文条数
        privacyContentHTML += '<label style="display:block;font-size:12px;color:#888;margin-top:10px;margin-bottom:4px">发送给AI的历史消息条数</label>';
        privacyContentHTML += '<div style="display:flex;align-items:center;gap:8px">';
        privacyContentHTML += '<input type="range" id="ds-priv-ctx-slider" min="5" max="100" step="5" value="' + getPrivCtxCount() + '" style="flex:1;accent-color:#007AFF;height:4px">';
        privacyContentHTML += '<span style="font-size:12px;color:#007AFF;font-weight:600;min-width:40px;text-align:right" id="ds-priv-ctx-val">' + getPrivCtxCount() + ' 条</span>';
        privacyContentHTML += '</div>';
        // 上下文用量监控
        privacyContentHTML += '<div id="ds-priv-usage" style="margin-top:12px;padding:10px;border-radius:8px;background:rgba(0,122,255,0.05);border:1px solid rgba(0,122,255,0.1)"></div>';
        // 操作按钮
        privacyContentHTML += '<div class="ds-panel-row" style="margin-top:10px">';
        privacyContentHTML += '<button class="ds-panel-btn ds-panel-btn-primary" id="ds-priv-summary-btn">生成总结</button>';
        privacyContentHTML += '<button class="ds-panel-btn ds-panel-btn-danger" id="ds-priv-clear-btn">清除历史</button>';
        privacyContentHTML += '</div>';
        privacyContentHTML += '</div>';
        privacyContentHTML += '</div>';

        panel.innerHTML = tabsHTML + bgContentHTML + bubbleContentHTML + themeContentHTML + zoomContentHTML + privacyContentHTML;
        document.body.appendChild(panel);

        // === 标签切换 ===
        panel.querySelectorAll('.ds-panel-tab').forEach(function(tab) {
            tab.addEventListener('click', function(e) {
                e.stopPropagation();
                var tabName = tab.getAttribute('data-tab');
                panel.querySelectorAll('.ds-panel-tab').forEach(function(t) { t.classList.remove('ds-panel-tab-active'); });
                tab.classList.add('ds-panel-tab-active');
                panel.querySelectorAll('.ds-panel-content').forEach(function(c) { c.classList.remove('ds-panel-visible'); });
                var contentEl = document.getElementById('ds-panel-' + tabName);
                if (contentEl) contentEl.classList.add('ds-panel-visible');
                if (tabName === 'bubble') refreshBubbleCards();
                if (tabName === 'theme') refreshThemeCards();
                if (tabName === 'privacy') {
                    // Initialize privacy settings when tab is opened
                    var sysInput = document.getElementById('ds-priv-sys-input');
                    if (sysInput) sysInput.value = getPrivSysPrompt();
                    var ctxSlider = document.getElementById('ds-priv-ctx-slider');
                    if (ctxSlider) ctxSlider.value = getPrivCtxCount();
                    var ctxVal = document.getElementById('ds-priv-ctx-val');
                    if (ctxVal) ctxVal.textContent = getPrivCtxCount() + ' 条';
                    updatePrivUsageUI();
                }
            });
        });

        // === 背景控件 ===
        var blurSlider = document.getElementById('ds-blur-slider');
        var opSlider = document.getElementById('ds-opacity-slider');
        var blurVal = document.getElementById('ds-blur-val');
        var opVal = document.getElementById('ds-opacity-val');

        blurSlider.addEventListener('input', function() {
            blurVal.textContent = blurSlider.value + 'px';
            setBlur(parseInt(blurSlider.value));
            updateBgSettings();
        });
        opSlider.addEventListener('input', function() {
            opVal.textContent = opSlider.value + '%';
            setOp(parseInt(opSlider.value));
            updateBgSettings();
        });
        document.getElementById('ds-bg-upload-btn').addEventListener('click', function(e) {
            e.stopPropagation(); e.preventDefault();
            pickAndUploadBg();
        });
        document.getElementById('ds-bg-remove-btn').addEventListener('click', function(e) {
            e.stopPropagation(); e.preventDefault();
            delBg(); applyBg(''); toast('背景已清除');
            panel.classList.remove('ds-show');
        });
        document.getElementById('ds-bg-reset-btn').addEventListener('click', function(e) {
            e.stopPropagation(); e.preventDefault();
            setBlur(0); setOp(15);
            blurSlider.value = 0; opSlider.value = 15;
            blurVal.textContent = '0px'; opVal.textContent = '15%';
            updateBgSettings(); toast('已恢复默认');
        });
        document.getElementById('ds-bg-close-btn').addEventListener('click', function(e) {
            e.stopPropagation(); e.preventDefault();
            panel.classList.remove('ds-show');
        });

        // === 气泡卡片 ===
        document.getElementById('ds-bubble-cards').addEventListener('click', function(e) {
            var card = e.target.closest('.ds-bubble-card');
            if (!card) return;
            var preset = card.getAttribute('data-preset');
            setBubblePreset(preset);
            applyBubblePreset();
            refreshBubbleCards();
            toast('气泡样式已切换');
        });

        // === 主题模式 ===
        document.getElementById('ds-mode-segmented').addEventListener('click', function(e) {
            var seg = e.target.closest('.ds-mode-segment');
            if (!seg) return;
            var mode = seg.getAttribute('data-mode');
            setThemeMode(mode);
            refreshModeSegments();
            applyThemeCSS();
            refreshThemeCards();
            toast('主题模式已切换');
        });

        // === 主题卡片 ===
        document.getElementById('ds-theme-cards').addEventListener('click', function(e) {
            var card = e.target.closest('.ds-theme-card');
            if (!card) return;
            var themeId = card.getAttribute('data-theme');
            setThemeId(themeId);
            applyThemeCSS();
            refreshThemeCards();
            toast('主题已切换为 ' + THEMES[themeId].name);
        });

        // === 缩放控件 ===
        var zoomSlider = document.getElementById('ds-zoom-slider');
        zoomSlider.addEventListener('input', function() {
            var v = parseInt(zoomSlider.value);
            document.getElementById('ds-zoom-val').textContent = v + '%';
            applyZoom(v); setZoom(v);
        });
        var zoomPresets = panel.querySelectorAll('.ds-zoom-preset');
        for (var j = 0; j < zoomPresets.length; j++) {
            zoomPresets[j].addEventListener('click', function(e) {
                e.stopPropagation(); e.preventDefault();
                var v = parseInt(this.getAttribute('data-zoom-val'));
                zoomSlider.value = v;
                document.getElementById('ds-zoom-val').textContent = v + '%';
                applyZoom(v); setZoom(v);
            });
        }

        // === 隐私模式 & 时间注入控件 ===
        var timeSwitch = document.getElementById('ds-time-switch');
        if (timeSwitch) {
            timeSwitch.addEventListener('click', function(e) {
                e.stopPropagation(); e.preventDefault();
                var on = !getTimeInject();
                setTimeInject(on);
                timeSwitch.classList.toggle('ds-switch-on', on);
                toast(on ? '时间注入已开启' : '时间注入已关闭');
            });
        }
        var clearBtn = document.getElementById('ds-priv-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', function(e) {
                e.stopPropagation(); e.preventDefault();
                if (!confirm('确定清除所有本地对话历史？此操作不可撤销。')) return;
                setPrivHistory([]);
                setPrivSummary(null);
                toast('隐私模式历史已清除');
                updatePrivUsageUI();
            });
        }
        // 隐私模式开关
        var privSwitch = document.getElementById('ds-priv-switch');
        if (privSwitch) {
            privSwitch.addEventListener('click', function(e) {
                e.stopPropagation(); e.preventDefault();
                var on = !getPrivEnabled();
                setPrivEnabled(on);
                privSwitch.classList.toggle('ds-switch-on', on);
                var details = document.getElementById('ds-priv-details');
                if (details) details.style.display = on ? 'block' : 'none';
                toast(on ? '隐私模式已开启' : '隐私模式已关闭');
                if (on) updatePrivUsageUI();
            });
        }
        // 系统提示词
        var sysInput = document.getElementById('ds-priv-sys-input');
        if (sysInput) {
            sysInput.addEventListener('blur', function() {
                var val = sysInput.value.trim();
                if (val) {
                    setPrivSysPrompt(val);
                    toast('系统提示词已保存');
                }
            });
        }
        // 上下文条数滑块
        var ctxSlider = document.getElementById('ds-priv-ctx-slider');
        var ctxValEl = document.getElementById('ds-priv-ctx-val');
        if (ctxSlider) {
            ctxSlider.addEventListener('input', function() {
                var v = parseInt(ctxSlider.value);
                setPrivCtxCount(v);
                if (ctxValEl) ctxValEl.textContent = v + ' 条';
                updatePrivUsageUI();
            });
        }
        // 生成总结按钮
        var summaryBtn = document.getElementById('ds-priv-summary-btn');
        if (summaryBtn) {
            summaryBtn.addEventListener('click', function(e) {
                e.stopPropagation(); e.preventDefault();
                triggerPrivacySummary();
            });
        }

        // === 点击面板外关闭 ===
        document.addEventListener('click', function(e) {
            if (panel.classList.contains('ds-show') && !panel.contains(e.target) && e.target.id !== 'ds-settings-action-btn') {
                panel.classList.remove('ds-show');
            }
        }, true);

        // === 主题随系统变化 ===
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
            if (getThemeMode() === 'auto') {
                applyThemeCSS();
                applyBubblePreset();
            }
        });
    }

    function buildBubbleCardHTML() {
        var presets = [
            { id: 'default', name: '默认', desc: '经典气泡样式，简洁清爽', previewBg: 'linear-gradient(135deg, #f0f0f5 0%, #e0e0e8 100%)' },
            { id: 'frosted', name: 'iOS 毛玻璃', desc: 'blur(20px) saturate(180%) 磨砂质感', previewBg: 'linear-gradient(135deg, #c8d6e5 0%, #dfe6e9 100%)' },
            { id: 'water', name: '水玻璃', desc: 'blur(10px) 水波纹扭曲效果', previewBg: 'linear-gradient(135deg, #a0d2db 0%, #c8e6e0 100%)' }
        ];
        var current = getBubblePreset();
        var html = '';
        presets.forEach(function(p) {
            var selected = p.id === current ? ' ds-bubble-selected' : '';
            html += '<div class="ds-bubble-card' + selected + '" data-preset="' + p.id + '">';
            html += '<div class="ds-bubble-preview" style="background:' + p.previewBg + '"></div>';
            html += '<div class="ds-bubble-card-info">';
            html += '<div class="ds-bubble-card-name">' + p.name + '</div>';
            html += '<div class="ds-bubble-card-desc">' + p.desc + '</div>';
            html += '</div></div>';
        });
        return html;
    }

    function refreshBubbleCards() {
        var container = document.getElementById('ds-bubble-cards');
        if (!container) return;
        container.innerHTML = buildBubbleCardHTML();
    }

    function buildThemeCardsHTML() {
        var themeIds = ['default', 'dracula', 'coffee', 'cyberpunk', 'fulldark'];
        var html = '';
        var currentId = getThemeId();
        themeIds.forEach(function(id) {
            var selected = id === currentId ? ' ds-theme-selected' : '';
            var theme = THEMES[id];
            html += '<div class="ds-theme-card' + selected + '" data-theme="' + id + '">';
            html += '<div class="ds-theme-swatch">';
            html += '<div class="ds-theme-swatch-light" style="background:' + theme.light['--ds-theme-bg'] + '"></div>';
            html += '<div class="ds-theme-swatch-dark" style="background:' + theme.dark['--ds-theme-bg'] + '"></div>';
            html += '</div>';
            html += '<div class="ds-theme-card-info">';
            html += '<div class="ds-theme-card-name">' + theme.name + '</div>';
            html += '<div class="ds-theme-card-desc">' + theme.light['--ds-theme-accent'] + '</div>';
            html += '</div></div>';
        });
        return html;
    }

    function refreshThemeCards() {
        var container = document.getElementById('ds-theme-cards');
        if (!container) return;
        container.innerHTML = buildThemeCardsHTML();
    }

    function refreshModeSegments() {
        var container = document.getElementById('ds-mode-segmented');
        if (!container) return;
        var current = getThemeMode();
        container.querySelectorAll('.ds-mode-segment').forEach(function(seg) {
            if (seg.getAttribute('data-mode') === current) {
                seg.classList.add('ds-mode-active');
            } else {
                seg.classList.remove('ds-mode-active');
            }
        });
    }

    function refreshPrivacyControls() {
        var timeSwitch = document.getElementById('ds-time-switch');
        if (timeSwitch) {
            timeSwitch.classList.toggle('ds-switch-on', getTimeInject());
        }
    }

    function showUnifiedPanel() {
        ensureUnifiedPanel();
        var panel = document.getElementById('ds-unified-panel');
        var btn = document.getElementById('ds-settings-action-btn');
        var blurSlider = document.getElementById('ds-blur-slider');
        var opSlider = document.getElementById('ds-opacity-slider');
        var blurVal = document.getElementById('ds-blur-val');
        var opVal = document.getElementById('ds-opacity-val');

        var blur = getBlur();
        var op = getOp();
        blurSlider.value = blur; opSlider.value = op;
        blurVal.textContent = blur + 'px'; opVal.textContent = op + '%';

        var hasBg = !!getBg();
        var rmBtn = document.getElementById('ds-bg-remove-btn');
        if (rmBtn) rmBtn.style.display = hasBg ? '' : 'none';

        var zoomSlider = document.getElementById('ds-zoom-slider');
        var zoomVal = getZoom();
        if (zoomSlider) { zoomSlider.value = zoomVal; }
        var zv = document.getElementById('ds-zoom-val');
        if (zv) zv.textContent = zoomVal + '%';
        updateZoomPresets(zoomVal);

        refreshBubbleCards();
        refreshThemeCards();
        refreshModeSegments();
        refreshPrivacyControls();

        if (isMobile()) {
            panel.style.left = '16px'; panel.style.right = '16px';
            panel.style.bottom = '80px'; panel.style.top = 'auto';
            panel.style.width = 'auto'; panel.style.transform = '';
        } else if (btn) {
            var br = btn.getBoundingClientRect();
            panel.style.right = Math.max(8, window.innerWidth - br.right) + 'px';
            panel.style.bottom = (window.innerHeight - br.top + 12) + 'px';
            panel.style.left = 'auto'; panel.style.top = 'auto';
            panel.style.width = '320px'; panel.style.transform = '';
        } else {
            panel.style.left = '50%'; panel.style.top = '50%';
            panel.style.transform = 'translate(-50%,-50%)';
            panel.style.right = 'auto'; panel.style.bottom = 'auto';
        }

        panel.classList.toggle('ds-show');
    }

    // ============================================================
    //  PART 13: 按钮注入
    // ============================================================
    function injectActionButtons() {
        var container = document.querySelector('.ec4f5d61');
        if (!container) return;

        // 设置按钮 (⚙ 统一设置)
        if (!document.getElementById('ds-settings-action-btn')) {
            var settingsBtn = document.createElement('button');
            settingsBtn.id = 'ds-settings-action-btn';
            settingsBtn.className = 'ds-action-btn';
            settingsBtn.title = '设置 (Ctrl+Shift+B)';
            settingsBtn.textContent = '\u2699';
            settingsBtn.addEventListener('click', function(e) {
                e.preventDefault(); e.stopPropagation();
                showUnifiedPanel();
            });
            container.insertBefore(settingsBtn, container.firstChild);
        }

        // 全屏按钮 (⛶ 独立)
        if (!document.getElementById('ds-fs-action-btn')) {
            var fsBtn = document.createElement('button');
            fsBtn.id = 'ds-fs-action-btn';
            fsBtn.className = 'ds-action-btn';
            fsBtn.title = '一键全屏';
            fsBtn.textContent = '\u26F6';
            fsBtn.addEventListener('click', function(e) {
                e.preventDefault(); e.stopPropagation();
                toggleFullscreen();
            });
            container.insertBefore(fsBtn, container.firstChild);
        }
    }

    // ============================================================
    //  PART 13.5: REMOVED — Privacy mode uses in-page XHR splicing (PART 9)
    // ============================================================
    // ============================================================
    var lastUrl = location.href;
    var initDone = false;

    function fullInit() {
        ensureSVGFilters();
        ensureBgLayers();
        ensureNavBar();
        applyBg(getBg());
        applyThemeCSS();
        applyBubblePreset();
        styleUserBubbles();
        injectActionButtons();
        processAllMessages();
        _zoomPaused = false;
        applyZoom(getZoom());
        initZoomModalWatcher();
        if (window.__dsMermaidInit) window.__dsMermaidInit();
    }

    function init() {
        if (initDone) return;
        initDone = true;
        fullInit();

        var debouncedProcess = debounce(function() {
            styleUserBubbles();
            injectActionButtons();
            processAllMessages();
        }, 200);

        var obs = new MutationObserver(function() { debouncedProcess(); });
        obs.observe(document.body, { childList: true, subtree: true });

        setInterval(function() {
            styleUserBubbles();
            injectActionButtons();
            processAllMessages();
        }, 1500);

        // URL变化检测
        setInterval(function() {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                messageLastChange.clear();
                messageSnapshot.clear();
                pendingSplits.clear();
                // Navigation state auto-resets on conversation change
                initDone = false;
                setTimeout(function() {
                    initDone = true;
                    ensureSVGFilters();
                    ensureBgLayers();
                    ensureNavBar();
                    applyBg(getBg());
                    applyThemeCSS();
                    applyBubblePreset();
                    _zoomPaused = false;
                    applyZoom(getZoom());
                    styleUserBubbles();
                    processAllMessages();
                    injectActionButtons();
                    if (window.__dsMermaidScan) window.__dsMermaidScan();
                }, 600);
            }
        }, 500);

        // 快捷键
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.shiftKey && e.key === 'B') {
                e.preventDefault();
                showUnifiedPanel();
            }
            if (e.ctrlKey && e.shiftKey && e.key === 'ArrowUp') {
                e.preventDefault();
                navigateRound(-1);
            }
            if (e.ctrlKey && e.shiftKey && e.key === 'ArrowDown') {
                e.preventDefault();
                navigateRound(1);
            }
        });

        // 监听滚动更新导航 — show on scroll, auto-hide after inactivity
        var _scrollActiveTimer = null;
        function onScrollActivity() {
            onScrollEvent();
        }
        // Use a lighter debounce for scroll detection
        var scrollDebounced = debounce(onScrollActivity, 50);
        // Listen on window
        window.addEventListener('scroll', scrollDebounced, { passive: true, capture: true });
        // Listen on the chat scroll container (dynamically detected)
        function bindScrollListener() {
            var c = getScrollContainer();
            if (c && !c._ds_scroll_bound) {
                c._ds_scroll_bound = true;
                c.addEventListener('scroll', scrollDebounced, { passive: true });
            }
            // Also check children of the container for nested scrollables
            if (c) {
                var children = c.querySelectorAll('*');
                for (var i = 0; i < children.length && i < 50; i++) {
                    var child = children[i];
                    if (!child._ds_scroll_bound) {
                        var style = window.getComputedStyle(child);
                        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                            child._ds_scroll_bound = true;
                            child.addEventListener('scroll', scrollDebounced, { passive: true });
                        }
                    }
                }
            }
        }
        bindScrollListener();
        // Periodically re-detect and bind to new scroll containers
        setInterval(function() {
            bindScrollListener();
        }, 2000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();