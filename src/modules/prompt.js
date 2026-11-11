/* ============================================================
 * modules/prompt：单会话提示词工程
 *  - 系统提示词按会话隔离（独立开关），绝不跨会话混淆
 *  - 只改写请求体 prompt，用 ⟦DSE⟧ 标记包裹，历史回读由 net 层剥离
 *  - 不向 AI 发送任何关于 Markdown 的指令（官网默认即 Markdown，本地只做样式美化）
 * ============================================================ */
var Prompt = {
  defaults: {
    recallBrief: '注意：上面包含一条此前被系统撤回、现已补回的对话。为避免再次撤回，请用简短的方式回应（简单确认、轻描淡写或自然转开话题），不要重复敏感细节。'
  },
  tpl: function (name) {
    var custom = DSE.config.get('templates');
    if (custom && typeof custom[name] === 'string') return custom[name];
    return this.defaults[name];
  },
  setTpl: function (name, val) {
    var c = DSE.config.load();
    if (!c.templates) c.templates = JSON.parse(JSON.stringify(this.defaults));
    c.templates[name] = val; DSE.config.save();
  },
  /* 新对话页还没有 sid 时的暂存：填了并发送才转正，只填不发则丢弃 */
  getPending: function () { var v = DSE.config.get('pendingPrompt'); return typeof v === 'string' ? v : ''; },
  setPending: function (v) { DSE.config.set('pendingPrompt', v || ''); },
  saveField: function (key, val) {
    var sid = Utils.currentSid();
    if (sid) { var p = {}; p[key] = val; DSE.config.setSession(sid, p); return; }
    if (key === 'assistantSystemPrompt') this.setPending(val);
  },
  /* 首条消息已带上 pending 后，把这段提示词落到新会话名下 */
  adoptPending: function () {
    if (!this._pendingUsed) return;
    var sid = Utils.currentSid();
    if (!sid) return;
    var pending = this.getPending();
    if (!pending) { this._pendingUsed = false; return; }
    var s = DSE.config.session(sid);
    if (!(s.assistantSystemPrompt || '').trim()) {
      this.saveField('assistantSystemPrompt', pending);
      this.setPending('');
    }
    this._pendingUsed = false;
  },
  resetTpl: function () { var c = DSE.config.load(); c.templates = JSON.parse(JSON.stringify(this.defaults)); DSE.config.save(); },

  historyText: function (sid, limit) {
    var hist = (DSE.modules.antiRecall && DSE.modules.antiRecall.getHistory(sid)) || [];
    if (limit > 0) hist = hist.slice(-limit);
    return hist.map(function (m) {
      var who = m.role === 'user' ? '用户' : '我（AI）';
      var c = m.recalled ? '[曾被撤回的本地缓存内容] ' + m.content : m.content;
      return who + '：' + c;
    }).join('\n');
  },

  wrap: function (text) { return '⟦DSE⟧\n' + text + '\n⟦/DSE⟧'; },

  build: function (original, ctx) {
    var cfg = DSE.config.get();
    var sid = ctx.sid || Utils.currentSid();
    var sess = DSE.config.session(sid);
    var head = [];

    // 仅当前会话的系统提示词
    if (cfg.systemPromptEnabled) {
      var asp = (sess.assistantSystemPrompt || '').trim();
      if (!asp) {
        var pend = Prompt.getPending();
        if (pend.trim()) { asp = pend.trim(); Prompt._pendingUsed = true; }
      }
      if (asp) head.push('[系统设定]\n' + asp);
    }
    // 全量隐私模式：携带本地历史
    if (cfg.privacyMode === 'full') {
      var full = this.historyText(sid, cfg.privacyCtxMessages);
      if (full) head.push('[历史对话]\n' + full);
    }
    if (cfg.timeInject) {
      var d = new Date(), w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
      var p = function (n) { return String(n).padStart(2, '0'); };
      head.push('[当前时间 ' + d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
        p(d.getHours()) + ':' + p(d.getMinutes()) + ' 星期' + w + ']');
    }
    // 智能防撤回：补回缺失轮次
    if (cfg.privacyMode === 'smart' && ctx.recalledRounds && ctx.recalledRounds.length) {
      var block = ['[以下为此前被系统撤回、现从本地补回的对话轮次，请作为上下文理解]'];
      ctx.recalledRounds.forEach(function (r) {
        if (r.user) block.push('用户：' + r.user.content);
        block.push('我（AI）：' + r.assistant.content);
      });
      block.push('[补回内容结束]');
      head.push(block.join('\n'));
      if (cfg.recallBriefHint) head.push(this.tpl('recallBrief'));
    }

    return head.map(this.wrap).join('\n\n') + (head.length ? '\n\n' : '') + original;
  },

  preview: function () {
    return this.build('（你当前输入的消息会放在这里）', { sid: Utils.currentSid(), recalledRounds: [] })
      .replace(/⟦DSE⟧\n?/g, '').replace(/\n?⟦\/DSE⟧/g, '');
  },

  init: function () {
    var c = DSE.config.load();
    var need = JSON.parse(JSON.stringify(this.defaults));
    if (!c.templates) c.templates = need;
    else Object.keys(need).forEach(function (k) { if (typeof c.templates[k] !== 'string') c.templates[k] = need[k]; });
    DSE.config.save();

    setTimeout(function () { setInterval(function () { Prompt.adoptPending(); }, 800); }, 1500);

    DSE.net.addRequestMutator(function (obj, reqCtx) {
      if (!obj || typeof obj.prompt !== 'string' || !obj.prompt) return;
      var sid = obj.chat_session_id || '';
      var rounds = DSE.modules.antiRecall ? DSE.modules.antiRecall.pendingRecalledRounds(sid) : [];
      obj.prompt = Prompt.build(obj.prompt, { sid: sid, recalledRounds: rounds });
    });
  }
};
DSE.modules.prompt = Prompt;
