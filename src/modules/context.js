/* ============================================================
 * modules/context：会话上下文用量统计（不在对话界面插 UI，只供设置面板展示）
 * ============================================================ */
var Context = {
  sid: '', committed: 0, turn: 0,
  loadSid: function (sid) {
    if (sid === this.sid) return;
    this.sid = sid; this.turn = 0;
    this.committed = DSE.config.session(sid).usedTokens || 0;
    this.emit();
  },
  onTokens: function (v) { this.turn = Math.max(this.turn, v); this.emit(); },
  onFinished: function () {
    if (this.turn > 0) {
      this.committed += this.turn;
      var s = DSE.config.session(this.sid);
      s.usedTokens = this.committed; DSE.config.saveSessions();
      this.turn = 0; this.emit();
    }
  },
  onHistory: function (payload) {
    try {
      var biz = payload.json && payload.json.data && payload.json.data.biz_data;
      var msgs = biz && (biz.chat_messages || biz.messages) || [];
      var text = '';
      msgs.forEach(function (m) {
        (m.fragments || []).forEach(function (f) { text += f.content || ''; });
        if (typeof m.content === 'string') text += m.content;
      });
      var est = Utils.estimateTokens(text);
      if (est > this.committed) {
        this.committed = est;
        DSE.config.session(this.sid).usedTokens = est; DSE.config.saveSessions();
        this.emit();
      }
    } catch (e) {}
  },
  // 供面板调用：返回 {used, limit, pct, level}
  getUsage: function () {
    var limit = DSE.config.get('ctxLimitTokens') || 128000;
    var used = this.committed + this.turn;
    var pct = Math.min(100, Math.round(used / limit * 100));
    return { used: used, limit: limit, pct: pct, level: pct >= 90 ? 'danger' : (pct >= 75 ? 'warn' : 'ok') };
  },
  emit: function () { DSE.emit('ctx:update', this.getUsage()); },
  reset: function () { this.committed = 0; this.turn = 0; var s = DSE.config.session(this.sid); s.usedTokens = 0; DSE.config.saveSessions(); this.emit(); },
  init: function () {
    var self = this;
    DSE.on('sse:tokens', function (p) { self.loadSid(p.ctx.sid || Utils.currentSid()); self.onTokens(p.used); });
    DSE.on('sse:finished', function () { self.onFinished(); });
    DSE.on('history:loaded', function (p) { self.loadSid(p.ctx.sid || Utils.currentSid()); self.onHistory(p); });
    setInterval(function () { var s = Utils.currentSid(); if (s !== self.sid) self.loadSid(s); }, 1000);
    DSE.on('cfg:change', function (e) { if (e.path === 'ctxLimitTokens') self.emit(); });
  }
};
DSE.modules.context = Context;
