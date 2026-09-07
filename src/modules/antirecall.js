/* ============================================================
 * modules/antiRecall：防撤回（XHR 响应层照搬最初可用版本 v7.2 的成熟实现）
 *  - 全局生效：无论隐私模式开关如何，SSE 撤回替换 / 历史回放都工作
 *  - 智能 / 全量模式【只做回填】：把本地缓存的撤回轮次拼进下一次请求 prompt
 *  - 智能模式小瑕疵修复：history_messages 整体加载后，若服务端已重新承载
 *    某条撤回内容，则把它标记为 serverHas，不再重复回填（只回填仍缺失的）
 * ============================================================ */
var AntiRecall = {
  TEMPLATE_RESPONSE: 'TEMPLATE_RESPONSE',
  CONTENT_FILTER: 'CONTENT_FILTER',
  RECALL_TIP: '⚠️ 此回复已被撤回，以下为本地缓存内容',
  RECALL_NOT_FOUND: '⛔ 此回复已被撤回，本地缓存中未找到',

  /* ---------- localStorage 原始片段缓存（与 v7.2 同键，老缓存可直接复用） ---------- */
  rawKey: function (sid, mid) { return 'ds_recall_' + (sid || '') + '_' + (mid || ''); },
  saveRaw: function (sid, mid, frags) { try { localStorage.setItem(this.rawKey(sid, mid), JSON.stringify(frags)); } catch (e) {} },
  loadRaw: function (sid, mid) {
    try {
      var raw = localStorage.getItem(this.rawKey(sid, mid));
      if (raw) {
        var frags = JSON.parse(raw);
        // 历史渲染器只渲染既有 RESPONSE 片段，提示直接并入最后一个 RESPONSE 片段，保证可见
        for (var fi = frags.length - 1; fi >= 0; fi--) {
          if (frags[fi].type === 'RESPONSE') { frags[fi].content += '\n\n' + this.RECALL_TIP; break; }
        }
        return frags;
      }
    } catch (e) {}
    return [{ content: this.RECALL_NOT_FOUND, id: 2, type: this.TEMPLATE_RESPONSE }];
  },

  /* ---------- 会话级高层历史（智能/全量回填的数据底座，按 sid 严格隔离） ---------- */
  getHistory: function (sid) { return DSE.config.session(sid).hist || []; },
  pushHistory: function (sid, item) {
    if (!sid) return;
    var s = DSE.config.session(sid);
    if (!s.hist) s.hist = [];
    s.hist.push(item);
    if (s.hist.length > 400) s.hist = s.hist.slice(-400);
    DSE.config.saveSessions();
  },
  clearHistory: function (sid) {
    if (sid) { DSE.config.setSession(sid, { hist: [] }); }
    else { var all = DSE.config.sessions(); Object.keys(all).forEach(function (k) { all[k].hist = []; }); DSE.config.saveSessions(); }
  },
  // 智能模式：仍需回填的撤回轮次（服务端上下文里没有的）
  pendingRecalledRounds: function (sid) {
    if (DSE.config.get('privacyMode') !== 'smart') return [];
    var h = this.getHistory(sid), rounds = [];
    for (var i = 0; i < h.length; i++) {
      // serverHas：重载历史时服务端已承载；backfilled：已随某次请求发出、服务端上下文已吃下
      if (h[i].role === 'assistant' && h[i].recalled && !h[i].serverHas && !h[i].backfilled) {
        var user = null;
        for (var j = i - 1; j >= 0; j--) if (h[j].role === 'user') { user = h[j]; break; }
        rounds.push({ user: user, assistant: h[i] });
      }
    }
    return rounds;
  },

  extractResponseContent: function (fragments) {
    if (!fragments || !Array.isArray(fragments)) return '';
    var c = '';
    for (var i = 0; i < fragments.length; i++) if (fragments[i].type === 'RESPONSE' && fragments[i].content) c += fragments[i].content;
    return c;
  },

  /* ================= SSE op 树状态机（照搬 v7.2） ================= */
  _setValueByPath: function (obj, path, value, isAppend) {
    var keys = path.split('/'), cur = obj;
    var parseK = function (k, c) { return (/^[-+]?\d+$/.test(k)) ? (parseInt(k) < 0 ? c.length + parseInt(k) : parseInt(k)) : k; };
    for (var i = 0; i < keys.length - 1; i++) {
      var k = parseK(keys[i], cur);
      if (!(k in cur)) cur[k] = typeof parseK(keys[i + 1], cur) === 'number' ? [] : {};
      cur = cur[k];
    }
    var lk = parseK(keys[keys.length - 1], cur);
    if (isAppend) { if (Array.isArray(cur[lk])) cur[lk] = cur[lk].concat(value); else cur[lk] = (cur[lk] || '') + value; }
    else cur[lk] = value;
    return obj;
  },
  makeState: function (sid) {
    var AR = this;
    var st = {
      fields: {}, sessId: sid || '', recalled: false, recalledContent: '',
      _updatePath: '', _updateMode: 'SET', _lastLen: 0, _cached: '',
      // preCheck 必须在 setField 之前执行：此时 fields.response.fragments 还是真实内容
      preCheck: function (data) {
        var path = data.p ? data.p : this._updatePath;
        var mode = data.o ? data.o : this._updateMode;
        var modified = false;
        if (mode === 'BATCH' && path === 'response') {
          for (var i = 0; i < data.v.length; i++) {
            var v = data.v[i];
            if (v.p === 'fragments' && v.v && v.v.length > 0 && v.v[0].type === AR.TEMPLATE_RESPONSE) {
              modified = true;
              try { AR.saveRaw(this.sessId, this.fields.response.message_id, this.fields.response.fragments); } catch (e) {}
              this.recalledContent = AR.extractResponseContent(this.fields.response.fragments);
              this.recalled = true;
              data.v[i] = { v: [{ id: 1, type: 'TIP', style: 'WARNING', content: AR.RECALL_TIP }], p: 'fragments', o: 'APPEND' };
            }
            if (v.p === 'status' && v.v === AR.CONTENT_FILTER) {
              modified = true; this.recalled = true;
              data.v[i] = { p: 'status', v: 'FINISHED' };
            }
          }
        }
        return modified ? JSON.stringify(data) : '';
      },
      setField: function (path, value, mode) {
        if (mode === 'BATCH') {
          for (var i = 0; i < value.length; i++) {
            var v = value[i];
            this.setField(path + '/' + v.p, v.v, v.o || 'SET');
          }
        } else if (mode === 'SET') AR._setValueByPath(this.fields, path, value, false);
        else if (mode === 'APPEND') AR._setValueByPath(this.fields, path, value, true);
      },
      update: function (data) {
        var pre = this.preCheck(data);
        if (data.p) this._updatePath = data.p;
        if (data.o) this._updateMode = data.o;
        var value = data.v;
        if (typeof value === 'object' && this._updatePath === '') {
          for (var key in value) if (Object.prototype.hasOwnProperty.call(value, key)) this.fields[key] = value[key];
          return pre;
        }
        this.setField(this._updatePath, value, this._updateMode);
        return pre;
      },
      content: function () {
        if (this.recalled && this.recalledContent) return this.recalledContent;
        return AR.extractResponseContent((this.fields.response && this.fields.response.fragments) || []);
      }
    };
    return st;
  },

  // 照搬 v7.2 processSSEStream：按长度游标处理新增行，撤回则重组并推进游标
  processSSEStream: function (rawText, state) {
    var lastLen = state._lastLen || 0;
    if (!rawText || rawText.length <= lastLen) return { text: state._cached || rawText, changed: false };
    var newPart = rawText.substring(lastLen), lines = newPart.split('\n'), modified = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line || line.indexOf('data:') !== 0) continue;
      try {
        var data = JSON.parse(line.replace(/^data:\s*/, ''));
        if (data.v) { var repl = state.update(data); if (repl) { lines[i] = 'data: ' + repl; modified = true; } }
      } catch (e) {}
    }
    var newText = modified ? rawText.substring(0, lastLen) + lines.join('\n') : rawText;
    state._lastLen = newText.length;
    if (modified) state._cached = newText;
    return { text: newText, changed: modified };
  },

  // 历史回放：status=CONTENT_FILTER 的消息用本地缓存替换（照搬 v7.2）+ 智能对账
  processHistoryJSON: function (rawText, sid) {
    var AR = this;
    try {
      var json = JSON.parse(rawText);
      if (!json.data || !json.data.biz_data) return rawText;
      var data = json.data.biz_data;
      var sessId = (data.chat_session && data.chat_session.id) || sid || '';
      if (!data.chat_messages) return rawText;
      var modified = false;
      var serverTexts = {};
      for (var i = 0; i < data.chat_messages.length; i++) {
        var msg = data.chat_messages[i];
        var t = AR.extractResponseContent(msg.fragments);
        if (t) serverTexts[t.slice(0, 60)] = true;
        if (msg.status === AR.CONTENT_FILTER) {
          msg.fragments = AR.loadRaw(sessId, msg.message_id);
          msg.status = 'FINISHED'; modified = true;
        }
      }
      // 智能模式对账：服务端整体加载后，已重新承载的旧撤回不再回填
      var hist = AR.getHistory(sessId);
      hist.forEach(function (h) {
        if (h.recalled && !h.serverHas && h.content && serverTexts[h.content.slice(0, 60)]) {
          h.serverHas = true; modified = true;
        }
      });
      if (modified) { DSE.config.saveSessions(); json.data.biz_data = data; return JSON.stringify(json); }
    } catch (e) {}
    return rawText;
  },

  /* ================= XHR 挂载层（照搬 v7.2 结构，链式包在 net 之外） ================= */
  _installed: false,
  installXhr: function () {
    if (this._installed) return; this._installed = true;
    var AR = this;
    var proto = XMLHttpRequest.prototype;
    var _origOpen = proto.open, _origSend = proto.send;
    var textDesc = Object.getOwnPropertyDescriptor(proto, 'responseText');
    var respDesc = Object.getOwnPropertyDescriptor(proto, 'response');
    var _origTextGetter = textDesc && textDesc.get;
    var _origRespGetter = respDesc && respDesc.get;

    proto.open = function (method, url) {
      this._arUrl = (url || '').split('?')[0];
      return _origOpen.apply(this, arguments);
    };

    proto.send = function (body) {
      var xhr = this, url = xhr._arUrl || '';
      var isGen = /\/api\/v0\/chat\/(completion|regenerate|edit_message|continue|resume_stream)/.test(url);
      var isHist = /\/api\/v0\/chat\/history_messages/.test(url);
      if (!isGen && !isHist) return _origSend.apply(this, arguments);

      // 生成请求：先取会话 id（body 之后会被 net 的请求管线改写，这里读原始值）
      var sid = '';
      if (isGen && typeof body === 'string') {
        try { sid = (JSON.parse(body).chat_session_id) || ''; } catch (e) {}
      }
      var state = isGen ? AR.makeState(sid) : null;

      if (_origTextGetter) {
        try {
          Object.defineProperty(xhr, 'responseText', {
            configurable: true, enumerable: true,
            get: function () {
              var raw = _origTextGetter.call(xhr);
              if (raw == null) return raw;
              if (isGen && state) {
                var r = AR.processSSEStream(String(raw), state);
                var ctx = xhr._dseCtx;           // net 在其 send 中挂上
                if (ctx) DSE.net.parseSSE(r.text, ctx);
                return r.text;
              }
              if (isHist) {
                var t = DSE.net.handleHistory(raw, xhr._dseCtx || { url: url, isHistory: true });
                return AR.processHistoryJSON(t, sid);
              }
              return raw;
            }
          });
        } catch (e) {}
      }
      if (_origRespGetter) {
        try {
          Object.defineProperty(xhr, 'response', {
            configurable: true, enumerable: true,
            get: function () {
              var raw = _origRespGetter.call(xhr);
              if (typeof raw !== 'string') return raw;
              if (isGen && state) return AR.processSSEStream(String(raw), state).text;
              if (isHist) {
                var t = DSE.net.handleHistory(raw, xhr._dseCtx || { url: url, isHistory: true });
                return AR.processHistoryJSON(t, sid);
              }
              return raw;
            }
          });
        } catch (e) {}
      }

      // 流结束落库本轮 AI 回复（撤回时用 preCheck 保存的真实内容）
      if (isGen) {
        // 请求真正发出后（net 的请求改写管线已同步跑完），快照本次带上的待回填轮次
        var retSend = _origSend.apply(this, arguments);
        var injectedTs = [];
        try {
          injectedTs = AR.pendingRecalledRounds(sid).map(function (r) { return r.assistant.ts; });
        } catch (e) {}
        xhr.addEventListener('load', function () {
          try {
            if (xhr.status && xhr.status !== 200) return; // 异常响应不视为已承载
            // 服务端已接收包含这些旧撤回内容的上下文 → 标记已回填，后续请求不再重复注入
            if (injectedTs.length) {
              var hh = AR.getHistory(sid), changed = false;
              hh.forEach(function (item) {
                if (item.role === 'assistant' && item.recalled && !item.backfilled &&
                    injectedTs.indexOf(item.ts) !== -1) { item.backfilled = true; changed = true; }
              });
              if (changed) DSE.config.saveSessions();
            }
            var content = state.content();
            if (content) {
              AR.pushHistory(sid, { role: 'assistant', content: content, ts: Date.now(), recalled: state.recalled });
              if (state.recalled && DSE.config.get('privacyMode') === 'smart') {
                setTimeout(function () { Utils.toast('已拦截一次撤回，真实内容已本地保留'); }, 400);
              }
            }
          } catch (e) {}
        });
        return retSend;
      }
      return _origSend.apply(this, arguments);
    };
  },

  init: function () {
    var AR = this;
    this.installXhr();
    // 记录用户原始输入（在 prompt 模块之前注册，拿到的是未注入文本）
    DSE.net.addRequestMutator(function (obj, ctx) {
      if (obj && typeof obj.prompt === 'string' && /\/chat\/completion$/.test(ctx.url)) {
        AR.pushHistory(obj.chat_session_id || '', { role: 'user', content: obj.prompt, ts: Date.now(), recalled: false });
      }
    });
  }
};
DSE.modules.antiRecall = AntiRecall;
