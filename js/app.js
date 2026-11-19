/* 主控：打字→落字→生画→动景→出声 */
(function (global) {
  'use strict';
  var M = MoDraw, rnd = M.rnd, rint = M.rint, clamp = M.clamp;
  var stage = document.getElementById('stage');
  var cPaper = document.getElementById('paper'), cBG = document.getElementById('bg'),
    cArt = document.getElementById('art'), cRv = document.getElementById('reveal'),
    cInk = document.getElementById('ink'), cFG = document.getElementById('fg');
  var xPaper = cPaper.getContext('2d'), xBG = cBG.getContext('2d'), xArt = cArt.getContext('2d'),
    xRv = cRv.getContext('2d'), xInk = cInk.getContext('2d'), xFG = cFG.getContext('2d');
  var elTitle = document.getElementById('titlecard'), elComp = document.getElementById('composing'),
    elCompText = document.getElementById('composingText'), elCard = document.getElementById('pinyincard'),
    elKeys = document.getElementById('pinyinKeys'), elZi = document.getElementById('pinyinZi'),
    elGloss = document.getElementById('pinyinGloss'), elWords = document.getElementById('pinyinWords'),
    elFall = document.getElementById('falllist'), elIME = document.getElementById('ime'),
    elPanel = document.getElementById('tablePanel'), elTableBody = document.getElementById('tableBody'),
    elAim = document.getElementById('aim');

  var view = { w: 0, h: 0, dpr: 1 };
  var placed = [];
  var aim = null;
  var falled = 0;
  var lastT = 0, clock = 0, rainInkCool = 0;
  var titleHidden = false;
  var soundOn = true;

  /* ---------------- 画布尺寸 ---------------- */
  function sizeCanvas(c, w, h, dpr) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    var ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function resize() {
    flushReveals();
    var oldW = view.w, oldH = view.h;
    hideAim();
    var w = global.innerWidth, h = global.innerHeight;
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    view.w = w; view.h = h; view.dpr = dpr;
    sizeCanvas(cPaper, w, h, dpr);
    sizeCanvas(cBG, w, h, dpr);
    sizeCanvas(cArt, w, h, dpr);
    sizeCanvas(cRv, w, h, dpr);
    sizeCanvas(cInk, w, h, dpr);
    sizeCanvas(cFG, w, h, dpr);
    drawPaper(w, h);
    MoInk.resize(w / h);
    MoScene.resize(w, h);
    if (oldW && oldH && placed.length) {
      // 位置按比例挪，大小按短边等比缩放，再用各自的种子原样重画——不拉伸、不变样
      placed.forEach(function (p) {
        p.x = p.x / oldW * w;
        p.y = p.y / oldH * h;
        p.r = p.r / Math.min(oldW, oldH) * Math.min(w, h);
      });
      redrawAll();
    }
  }

  /* ---------------- 宣纸底 ---------------- */
  function drawPaper(w, h) {
    xPaper.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    var g = xPaper.createLinearGradient(0, 0, w * 0.6, h);
    g.addColorStop(0, '#efe7d3'); g.addColorStop(0.5, '#e9e0cb'); g.addColorStop(1, '#e2d7be');
    xPaper.fillStyle = g;
    xPaper.fillRect(0, 0, w, h);
    // 纸纤维
    xPaper.save();
    for (var i = 0; i < 900; i++) {
      var x = rnd(0, w), y = rnd(0, h), l = rnd(2, 26), a = rnd(0, 3.14);
      xPaper.strokeStyle = 'rgba(120,104,74,' + rnd(0.02, 0.07).toFixed(3) + ')';
      xPaper.lineWidth = rnd(0.4, 1.1);
      xPaper.beginPath();
      xPaper.moveTo(x, y);
      xPaper.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      xPaper.stroke();
    }
    // 淡墨渍与霉斑
    for (var k = 0; k < 12; k++) {
      M.wash(xPaper, rnd(0, w), rnd(0, h), rnd(w * 0.02, w * 0.11), rnd(h * 0.01, h * 0.06),
        { color: k % 3 ? '#b8a882' : M.INK, alpha: rnd(0.02, 0.05) });
    }
    xPaper.restore();
    // 装裱边
    xPaper.save();
    xPaper.strokeStyle = 'rgba(120,104,78,.22)';
    xPaper.lineWidth = 1;
    xPaper.strokeRect(14.5, 14.5, w - 29, h - 29);
    xPaper.restore();
  }

  /* ---------------- 落字位置 ---------------- */
  var ZONE = {
    high: [0.06, 0.74, 0.06, 0.26],   // 云 鸟 日 月
    sky: [0.06, 0.74, 0.05, 0.34],
    mid: [0.07, 0.72, 0.16, 0.56],
    low: [0.10, 0.74, 0.54, 0.86],    // 鱼 水
    any: [0.07, 0.74, 0.13, 0.78]
  };
  var ZONE_BY = {
    柳: 'high', 杨: 'high', 枝: 'high', 云: 'sky', 雾: 'sky', 霞: 'sky', 天: 'sky',
    鸟: 'sky', 燕: 'sky', 鹤: 'sky', 鸡: 'sky', 鹅: 'sky', 蝶: 'sky', 蜂: 'sky', 虫: 'mid',
    日: 'sky', 月: 'sky', 星: 'sky', 风: 'sky',
    鱼: 'low', 鲤: 'low', 虾: 'low', 龟: 'low', 水: 'low', 河: 'low', 湖: 'low', 海: 'low',
    溪: 'low', 泉: 'low', 池: 'low', 荷: 'low', 莲: 'low', 船: 'low', 桥: 'low',
    山: 'mid', 峰: 'mid', 岭: 'mid', 石: 'mid', 树: 'mid', 梅: 'mid', 桃: 'mid', 竹: 'mid',
    松: 'mid', 兰: 'mid', 菊: 'mid', 花: 'mid', 草: 'mid', 叶: 'mid', 雪: 'sky', 雨: 'sky'
  };

  function chooseSpot(ch) {
    var w = view.w, h = view.h, mn = Math.min(w, h);
    var z = ZONE[ZONE_BY[ch] || 'any'] || ZONE.any;
    var S = clamp(mn * (0.44 - placed.length * 0.016), mn * 0.15, mn * 0.44);
    var x0 = z[0] * w, x1 = z[1] * w, y0 = z[2] * h, y1 = z[3] * h;
    S = Math.min(S, (x1 - x0) * 0.92, (y1 - y0) * 0.92);
    var best = null, bestScore = -1;
    var pad = S * 0.52;
    for (var i = 0; i < 30; i++) {
      var cx = rnd(x0, x1), cy = rnd(y0, y1);
      if (cx - pad < w * 0.045 || cx + pad > w * 0.87 || cy - pad < h * 0.09 || cy + pad > h - 210) continue;
      var score = 1e9;
      for (var j = 0; j < placed.length; j++) {
        var p = placed[j];
        var d = Math.hypot(cx - p.x, cy - p.y) - (p.r + S * 0.5) * 0.72;
        if (d < 0) { score = -1; break; }
        score = Math.min(score, d);
      }
      if (score > 0) {
        // 稍微偏好黄金分割点，画面更有呼吸
        score += 40 - Math.hypot(cx - w * 0.382, cy - h * 0.5) * 0.12;
      }
      if (score > bestScore) { bestScore = score; best = { x: cx, y: cy, s: S }; }
      if (bestScore > mn * 0.22) break;
    }
    if (!best) {
      // 纸面挤满了：缩小一点再随机放，仍避开拼音卡
      S = S * 0.7; pad = S * 0.52;
      for (var k = 0; k < 24; k++) {
        var ax = rnd(x0, x1), ay = rnd(y0, Math.min(y1, h - 210 - pad));
        if (ax - pad < w * 0.045 || ax + pad > w * 0.87 || ay - pad < h * 0.09) continue;
        best = { x: ax, y: ay, s: S };
        break;
      }
      if (!best) best = { x: w * 0.4, y: h * 0.45, s: S };
    }
    return best;
  }

  /* 点出来的落笔处：以点击为中心，只按纸边和已有的画收大小，不挪位置 */
  function spotAtPoint(px, py) {
    var w = view.w, h = view.h, mn = Math.min(w, h);
    var S = clamp(mn * (0.44 - placed.length * 0.016), mn * 0.15, mn * 0.44);
    var fit = Math.min((px - w * 0.045) * 2, (w * 0.87 - px) * 2, (py - h * 0.09) * 2, (h - 210 - py) * 2);
    S = Math.max(mn * 0.12, Math.min(S, fit));
    for (var i = 0; i < 7 && S > mn * 0.13; i++) {
      var crowd = false;
      for (var j = 0; j < placed.length; j++) {
        var p = placed[j];
        if (Math.hypot(px - p.x, py - p.y) < (p.r + S * 0.5) * 0.62) { crowd = true; break; }
      }
      if (!crowd) break;
      S *= 0.8;
    }
    return { x: clamp(px, w * 0.045 + S * 0.5, w * 0.87 - S * 0.5),
      y: clamp(py, h * 0.09 + S * 0.5, h - 210 - S * 0.5), s: S };
  }

  function showAim(px, py) {
    aim = { x: px, y: py };
    elAim.style.left = px + 'px';
    elAim.style.top = py + 'px';
    elAim.classList.add('show');
  }

  function hideAim() {
    aim = null;
    elAim.classList.remove('show');
  }

  var WARM = { plum: 1, peach: 1, blossom: 1, fire: 1, sun: 1, colorred: 1, lantern: 1, drum: 1, bell: 1 };  var COOL = { fish: 1, water: 1, wave: 1, rain: 1, snow: 1, sky: 1, cloud: 1, mist: 1, lightning: 1, wind: 1, moon: 1, rainbow: 1 };

  function seedInk(spot, motifKey, ch) {
    var gx = spot.x / view.w, gy = spot.y / view.h;
    var rad = spot.s / view.w * 0.42;
    MoInk.addDensity(gx, gy, rad, 0.5, 'ink');
    if (WARM[motifKey]) MoInk.addDensity(gx, gy, rad * 0.7, 0.34, 'warm');
    else if (COOL[motifKey]) MoInk.addDensity(gx, gy, rad * 0.7, 0.3, 'cool');
    // 落笔的一股冲力
    var ang = rnd(0, 6.283), pow = rnd(2.5, 6);
    MoInk.addVelocity(gx, gy, Math.cos(ang) * pow, Math.sin(ang) * pow, 0.08);
    MoInk.addVelocity(gx, gy, -Math.cos(ang) * pow, -Math.sin(ang) * pow, 0.12);
  }

  /* ---------------- 洇墨生画 ---------------- */
  var reveals = [];
  var rvDirty = false;

  function paintOff(key, ch, S, seed) {
    var size = Math.round(S * 1.6), pad = (size - S) / 2;
    var cv = document.createElement('canvas');
    cv.width = cv.height = Math.max(2, Math.round(size * view.dpr));
    var x = cv.getContext('2d');
    x.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    x.lineCap = 'round'; x.lineJoin = 'round';
    x.translate(pad, pad);
    x.scale(S / 100, S / 100);
    MoDraw.withSeed(seed, function () { MoMotifs.draw(x, key, { ch: ch }); });
    return { cv: cv, size: size };
  }

  function revealsPixelCost() {
    var t = 0;
    for (var i = 0; i < reveals.length; i++) {
      var d = reveals[i].off.size * view.dpr;
      t += d * d;
    }
    return t;
  }

  function startReveal(key, ch, spot, seed) {
    var off = paintOff(key, ch, spot.s, seed);
    var cost = off.size * view.dpr;
    cost *= cost;
    // 同时洇开的量按像素预算收，超了就把最老的直接落成画
    while (reveals.length && revealsPixelCost() + cost > 18e6) commitReveal(reveals.shift());
    var half = off.size / 2;
    var blobs = [{ ox: 0, oy: 0, d: 0 }];
    for (var i = 0; i < rint(5, 8); i++) {
      var a = rnd(0, 6.283), rr = rnd(0.06, 0.3) * spot.s;
      blobs.push({ ox: Math.cos(a) * rr, oy: Math.sin(a) * rr, d: rr / (spot.s * 0.3) * 0.42 });
    }
    for (var k = 0; k < blobs.length; k++) {
      var b = blobs[k];
      b.R = Math.hypot(half + Math.abs(b.ox), half + Math.abs(b.oy));
      b.j = rnd(0, 6.283);
    }
    var sc = document.createElement('canvas');
    sc.width = sc.height = Math.max(4, Math.round(off.size * view.dpr * 0.75));
    reveals.push({
      off: off, sc: sc, x: sc.getContext('2d'), spot: spot, half: half, key: key,
      t: 0, dur: clamp(spot.s / Math.min(view.w, view.h) * 0.62 + 0.66, 0.74, 1.1),
      blobs: blobs, drip: 0
    });
  }

  function blobAlpha(u) { return 1 - Math.pow(1 - u, 2.2); }

  function toneOf(key) { return WARM[key] ? 'warm' : COOL[key] ? 'cool' : 'ink'; }

  // 湿蒙版各幅共用一张，一次画好并集
  var maskCv = null, xMask = null, maskSize = 0;
  function maskCtx(n) {
    if (!maskCv) { maskCv = document.createElement('canvas'); xMask = maskCv.getContext('2d'); }
    if (n > maskSize) { maskCv.width = maskCv.height = maskSize = n; }
    return xMask;
  }

  function stepReveals(dt) {
    if (!reveals.length) {
      if (rvDirty) { xRv.clearRect(0, 0, view.w, view.h); rvDirty = false; }
      return;
    }
    var i, rv;
    for (i = 0; i < reveals.length; i++) {
      rv = reveals[i];
      xRv.clearRect(rv.spot.x - rv.half - 4, rv.spot.y - rv.half - 4, rv.off.size + 8, rv.off.size + 8);
    }
    for (i = reveals.length - 1; i >= 0; i--) {
      rv = reveals[i];
      var size = rv.off.size, half = rv.half;
      rv.t += dt;
      var w = clamp(rv.t / rv.dur, 0, 1);
      var a0 = clamp(w / 0.32, 0, 1);

      if (w >= 0.88) {
        // 墨已干：和最终成画一模一样
        xRv.globalAlpha = 1;
        xRv.drawImage(rv.off.cv, rv.spot.x - half, rv.spot.y - half, size, size);
      } else {
        var wet = 1 - w / 0.88;
        // 半分辨率湿蒙版：一团团洇开的并集
        var mk = view.dpr * 0.25, msize = Math.max(2, Math.round(size * mk));
        var mx = maskCtx(msize);
        mx.setTransform(1, 0, 0, 1, 0, 0);
        mx.clearRect(0, 0, maskSize, maskSize);
        for (var k = 0; k < rv.blobs.length; k++) {
          var b = rv.blobs[k];
          var u = clamp((w - b.d) / (1 - b.d), 0, 1);
          if (u <= 0) continue;
          var r = b.R * blobAlpha(u) * (1 + 0.05 * Math.sin(clock * 2.6 + b.j)) * mk;
          if (r < 2) continue;
          var bx = (half + b.ox) * mk, by = (half + b.oy) * mk;
          var g = mx.createRadialGradient(bx, by, r * 0.34, bx, by, r);
          g.addColorStop(0, 'rgba(0,0,0,1)');
          g.addColorStop(0.68, 'rgba(0,0,0,0.78)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          mx.fillStyle = g;
          mx.fillRect(bx - r, by - r, r * 2, r * 2);
        }
        var fa = clamp((w - 0.62) / 0.26, 0, 1);
        if (fa > 0) {
          mx.fillStyle = 'rgba(0,0,0,' + (fa * fa).toFixed(3) + ')';
          mx.fillRect(0, 0, maskSize, maskSize);
        }

        var x = rv.x;
        x.setTransform(view.dpr * 0.75, 0, 0, view.dpr * 0.75, 0, 0);
        x.globalCompositeOperation = 'source-over';
        x.clearRect(0, 0, size, size);
        x.drawImage(rv.off.cv, 0, 0, size, size);
        x.globalCompositeOperation = 'destination-in';
        x.drawImage(maskCv, 0, 0, maskSize, maskSize, 0, 0, size, size);
        x.globalCompositeOperation = 'source-over';

        xRv.globalAlpha = a0;
        xRv.drawImage(rv.sc, rv.spot.x - half, rv.spot.y - half, size, size);
        if (wet > 0.25) {
          // 湿墨外洇的一圈，用放大重画代替模糊
          var bl = 1 + wet * 0.05;
          xRv.globalAlpha = a0 * 0.26 * wet;
          xRv.drawImage(rv.sc, rv.spot.x - half * bl, rv.spot.y - half * bl, size * bl, size * bl);
        }
        xRv.globalAlpha = 1;
      }

      // 墨在纸上渗开的同时，给流体层补一点湿意
      rv.drip -= dt;
      while (rv.drip <= 0 && w < 0.94) {
        rv.drip += 0.09;
        var b2 = rv.blobs[rint(0, rv.blobs.length - 1)];
        var u2 = clamp((w - b2.d) / (1 - b2.d), 0, 1);
        MoInk.addDensity((rv.spot.x + b2.ox * u2) / view.w, (rv.spot.y + b2.oy * u2) / view.h,
          0.02, 0.1 * (1 - w) + 0.03, toneOf(rv.key));
      }

      if (w >= 1) { commitReveal(rv); reveals.splice(i, 1); }
    }
    rvDirty = true;
  }

  function commitReveal(rv) {
    var size = rv.off.size, half = rv.half;
    xArt.drawImage(rv.off.cv, rv.spot.x - half, rv.spot.y - half, size, size);
    rv.off.cv.width = rv.off.cv.height = 1;
    rv.sc.width = rv.sc.height = 1;
  }

  function flushReveals() {
    for (var i = 0; i < reveals.length; i++) commitReveal(reveals[i]);
    reveals = [];
    xRv.clearRect(0, 0, view.w, view.h);
    rvDirty = false;
  }

  function dropReveals() {
    for (var i = 0; i < reveals.length; i++) {
      reveals[i].off.cv.width = reveals[i].off.cv.height = 1;
      reveals[i].sc.width = reveals[i].sc.height = 1;
    }
    reveals = [];
    xRv.clearRect(0, 0, view.w, view.h);
    rvDirty = false;
  }

  /* ---------------- 落字 ---------------- */
  function isHan(ch) {
    return /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(ch);
  }

  function fallChar(ch) {
    if (!isHan(ch)) return;
    var z = MoZi.get(ch);
    hideTitle();

    var spot = aim ? spotAtPoint(aim.x, aim.y) : chooseSpot(ch);
    if (aim) hideAim();
    var key = MoMotifs.has(z.motif) ? z.motif : 'glyph';
    // 每幅画记住自己的种子：撤销、改窗口大小后重画出来还是这一幅
    var seed = (Math.random() * 4294967296) >>> 0;
    startReveal(key, ch, spot, seed);
    var item = { x: spot.x, y: spot.y, r: spot.s * 0.5, ch: ch, seed: seed, extras: [] };
    placed.push(item);

    seedInk(spot, key, ch);
    item.extras = react(ch, key, spot);

    if (soundOn) {
      MoAudio.resume();
      MoAudio.strike(z.tone, z.initial);
      MoAudio.rustle(clamp(spot.s / Math.min(view.w, view.h), 0.5, 1.2));
      speak(ch);
    }
    pushFall(ch, z);
    showPinyin(z);
    falled++;
  }

  function react(ch, key, spot) {
    var S = spot.s, made = [];
    if (ch === '风' || key === 'wind') {
      MoScene.gustWind(1.05);
      MoInk.setWind(MoScene.wind * 1.3, 0.05);
    } else if (ch === '雨' || key === 'rain') {
      MoScene.setWeather('rain', rnd(24, 40));
      rainSound(true);
    } else if (ch === '雪' || key === 'snow') {
      MoScene.setWeather('snow', rnd(26, 44));
      rainSound(false);
    } else if (ch === '雷' || ch === '闪' || key === 'thunder' || key === 'lightning') {
      MoScene.gustWind(1.6);
      for (var i = 0; i < 8; i++) {
        MoInk.addVelocity(rnd(0.1, 0.9), rnd(0.1, 0.6), rnd(-9, 9), rnd(2, 8), 0.1);
      }
    } else if (ch === '晴' || ch === '霁' || ch === '日') {
      MoScene.setWeather('clear', 0);
      rainSound(false);
    } else if (key === 'willow') {
      made.push(MoScene.addWillow(spot.x, spot.y - S * 0.1, S * 0.62));
    } else if (key === 'fish') {
      for (var f = 0, nf = rint(2, 4); f < nf; f++) made.push(MoScene.addFish(spot.x + rnd(-S * .3, S * .3), spot.y + rnd(-S * .2, S * .2)));
    } else if (key === 'cloud' || key === 'mist') {
      for (var c = 0; c < 2; c++) made.push(MoScene.addCloud(spot.x + rnd(-S * .3, S * .3), rnd(view.h * 0.08, view.h * 0.3)));
    } else if (key === 'bird' || key === 'swallow' || key === 'crane' || key === 'butterfly' || key === 'bee' || key === 'firefly') {
      for (var b = 0, nb = rint(1, 3); b < nb; b++) made.push(MoScene.addBird(rnd(-view.w * 0.1, view.w * 0.5), rnd(view.h * 0.06, view.h * 0.34)));
    } else if (key === 'plum' || key === 'peach' || key === 'blossom') {
      made.push(MoScene.addTree(spot.x, spot.y - S * 0.25, key === 'plum' ? 'plum' : 'pink', S));
    } else if (key === 'water' || key === 'wave' || key === 'lotus') {
      for (var r = 0; r < 3; r++) MoInk.addDensity(rnd(0.15, 0.75), rnd(0.55, 0.85), 0.05, 0.35, 'cool');
    } else if (key === 'rainbow') {
      MoScene.setWeather('clear', 0);
      rainSound(false);
    }
    return made;
  }

  var rainWanted = false;
  function rainSound(on) {
    rainWanted = !!on && soundOn;
    if (soundOn) MoAudio.rain(rainWanted);
  }

  /* ---------------- 右侧落字列表 ---------------- */
  function pushFall(ch, z) {
    var row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = '<span class="zi">' + ch + '</span>' +
      (z.py ? '<span class="py">' + z.py + '</span>' : '');
    // 落款印章始终压在列表最底下，新字排在它上面
    elFall.insertBefore(row, elFall.querySelector('.seal'));
    var kids = elFall.querySelectorAll('.row');
    if (kids.length > 11) {
      kids[0].parentNode.removeChild(kids[0]);
    }
    if (!elFall.querySelector('.gap')) {
      var gap = document.createElement('div'); gap.className = 'gap';
      elFall.insertBefore(gap, elFall.firstChild);
    }
    var seal = elFall.querySelector('.seal');
    if (!seal && falled >= 5) {
      seal = document.createElement('div');
      seal.className = 'seal';
      seal.innerHTML = '<span>墨</span><span>戏</span>';
      elFall.appendChild(seal);
    }
  }

  /* ---------------- 读音 ---------------- */
  var TONE_NAME = ['', '一声', '二声', '三声', '四声', '轻声'];
  var zhVoice = null;
  function pickVoice() {
    var vs = global.speechSynthesis ? global.speechSynthesis.getVoices() : [];
    zhVoice = null;
    for (var i = 0; i < vs.length && !zhVoice; i++) if (/zh[-_]CN/i.test(vs[i].lang)) zhVoice = vs[i];
    for (var j = 0; j < vs.length && !zhVoice; j++) if (/^zh/i.test(vs[j].lang)) zhVoice = vs[j];
  }
  if (global.speechSynthesis) { pickVoice(); global.speechSynthesis.onvoiceschanged = pickVoice; }
  // 用系统自带的中文语音读出来；连着打几个字会排队一个个读
  function speak(text) {
    if (!soundOn || !global.speechSynthesis || !global.SpeechSynthesisUtterance) return;
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN'; u.rate = 0.8;
    if (zhVoice) u.voice = zhVoice;
    global.speechSynthesis.speak(u);
  }
  elCard.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-say]') : null;
    if (!t) return;
    global.speechSynthesis && global.speechSynthesis.cancel();
    var was = soundOn; soundOn = true; speak(t.getAttribute('data-say')); soundOn = was;
  });

  /* ---------------- 拼音卡 ---------------- */
  function showPinyin(z) {
    elKeys.innerHTML = '';
    if (z.py) {
      if (z.whole) {
        elKeys.innerHTML = '<span class="key whole" title="整体认读音节">' + z.py + '</span><span class="tag">整体认读</span>';
      } else if (!z.initial) {
        elKeys.innerHTML = '<span class="key final" title="零声母，只有韵母">' + z.final + '</span><span class="tag">零声母</span>';
      } else {
        elKeys.innerHTML = '<span class="key" title="声母">' + z.initial + '</span>' +
          '<span class="key final" title="韵母">' + z.final + '</span>';
      }
      elKeys.innerHTML += '<span class="tag tone' + z.tone + '">' + (TONE_NAME[z.tone] || '') + '</span>';
    }
    elZi.textContent = z.ch;
    elZi.setAttribute('data-say', z.ch);
    elGloss.textContent = z.gloss || (z.py ? '这个字还没有收进字表，先听听它怎么读' : '这个字还没收录，且看它自己长成一幅画');
    elWords.innerHTML = (z.words || []).map(function (wd) { return '<b data-say="' + wd + '">' + wd + '</b>'; }).join('');
    elCard.classList.add('show');
  }

  function hideTitle() {
    if (titleHidden) return;
    titleHidden = true;
    elTitle.classList.add('hide');
  }

  /* ---------------- 字表 ---------------- */
  function buildTable() {
    var html = '';
    MoZi.GROUPS.forEach(function (g) {
      html += '<div class="group"><h3>' + g.name + '</h3><div class="cells">';
      Array.prototype.forEach.call(g.chars, function (ch) {
        if (!isHan(ch)) return;
        var z = MoZi.get(ch);
        html += '<div class="cell" data-ch="' + ch + '"><span class="c">' + ch + '</span><span class="p">' + (z.py || '…') + '</span></div>';
      });
      html += '</div></div>';
    });
    elTableBody.innerHTML = html;
  }

  elTableBody.addEventListener('click', function (e) {
    var cell = e.target.closest ? e.target.closest('.cell') : null;
    if (!cell) return;
    closeTable();
    fallChar(cell.getAttribute('data-ch'));
  });

  function openTable() { elPanel.classList.add('show'); focusIME(); }
  function closeTable() { elPanel.classList.remove('show'); focusIME(); }

  /* ---------------- 工具条 ---------------- */
  document.querySelector('.toolbar').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'table') { elPanel.classList.contains('show') ? closeTable() : openTable(); }
    else if (act === 'clear') { clearPaper(); }
    else if (act === 'save') { savePNG(); }
    else if (act === 'sound') {
      soundOn = !soundOn;
      b.classList.toggle('active', soundOn);
      if (!soundOn && global.speechSynthesis) global.speechSynthesis.cancel();
      MoAudio.setEnabled(soundOn);
      rainSound(rainWanted || MoScene.weather === 'rain');
      if (soundOn) { MoAudio.resume(); MoAudio.sweep(); }
    }
  });
  document.querySelector('.panel-head').addEventListener('click', function (e) {
    if (e.target.getAttribute && e.target.getAttribute('data-act') === 'close-table') closeTable();
  });

  function clearPaper() {
    dropReveals();
    xArt.clearRect(0, 0, view.w, view.h);
    xInk.clearRect(0, 0, view.w, view.h);
    MoInk.clear();
    MoInk.setWind(0, 0);
    MoScene.clearAll();
    drawPaper(view.w, view.h);
    placed = []; falled = 0; titleHidden = false;
    elFall.innerHTML = '';
    elCard.classList.remove('show');
    if (global.speechSynthesis) global.speechSynthesis.cancel();
    elTitle.classList.remove('hide');
    rainSound(false);
    seedIdle();
  }

  function savePNG() {
    flushReveals();
    var out = document.createElement('canvas');
    out.width = view.w * view.dpr; out.height = view.h * view.dpr;
    var o = out.getContext('2d');
    o.fillStyle = '#e9e0cb';
    o.fillRect(0, 0, out.width, out.height);
    [cPaper, cBG, cArt].forEach(function (c) { o.drawImage(c, 0, 0, out.width, out.height); });
    o.globalCompositeOperation = 'multiply';
    o.drawImage(cInk, 0, 0, out.width, out.height);
    o.globalCompositeOperation = 'source-over';
    o.drawImage(cFG, 0, 0, out.width, out.height);
    var d = new Date();
    var name = '墨戏-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.png';
    var a = document.createElement('a');
    a.download = name;
    a.href = out.toDataURL('image/png');
    a.click();
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------------- 输入法 ---------------- */
  function focusIME() {
    try { elIME.focus({ preventScroll: true }); } catch (e) { elIME.focus(); }
  }
  var composingNow = false;
  elIME.addEventListener('compositionstart', function () {
    composingNow = true;
    elComp.classList.add('show');
    elCompText.textContent = '';
  });
  elIME.addEventListener('compositionupdate', function (e) {
    elCompText.textContent = e.data || elIME.getAttribute('data-c') || '';
  });
  elIME.addEventListener('compositionend', function (e) {
    composingNow = false;
    elComp.classList.remove('show');
    elCompText.textContent = '';
    var s = e.data || '';
    commitString(s);
    elIME.value = '';
  });
  elIME.addEventListener('input', function () {
    if (composingNow) return;
    // 粘贴或混着英文数字时，只留下其中的汉字，而不是整串丢掉
    var v = elIME.value;
    elIME.value = '';
    commitString(v);
  });
  function commitString(s) {
    // 按码点遍历，扩展区汉字（两个 UTF-16 单元）也不会被拆坏
    Array.from(s || '').forEach(function (ch) { if (isHan(ch)) fallChar(ch); });
  }

  stage.addEventListener('pointerdown', function (e) {
    if (e.target.closest && (e.target.closest('.toolbar') || e.target.closest('.panel') ||
      e.target.closest('.pinyincard') || e.target.closest('.falllist'))) return;
    MoAudio.resume();
    focusIME();
    // 点一下先溅一团墨，并把这一点留作下一笔的落处
    var gx = e.clientX / view.w, gy = e.clientY / view.h;
    MoInk.addDensity(gx, gy, 0.03, 0.5, 'ink');
    MoInk.stir(gx, gy, rnd(-1, 1), rnd(-1, 1), 3);
    showAim(e.clientX, e.clientY);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (aim) { hideAim(); return; } closeTable(); return; }
    // Safari 会先发 compositionend 再发 keydown：用 isComposing / 229 兜住，删拼音时不误删画
    if (e.key === 'Backspace' && !composingNow && !e.isComposing && e.keyCode !== 229 && placed.length) {
      // 倒悔：擦掉最后一幅（连同它带出的柳、鱼、云），其余按原种子重画，不变样
      var gone = placed.pop();
      MoScene.remove(gone.extras);
      redrawAll();
      elCard.classList.remove('show');
      var rows = elFall.querySelectorAll('.row');
      if (rows.length) rows[rows.length - 1].parentNode.removeChild(rows[rows.length - 1]);
      falled = Math.max(0, falled - 1);
      e.preventDefault();
      return;
    }
    if (document.activeElement !== elIME && !e.ctrlKey && !e.metaKey && !e.altKey) focusIME();
  });

  function redrawAll() {
    flushReveals();
    xArt.clearRect(0, 0, view.w, view.h);
    var list = placed.slice();
    placed = [];
    list.forEach(function (p) {
      var z = MoZi.get(p.ch);
      var key = MoMotifs.has(z.motif) ? z.motif : 'glyph';
      xArt.save();
      xArt.translate(p.x - p.r * 2 / 2, p.y - p.r * 2 / 2);
      xArt.scale(p.r * 2 / 100, p.r * 2 / 100);
      xArt.lineCap = 'round'; xArt.lineJoin = 'round';
      MoDraw.withSeed(p.seed, function () { MoMotifs.draw(xArt, key, { ch: p.ch }); });
      xArt.restore();
      placed.push(p);
    });
  }

  /* ---------------- 搅墨 ---------------- */
  var px = 0, py = 0, hasP = false;
  var pend = { dx: 0, dy: 0, x: 0, y: 0, n: 0 };
  stage.addEventListener('pointermove', function (e) {
    if (elPanel.classList.contains('show')) return;
    var x = e.clientX, y = e.clientY;
    if (hasP) {
      pend.dx += (x - px) / view.w;
      pend.dy += (y - py) / view.h;
      pend.x = x; pend.y = y; pend.n++;
    }
    px = x; py = y; hasP = true;
  });
  stage.addEventListener('pointerleave', function () { hasP = false; });

  // 一帧只推一次：把整帧的位移合成一股力，墨才不会被甩飞
  function applyStir() {
    if (!pend.n) return;
    var dx = clamp(pend.dx, -0.07, 0.07), dy = clamp(pend.dy, -0.07, 0.07);
    var sp = Math.hypot(dx, dy);
    if (sp > 0.002) {
      MoInk.stir(pend.x / view.w, pend.y / view.h, dx, dy, 4.5 + sp * 26);
      if (sp > 0.035) MoInk.addDensity(pend.x / view.w, pend.y / view.h, 0.012, 0.12, 'ink');
    }
    pend.dx = pend.dy = pend.n = 0;
  }

  /* ---------------- 主循环 ---------------- */
  function frame(now) {
    var dt = clamp((now - lastT) / 1000, 0, 0.05);
    lastT = now;
    clock += dt;
    stepReveals(dt);

    MoScene.step(dt);
    MoScene.drawBG(xBG);

    var w = MoScene.wind;
    MoInk.setWind(w * 1.2, MoScene.weather === 'rain' ? 0.5 : 0);
    applyStir();
    MoInk.step(dt);
    MoInk.render(xInk, view.w, view.h);
    MoScene.drawFG(xFG);

    // 下雨：天上来墨
    if (MoScene.weather === 'rain') {
      rainInkCool -= dt;
      while (rainInkCool <= 0) {
        rainInkCool += 0.05;
        MoInk.addDensity(rnd(0.02, 0.98), rnd(0.02, 0.5), 0.02, 0.18, 'cool');
      }
    } else if (MoScene.weather === 'snow') {
      rainInkCool -= dt;
      while (rainInkCool <= 0) {
        rainInkCool += 0.12;
        MoInk.addDensity(rnd(0.02, 0.98), rnd(0.05, 0.4), 0.03, 0.1, 'ink');
      }
    }
    if (rainWanted && MoScene.weather !== 'rain') rainSound(false);

    requestAnimationFrame(frame);
  }

  /* 起始：一张空纸，远山云雾，一只飞鸟 */
  function seedIdle() {
    MoScene.addCloud(view.w * 0.24, view.h * 0.16);
    MoScene.addCloud(view.w * 0.68, view.h * 0.22);
    MoScene.addCloud(view.w * 0.45, view.h * 0.1);
    MoInk.addDensity(0.5, 0.42, 0.16, 0.12, 'ink');
    MoInk.addDensity(0.3, 0.62, 0.1, 0.06, 'ink');
    MoScene.addBird(view.w * 0.62, view.h * 0.17);
    MoScene.addBird(view.w * 0.7, view.h * 0.21);
  }

  var rt;
  global.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(resize, 140);
  });

  resize();
  seedIdle();
  buildTable();
  focusIME();
  requestAnimationFrame(function (t0) { lastT = t0; frame(t0); });

  global.MoApp = {
    fall: fallChar,
    resize: resize,
    clear: clearPaper,
    save: savePNG,
    table: openTable,
    get placed() { return placed.slice(); }
  };
})(window);
