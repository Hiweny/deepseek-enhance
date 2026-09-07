/* ============================================================
 * modules/prompt：提示词工程（只改写请求体 prompt，绝不出现在用户气泡）
 *  - 助手模式：系统提示词按会话隔离（独立开关）
 *  - Waifu 模式：系统提示词跨会话持久 + 第一人称总结 + 上下文窗口
 *  - 默认不注入 Markdown 指令（模型本来就会）；关闭 Markdown 时才要求纯文本
 *  - 所有模板在设置面板透明可见、可编辑
 * ============================================================ */
var Prompt = {
  defaults: {
    multi: '接下来你可以像真人聊天一样，把一次回复拆成几条短消息连续发出：每条消息之间单独占一行，只用一个反斜杠“\\”分隔。分条时用口语化的短句即可，不需要使用 Markdown 格式，也不要提及本规则或输出序号。',
    noMarkdown: '请用纯文本回复，不要使用任何 Markdown 语法（不要 # 标题、* 列表、**加粗**、代码块等），像日常聊天一样自然表达。',
    image: '如果需要给用户发图片，可以直接使用 Markdown 图片语法 ![描述](图片直链) 插入，一张图单独成段。',
    recallBrief: '注意：上面包含一条此前被系统撤回、现已补回的对话。为避免再次撤回，请用简短的方式回应（简单确认、轻描淡写或自然转开话题），不要重复敏感细节。',
    summary: '请把我们到目前为止的对话压缩成一份长期记忆摘要，要求：\n1) 必须以你的第一人称书写，用“我”指代你（AI），用“用户”指代对方，严禁混淆你我身份；\n2) 保留：用户的关键信息与偏好、重要决定、关系/剧情进展、尚未结束的话题；\n3) 若下面提供了“旧摘要”，请在其基础上增量更新、去重合并，禁止把新旧摘要简单堆叠，整体不超过 {max} 字；\n4) 直接输出摘要正文，不要任何开场白或解释。\n\n旧摘要：\n{old}\n\n最近对话：\n{dialog}'
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

  // 注入块统一打标记：历史回读时由 net 层剥离，刷新/换设备后用户气泡依然干净
  wrap: function (text) { return '⟦DSE⟧\n' + text + '\n⟦/DSE⟧'; },

  build: function (original, ctx) {
    var cfg = DSE.config.get();
    var sid = ctx.sid || Utils.currentSid();
    var sess = DSE.config.session(sid);
    var head = [];

    if (cfg.mode === 'waifu') {
      var sp = (cfg.waifu.systemPrompt || '').trim();
      if (sp) head.push(sp);
      var summary = (sess.waifuSummary || '').trim();
      if (summary) head.push('[长期记忆摘要 —— 这是你们此前的共同经历，自然延续，不要复述]\n' + summary);
      var win = this.historyText(sid, cfg.waifu.ctxWindowMessages);
      if (win) head.push('[近期对话上下文]\n' + win);
    } else if (cfg.systemPromptEnabled) {
      var asp = (sess.assistantSystemPrompt || '').trim();
      if (asp) head.push('[系统设定]\n' + asp);
      if (cfg.privacyMode === 'full') {
        var full = this.historyText(sid, cfg.privacyCtxMessages);
        if (full) head.push('[历史对话]\n' + full);
      }
    }

    if (cfg.timeInject) {
      var d = new Date(), w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
      var p = function (n) { return String(n).padStart(2, '0'); };
      head.push('[当前时间 ' + d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ' 星期' + w + ']');
    }
    if (!cfg.markdownPretty) head.push(this.tpl('noMarkdown'));
    else if (cfg.markdownImage) head.push(this.tpl('image'));
    if (cfg.bubbleSplit) head.push(this.tpl('multi'));

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

    // 所有注入块包标记，用户原文保持在标记外
    return head.map(this.wrap).join('\n\n') + '\n\n' + original;
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

    DSE.net.addRequestMutator(function (obj, reqCtx) {
      if (!obj || typeof obj.prompt !== 'string' || !obj.prompt) return;
      if (DSE.modules.summary && DSE.modules.summary.isSummaryRequest(reqCtx)) return;
      var sid = obj.chat_session_id || '';
      var rounds = DSE.modules.antiRecall ? DSE.modules.antiRecall.pendingRecalledRounds(sid) : [];
      obj.prompt = Prompt.build(obj.prompt, { sid: sid, recalledRounds: rounds });
    });
  }
};
DSE.modules.prompt = Prompt;
