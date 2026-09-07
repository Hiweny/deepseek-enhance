/* ============================================================
 * modules/context：会话上下文用量（只在设置面板展示，对话界面零侵入）
 *
 * 用量口径（2026-09-07 抓包实测）：
 *  - history_messages 的每条 chat_message 自带 accumulated_token_usage，
 *    它是【该消息生成时整段上下文的累计 token】，取最大值 = 当前会话总占用，
 *    因此脚本注入前就存在的旧对话也能精确算出，无需文本估算。
 *  - 实时对话 SSE 的 accumulated_token_usage 同理，取会话级最大值，不累加。
 *  - 文本估算仅在接口无该字段时兜底。
 *  - 全部按会话 id 隔离。
 * ============================================================ */
var Context = {
  sid: '', live: 0, busy: false,

  loadSid: function (sid) {
    if (!sid || sid === this.sid) return;
    this.sid = sid;
    this.live = DSE.config.session(sid).serverTokens || 0;
    this.emit();
  },
  setServer: function (sid, v) {
    if (!sid || !(v > 0)) return;
    this.loadSid(sid);
    if (v > this.live) {
      this.live = v;
      var s = DSE.config.session(sid);
      s.serverTokens = Math.max(s.serverTokens || 0, v);
      DSE.config.saveSessions();
      this.emit();
    }
  },
  // 从历史响应里取权威用量（每条消息的 accumulated_token_usage 最大值）
  onHistory: function (payload) {
    try {
      var biz = payload.json && payload.json.data && payload.json.data.biz_data;
      var msgs = biz && biz.chat_messages;
      if (!Array.isArray(msgs)) return;
      var sid = (biz.chat_session && biz.chat_session.id) || this.sid;
      if (!sid) return;
      this.loadSid(sid);
      var maxTok = 0, text = '';
      msgs.forEach(function (m) {
        if (typeof m.accumulated_token_usage === 'number') maxTok = Math.max(maxTok, m.accumulated_token_usage);
        (m.fragments || []).forEach(function (f) { text += f.content || ''; });
      });
      var est = Utils.estimateTokens(text);
      var s = DSE.config.session(sid), changed = false;
      if (maxTok > (s.serverTokens || 0)) { s.serverTokens = maxTok; changed = true; }
      var floor = Math.max(maxTok, s.serverTokens || 0);
      if (est > floor && est > (s.usedTokensEst || 0)) { s.usedTokensEst = est; changed = true; }
      if (changed) { DSE.config.saveSessions(); this.emit(); }
    } catch (e) {}
  },
  getUsage: function () {
    var sid = this.sid || Utils.currentSid();
    var s = sid ? DSE.config.session(sid) : { serverTokens: 0, usedTokensEst: 0 };
    var used = Math.max(s.serverTokens || 0, s.usedTokensEst || 0, this.live || 0);
    var limit = DSE.config.get('ctxLimitTokens') || 128000;
    var pct = Math.min(100, Math.round(used / limit * 100));
    return {
      used: used, limit: limit, pct: pct,
      level: pct >= 90 ? 'danger' : (pct >= 75 ? 'warn' : 'ok'),
      source: (s.serverTokens || 0) > 0 ? 'server' : ((s.usedTokensEst || 0) > 0 ? 'estimate' : 'empty')
    };
  },
  emit: function () { DSE.emit('ctx:update', this.getUsage()); },

  // 主动重新统计：拉一次当前会话的 history_messages（与官网同接口），实时重算
  recompute: function () {
    var self = this, sid = Utils.currentSid();
    if (!sid) { Utils.toast('请先进入一个对话'); return Promise.resolve(); }
    if (this.busy) return Promise.resolve();
    this.busy = true; Utils.toast('正在重新统计…');
    return fetch('/api/v0/chat/history_messages?chat_session_id=' + encodeURIComponent(sid), {
      method: 'GET', credentials: 'include', headers: { 'Accept': 'application/json' }
    }).then(function (r) { return r.text(); }).then(function (txt) {
      var json = JSON.parse(txt);
      var s = DSE.config.session(sid); s.serverTokens = 0; s.usedTokensEst = 0; self.live = 0;
      self.onHistory({ json: json });
      // DOM 兜底：当前已渲染消息文本估算
      var domText = '';
      document.querySelectorAll('.ds-markdown, .fbb737a4').forEach(function (n) { domText += n.innerText || ''; });
      var est = Utils.estimateTokens(domText);
      if (est > (s.usedTokensEst || 0)) { s.usedTokensEst = est; DSE.config.saveSessions(); }
      self.sid = sid; self.emit();
      var u = self.getUsage();
      Utils.toast('统计完成：约 ' + (u.used >= 1000 ? (u.used / 1000).toFixed(1) + 'K' : u.used) + ' tokens');
    }).catch(function () { Utils.toast('统计失败（可能需要联网）'); })
      .then(function () { self.busy = false; });
  },

  init: function () {
    var self = this;
    DSE.on('sse:tokens', function (p) { self.setServer(p.ctx.sid || Utils.currentSid(), p.used); });
    DSE.on('history:loaded', function (p) {
      self.loadSid(p.ctx.sid || Utils.currentSid()); self.onHistory(p);
    });
    setInterval(function () { var s = Utils.currentSid(); if (s && s !== self.sid) self.loadSid(s); }, 1000);
    DSE.on('cfg:change', function (e) { if (e.path === 'ctxLimitTokens') self.emit(); });
  }
};
DSE.modules.context = Context;
