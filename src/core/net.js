/* ============================================================
 * core/net：统一网络层（只 patch 一次）
 *  - 请求体改写管线（提示词注入点：/chat/completion 等的 prompt 字段）
 *  - SSE 增量解析（消息 ID、accumulated_token_usage、撤回信号）
 *  - 历史整体加载信号（history_messages / chat_session/fetch_page）
 * ============================================================ */
var Net = {
  _reqMutators: [],     // (bodyObj, ctx) => void
  _respTransformers: [],// (rawText, ctx) => newText
  _patched: false,

  isGenUrl: function (u) {
    return /\/api\/v0\/chat\/(completion|regenerate|edit_message|continue|resume_stream)/.test(u || '');
  },
  isHistoryUrl: function (u) {
    return /\/api\/v0\/(chat\/history_messages|chat_session\/fetch_page)/.test(u || '');
  },
  addRequestMutator: function (fn) { this._reqMutators.push(fn); },
  addResponseTransformer: function (fn) { this._respTransformers.push(fn); },

  init: function () {
    if (this._patched) return; this._patched = true;
    var self = this;
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    var desc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
    var origGetter = desc && desc.get;

    XMLHttpRequest.prototype.open = function (method, url) {
      this._dseUrl = (url || '').split('?')[0];
      this._dseMethod = method;
      this._dseHeaders = {};
      return origOpen.apply(this, arguments);
    };
    var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
      try { if (this._dseHeaders) this._dseHeaders[k] = v; } catch (e) {}
      return origSetHeader.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
      var xhr = this, url = xhr._dseUrl || '';
      var isGen = self.isGenUrl(url), isHist = self.isHistoryUrl(url);
      if (!isGen && !isHist) return origSend.apply(this, arguments);

      var ctx = {
        url: url, isGen: isGen, isHistory: isHist,
        sid: '', lastLen: 0, bodyObj: null, sse: { reqMid: null, respMid: null, tokens: 0, finished: false }
      };

      // ---- 请求体改写管线 ----
      if (typeof body === 'string' && body.charAt(0) === '{') {
        try {
          var obj = JSON.parse(body);
          ctx.bodyObj = obj; ctx.sid = obj.chat_session_id || '';
          self._reqMutators.forEach(function (fn) { try { fn(obj, ctx); } catch (e) { console.error('[DSE reqMutator]', e); } });
          body = JSON.stringify(obj);
        } catch (e) {}
      }
      if (isGen && xhr._dseHeaders) Net.lastHeaders = xhr._dseHeaders;
      DSE.emit('net:send', ctx);

      // ---- 响应拦截 ----
      if (origGetter) {
        Object.defineProperty(xhr, 'responseText', {
          configurable: true, enumerable: true,
          get: function () {
            var raw = origGetter.call(xhr);
            if (raw == null) return raw;
            var text = String(raw);
            try {
              if (isGen) text = self._handleSSE(xhr, ctx, text);
              else if (isHist) text = self._handleHistory(xhr, ctx, text);
            } catch (e) { console.error('[DSE resp]', e); }
            return text;
          }
        });
        var rd = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'response');
        if (rd && rd.get) {
          var origResp = rd.get;
          Object.defineProperty(xhr, 'response', {
            configurable: true, enumerable: true,
            get: function () {
              var r = origResp.call(xhr);
              if (typeof r === 'string') {
                try {
                  if (isGen) return self._handleSSE(xhr, ctx, r);
                  if (isHist) return self._handleHistory(xhr, ctx, r);
                } catch (e) {}
              }
              return r;
            }
          });
        }
      }
      xhr.addEventListener('load', function () { DSE.emit('net:load', ctx); });
      return origSend.call(this, body);
    };

    // fetch 兜底（站点当前走 XHR，这里仅处理请求改写）
    var origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function (input, init) {
        try {
          var url = typeof input === 'string' ? input : (input && input.url) || '';
          if (self.isGenUrl(url) && init && typeof init.body === 'string' && init.body.charAt(0) === '{') {
            var obj = JSON.parse(init.body);
            self._reqMutators.forEach(function (fn) { try { fn(obj, { url: url, isGen: true, isHistory: false, sid: obj.chat_session_id }); } catch (e) {} });
            init = Object.assign({}, init, { body: JSON.stringify(obj) });
          }
        } catch (e) {}
        return origFetch.call(this, input, init);
      };
    }
  },

  _handleSSE: function (xhr, ctx, raw) {
    // 同一份原文重复读取时直接返回缓存（XHR getter 会被站点多次调用）
    if (xhr._dseRaw === raw && xhr._dseCached != null) return xhr._dseCached;
    // 先跑外部转换器（防撤回等需要改写 SSE；转换器内部自行维护增量状态）
    var text = raw;
    for (var i = 0; i < this._respTransformers.length; i++) {
      text = this._respTransformers[i](text, ctx) || text;
    }
    // 事件解析按【原始文本】的游标增量推进——转换器改写会改变长度，
    // 绝不能用改写后长度做偏移，否则后续事件全部错位
    try {
      var rawLast = ctx.rawLast || 0;
      var tail = raw.substring(rawLast);
      var lines = tail.split('\n');
      for (var li = 0; li < lines.length; li++) {
        var ln = lines[li];
        if (ln.indexOf('event:') === 0) ctx._lastEvent = ln.slice(6).trim();
        if (ln.indexOf('data:') !== 0) continue;
        var payload = ln.replace(/^data:\s*/, '');
        if (!payload || payload === '[DONE]') continue;
        var data;
        try { data = JSON.parse(payload); } catch (e) { continue; }
        if (ctx._lastEvent === 'ready' && data.request_message_id) {
          ctx.sse.reqMid = data.request_message_id; ctx.sse.respMid = data.response_message_id;
          DSE.emit('sse:ready', { ctx: ctx, data: data });
        }
        // token 用量（服务端累计值）
        var used = this._pickTokens(data);
        if (used != null) { ctx.sse.tokens = used; DSE.emit('sse:tokens', { used: used, ctx: ctx }); }
        // 结束状态（兼容直接路径与 BATCH；只触发一次）
        var finished = (data.p === 'response/status' && data.v === 'FINISHED') ||
          (data.p === 'response' && data.o === 'BATCH' && Array.isArray(data.v) &&
            data.v.some(function (x) { return x.p === 'status' && x.v === 'FINISHED'; })) ||
          ctx._lastEvent === 'close';
        if (finished && !ctx.sse.finished) { ctx.sse.finished = true; DSE.emit('sse:finished', { ctx: ctx }); }
        DSE.emit('sse:data', { data: data, ctx: ctx, event: ctx._lastEvent });
      }
      ctx.rawLast = raw.length;
    } catch (e) {}
    xhr._dseRaw = raw;
    xhr._dseCached = text;
    return text;
  },

  _pickTokens: function (data) {
    if (data.v && data.v.response && typeof data.v.response.accumulated_token_usage === 'number')
      return data.v.response.accumulated_token_usage;
    if (data.p === 'response' && data.o === 'BATCH' && Array.isArray(data.v)) {
      for (var i = 0; i < data.v.length; i++)
        if (data.v[i].p === 'accumulated_token_usage' && typeof data.v[i].v === 'number') return data.v[i].v;
    }
    // 路径式 SET op
    if (data.p === 'response/accumulated_token_usage' && typeof data.v === 'number') return data.v;
    return null;
  },

  // 去掉历史里服务端原样存下的注入指令块（⟦DSE⟧…⟦/DSE⟧），保证刷新后用户气泡干净
  _stripInjected: function (node) {
    var RE = /⟦DSE⟧[\s\S]*?⟦\/DSE⟧\n?/g;
    var walk = function (n) {
      if (typeof n === 'string') {
        if (n.indexOf('⟦DSE⟧') === -1) return n;
        return n.replace(RE, '').replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '');
      }
      if (Array.isArray(n)) { for (var i = 0; i < n.length; i++) n[i] = walk(n[i]); return n; }
      if (n && typeof n === 'object') { Object.keys(n).forEach(function (k) { n[k] = walk(n[k]); }); return n; }
      return n;
    };
    return walk(node);
  },

  _handleHistory: function (xhr, ctx, raw) {
    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { return raw; }
    parsed = this._stripInjected(parsed);
    DSE.emit('history:loaded', { json: parsed, ctx: ctx,
      replace: function (np) { parsed = np; } });
    // 外部转换器
    var text = JSON.stringify(parsed);
    for (var i = 0; i < this._respTransformers.length; i++) {
      var r = this._respTransformers[i](text, Object.assign({}, ctx, { historyJson: parsed }));
      if (typeof r === 'string') text = r;
    }
    return text;
  }
};
DSE.net = Net;
DSE.register('net', Net);
