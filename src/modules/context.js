/* ============================================================
 * modules/context：会话上下文用量（只供设置面板展示，不在对话界面插 UI）
 *
 * 数据口径（关键）：
 *  - SSE 的 accumulated_token_usage 是【服务端本轮请求的累计上下文 token】，
 *    本身就是“当前对话总共占用”，直接取最大值即可，禁止逐轮累加（会翻倍）。
 *  - 脚本注入前就已存在的历史对话：从 history/fetch_page 响应文本估算，
 *    与服务端值取 max，因此刚打开旧对话也能看到用量。
 *  - 全部按会话 id 隔离存储，切换会话互不影响。
 * ============================================================ */
var Context = {
  sid: '', live: 0,

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
      s.serverTokens = v;
      // 服务端值是权威口径，同时校正估算值
      if ((s.usedTokensEst || 0) < v) s.usedTokensEst = v;
      DSE.config.saveSessions();
      this.emit();
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
      var sid = (biz.chat_session && biz.chat_session.id) || this.sid;
      if (!sid) return;
      this.loadSid(sid);
      var est = Utils.estimateTokens(text);
      var s = DSE.config.session(sid);
      // 估算只增不减；若服务端已有权威值，以其为下限
      est = Math.max(est, s.serverTokens || 0);
      if (est > (s.usedTokensEst || 0)) { s.usedTokensEst = est; DSE.config.saveSessions(); this.emit(); }
    } catch (e) {}
  },
  // 供面板调用：{used, limit, pct, level, source}
  getUsage: function () {
    var sid = this.sid || Utils.currentSid();
    var s = sid ? DSE.config.session(sid) : { serverTokens: 0, usedTokensEst: 0 };
    var used = Math.max(s.serverTokens || 0, s.usedTokensEst || 0, this.live || 0);
    var limit = DSE.config.get('ctxLimitTokens') || 128000;
    var pct = Math.min(100, Math.round(used / limit * 100));
    return {
      used: used, limit: limit, pct: pct,
      level: pct >= 90 ? 'danger' : (pct >= 75 ? 'warn' : 'ok'),
      source: (s.serverTokens || 0) > 0 ? 'server' : 'estimate'
    };
  },
  emit: function () { DSE.emit('ctx:update', this.getUsage()); },
  reset: function () {
    var sid = this.sid || Utils.currentSid();
    if (!sid) return;
    var s = DSE.config.session(sid); s.usedTokensEst = 0; s.serverTokens = 0;
    this.live = 0; DSE.config.saveSessions(); this.emit();
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
