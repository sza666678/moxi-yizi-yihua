/* 水墨绘制助手：所有母题都在 0..100 的局部坐标里作画 */
(function (global) {
  'use strict';

  var INK = '#201f1b';
  var RED = '#a4262c';
  var BLUE = '#2f5573';
  var GREEN = '#4a6549';
  var GOLD = '#9a7b45';
  var FONT_BRUSH = '"STXingkai","华文行楷","Xingkai SC","STKaiti","KaiTi","楷体",serif';
  var FONT_KAI = '"STKaiti","KaiTi","Kaiti SC","楷体",serif';

  /* 随机源：默认 Math.random；withSeed 期间换成可复现的种子随机，
     这样撤销、改窗口大小时重画出来的还是同一幅画 */
  var RNG = Math.random;
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function withSeed(seed, fn) {
    var prev = RNG;
    RNG = mulberry(seed >>> 0);
    try { return fn(); } finally { RNG = prev; }
  }

  function rnd(a, b) {
    if (b === undefined) { b = a; a = 0; }
    return a + RNG() * (b - a);
  }
  function rint(a, b) { return Math.floor(rnd(a, b + 1)); }
  function pick(list) { return list[Math.floor(RNG() * list.length)]; }
  function chance(p) { return RNG() < p; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function sign() { return RNG() < 0.5 ? -1 : 1; }

  /* Catmull-Rom 重采样，让折线变成笔意曲线 */
  function smooth(pts, seg) {
    seg = seg || 10;
    if (pts.length < 3) return pts.slice();
    var out = [];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i === 0 ? 0 : i - 1];
      var p1 = pts[i];
      var p2 = pts[i + 1];
      var p3 = pts[i + 2 >= pts.length ? pts.length - 1 : i + 2];
      for (var s = 0; s < seg; s++) {
        var t = s / seg, t2 = t * t, t3 = t2 * t;
        out.push({
          x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
        });
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  var PROFILES = {
    brush: function (t) { return 0.34 + 0.66 * Math.sin(Math.PI * Math.pow(t, 0.62)); },
    reed: function (t) { return Math.max(0.05, Math.sin(Math.PI * t)); },
    taper: function (t) { return 1 - 0.85 * t; },
    swell: function (t) { return 0.25 + 0.75 * t; },
    flat: function () { return 1; }
  };

  function poly(ctx, L, R, grow) {
    ctx.beginPath();
    ctx.moveTo(L[0].x, L[0].y);
    for (var i = 1; i < L.length; i++) ctx.lineTo(L[i].x, L[i].y);
    for (var j = R.length - 1; j >= 0; j--) ctx.lineTo(R[j].x, R[j].y);
    ctx.closePath();
  }

  function offsets(P, w0, w1, jitter, prof, grow) {
    var n = P.length, L = [], R = [];
    var f = PROFILES[prof] || PROFILES.brush;
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? 0 : i / (n - 1);
      var p = P[i];
      var a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      var dx = b.x - a.x, dy = b.y - a.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / len, ny = dx / len;
      var w = (w0 + (w1 - w0) * t) * f(t) * grow;
      var j = (RNG() - 0.5) * w * jitter;
      L.push({ x: p.x + nx * (w / 2 + j), y: p.y + ny * (w / 2 + j), w: w });
      R.push({ x: p.x - nx * (w / 2 + j), y: p.y - ny * (w / 2 + j), w: w });
    }
    return { L: L, R: R };
  }

  /* 一笔：带起笔收笔、可选洇边与飞白 */
  function stroke(ctx, pts, o) {
    o = o || {};
    var P = smooth(pts, o.seg || 9);
    if (P.length < 2) return;
    var color = o.color || INK;
    var alpha = o.alpha == null ? 0.82 : o.alpha;
    var w0 = o.w == null ? 3 : o.w;
    var w1 = o.w2 == null ? w0 : o.w2;
    var jitter = o.jitter == null ? 0.22 : o.jitter;

    ctx.save();
    if (o.bleed) {
      var bl = offsets(P, w0, w1, jitter * 1.6, o.profile, 1 + (o.bleed || 1));
      ctx.globalAlpha = alpha * 0.13;
      ctx.fillStyle = color;
      poly(ctx, bl.L, bl.R);
      ctx.fill();
    }
    var of = offsets(P, w0, w1, jitter, o.profile, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    poly(ctx, of.L, of.R);
    ctx.fill();
    // 笔头笔尾的圆锋：只补在粗端，细梢上再点一个圆就成了串珠子
    if (o.cap !== false) {
      var capA = of.L[0].w / 2, capB = of.L[of.L.length - 1].w / 2;
      ctx.beginPath();
      if (capA > 1.1) ctx.arc(P[0].x, P[0].y, capA, 0, 6.2832);
      if (capB > 1.1) ctx.arc(P[P.length - 1].x, P[P.length - 1].y, capB, 0, 6.2832);
      ctx.fill();
    }

    if (o.dry) {
      ctx.globalCompositeOperation = 'destination-out';
      for (var k = 0; k < (o.dryN || 3); k++) {
        var off = rnd(-w0 / 2, w0 / 2);
        ctx.beginPath();
        for (var i = 0; i < P.length; i++) {
          var t = i / (P.length - 1);
          var a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
          var dx = b.x - a.x, dy = b.y - a.y;
          var len = Math.sqrt(dx * dx + dy * dy) || 1;
          var nx = -dy / len, ny = dx / len;
          var f = PROFILES[o.profile || 'brush'](t);
          var w = (w0 + (w1 - w0) * t) * f;
          var x = P[i].x + nx * off + rnd(-0.2, 0.2);
          var y = P[i].y + ny * off + rnd(-0.2, 0.2);
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.globalAlpha = o.dry * (0.4 + RNG() * 0.6);
        ctx.lineWidth = Math.max(0.25, w0 * 0.16);
        ctx.strokeStyle = '#000';
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* 一团墨：边缘不规则、中心浓 */
  function blot(ctx, x, y, r, o) {
    o = o || {};
    var color = o.color || INK;
    var alpha = o.alpha == null ? 0.5 : o.alpha;
    var lobes = o.lobes || 6;
    ctx.save();
    ctx.fillStyle = color;
    for (var i = 0; i < lobes; i++) {
      var a = rnd(0, 6.2832), d = rnd(0, r * 0.4);
      var rr = r * rnd(0.4, 1);
      ctx.globalAlpha = alpha * rnd(0.18, 0.5);
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, rr, rr * rnd(0.62, 1.05), rnd(0, 3.14), 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = alpha * 0.75;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.55, r * 0.5, rnd(0, 3.14), 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }

  /* 极淡的一片墨晕，用来做远山、水气、云 */
  function wash(ctx, x, y, rx, ry, o) {
    o = o || {};
    var color = o.color || INK;
    var alpha = o.alpha == null ? 0.16 : o.alpha;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, hexA(color, alpha));
    g.addColorStop(0.55, hexA(color, alpha * 0.55));
    g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }

  function hexA(hex, a) {
    if (hex.charAt(0) !== '#') return hex.replace('rgb(', 'rgba(').replace(')', ',' + a + ')');
    var h = hex.replace('#', '');
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* 给任意颜色（#hex 或 rgb()）加一个 alpha，返回 rgba() */
  function colA(c, a) { return hexA(c, a); }

  function dot(ctx, x, y, r, o) {
    o = o || {};
    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 0.85 : o.alpha;
    ctx.fillStyle = o.color || INK;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }

  function petal(ctx, x, y, rx, ry, rot, o) {
    o = o || {};
    var a = o.alpha == null ? 0.8 : o.alpha;
    var col = o.color || RED;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot || 0);
    var g = ctx.createLinearGradient(-rx, 0, rx, 0);
    g.addColorStop(0, hexA(o.base || '#f4ead6', a * 0.5));
    g.addColorStop(0.4, hexA(col, a * 0.72));
    g.addColorStop(1, hexA(o.tip || col, a));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, 6.2832);
    ctx.fill();
    if (o.edge !== false) {
      ctx.strokeStyle = hexA(o.tip || col, a * 0.45);
      ctx.lineWidth = Math.max(0.25, ry * 0.1);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* 尖叶：两头尖的椭圆 */
  function blade(ctx, x0, y0, x1, y1, w, o) {
    o = o || {};
    var mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    var dx = x1 - x0, dy = y1 - y0;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var bg = o.bulge == null ? 1 : o.bulge;
    var nx = -dy / len * w, ny = dx / len * w;
    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 0.7 : o.alpha;
    if (o.tip) {
      var lg = ctx.createLinearGradient(x0, y0, x1, y1);
      lg.addColorStop(0, o.base || o.color || INK);
      lg.addColorStop(0.55, o.color || INK);
      lg.addColorStop(1, o.tip);
      ctx.fillStyle = lg;
    } else {
      ctx.fillStyle = o.color || INK;
    }
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx + nx * bg, my + ny * bg, x1, y1);
    ctx.quadraticCurveTo(mx - nx * (2 - bg), my - ny * (2 - bg), x0, y0);
    ctx.fill();
    ctx.restore();
  }

  /* 荷叶一类的大圆叶：边缘波浪 */
  function roundLeaf(ctx, x, y, r, o) {
    o = o || {};
    var alpha = o.alpha == null ? 0.55 : o.alpha;
    var color = o.color || INK;
    var lobes = o.lobes || 16;
    var flat = o.flat == null ? 0.52 : o.flat;
    var wv = o.waves || 5, wa = o.waveAmt == null ? 0.08 : o.waveAmt;
    var notch = o.notch == null ? rnd(0, 6.28) : o.notch;

    function ring(scale) {
      ctx.beginPath();
      for (var i = 0; i <= lobes; i++) {
        var a = i / lobes * 6.2832;
        var cut = Math.abs(angDiff(a, notch)) < 0.16 ? 0.18 : 1;
        var rr = r * scale * cut * (1 + Math.sin(a * wv) * wa + Math.sin(a * (wv * 2.7)) * wa * 0.4);
        if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, flat);
    // 先洇一圈水气
    ring(1.16);
    ctx.fillStyle = hexA(color, alpha * 0.16);
    ctx.fill();
    // 主体：中心浓、边沿淡的湿墨
    var g = ctx.createRadialGradient(-r * 0.12, -r * 0.14, r * 0.04, 0, 0, r * 1.05);
    g.addColorStop(0, hexA(color, Math.min(0.95, alpha * 1.35)));
    g.addColorStop(0.5, hexA(color, alpha));
    g.addColorStop(0.86, hexA(color, alpha * 0.55));
    g.addColorStop(1, hexA(color, alpha * 0.18));
    ring(1);
    ctx.fillStyle = g;
    ctx.fill();
    // 叶筋：留白
    if (o.veins !== false) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,' + (o.vw == null ? 0.5 : o.vw) + ')';
      ctx.lineWidth = Math.max(0.4, r * 0.035);
      for (var v = 0; v < 9; v++) {
        var va = v / 9 * 6.2832 + rnd(-0.08, 0.08);
        if (Math.abs(angDiff(va, notch)) < 0.3) continue;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(Math.cos(va + 0.12) * r * 0.5, Math.sin(va + 0.12) * r * 0.5,
          Math.cos(va) * r * 0.94, Math.sin(va) * r * 0.94);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // 中心一点浓墨
    ctx.fillStyle = hexA(color, alpha * 0.9);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.1, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  function angDiff(a, b) {
    var d = (a - b) % 6.2832;
    if (d > 3.1416) d -= 6.2832;
    if (d < -3.1416) d += 6.2832;
    return d;
  }

  /* 飞溅 */
  function splatter(ctx, x, y, r, n, o) {
    o = o || {};
    var color = o.color || INK;
    ctx.save();
    ctx.fillStyle = color;
    for (var i = 0; i < n; i++) {
      var a = rnd(0, 6.2832), d = rnd(r * 0.2, r);
      ctx.globalAlpha = (o.alpha == null ? 0.6 : o.alpha) * rnd(0.25, 1);
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, rnd(0.25, o.max || 1.3), rnd(0.25, o.max || 1.3), rnd(0, 3.14), 0, 6.2832);
      ctx.fill();
    }
    ctx.restore();
  }

  /* 行楷大字，带墨洇 */
  function glyph(ctx, ch, x, y, size, o) {
    o = o || {};
    var alpha = o.alpha == null ? 0.9 : o.alpha;
    var color = o.color || INK;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = size + 'px ' + (o.font || FONT_BRUSH);
    if (o.bleed !== false) {
      ctx.globalAlpha = alpha * 0.16;
      ctx.fillStyle = color;
      ctx.fillText(ch, x, y + size * 0.012);
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillText(ch, x, y);
    ctx.restore();
  }

  function seal(ctx, x, y, w, h, text, o) {
    o = o || {};
    var size = o.size || (w * 0.62);
    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 0.92 : o.alpha;
    ctx.fillStyle = o.color || RED;
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 0.35;
    for (var i = 0; i < 60; i++) {
      ctx.beginPath();
      ctx.arc(x + rnd(0, w), y + rnd(0, h), rnd(0.2, w * 0.05), 0, 6.2832);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#f6ead6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = size + 'px ' + FONT_KAI;
    if (text.length > 1 && h > w) {
      for (var k = 0; k < text.length; k++) {
        ctx.fillText(text.charAt(k), x + w / 2, y + h * (0.5 + (k - (text.length - 1) / 2) / text.length * 0.78));
      }
    } else {
      ctx.fillText(text, x + w / 2, y + h / 2);
    }
    ctx.restore();
  }

  /* 随机分叉的枝条 */
  function branch(x, y, angle, len, depth, spread, out, cur) {
    cur = cur || [];
    out = out || [];
    var nx = x + Math.cos(angle) * len, ny = y + Math.sin(angle) * len;
    cur.push({ x: nx, y: ny });
    if (depth <= 1) {
      out.push(cur.slice());
      return out;
    }
    if (chance(0.55) || cur.length > 5) { out.push(cur.slice()); cur = [{ x: nx, y: ny }]; }
    var kids = depth > 2 ? rint(1, 2) : 1;
    for (var i = 0; i < kids; i++) {
      branch(nx, ny, angle + rnd(-spread, spread) + (i ? sign() * rnd(0.3, 0.7) : 0),
        len * rnd(0.6, 0.82), depth - 1, spread, out, cur.slice());
    }
    return out;
  }

  /* 山脊：一条起伏曲线以下的淡墨剪影 */
  function ridge(ctx, x0, x1, baseY, amp, steps, o) {
    o = o || {};
    var pts = [];
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var x = x0 + (x1 - x0) * t;
      var y = baseY - amp * (Math.sin(t * 3.1 + (o.seed || 0)) * 0.5 + Math.sin(t * 7.3 + (o.seed || 0) * 2) * 0.28 + Math.sin(t * 13.7) * 0.12 + 0.4);
      pts.push({ x: x, y: y });
    }
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
    // 淡出的剪影：两头斜着拖出去、底边压到画面外，竖直的断边才不会露在纸上
    var ex = o.fade ? (x1 - x0) * 0.3 : 0;
    ctx.lineTo(x1 + ex, baseY + amp * (o.fade ? 3 : 1));
    ctx.lineTo(x0 - ex, baseY + amp * (o.fade ? 3 : 1));
    ctx.closePath();
    var ra = o.alpha == null ? 0.16 : o.alpha;
    if (o.fade) {                       // 剪影往下淡掉，才不留一条平直的底边
      var rg = ctx.createLinearGradient(0, baseY - amp, 0, baseY + amp * 1.15);
      var col = o.color || INK;
      rg.addColorStop(0, hexA(col, ra));
      rg.addColorStop(0.5, hexA(col, ra * 0.62));
      rg.addColorStop(0.78, hexA(col, ra * 0.28));
      rg.addColorStop(1, hexA(col, 0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = rg;
    } else {
      ctx.globalAlpha = ra;
      ctx.fillStyle = o.color || INK;
    }
    ctx.fill();
    ctx.globalAlpha = ra * (o.fade ? 1.4 : 2.2);
    ctx.lineWidth = o.lw || 0.6;
    ctx.strokeStyle = o.color || INK;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
    ctx.stroke();
    ctx.restore();
    return pts;
  }

  /* 把颜色压暗，用作“醒笔”的浓墨 */
  function darken(hex, k) {
    var c = hex.replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var n = parseInt(c, 16);
    var r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* 把颜色提亮，用作湿叶背光的一面 */
  function lighten(hex, k) {
    var c = hex.replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var n = parseInt(c, 16);
    var r = Math.min(255, Math.round(((n >> 16) & 255) * k));
    var g = Math.min(255, Math.round(((n >> 8) & 255) * k));
    var b = Math.min(255, Math.round((n & 255) * k));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* 三遍墨：淡墨铺底 → 主墨成形 → 浓墨醒笔 → 一侧水线
     这是“像画”和“像涂鸦”的分水岭 */
  function ink3(ctx, pts, o) {
    o = o || {};
    if (!pts || pts.length < 2) return;
    var col = o.color || INK;
    var w = o.w == null ? 4 : o.w, w2 = o.w2 == null ? w * 0.4 : o.w2;
    var seg = o.seg || 9;
    // 一：湿笔铺底，宽而淡，洇得不多
    stroke(ctx, pts, {
      w: w * 1.9, w2: w2 * 1.7, alpha: o.washAlpha == null ? 0.1 : o.washAlpha,
      color: col, profile: 'swell', seg: seg, bleed: 0.35, jitter: o.jitter
    });
    // 二：主墨
    stroke(ctx, pts, {
      w: w, w2: w2, alpha: o.alpha == null ? 0.78 : o.alpha, color: col,
      profile: o.profile || 'taper', seg: seg, jitter: o.jitter, dry: o.dry, bleed: o.bleed
    });
    // 三：浓墨醒笔，只走中段，偏一丝
    var last = pts.length - 1;
    if (o.core !== false) {
      var core = [];
      for (var i = 0; i <= last; i++) {
        var f = i / last;
        var off = (o.side == null ? 1 : o.side) * w * 0.22 * Math.sin(f * 3.1);
        core.push({ x: pts[i].x + off + rnd(-0.4, 0.4), y: pts[i].y + off * 0.4 + rnd(-0.4, 0.4) });
      }
      stroke(ctx, core, {
        w: w * 0.4, w2: w * 0.1, alpha: o.coreAlpha == null ? 0.9 : o.coreAlpha,
        color: o.core || darken(col, 0.55), profile: 'taper', seg: seg, dry: o.coreDry == null ? 0.4 : o.coreDry
      });
    }
    // 四：水线——边缘那道积墨
    if (o.line !== false) {
      var edge = [];
      for (var j = 0; j <= last; j++) {
        var fj = j / last;
        edge.push({ x: pts[j].x - (o.side == null ? 1 : o.side) * w * 0.5 * Math.sin(fj * 2.6),
                    y: pts[j].y + w * 0.28 * Math.sin(fj * 2.6) });
      }
      stroke(ctx, edge, { w: w * 0.14, w2: w * 0.05, alpha: 0.34, color: col, profile: 'flat', seg: seg });
    }
  }

  /* 苔点：画面“透气”的关键，三五簇浓墨小点 */
  function moss(ctx, x, y, n, o) {
    o = o || {};
    var col = o.color || INK;
    var spread = o.spread == null ? 3 : o.spread;
    var am = o.alpha == null ? 1 : o.alpha;
    ctx.save();
    for (var i = 0; i < n; i++) {
      var px = x + rnd(-spread, spread), py = y + rnd(-spread, spread) * 0.5;
      var r = rnd(o.min || 0.35, o.max || 1.1);
      ctx.globalAlpha = rnd(0.45, 0.9) * am;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(px, py, r, r * rnd(0.6, 1), rnd(0, 3.14), 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }

  /* 极淡的一层空气，让主体不“贴”在纸上：横抹成云气，不画圆饼 */
  function air(ctx, x, y, rx, ry, o) {
    o = o || {};
    var col = o.color || INK;
    wash(ctx, x, y, rx * 1.4, ry * 0.62, { color: col, alpha: 0.045 });
    wash(ctx, x + rnd(-rx * 0.3, rx * 0.3), y + rnd(-ry * 0.2, ry * 0.2), rx * 0.95, ry * 0.42, { color: col, alpha: 0.04 });
    wash(ctx, x + rnd(-rx * 0.2, rx * 0.2), y + ry * rnd(0.3, 0.7), rx * 1.1, ry * 0.34, { color: col, alpha: 0.035 });
  }

  global.MoDraw = {
    INK: INK, RED: RED, BLUE: BLUE, GREEN: GREEN, GOLD: GOLD,
    FONT_BRUSH: FONT_BRUSH, FONT_KAI: FONT_KAI,
    withSeed: withSeed,
    rnd: rnd, rint: rint, pick: pick, chance: chance, clamp: clamp, sign: sign,
    smooth: smooth, stroke: stroke, blot: blot, wash: wash, hexA: hexA, colA: colA,
    dot: dot, petal: petal, blade: blade, roundLeaf: roundLeaf,
    splatter: splatter, glyph: glyph, seal: seal, branch: branch, ridge: ridge,
    darken: darken, lighten: lighten, ink3: ink3, moss: moss, air: air
  };
})(window);
