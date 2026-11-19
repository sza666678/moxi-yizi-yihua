/* 实时流动的墨：粗网格不可压缩流体（Jos Stam 稳定流体）+ 三通道墨浓度 */
(function (global) {
  'use strict';

  var W = 96, H = 54, SZ = 0;
  var u, v, u0, v0, dI, dW, dC, tI, tW, tC, div, prs;
  var off = document.createElement('canvas');
  var octx = off.getContext('2d');
  var img = null;

  var visc = 0.00006;
  var diff = 0.00004;
  var fade = 0.9915;
  var iter = 6;

  function IX(i, j) { return i + j * (W + 2); }

  function alloc() {
    SZ = (W + 2) * (H + 2);
    var mk = function () { return new Float32Array(SZ); };
    u = mk(); v = mk(); u0 = mk(); v0 = mk();
    dI = mk(); dW = mk(); dC = mk();
    tI = mk(); tW = mk(); tC = mk();
    div = mk(); prs = mk();
    off.width = W; off.height = H;
    img = octx.createImageData(W, H);
  }

  /* 改窗口大小时把三种墨按新网格重新采样，而不是整张清空 */
  function resample(src, oW, oH) {
    var out = new Float32Array(SZ);
    for (var j = 1; j <= H; j++) {
      for (var i = 1; i <= W; i++) {
        var x = (i - 0.5) / W * oW + 0.5, y = (j - 0.5) / H * oH + 0.5;
        var i0 = Math.max(1, Math.min(oW, x | 0)), j0 = Math.max(1, Math.min(oH, y | 0));
        var i1 = Math.min(oW, i0 + 1), j1 = Math.min(oH, j0 + 1);
        var s1 = Math.max(0, Math.min(1, x - i0)), t1 = Math.max(0, Math.min(1, y - j0));
        var R = oW + 2;
        out[IX(i, j)] = (1 - s1) * ((1 - t1) * src[i0 + j0 * R] + t1 * src[i0 + j1 * R]) +
          s1 * ((1 - t1) * src[i1 + j0 * R] + t1 * src[i1 + j1 * R]);
      }
    }
    return out;
  }

  function resize(aspect) {
    var oW = W, oH = H, oI = dI, oWm = dW, oC = dC;
    W = 112;
    H = Math.max(28, Math.round(W / Math.max(0.6, aspect)));
    if (H > 96) H = 96;
    alloc();
    if (oI && oW && oH) {
      dI = resample(oI, oW, oH); dW = resample(oWm, oW, oH); dC = resample(oC, oW, oH);
    }
  }

  function setBnd(b, x) {
    for (var i = 1; i <= W; i++) {
      x[IX(i, 0)] = b === 2 ? -x[IX(i, 1)] : x[IX(i, 1)];
      x[IX(i, H + 1)] = b === 2 ? -x[IX(i, H)] : x[IX(i, H)];
    }
    for (var j = 1; j <= H; j++) {
      x[IX(0, j)] = b === 1 ? -x[IX(1, j)] : x[IX(1, j)];
      x[IX(W + 1, j)] = b === 1 ? -x[IX(W, j)] : x[IX(W, j)];
    }
    x[IX(0, 0)] = 0.5 * (x[IX(1, 0)] + x[IX(0, 1)]);
    x[IX(0, H + 1)] = 0.5 * (x[IX(1, H + 1)] + x[IX(0, H)]);
    x[IX(W + 1, 0)] = 0.5 * (x[IX(W, 0)] + x[IX(W + 1, 1)]);
    x[IX(W + 1, H + 1)] = 0.5 * (x[IX(W, H + 1)] + x[IX(W + 1, H)]);
  }

  function linSolve(b, x, x0, c, it) {
    var inv = 1 / (1 + 4 * c);
    for (var k = 0; k < it; k++) {
      for (var j = 1; j <= H; j++) {
        var row = j * (W + 2);
        for (var i = 1; i <= W; i++) {
          var id = row + i;
          x[id] = (x0[id] + c * (x[id - 1] + x[id + 1] + x[id - (W + 2)] + x[id + (W + 2)])) * inv;
        }
      }
      setBnd(b, x);
    }
  }

  function diffuse(b, x, x0, rate, dt) {
    var c = dt * rate * W * H;
    linSolve(b, x, x0, c, b === 0 ? 2 : iter);
  }

  function advect(b, d, d0, uu, vv, dt) {
    var dtx = dt * W, dty = dt * H;
    for (var j = 1; j <= H; j++) {
      for (var i = 1; i <= W; i++) {
        var id = IX(i, j);
        var x = i - dtx * uu[id];
        var y = j - dty * vv[id];
        if (x < 0.5) x = 0.5; if (x > W + 0.5) x = W + 0.5;
        if (y < 0.5) y = 0.5; if (y > H + 0.5) y = H + 0.5;
        var i0 = x | 0, j0 = y | 0;
        var i1 = i0 + 1, j1 = j0 + 1;
        var s1 = x - i0, s0 = 1 - s1, t1 = y - j0, t0 = 1 - t1;
        d[id] = s0 * (t0 * d0[IX(i0, j0)] + t1 * d0[IX(i0, j1)]) +
          s1 * (t0 * d0[IX(i1, j0)] + t1 * d0[IX(i1, j1)]);
      }
    }
    setBnd(b, d);
  }

  function project(uu, vv, p, d) {
    var hx = 1 / W, hy = 1 / H;
    for (var j = 1; j <= H; j++) {
      for (var i = 1; i <= W; i++) {
        var id = IX(i, j);
        d[id] = -0.5 * (hx * (uu[id + 1] - uu[id - 1]) + hy * (vv[id + (W + 2)] - vv[id - (W + 2)]));
        p[id] = 0;
      }
    }
    setBnd(0, d); setBnd(0, p);
    linSolve(0, p, d, 1, iter);
    for (var jj = 1; jj <= H; jj++) {
      for (var ii = 1; ii <= W; ii++) {
        var k = IX(ii, jj);
        uu[k] -= 0.5 * W * (p[k + 1] - p[k - 1]);
        vv[k] -= 0.5 * H * (p[k + (W + 2)] - p[k - (W + 2)]);
      }
    }
    setBnd(1, uu); setBnd(2, vv);
  }

  function addDensity(gx, gy, rad, amount, kind) {
    var target = kind === 'warm' ? dW : (kind === 'cool' ? dC : dI);
    var r = Math.max(1, rad * W);
    var i0 = Math.max(1, Math.floor(gx * W - r)), i1 = Math.min(W, Math.ceil(gx * W + r));
    var j0 = Math.max(1, Math.floor(gy * H - r * H / W)), j1 = Math.min(H, Math.ceil(gy * H + r * H / W));
    for (var j = j0; j <= j1; j++) {
      for (var i = i0; i <= i1; i++) {
        var dx = (i - gx * W) / r, dy = (j - gy * H) / (r * H / W);
        var f = 1 - dx * dx - dy * dy;
        if (f <= 0) continue;
        var id = IX(i, j);
        target[id] += amount * f * f * (0.6 + Math.random() * 0.7);
      }
    }
  }

  function addVelocity(gx, gy, du, dv, rad) {
    var r = Math.max(1, rad * W);
    var i0 = Math.max(1, Math.floor(gx * W - r)), i1 = Math.min(W, Math.ceil(gx * W + r));
    var j0 = Math.max(1, Math.floor(gy * H - r * H / W)), j1 = Math.min(H, Math.ceil(gy * H + r * H / W));
    for (var j = j0; j <= j1; j++) {
      for (var i = i0; i <= i1; i++) {
        var dx = (i - gx * W) / r, dy = (j - gy * H) / (r * H / W);
        var f = 1 - dx * dx - dy * dy;
        if (f <= 0) continue;
        var id = IX(i, j);
        u[id] += du * f;
        v[id] += dv * f;
      }
    }
  }

  /* 鼠标划过时既推又旋，才像“搅墨” */
  function stir(gx, gy, dx, dy, power) {
    var du = dx * power, dv = dy * power;
    addVelocity(gx, gy, du, dv, 0.045);
    // 两侧成对的旋：只加转动，不抵消前进
    addVelocity(gx + 0.025, gy - 0.025, -dv * 0.34, du * 0.34, 0.03);
    addVelocity(gx - 0.025, gy + 0.025, dv * 0.34, -du * 0.34, 0.03);
  }

  function step(dt) {
    if (!(dt > 0)) return;
    var t = performance.now() / 1000;
    // 衰减按时间算，120Hz 屏幕上墨不会比 60Hz 散得快一倍
    var k60 = dt * 60, fd = Math.pow(fade, k60), damp = Math.pow(0.994, k60);
    // 环境微流：让墨自己慢慢游走
    var amp = 0.06 + windX * 0.4;
    for (var j = 1; j <= H; j += 2) {
      for (var i = 1; i <= W; i += 2) {
        var id = IX(i, j);
        var nx = Math.sin(i * 0.11 + t * 0.31) + Math.cos(j * 0.17 - t * 0.22);
        var ny = Math.cos(i * 0.13 - t * 0.24) + Math.sin(j * 0.11 + t * 0.19);
        u[id] += (nx * 0.006 + windX * 0.012) * amp * k60;
        v[id] += (ny * 0.004 + windY * 0.008) * amp * k60;
      }
    }

    project(u, v, div, prs);

    var tu = u0, tv = v0;
    tu.set(u); tv.set(v);
    diffuse(1, u, tu, visc, dt);
    diffuse(2, v, tv, visc, dt);
    project(u, v, div, prs);
    tu.set(u); tv.set(v);
    advect(1, u, tu, tu, tv, dt);
    advect(2, v, tv, tu, tv, dt);
    project(u, v, div, prs);

    tI.set(dI); tW.set(dW); tC.set(dC);
    diffuse(0, dI, tI, diff, dt);
    diffuse(0, dW, tW, diff, dt);
    diffuse(0, dC, tC, diff, dt);
    tI.set(dI); tW.set(dW); tC.set(dC);
    advect(0, dI, tI, u, v, dt);
    advect(0, dW, tW, u, v, dt);
    advect(0, dC, tC, u, v, dt);

    for (var k = 0; k < SZ; k++) {
      dI[k] *= fd; dW[k] *= fd; dC[k] *= fd;
      u[k] *= damp; v[k] *= damp;
      if (dI[k] > 2.2) dI[k] = 2.2;
      if (dW[k] > 2.2) dW[k] = 2.2;
      if (dC[k] > 2.2) dC[k] = 2.2;
    }
  }

  var windX = 0, windY = 0;
  function setWind(x, y) { windX = x; windY = y; }

  function render(ctx, w, h) {
    var data = img.data;
    var n = 0;
    for (var j = 1; j <= H; j++) {
      for (var i = 1; i <= W; i++) {
        var id = IX(i, j);
        var a = dI[id], b2 = dW[id], c2 = dC[id];
        var tot = a + b2 + c2;
        if (tot < 0.008) { data[n + 3] = 0; n += 4; continue; }
        var alpha = 1 - Math.exp(-tot * 1.05);
        // 墨色 26,25,22 / 朱 150,40,44 / 花青 44,80,110
        var r = (a * 26 + b2 * 150 + c2 * 44) / tot;
        var g = (a * 25 + b2 * 40 + c2 * 80) / tot;
        var bl = (a * 22 + b2 * 44 + c2 * 110) / tot;
        data[n] = r; data[n + 1] = g; data[n + 2] = bl;
        data[n + 3] = Math.min(255, alpha * 152);
        n += 4;
      }
    }
    octx.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(off, 0, 0, W, H, 0, 0, w, h);
    ctx.restore();
  }

  function clear() { alloc(); }

  global.MoInk = {
    resize: resize,
    step: step,
    render: render,
    clear: clear,
    addDensity: addDensity,
    addVelocity: addVelocity,
    stir: stir,
    setWind: setWind,
    get grid() { return { W: W, H: H }; }
  };
})(window);
