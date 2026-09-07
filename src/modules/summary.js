/* ============================================================
 * modules/summary：Waifu 长期对话总结（第一人称、增量更新、防臃肿）
 *  - 不走底层接口 / PoW：直接把总结提示词填入当前对话输入框，
 *    由官网原生管线发送（PoW、令牌全部由官网自己处理）
 *  - 手动 / 自动（超阈值，发送前 toast 提示）两种触发
 *  - AI 的总结回复到达后自动落库为 waifuSummary，并把这轮
 *    “总结请求/总结回复”从本地历史里剔除，避免上下文窗口膨胀
 * ============================================================ */
var Summary = {
  activePrompt: null,        // 正在发送的总结提示词原文（供 prompt 层跳过注入）
  activeSid: null,           // 对应的会话
  cooldownUntil: {},

  // prompt 层调用：判断某个出站请求是不是我们的总结请求（是的话不再叠加 waifu 注入）
  isSummaryRequest: function (ctx) {
    if (!this.activePrompt) return false;
    var obj = ctx && ctx.bodyObj;
    return !!(obj && typeof obj.prompt === 'string' && obj.prompt === this.activePrompt);
  },

  buildPrompt: function (sid) {
    var sess = DSE.config.session(sid);
    var hist = (DSE.modules.antiRecall && DSE.modules.antiRecall.getHistory(sid)) || [];
    var dialog = hist.slice(-60).map(function (m) {
      return (m.role === 'user' ? '用户' : '我（AI）') + '：' + m.content;
    }).join('\n');
    var tpl = DSE.modules.prompt.tpl('summary');
    return tpl
      .replace('{max}', '500')
      .replace('{old}', sess.waifuSummary || '（暂无）')
      .replace('{dialog}', dialog || '（暂无）');
  },

  // 用 React 受控组件的原生 setter 写入输入框，再模拟回车发送
  fillAndSend: function (text) {
    var ta = document.querySelector(DSE.SEL.textarea);
    if (!ta) return false;
    var proto = window.HTMLTextAreaElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    ta.focus();
    setter.call(ta, text);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(function () {
      ta.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
      }));
      ta.dispatchEvent(new KeyboardEvent('keypress', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
      }));
      ta.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
      }));
    }, 120);
    return true;
  },

  // 触发一次总结（isAuto=true 为自动触发）
  run: function (sid, isAuto) {
    sid = sid || Utils.currentSid();
    if (!sid) { Utils.toast('请先进入一个对话'); return Promise.resolve(null); }
    if (this.activeSid === sid) return Promise.resolve(null);
    var prompt = this.buildPrompt(sid);
    if (!this.fillAndSend(prompt)) { Utils.toast('未找到输入框，无法发送总结请求'); return Promise.resolve(null); }
    this.activePrompt = prompt;
    this.activeSid = sid;
    Utils.toast(isAuto
      ? '对话较长，正在通过当前对话更新长期记忆摘要…'
      : '已发送总结请求，回复将自动存为长期记忆');
    return Promise.resolve(prompt);
  },

  init: function () {
    var self = this;

    // AI 回复结束：若这一轮是我们的总结请求，则把回复落库并清理本地历史中的该轮
    DSE.on('sse:finished', function (p) {
      var sid = (p.ctx && p.ctx.sid) || Utils.currentSid();
      if (!self.activeSid || sid !== self.activeSid) return;
      var AR = DSE.modules.antiRecall;
      var hist = AR ? AR.getHistory(sid) : [];
      // antiRecall 不会把总结请求计入 hist，因此末轮就是总结回复
      var last = hist[hist.length - 1];
      var answer = (last && last.role === 'assistant') ? (last.content || '').trim() : '';
      if (answer) {
        DSE.config.setSession(sid, { waifuSummary: answer });
        DSE.emit('summary:updated', { sid: sid, summary: answer });
        // 从本地上下文窗口剔除这条总结回复，防止摘要文本反复堆叠膨胀
        if (AR) {
          var s = DSE.config.session(sid);
          s.hist = hist.slice(0, -1);
          DSE.config.saveSessions();
        }
        Utils.toast('长期记忆摘要已更新');
      }
      self.activePrompt = null;
      self.activeSid = null;
    });

    // 自动总结：每轮结束后按阈值判定，带冷却
    DSE.on('sse:finished', function () {
      var cfg = DSE.config.get();
      if (cfg.mode !== 'waifu' || !cfg.waifu.autoSummary) return;
      var sid = Utils.currentSid();
      if (!sid || self.activeSid === sid) return;
      if (Date.now() < (self.cooldownUntil[sid] || 0)) return;
      var used = DSE.modules.context.getUsage().used;
      if (used >= cfg.waifu.summaryThreshold) {
        self.cooldownUntil[sid] = Date.now() + 180000; // 3 分钟冷却
        setTimeout(function () { self.run(sid, true); }, 1200);
      }
    });
  }
};
DSE.modules.summary = Summary;
