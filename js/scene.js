/* 活过来的场景：远山、流云、柳枝、锦鲤、风雨雪、落花、归鸟 */
(function (global) {
  'use strict';
  var M = MoDraw, rnd = M.rnd, rint = M.rint, chance = M.chance, INK = M.INK, RED = M.RED, BLUE = M.BLUE;

  var W = 0, H = 0;
  var ridges = [], mists = [], clouds = [], willows = [], fishes = [], trees = [],
    petals = [], drops = [], flakes = [], ripples = [], birds = [], ribbons = [];
  var wind = 0, gust = 0, phase = rnd(0, 10), t = 0;
  var weather = 'clear', weatherLeft = 0;

  // 活景数量设上限：一节课打几十个字，帧率也不往下掉
  var CAP = { clouds: 12, willows: 6, trees: 6 };
  function capped(list, max) { while (list.length > max) list.shift(); }

  function resize(w, h) {
    // 已有的柳、鱼、云、树跟着纸一起缩放，别留在旧坐标上
    if (W && H && (w !== W || h !== H)) {
      var sx = w / W, sy = h / H, sm = Math.min(sx, sy);
      [clouds, fishes, birds, petals, ripples].forEach(function (list) {
        list.forEach(function (o) { o.x *= sx; o.y *= sy; });
      });
      willows.forEach(function (o) {
        o.x *= sx; o.y *= sy; o.s *= sm;
        o.strands.forEach(function (st) { st.ox *= sm; st.oy *= sm; st.len *= sm; st.wid *= sm; });
      });
      trees.forEach(function (o) { o.x *= sx; o.y *= sy; o.s *= sm; });
      clouds.forEach(function (o) { o.s *= sm; });
      fishes.forEach(function (o) { o.s *= sm; });
    }
    W = w; H = h;
    buildTerrain();
  }

  // 撤销某个字时，把它带出来的活景一起收走
  function remove(objs) {
    (objs || []).forEach(function (o) {
      [clouds, willows, fishes, trees, birds].forEach(function (list) {
        var i = list.indexOf(o);
        if (i >= 0) list.splice(i, 1);
      });
    });
  }

  function buildTerrain() {
    ridges = [];
    var layers = 4;
    for (var L = 0; L < layers; L++) {
      var pts = [];
      var top = H * (0.14 + L * 0.075);
      var amp = H * (0.16 - L * 0.028);
      var n = 7 + L * 3;
      for (var i = 0; i <= n; i++) {
        var x = (i / n) * W * 1.15 - W * 0.07;
        var y = top + amp * 0.5 - Math.abs(Math.sin(i * 0.62 + L * 2.1)) * amp * rnd(0.5, 1)
          - Math.sin(i * 0.29 + L * 1.3) * amp * 0.18;
        pts.push({ x: x, y: y });
      }
      var minY = Math.min.apply(null, pts.map(function (p) { return p.y; }));
      ridges.push({ pts: pts, alpha: 0.11 - L * 0.018, top: minY, fade: H * (0.26 + L * 0.05) });
    }
    mists = [];
    for (var k = 0; k < 6; k++) {
      mists.push({ x: rnd(0, W), y: H * (0.26 + k * 0.06), r: rnd(W * 0.1, W * 0.26), v: rnd(1.5, 6), a: rnd(0.05, 0.11) });
    }
  }

  function addCloud(x, y) {
    var c = { x: x === undefined ? rnd(0, W) : x, y: y === undefined ? rnd(H * 0.08, H * 0.3) : y, s: rnd(W * 0.05, W * 0.12), lobes: [], a: rnd(0.1, 0.22) };
    for (var i = 0; i < rint(4, 7); i++) {
      c.lobes.push({ dx: rnd(-1.4, 1.4), dy: rnd(-0.35, 0.35), r: rnd(0.4, 1), a: rnd(0.3, 1) });
    }
    clouds.push(c);
    capped(clouds, CAP.clouds);
    return c;
  }

  function addFish(x, y, col) {
    if (fishes.length > 16) fishes.shift();
    var c = col || (chance(0.4) ? RED : INK);
    fishes.push({
      x: x === undefined ? rnd(W * 0.2, W * 0.8) : x,
      y: y === undefined ? rnd(H * 0.6, H * 0.86) : y,
      s: rnd(H * 0.016, H * 0.032),
      dir: chance(0.5) ? 1 : -1,
      sp: rnd(7, 18),
      ph: rnd(0, 6.28),
      wander: rnd(0, 6.28),
      color: c,
      mark: c === RED ? '#f6efe0' : (chance(0.5) ? RED : '#f6efe0')
    });
    return fishes[fishes.length - 1];
  }

  function addWillow(x, y, s) {
    var w = { x: x, y: y, s: s, strands: [] };
    var n = rint(10, 16);
    for (var i = 0; i < n; i++) {
      var len = s * rnd(0.7, 1.5);
      w.strands.push({
        ox: rnd(-w.s * 0.55, w.s * 0.55), oy: rnd(-w.s * 0.06, w.s * 0.1),
        len: len, ph: rnd(0, 6.28), amp: rnd(0.5, 1), wid: rnd(0.008, 0.016) * s,
        leaves: rint(3, 7)
      });
    }
    willows.push(w);
    capped(willows, CAP.willows);
    return w;
  }

  function addTree(x, y, kind, s) {
    var tr = { x: x, y: y, kind: kind, s: s, cool: 0 };
    trees.push(tr);
    capped(trees, CAP.trees);
    return tr;
  }

  function addBird(x, y) {
    var b = {
      x: x === undefined ? -30 : x,
      y: y === undefined ? rnd(H * 0.1, H * 0.32) : y,
      v: rnd(26, 58), s: rnd(H * 0.013, H * 0.024), ph: rnd(0, 6.28)
    };
    birds.push(b);
    capped(birds, 12);
    return b;
  }

  function setWeather(kind, seconds) {
    weather = kind;
    weatherLeft = seconds || 18;
  }

  function gustWind(power) {
    gust += power;
    for (var i = 0; i < rint(2, 4); i++) {
      ribbons.push({
        x: -W * 0.1, y: rnd(H * 0.12, H * 0.62),
        len: rnd(W * 0.18, W * 0.42), life: 1, w: rnd(1.5, 5),
        blue: chance(0.6), amp: rnd(6, 22)
      });
    }
  }

  function emitPetals(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      petals.push({
        x: x + rnd(-20, 20), y: y + rnd(-14, 14),
        vx: rnd(6, 30), vy: rnd(-6, 14),
        r: rnd(H * 0.004, H * 0.008), rot: rnd(0, 6.28), vr: rnd(-3, 3),
        color: color, a: rnd(0.5, 0.9), life: 1
      });
    }
  }

  function step(dt) {
    t += dt;
    phase += dt * 0.4;
    gust *= Math.pow(0.42, dt);
    var base = Math.sin(phase * 0.7) * 0.22 + Math.sin(phase * 0.23) * 0.16;
    wind += (base + gust - wind) * Math.min(1, dt * 2.4);

    if (weatherLeft > 0) {
      weatherLeft -= dt;
      if (weatherLeft <= 0) weather = 'clear';
    }

    // 云与雾
    var cv = (5 + wind * 46);
    clouds.forEach(function (c) {
      c.x += cv * dt;
      if (c.x - c.s * 2 > W) { c.x = -c.s * 2; c.y = rnd(H * 0.08, H * 0.32); }
    });
    mists.forEach(function (m) {
      m.x += (m.v + wind * 18) * dt;
      if (m.x - m.r > W) m.x = -m.r;
    });

    // 雨
    if (weather === 'rain') {
      var want = Math.round(90 + Math.abs(wind) * 130);
      while (drops.length < want) {
        drops.push({ x: rnd(-W * 0.15, W * 1.1), y: rnd(-H * 0.2, 0), v: rnd(H * 0.9, H * 1.5), l: rnd(H * 0.02, H * 0.05) });
      }
      for (var i = drops.length - 1; i >= 0; i--) {
        var d = drops[i];
        d.y += d.v * dt;
        d.x += wind * 130 * dt;
        if (d.y > H * 0.94) {
          if (chance(0.05)) ripples.push({ x: d.x, y: H * rnd(0.72, 0.95), r: 1, max: rnd(6, 16), a: 0.5 });
          drops.splice(i, 1);
        } else if (d.x < -W * 0.2 || d.x > W * 1.2) drops.splice(i, 1);
      }
    } else {
      drops.length = 0;
    }

    // 雪
    if (weather === 'snow') {
      while (flakes.length < 130) {
        flakes.push({ x: rnd(0, W), y: rnd(-H * 0.2, 0), r: rnd(1.2, 3.4), ph: rnd(0, 6.28), v: rnd(H * 0.03, H * 0.08) });
      }
      for (var k = flakes.length - 1; k >= 0; k--) {
        var f = flakes[k];
        f.y += f.v * dt * 3;
        f.x += (Math.sin(t * 1.4 + f.ph) * 12 + wind * 70) * dt;
        if (f.y > H * 0.98) flakes.splice(k, 1);
      }
    } else {
      flakes.length = 0;
    }

    // 鱼：下雨游得更快
    var fishBoost = weather === 'rain' ? 2.1 : 1;
    fishes.forEach(function (f) {
      f.wander += dt * 0.5;
      f.ph += dt * (4 + fishBoost * 3);
      f.x += f.dir * f.sp * fishBoost * dt;
      f.y += Math.sin(f.wander) * 8 * dt + (chance(0.5) ? 1 : -1) * 3 * dt;
      if (f.x < W * 0.08) { f.dir = 1; }
      if (f.x > W * 0.92) { f.dir = -1; }
      f.y = M.clamp(f.y, H * 0.58, H * 0.9);
      if (weather === 'rain' && chance(0.012)) ripples.push({ x: f.x, y: f.y, r: 1, max: rnd(8, 18), a: 0.35 });
    });
    // 别游成一串：互相挤开
    for (var a1 = 0; a1 < fishes.length; a1++) {
      for (var b1 = a1 + 1; b1 < fishes.length; b1++) {
        var A = fishes[a1], B = fishes[b1];
        var ddx = B.x - A.x, ddy = (B.y - A.y) * 2.2;
        var dist = Math.hypot(ddx, ddy), min = (A.s + B.s) * 1.5;
        if (dist < min && dist > 0.01) {
          var push = (min - dist) / dist * 0.5;
          A.x -= ddx * push; A.y -= ddy * push * 0.45;
          B.x += ddx * push; B.y += ddy * push * 0.45;
        }
      }
    }

    // 花瓣：风大时被打落
    trees.forEach(function (tr) {
      if (Math.abs(wind) > 0.34 && tr.cool <= 0 && chance(0.5)) {
        emitPetals(tr.x, tr.y, tr.kind === 'plum' ? RED : '#d9768a', rint(2, 5));
        tr.cool = 0.5;
      }
      tr.cool -= dt;
    });
    for (var p = petals.length - 1; p >= 0; p--) {
      var pt = petals[p];
      pt.vx += (wind * 90 - pt.vx) * dt * 1.4;
      pt.vy += 26 * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.rot += pt.vr * dt;
      pt.life -= dt * 0.22;
      if (pt.life <= 0 || pt.x > W * 1.05 || pt.y > H * 0.98) petals.splice(p, 1);
    }

    // 涟漪
    for (var r = ripples.length - 1; r >= 0; r--) {
      var rp = ripples[r];
      rp.r += (rp.max - rp.r) * dt * 2.6;
      rp.a -= dt * 0.9;
      if (rp.a <= 0) ripples.splice(r, 1);
    }

    // 风带
    for (var b = ribbons.length - 1; b >= 0; b--) {
      var rb = ribbons[b];
      rb.x += (W * 0.35 + Math.abs(wind) * W * 0.5) * dt;
      rb.life -= dt * 0.42;
      if (rb.life <= 0 || rb.x > W * 1.2) ribbons.splice(b, 1);
    }

    // 鸟
    if (birds.length < 2 && chance(dt * 0.06)) {
      birds.push({ x: -30, y: rnd(H * 0.1, H * 0.34), v: rnd(28, 60), s: rnd(H * 0.012, H * 0.022), ph: rnd(0, 6.28) });
    }
    for (var i2 = birds.length - 1; i2 >= 0; i2--) {
      var bd = birds[i2];
      bd.x += bd.v * dt;
      bd.ph += dt * 6;
      bd.y += Math.sin(bd.ph * 0.4) * 6 * dt;
      if (bd.x > W + 40) birds.splice(i2, 1);
    }
  }

  function drawBG(ctx) {
    ctx.clearRect(0, 0, W, H);
    // 远山：山脚用渐变化开，不留硬边
    for (var L = ridges.length - 1; L >= 0; L--) {
      var rg = ridges[L];
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(rg.pts[0].x, rg.pts[0].y);
      for (var i = 1; i < rg.pts.length; i++) {
        var p0 = rg.pts[i - 1], p1 = rg.pts[i];
        ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
      }
      ctx.lineTo(W * 1.2, H);
      ctx.lineTo(-W * 0.1, H);
      ctx.closePath();
      var g = ctx.createLinearGradient(0, rg.top, 0, rg.top + rg.fade);
      g.addColorStop(0, M.hexA(INK, rg.alpha));
      g.addColorStop(0.45, M.hexA(INK, rg.alpha * 0.5));
      g.addColorStop(1, M.hexA(INK, 0));
      ctx.fillStyle = g;
      ctx.fill();
      // 山脊一线
      ctx.globalAlpha = 1;
      ctx.strokeStyle = M.hexA(INK, rg.alpha * 1.5);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(rg.pts[0].x, rg.pts[0].y);
      for (var j = 1; j < rg.pts.length; j++) {
        var a = rg.pts[j - 1], b = rg.pts[j];
        ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      ctx.stroke();
      ctx.restore();
    }
    // 云
    clouds.forEach(function (c) {
      c.lobes.forEach(function (l) {
        M.wash(ctx, c.x + l.dx * c.s, c.y + l.dy * c.s * 0.5, c.s * l.r, c.s * l.r * 0.42,
          { color: INK, alpha: c.a * l.a * (1 + Math.abs(wind) * 0.5) });
      });
      ctx.save();
      ctx.globalAlpha = c.a * 1.5;
      ctx.strokeStyle = INK; ctx.lineWidth = 1;
      ctx.beginPath();
      for (var s = 0; s <= 8; s++) {
        var x = c.x - c.s + s * c.s * 0.25;
        var y = c.y + Math.sin(s * 0.9 + c.x * 0.01) * c.s * 0.14;
        s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    });
    // 雾带
    mists.forEach(function (m) {
      M.wash(ctx, m.x, m.y, m.r, m.r * 0.22, { color: '#f2ecd9', alpha: m.a * 3 });
      M.wash(ctx, m.x, m.y, m.r * 0.7, m.r * 0.14, { color: INK, alpha: m.a * 0.5 });
    });
  }

  function drawFG(ctx) {
    ctx.clearRect(0, 0, W, H);

    // 柳枝：一枝横出，条儿下垂随风
    willows.forEach(function (w) {
      ctx.save();
      var limb = [
        { x: w.x - w.s * 0.62, y: w.y - w.s * 0.2 },
        { x: w.x - w.s * 0.2, y: w.y - w.s * 0.02 },
        { x: w.x + w.s * 0.22, y: w.y + w.s * 0.08 },
        { x: w.x + w.s * 0.66, y: w.y + w.s * 0.02 }
      ];
      M.stroke(ctx, limb, { w: w.s * 0.085, w2: w.s * 0.03, alpha: 0.8, profile: 'taper', dry: 0.3, seg: 8 });
      // 小杈
      for (var g = 0; g < 3; g++) {
        var gx = w.x + (g - 1) * w.s * 0.3;
        M.stroke(ctx, [{ x: gx, y: w.y + w.s * 0.02 }, { x: gx + w.s * 0.1, y: w.y - w.s * 0.16 }],
          { w: w.s * 0.022, w2: w.s * 0.006, alpha: 0.7, profile: 'taper' });
      }
      w.strands.forEach(function (s) {
        var sway = (wind * s.amp * 0.9 + Math.sin(t * 1.3 + s.ph) * 0.07) * w.s * 0.5;
        var pts = [{ x: w.x + s.ox, y: w.y + s.oy }];
        var seg = 7;
        for (var i = 1; i <= seg; i++) {
          var f = i / seg;
          pts.push({
            x: w.x + s.ox + sway * f * f * 1.5 + Math.sin(t * 1.8 + s.ph + f * 2.2) * w.s * 0.03 * f,
            y: w.y + s.oy + s.len * f
          });
        }
        M.stroke(ctx, pts, { w: s.wid, w2: s.wid * 0.2, alpha: 0.46, profile: 'swell', seg: 7 });
        // 条上小叶
        for (var l = 0; l < s.leaves; l++) {
          var lf = pts[1 + Math.floor(l / s.leaves * (pts.length - 1))];
          var nx = pts[Math.min(pts.length - 1, 2 + Math.floor(l / s.leaves * (pts.length - 1)))];
          M.blade(ctx, lf.x, lf.y, lf.x + (nx.x - lf.x) * 0.4 + (chance(0.5) ? -1 : 1) * w.s * 0.035,
            lf.y + w.s * 0.05, w.s * 0.016, { color: M.GREEN, alpha: 0.55 });
        }
      });
      ctx.restore();
    });

    // 风带
    ribbons.forEach(function (rb) {
      var pts = [];
      for (var i = 0; i <= 10; i++) {
        var f = i / 10;
        pts.push({ x: rb.x - rb.len + f * rb.len, y: rb.y + Math.sin(f * 5 + t * 3) * rb.amp * (1 - f * 0.5) });
      }
      M.stroke(ctx, pts, {
        w: rb.w, w2: rb.w * 0.15, alpha: 0.34 * rb.life, profile: 'swell', seg: 8,
        color: rb.blue ? BLUE : INK
      });
    });

    // 雨丝
    if (drops.length) {
      ctx.save();
      ctx.strokeStyle = M.hexA(BLUE, 0.34);
      ctx.lineWidth = Math.max(0.7, W * 0.0009);
      ctx.beginPath();
      var slant = wind * 0.5;
      drops.forEach(function (d) {
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.l * slant, d.y - d.l);
      });
      ctx.stroke();
      ctx.restore();
    }

    // 雪
    if (flakes.length) {
      ctx.save();
      ctx.fillStyle = '#f7f2e4';
      flakes.forEach(function (f) {
        ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = INK; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 1.5, 0, 6.2832); ctx.stroke();
      });
      ctx.restore();
    }

    // 涟漪
    ripples.forEach(function (rp) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, rp.a) * 0.34;
      ctx.strokeStyle = M.hexA(INK, 0.55);
      ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.ellipse(rp.x, rp.y, rp.r, rp.r * 0.26, 0, 0, 6.2832); ctx.stroke();
      ctx.restore();
    });

    // 锦鲤
    fishes.forEach(function (f) {
      var wig = Math.sin(f.ph) * 0.4;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.scale(f.dir, 1);
      ctx.rotate(wig * 0.12);
      // 尾鳍与胸鳍：飘带两笔
      var fa = [], fb = [], fc = [];
      for (var i = 0; i <= 5; i++) {
        var q = i / 5;
        var sw = Math.sin(f.ph + q * 2.4) * f.s * 0.4 * q;
        fa.push({ x: -f.s * (0.75 + q * 1.15), y: -f.s * 0.1 - q * f.s * 0.5 + sw });
        fb.push({ x: -f.s * (0.75 + q * 1.15), y: f.s * 0.1 + q * f.s * 0.5 + sw });
        if (q < 0.7) fc.push({ x: -f.s * 0.1 - q * f.s * 0.5, y: f.s * 0.3 + q * f.s * 0.55 + sw * 0.4 });
      }
      M.stroke(ctx, fa, { w: f.s * 0.3, w2: f.s * 0.04, alpha: 0.34, profile: 'swell', seg: 6, color: f.color });
      M.stroke(ctx, fb, { w: f.s * 0.26, w2: f.s * 0.04, alpha: 0.3, profile: 'swell', seg: 6, color: f.color });
      M.stroke(ctx, fc, { w: f.s * 0.2, w2: f.s * 0.03, alpha: 0.28, profile: 'swell', seg: 5, color: f.color });
      // 身：一次湿墨，头浓尾淡
      var g = ctx.createRadialGradient(f.s * 0.35, -f.s * 0.08, f.s * 0.06, 0, 0, f.s * 1.1);
      g.addColorStop(0, M.hexA(f.color, 0.82));
      g.addColorStop(0.55, M.hexA(f.color, 0.5));
      g.addColorStop(1, M.hexA(f.color, 0.05));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, f.s, f.s * 0.38, wig * 0.15, 0, 6.2832);
      ctx.fill();
      // 斑纹
      ctx.fillStyle = M.hexA(f.mark, 0.55);
      ctx.beginPath();
      ctx.ellipse(-f.s * 0.15, -f.s * 0.06, f.s * 0.3, f.s * 0.16, 0.3, 0, 6.2832);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(f.s * 0.42, f.s * 0.08, f.s * 0.22, f.s * 0.12, -0.2, 0, 6.2832);
      ctx.fill();
      // 腹下一道留白
      ctx.fillStyle = 'rgba(248,243,230,.42)';
      ctx.beginPath();
      ctx.ellipse(f.s * 0.1, f.s * 0.16, f.s * 0.5, f.s * 0.1, 0, 0, 6.2832);
      ctx.fill();
      // 眼与须
      ctx.fillStyle = M.hexA(INK, 0.7);
      ctx.beginPath(); ctx.arc(f.s * 0.66, -f.s * 0.06, Math.max(0.6, f.s * 0.05), 0, 6.2832); ctx.fill();
      ctx.strokeStyle = M.hexA(INK, 0.4);
      ctx.lineWidth = Math.max(0.5, f.s * 0.035);
      ctx.beginPath();
      ctx.moveTo(f.s * 0.85, f.s * 0.05);
      ctx.quadraticCurveTo(f.s * 1.2, f.s * 0.3 + wig * f.s * 0.2, f.s * 1.45, f.s * 0.42);
      ctx.stroke();
      ctx.restore();
      // 身后拖一团墨
      M.wash(ctx, f.x - f.dir * f.s * 1.3, f.y, f.s * 1.9, f.s * 0.7, { color: f.color, alpha: 0.05 });
    });

    // 花瓣
    petals.forEach(function (pt) {
      M.petal(ctx, pt.x, pt.y, pt.r * 1.4, pt.r * 0.8, pt.rot, { color: pt.color, alpha: pt.a * pt.life });
    });

    // 飞鸟
    birds.forEach(function (bd) {
      var flap = Math.sin(bd.ph) * bd.s * 0.5;
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, bd.s * 0.16); ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bd.x - bd.s, bd.y + flap);
      ctx.quadraticCurveTo(bd.x - bd.s * 0.3, bd.y - bd.s * 0.2, bd.x, bd.y);
      ctx.quadraticCurveTo(bd.x + bd.s * 0.3, bd.y - bd.s * 0.2, bd.x + bd.s, bd.y + flap);
      ctx.stroke();
      ctx.restore();
    });
  }

  function clearAll() {
    clouds = []; willows = []; fishes = []; trees = [];
    petals = []; drops = []; flakes = []; ripples = []; birds = []; ribbons = [];
    weather = 'clear'; weatherLeft = 0; gust = 0;
    buildTerrain();
    for (var i = 0; i < 3; i++) addCloud();
  }

  global.MoScene = {
    resize: resize,
    step: step,
    drawBG: drawBG,
    drawFG: drawFG,
    addCloud: addCloud,
    addFish: addFish,
    addWillow: addWillow,
    addTree: addTree,
    addBird: addBird,
    emitPetals: emitPetals,
    setWeather: setWeather,
    gustWind: gustWind,
    clearAll: clearAll,
    remove: remove,
    get wind() { return wind; },
    get weather() { return weather; },
    get counts() { return { fish: fishes.length, willow: willows.length, cloud: clouds.length, petal: petals.length }; }
  };
})(window);
