/* ============================================================
 * modules/context：会话上下文用量（设置面板展示 + 达阈值轻提示）
 *
 * 用量口径（2026-10-11 官网实测复核）：
 *  - GET /api/v0/chat/history_messages 的每条 chat_message 自带 accumulated_token_usage，
 *    它是【该消息生成时整段上下文的累计 token】。序列单调递增，取最后一条（也是最大值）
 *    即当前会话真实占用；脚本注入前就存在的旧对话也能精确算出，无需文本估算。
 *  - 实时对话 SSE 亦回报 accumulated_token_usage（同一口径），取最新值即可。
 *  - 文本估算（estimateTokens）仅在接口没有真值时兜底；一旦拿到真值就不再参与，
 *    避免把渲染文本（含思考过程/排版标记）算进去而虚高。
 *  - 官网当前模型上下文为 1M（1048576），故固定使用该上限；不再让用户填上限，
 *    改为让用户设定“提醒阈值百分比”，使用量达到即弹一次轻提示。
 *  - 全部按会话 id 隔离。
 * ============================================================ */
var Context = {
  sid: '', live: 0, busy: false, warned: false,
  LIMIT: 1048576,            // 官网当前模型上下文 ≈ 1M

  loadSid: function (sid) {
    if (!sid) return;
    if (sid !== this.sid) { this.sid = sid; this.warned = false; }
    this.live = DSE.config.session(sid).serverTokens || 0;
    this.emit();
  },
  setServer: function (sid, v) {
    if (!sid || !(v > 0)) return;
    this.loadSid(sid);
    if (v !== this.live) {
      this.live = v;
      var s = DSE.config.session(sid);
      s.serverTokens = v;      // 以最新真值为准（刷新后可用更小值纠正）
      DSE.config.saveSessions();
      this.emit();
    }
  },
  // 从历史响应里取权威用量（每条消息 accumulated_token_usage 的最大值 = 当前真实占用）
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
      var s = DSE.config.session(sid), changed = false;
      if (maxTok > 0) {
        if (maxTok !== (s.serverTokens || 0)) { s.serverTokens = maxTok; changed = true; }
      } else {
        // 接口无真值时才用文本估算兜底（一般不会走到）
        var est = Utils.estimateTokens(text);
        if (est > 0 && est !== (s.usedTokensEst || 0)) { s.usedTokensEst = est; changed = true; }
      }
      if (changed) { DSE.config.saveSessions(); this.emit(); }
    } catch (e) {}
  },
  getUsage: function () {
    var sid = this.sid || Utils.currentSid();
    var s = sid ? DSE.config.session(sid) : { serverTokens: 0, usedTokensEst: 0 };
    var server = Math.max(s.serverTokens || 0, this.live || 0);
    var used, source;
    if (server > 0) { used = server; source = 'server'; }          // 权威真值优先
    else if (s.usedTokensEst > 0) { used = s.usedTokensEst; source = 'estimate'; }
    else { used = 0; source = 'empty'; }
    var limit = this.LIMIT;
    var pct = Math.max(0, Math.min(100, Math.round(used / limit * 100)));
    var warnPct = DSE.config.get('ctxWarnPct');
    if (!(warnPct > 0)) warnPct = 80;
    return {
      used: used, limit: limit, pct: pct, warnPct: warnPct,
      level: pct >= warnPct ? 'danger' : (pct >= Math.round(warnPct * 0.7) ? 'warn' : 'ok'),
      source: source
    };
  },
  // 达到阈值弹一次轻提示；用量回落后重新武装，避免反复打扰
  checkWarn: function (u) {
    if (!u || u.source === 'empty') return;
    var warnPct = u.warnPct || 80;
    if (u.pct >= warnPct) {
      if (!this.warned) {
        this.warned = true;
        Utils.toast(DSE.t('本会话上下文已使用 {p}%，达到提醒阈值 {t}%，可考虑开启新对话', { p: u.pct, t: warnPct }), 4200);
      }
    } else if (u.pct < warnPct - 5) {
      this.warned = false;
    }
  },
  emit: function () {
    var u = this.getUsage();
    this.checkWarn(u);
    DSE.emit('ctx:update', u);
  },

  // 主动重新统计：拉一次当前会话的 history_messages（与官网同接口），实时重算
  recompute: function () {
    var self = this, sid = Utils.currentSid();
    if (!sid) { Utils.toast(DSE.t('请先进入一个对话')); return Promise.resolve(); }
    if (this.busy) return Promise.resolve();
    this.busy = true; Utils.toast(DSE.t('正在重新统计…'));
    return fetch('/api/v0/chat/history_messages?chat_session_id=' + encodeURIComponent(sid), {
      method: 'GET', credentials: 'include', headers: { 'Accept': 'application/json' }
    }).then(function (r) { return r.text(); }).then(function (txt) {
      var json = JSON.parse(txt);
      var s = DSE.config.session(sid); s.serverTokens = 0; s.usedTokensEst = 0; self.live = 0;
      self.onHistory({ json: json });
      // DOM 兜底：仅当接口没有真值时，才用当前已渲染消息文本估算
      if (!(s.serverTokens > 0)) {
        var domText = '';
        document.querySelectorAll('.ds-markdown, .fbb737a4').forEach(function (n) { domText += n.innerText || ''; });
        var est = Utils.estimateTokens(domText);
        if (est > 0) { s.usedTokensEst = est; DSE.config.saveSessions(); }
      }
      self.loadSid(sid);
      var u = self.getUsage();
      Utils.toast(DSE.t('统计完成：约') + ' ' + (u.used >= 1000 ? (u.used / 1000).toFixed(1) + 'K' : u.used) + ' ' + DSE.t('tokens'));
    }).catch(function () { Utils.toast(DSE.t('统计失败（可能需要联网）')); })
      .then(function () { self.busy = false; });
  },

  init: function () {
    var self = this;
    DSE.on('sse:tokens', function (p) { self.setServer(p.ctx.sid || Utils.currentSid(), p.used); });
    DSE.on('history:loaded', function (p) {
      self.loadSid(p.ctx.sid || Utils.currentSid()); self.onHistory(p);
    });
    setInterval(function () { var s = Utils.currentSid(); if (s && s !== self.sid) self.loadSid(s); }, 1000);
    DSE.on('cfg:change', function (e) { if (e.path === 'ctxWarnPct') { self.warned = false; self.emit(); } });
  }
};
DSE.modules.context = Context;
