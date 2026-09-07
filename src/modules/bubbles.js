/* ============================================================
 * modules/bubbles：气泡材质 + 用户气泡 + AI 多消息分割（\ 分隔）
 *  策略（按用户要求）：流式过程中保持单气泡原样；AI 回复【完成后】
 *  再用【真实节点】切割成多条并依次浮现 —— 代码块复制/mermaid 交互完整保留。
 *  历史消息（重载/切回/虚拟列表重挂）同步复原、不播动画。
 *  实测官网软换行 = 一个 <p> 内 <span><br><span>，按 <br> 行级切分。
 * ============================================================ */
var Bubbles = {
  histMarked: false,
  rafQ: false,
  stableMap: new WeakMap(),

  applyPreset: function () {
    var p = DSE.config.get('bubblePreset') || 'water';
    document.body.classList.remove('dse-preset-default', 'dse-preset-frosted', 'dse-preset-water');
    document.body.classList.add('dse-preset-' + p);
  },
  styleUserBubbles: function () {
    var nodes = document.querySelectorAll(SEL.userBubble);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.closest('textarea') || n.closest('[contenteditable="true"]')) continue;
      n.classList.add('dse-user-bubble');
    }
  },
  unwrap: function (md) {
    var wraps = md.querySelectorAll('[data-dse-grp]');
    for (var i = wraps.length - 1; i >= 0; i--) {
      var w = wraps[i];
      while (w.firstChild) md.appendChild(w.firstChild);
      w.remove();
    }
  },

  // 真实节点：把块按 <br> 切成行（节点被移动，保留事件/复制按钮）
  splitBlock: function (block) {
    if (block.tagName === 'PRE' || block.querySelector('pre,svg,table,ul,ol')) {
      return [{ atomic: block }];
    }
    var lines = [[]], kids = block.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var n = kids[i];
      if (n.nodeType === 1 && n.tagName === 'BR') lines.push([]);
      else lines[lines.length - 1].push(n);
    }
    return lines.map(function (seg) {
      var text = seg.map(function (x) { return x.textContent || ''; }).join('');
      var hasMedia = seg.some(function (x) { return x.nodeType === 1 && /IMG|SVG|CODE/.test(x.tagName); });
      if (!hasMedia && /^\\{1,2}$/.test(text.replace(/\s/g, ''))) return { sep: true };
      return { line: seg, cls: block.className || '', tag: block.tagName };
    });
  },
  makeP: function (nodes, tag, cls) {
    var p = document.createElement(tag || 'p');
    if (cls) p.className = cls;
    nodes.forEach(function (n) { p.appendChild(n); });
    return p;
  },
  makeBubble: function (blocks) {
    var b = document.createElement('div');
    b.className = 'dse-ai-bubble'; b.setAttribute('data-dse-grp', '1');
    blocks.forEach(function (blk) { b.appendChild(blk); });
    return b;
  },
  makeImgMsg: function (img) {
    var d = document.createElement('div');
    d.className = 'dse-img-msg'; d.setAttribute('data-dse-grp', 'img');
    d.appendChild(img); return d;
  },

  hasSep: function (md) {
    var blocks = md.children;
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.tagName === 'PRE' || b.querySelector('pre,svg,table,ul,ol')) continue;
      // 整块就是分隔符
      if (/^\\{1,2}$/.test((b.textContent || '').replace(/\s/g, ''))) return true;
      // 行内分隔
      if (b.querySelectorAll('br').length) {
        var segs = [[]], kd = b.childNodes;
        for (var j = 0; j < kd.length; j++) {
          if (kd[j].nodeType === 1 && kd[j].tagName === 'BR') segs.push([]);
          else segs[segs.length - 1].push(kd[j]);
        }
        for (var s = 0; s < segs.length; s++) {
          var t = segs[s].map(function (x) { return x.textContent || ''; }).join('').replace(/\s/g, '');
          if (/^\\{1,2}$/.test(t)) return true;
        }
      }
    }
    return false;
  },

  // 回复完成后切割（真实节点移动）
  finalize: function (md, animate) {
    if (md.dataset.dseSplitDone === '1') return;
    this.unwrap(md);
    var groups = [[]], sepSeen = false;
    var kids = Array.prototype.slice.call(md.childNodes);
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.nodeType === 3) { if (k.textContent.trim()) groups[groups.length - 1].push(k); continue; }
      if (k.nodeType !== 1) continue;
      var pieces = this.splitBlock(k);
      for (var j = 0; j < pieces.length; j++) {
        var pc = pieces[j];
        if (pc.atomic) { groups[groups.length - 1].push(pc.atomic); continue; }
        if (pc.sep) { sepSeen = true; groups.push([]); continue; }
        groups[groups.length - 1].push(pieces.length === 1 ? k : this.makeP(pc.line, pc.tag, pc.cls));
      }
      if (pieces.length > 1 && k.parentNode) k.remove();
    }
    groups = groups.filter(function (g) {
      return g.some(function (n) {
        if (n.nodeType === 3) return !!n.textContent.trim();
        return !!(n.textContent || '').trim() || (n.querySelector && n.querySelector('img,svg,pre,table'));
      });
    });
    if (!sepSeen || groups.length <= 1) { md.classList.add('dse-ai-bubble'); md.dataset.dseSplitDone = '1'; return; }

    md.classList.remove('dse-ai-bubble');
    var self = this, gi = 0, frag = document.createDocumentFragment();
    var wantImg = DSE.config.get('markdownImage');
    var bubbles = [];
    groups.forEach(function (g) {
      if (wantImg) {
        var imgs = [];
        g.forEach(function (n) {
          if (n.nodeType === 1 && n.querySelectorAll) n.querySelectorAll('img').forEach(function (im) {
            var pp = im.closest('p');
            if (pp && (pp.textContent || '').trim() === '') imgs.push({ im: im, p: pp });
          });
        });
        imgs.forEach(function (o) { var ix = g.indexOf(o.p); if (ix >= 0) g.splice(ix, 1); });
        if (g.length) bubbles.push(self.makeBubble(g));
        imgs.forEach(function (o) { bubbles.push(self.makeImgMsg(o.im)); });
      } else bubbles.push(self.makeBubble(g));
    });
    bubbles.forEach(function (b) { frag.appendChild(b); });
    md.appendChild(frag);

    // 依次浮现（模拟真人逐条发送）
    if (animate && DSE.config.get('bubbleSplitAnim')) {
      var lo = DSE.config.get('splitTypingMin'), hi = DSE.config.get('splitTypingMax');
      bubbles.forEach(function (b, idx) {
        b.classList.add('dse-wait');
        setTimeout(function () {
          b.classList.remove('dse-wait');
          b.classList.add('dse-bubble-in');
        }, Math.round(idx * Utils.rand(lo, hi)));
      });
    }
    md.dataset.dseSplitDone = '1';
  },

  processAi: function (md) {
    if (md.closest('.ds-think-content')) return;
    var splitOn = DSE.config.get('bubbleSplit');

    if (!splitOn) {
      if (md.dataset.dseSplitDone === '1') { this.unwrap(md); md.dataset.dseSplitDone = ''; }
      md.classList.add('dse-ai-bubble');
      return;
    }
    // 已切割完成：保持
    if (md.dataset.dseSplitDone === '1') return;

    var live = md.dataset.dseLive === '1';
    if (!live) {
      // 历史消息：回复早已完成，直接静态切割（不播动画）
      if (this.hasSep(md)) this.finalize(md, false);
      else md.classList.add('dse-ai-bubble');
      md.dataset.dseSplitDone = '1';
      return;
    }
    // 实时消息：流式期间保持单气泡，等 finished / 稳定观察器切割
    md.classList.add('dse-ai-bubble');
  },

  // 稳定观察：兜底判断“回复完成”（sse:finished 之外的保险）
  watchStable: function () {
    if (!DSE.config.get('bubbleSplit')) return;
    var self = this, mds = document.querySelectorAll(SEL.aiMarkdown);
    mds.forEach(function (md) {
      if (md.dataset.dseLive !== '1' || md.dataset.dseSplitDone === '1') return;
      if (md.closest('.ds-think-content')) return;
      var loading = md.querySelector('[class*="loading-dots"],[class*="cursor-blink"]');
      if (loading) { self.stableMap.set(md, { len: -1, n: 0 }); return; }
      var len = md.textContent.length;
      var st = self.stableMap.get(md) || { len: -1, n: 0 };
      if (len === st.len && len > 0) st.n++; else st = { len: len, n: 0 };
      self.stableMap.set(md, st);
      if (st.n >= 2 && self.hasSep(md)) self.finalize(md, true);
    });
  },

  scan: function () {
    if (!document.body) return;
    this.applyPreset();
    this.styleUserBubbles();
    var mds = document.querySelectorAll(SEL.aiMarkdown + ',' + SEL.aiMarkdownAny);
    var seen = new Set();
    for (var i = 0; i < mds.length; i++) {
      var md = mds[i];
      if (seen.has(md)) continue; seen.add(md);
      if (md.closest('.ds-think-content')) continue;
      if (!this.histMarked) md.dataset.dseLive = '0';
      else if (!md.dataset.dseLive) md.dataset.dseLive = '1';
      try { this.processAi(md); } catch (e) {}
    }
    this.histMarked = true;
  },
  requestScan: function () {
    if (this.rafQ) return; this.rafQ = true;
    var self = this;
    requestAnimationFrame(function () { self.rafQ = false; self.scan(); });
  },
  resetHistoryFlag: function () { this.histMarked = false; this.requestScan(); },

  init: function () {
    var self = this;
    Utils.onReady(function () {
      self.scan();
      new MutationObserver(function () { self.requestScan(); })
        .observe(document.body, { childList: true, subtree: true, characterData: true });
      setInterval(function () { self.watchStable(); }, 900);
      var last = location.href;
      setInterval(function () {
        if (location.href !== last) { last = location.href; setTimeout(self.resetHistoryFlag.bind(self), 500); }
      }, 400);
    });
    // 流结束 → 给当前实时消息做最终切割
    DSE.on('sse:finished', function () {
      setTimeout(function () {
        var mds = document.querySelectorAll(SEL.aiMarkdown);
        for (var i = mds.length - 1; i >= 0; i--) {
          var md = mds[i];
          if (md.dataset.dseLive === '1' && md.dataset.dseSplitDone !== '1' && self.hasSep(md)) {
            self.finalize(md, true); break;
          }
        }
      }, 350);
    });
    DSE.on('cfg:change', function (e) {
      if (['bubbleSplit', 'bubblePreset', 'markdownImage'].indexOf(e.path) !== -1) self.requestScan();
    });
  }
};
DSE.modules.bubbles = Bubbles;
