/* ============================================================
 * modules/antiRecall：防撤回 + 本地历史（智能/全量模式的数据底座）
 *  - SSE 撤回信号（TEMPLATE_RESPONSE / CONTENT_FILTER）到达前缓存真实内容
 *  - 历史接口（history_messages / fetch_page）用缓存补回被撤回消息
 *  - 智能模式修复：连续撤回连续回填；一旦服务端整体重载上下文，
 *    清除服务端已包含的旧撤回，只回填仍缺失的最新轮次
 * ============================================================ */
var AntiRecall = {
  TEMPLATE_RESPONSE: 'TEMPLATE_RESPONSE',
  CONTENT_FILTER: 'CONTENT_FILTER',
  RECALL_TIP: '⚠️ 此回复已被撤回，以下为本地缓存内容',
  RECALL_NOT_FOUND: '⛔ 此回复已被撤回，本地缓存中未找到',

  /* ---------- localStorage 原始片段缓存 ---------- */
  rawKey: function (sid, mid) { return 'dse_recall_' + (sid || '') + '_' + (mid || ''); },
  saveRaw: function (sid, mid, frags) { try { localStorage.setItem(this.rawKey(sid, mid), JSON.stringify(frags)); } catch (e) {} },
  loadRaw: function (sid, mid) {
    try {
      var raw = localStorage.getItem(this.rawKey(sid, mid));
      if (raw) { var f = JSON.parse(raw); f.push({ id: f.length + 1, type: 'TIP', style: 'WARNING', content: this.RECALL_TIP }); return f; }
    } catch (e) {}
    return [{ content: this.RECALL_NOT_FOUND, id: 2, type: this.TEMPLATE_RESPONSE }];
  },

  /* ---------- 会话级高层历史 ---------- */
  getHistory: function (sid) { return DSE.config.session(sid).hist || []; },
  pushHistory: function (sid, item) {
    var s = DSE.config.session(sid);
    if (!s.hist) s.hist = [];
    s.hist.push(item);
    if (s.hist.length > 400) s.hist = s.hist.slice(-400); // 防爆
    DSE.config.saveSessions();
  },
  clearHistory: function (sid) {
    if (sid) { DSE.config.setSession(sid, { hist: [] }); }
    else { var all = DSE.config.sessions(); Object.keys(all).forEach(function (k) { all[k].hist = []; }); DSE.config.saveSessions(); }
  },

  // 智能模式：计算当前仍需回填的撤回轮次（服务端上下文里没有的）
  pendingRecalledRounds: function (sid) {
    if (DSE.config.get('privacyMode') !== 'smart') return [];
    var h = this.getHistory(sid), rounds = [];
    for (var i = 0; i < h.length; i++) {
      if (h[i].role === 'assistant' && h[i].recalled && !h[i].serverHas) {
        var user = null;
        for (var j = i - 1; j >= 0; j--) if (h[j].role === 'user') { user = h[j]; break; }
        rounds.push({ user: user, assistant: h[i] });
      }
    }
    return rounds;
  },

  /* ---------- SSE op 树状态机（移植自旧版成熟实现） ---------- */
  setByPath: function (obj, path, val, append) {
    var keys = path.split('/'), cur = obj;
    var parseK = function (k, c) { return (/^[-+]?\d+$/.test(k)) ? (parseInt(k) < 0 ? c.length + parseInt(k) : parseInt(k)) : k; };
    for (var i = 0; i < keys.length - 1; i++) {
      var k = parseK(keys[i], cur);
      if (!(k in cur)) cur[k] = typeof parseK(keys[i + 1], cur) === 'number' ? [] : {};
      cur = cur[k];
    }
    var lk = parseK(keys[keys.length - 1], cur);
    if (append) { if (Array.isArray(cur[lk])) cur[lk] = cur[lk].concat(val); else cur[lk] = (cur[lk] || '') + val; }
    else cur[lk] = val;
  },
  makeState: function (sid) {
    return {
      fields: {}, sid: sid, recalled: false, recalledContent: '',
      preCheck: function (data, AR) {
        var path = data.p, mode = data.o, modified = false;
        if (mode === 'BATCH' && path === 'response') {
          for (var i = 0; i < data.v.length; i++) {
            var v = data.v[i];
            if (v.p === 'fragments' && v.v && v.v[0] && v.v[0].type === AR.TEMPLATE_RESPONSE) {
              modified = true;
              AR.saveRaw(this.sid, this.fields.response && this.fields.response.message_id, this.fields.response.fragments);
              var real = '';
              (this.fields.response.fragments || []).forEach(function (f) { if (f.type === 'RESPONSE') real += f.content || ''; });
              this.recalledContent = real; this.recalled = true;
              data.v[i] = { v: [{ id: 1, type: 'TIP', style: 'WARNING', content: AR.RECALL_TIP }], p: 'fragments', o: 'APPEND' };
            }
            if (v.p === 'status' && v.v === AR.CONTENT_FILTER) {
              modified = true; this.recalled = true; data.v[i] = { p: 'status', v: 'FINISHED' };
            }
          }
        }
        return modified ? JSON.stringify(data) : '';
      },
      update: function (data, AR) {
        var repl = this.preCheck(data, AR);
        // BATCH：v 是一组子 op，子 op 的 p 相对当前节点路径递归展开（官网现行协议）
        if (data.o === 'BATCH' && Array.isArray(data.v)) {
          var base = data.p ? String(data.p).replace(/\/$/, '') + '/' : '';
          var savedP = this._p, savedO = this._o;
          for (var bi = 0; bi < data.v.length; bi++) {
            var sub = data.v[bi];
            this.update({ p: base + (sub.p || ''), o: sub.o, v: sub.v }, AR);
          }
          this._p = savedP; this._o = savedO;
          return repl;
        }
        if (data.p) this._p = data.p;
        if (data.o) this._o = data.o;
        var val = data.v;
        if (typeof val === 'object' && !this._p) { for (var k in val) this.fields[k] = val[k]; }
        else AR.setByPath(this.fields, this._p, val, this._o === 'APPEND');
        return repl;
      },
      content: function () {
        if (this.recalled && this.recalledContent) return this.recalledContent;
        var out = '';
        ((this.fields.response && this.fields.response.fragments) || []).forEach(function (f) {
          if (f.type === 'RESPONSE') out += f.content || '';
        });
        return out;
      }
    };
  },

  transformSSE: function (raw, ctx) {
    if (!ctx._arState) { ctx._arState = this.makeState(ctx.sid); ctx._arLast = 0; }
    var st = ctx._arState;
    if (raw.length <= ctx._arLast) return raw;
    var tail = raw.substring(ctx._arLast), lines = tail.split('\n'), changed = false;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (ln.indexOf('data:') !== 0) continue;
      try {
        var data = JSON.parse(ln.replace(/^data:\s*/, ''));
        if (data.v) { var repl = st.update(data, this); if (repl) { lines[i] = 'data: ' + repl; changed = true; } }
      } catch (e) {}
    }
    var out = changed ? raw.substring(0, ctx._arLast) + lines.join('\n') : raw;
    ctx._arLast = out.length;
    ctx._arState = st;
    return out;
  },
  commitTurn: function (ctx) {
    var st = ctx._arState; if (!st) return;
    var content = st.content();
    if (content) this.pushHistory(ctx.sid, { role: 'assistant', content: content, ts: Date.now(), recalled: st.recalled });
    if (st.recalled && DSE.config.get('privacyMode') === 'smart') Utils.toast('已拦截一次撤回，内容已本地保留');
  },

  transformHistory: function (raw, ctx) {
    var AR = this;
    try {
      var j = JSON.parse(raw), biz = j.data && j.data.biz_data;
      if (!biz) return raw;
      var sid = (biz.chat_session && biz.chat_session.id) || ctx.sid;
      var msgs = biz.chat_messages || biz.messages || [];
      var changed = false;
      // 服务端现存消息文本集合，用于判定本地撤回是否已被服务端重新加载
      var serverTexts = {};
      msgs.forEach(function (m) {
        var t = '';
        (m.fragments || []).forEach(function (f) { t += f.content || ''; });
        if (t) serverTexts[t.slice(0, 60)] = true;
        if (m.status === AR.CONTENT_FILTER) {
          m.fragments = AR.loadRaw(sid, m.message_id); m.status = 'FINISHED'; changed = true;
        }
      });
      // 关键修复：上下文整体加载后，把服务端已有的旧撤回标记为 serverHas，不再回填
      var hist = this.getHistory(sid);
      hist.forEach(function (h) {
        if (h.recalled && !h.serverHas && h.content && serverTexts[h.content.slice(0, 60)]) { h.serverHas = true; changed = true; }
      });
      // fetch_page = 服务端整体重载了上下文：只保留“最新一轮”仍待回填，
      // 更早的撤回轮一律视为服务端已承载，避免旧撤回被反复拼进 prompt
      if (/fetch_page/.test(ctx.url || '')) {
        var pendingIdx = [];
        hist.forEach(function (h, i) { if (h.role === 'assistant' && h.recalled && !h.serverHas) pendingIdx.push(i); });
        if (pendingIdx.length > 1) {
          for (var k = 0; k < pendingIdx.length - 1; k++) { hist[pendingIdx[k]].serverHas = true; changed = true; }
        }
      }
      if (changed) { DSE.config.saveSessions(); return JSON.stringify(j); }
    } catch (e) {}
    return raw;
  },

  init: function () {
    var AR = this;
    // 记录用户发送（原始输入，不含装饰）——在 prompt 模块之前注册
    DSE.net.addRequestMutator(function (obj, ctx) {
      if (obj && typeof obj.prompt === 'string' && /\/chat\/completion$/.test(ctx.url)) {
        var sid = obj.chat_session_id || '';
        var isSummary = DSE.modules.summary && DSE.modules.summary.isSummaryRequest(ctx);
        if (!isSummary) AR.pushHistory(sid, { role: 'user', content: obj.prompt, ts: Date.now(), recalled: false });
      }
    });
    // 响应转换
    DSE.net.addResponseTransformer(function (raw, ctx) {
      if (ctx.isGen) return AR.transformSSE(raw, ctx);
      if (ctx.isHistory) return AR.transformHistory(raw, ctx);
      return raw;
    });
    // 流结束时落库本轮 AI 回复
    DSE.on('sse:finished', function (p) { AR.commitTurn(p.ctx); });
  }
};
DSE.modules.antiRecall = AntiRecall;
