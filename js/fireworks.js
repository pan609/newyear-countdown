/* 烟花引擎 v2。
 * 画面由这些层叠出来（自下而上）：
 *   sky     —— 照片/天空（不在这里画）
 *   back    —— 建筑「后面」的烟花：拖尾线 + 每颗星头部的发光贴图 + 闪烁星芒
 *   scene   —— 抠掉天空的建筑（不在这里画）
 *   light   —— 建筑受光：以 color-dodge 叠加，亮部被烟花颜色「重新曝光」
 *   rim     —— 建筑轮廓光 + 少量漫反射：以 screen 叠加
 *   reflect —— 水面倒影：逐行采样泛光层，纵向拉长并加波纹
 *   front   —— 从地标自身喷射的焰火、祝福语字样
 *   glow    —— 近泛光 + 硝烟 + 夜空闪光；glow2 是更宽更柔的远泛光
 * 另外每次爆炸会让整幅画面短暂提亮（曝光）并轻微震动。 */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];

  function sprite(c) {   // 星体头部的发光贴图：白热核心 → 本色光晕
    const cv = document.createElement('canvas'); cv.width = cv.height = 48;
    const x = cv.getContext('2d'), g = x.createRadialGradient(24, 24, 0, 24, 24, 24), k = `${c[0]},${c[1]},${c[2]}`;
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.07, `rgba(${k},.95)`);
    g.addColorStop(.3, `rgba(${k},.42)`); g.addColorStop(.62, `rgba(${k},.1)`); g.addColorStop(1, `rgba(${k},0)`);
    x.fillStyle = g; x.fillRect(0, 0, 48, 48);
    return cv;
  }
  const col = (r, g, b) => {
    const c = [r, g, b]; c.s = `rgb(${r},${g},${b})`;
    c.e = `rgb(${Math.round(r * .85)},${Math.round(g * .42)},${Math.round(b * .28)})`;   // 余烬色
    c.sp = sprite(c);
    return c;
  };
  const C = {
    gold: col(255, 200, 96), amber: col(255, 150, 58), orange: col(255, 120, 40), red: col(255, 64, 64), rose: col(255, 92, 160),
    magenta: col(236, 86, 255), violet: col(150, 110, 255), blue: col(84, 146, 255), cyan: col(86, 230, 255), teal: col(70, 255, 214),
    green: col(104, 255, 150), lime: col(206, 255, 108), white: col(255, 246, 228), silver: col(214, 228, 255)
  };
  const BRIGHT = [C.gold, C.red, C.rose, C.magenta, C.violet, C.blue, C.cyan, C.teal, C.green, C.lime, C.white, C.orange];
  const TYPES = ['peony', 'peony', 'peony', 'chrys', 'chrys', 'kamuro', 'kamuro', 'crackle', 'crackle', 'saturn', 'ring', 'willow', 'strobe', 'cross', 'palm', 'multi', 'dual'];
  const MAX = 9000;

  const GLINT = (() => {   // 四芒星芒
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const x = cv.getContext('2d');
    const ray = (a, b) => {
      const g = a ? x.createLinearGradient(0, 32, 64, 32) : x.createLinearGradient(32, 0, 32, 64);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; a ? x.fillRect(0, 32 - b, 64, b * 2) : x.fillRect(32 - b, 0, b * 2, 64);
    };
    ray(1, 1.2); ray(0, 1.2);
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 12);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(20, 20, 24, 24);
    return cv;
  })();

  window.Fireworks = function (cv, cb) {
    cb = cb || {};
    const ctxOf = c => c.getContext('2d');
    const bctx = ctxOf(cv.back), fctx = ctxOf(cv.front), gctx = ctxOf(cv.glow), g2ctx = ctxOf(cv.glow2);
    const lctx = ctxOf(cv.light), mctx = ctxOf(cv.rim), rctx = ctxOf(cv.reflect);
    const mask = document.createElement('canvas'), rimMask = document.createElement('canvas'), pre = document.createElement('canvas'), g3ctx = pre.getContext('2d');
    const parts = [], rockets = [], lights = [], emitters = [], flashes = [], smokes = [];
    let queue = [];
    let w = 1, h = 1, fs = 1, k = 1, gw = 1, gh = 1, lw = 1, lh = 1, rh = 1;
    let L = { hy: 1, u: 1, ox: 0, water: false, mounts: [], sparks: [] };
    let time = 0, q = 1, calm = false, idle = 0, slow = 0, level = 1;
    let mode = 'ambient', nextAuto = 600, nextSet = 6000, beats = 0;
    let expo = 0, lastExpo = -1, shake = 0, shaking = false, pops = 0;

    /* ---------- 尺寸与场景 ---------- */
    function resize(W, H, dpr) {
      w = W; h = H; fs = Math.min(dpr, 1.5);
      k = Math.max(.55, Math.min(1.5, Math.min(w, h) / 800));
      [cv.back, cv.front].forEach(c => { c.width = Math.round(w * fs); c.height = Math.round(h * fs); });
      [bctx, fctx].forEach(c => { c.setTransform(fs, 0, 0, fs, 0, 0); c.lineCap = 'round'; });
      gw = Math.ceil(w / 4); gh = Math.ceil(h / 4); cv.glow.width = gw; cv.glow.height = gh; pre.width = gw; pre.height = gh;
      cv.glow2.width = Math.ceil(gw / 2); cv.glow2.height = Math.ceil(gh / 2);
      lw = Math.ceil(w / 2); lh = Math.ceil(h / 2);
      [cv.light, cv.rim, mask, rimMask].forEach(c => { c.width = lw; c.height = lh; });
      if (w < 700) q = Math.min(q, .65);
    }
    function setScene(layout, sceneCv) {
      L = layout;
      const hy2 = Math.floor(L.hy / 2) - 1;
      const m = mask.getContext('2d');
      m.clearRect(0, 0, lw, lh); m.drawImage(sceneCv, 0, 0, lw, lh); m.clearRect(0, hy2, lw, lh);
      /* 轮廓光遮罩 = 建筑 − 向内收缩后的建筑；再叠一层很淡的整体，让暗面也有一点漫反射 */
      const er = document.createElement('canvas'); er.width = lw; er.height = lh;
      const e = er.getContext('2d'); e.drawImage(mask, 0, 0);
      e.globalCompositeOperation = 'destination-in';
      [[0, 2], [2, 1], [-2, 1], [1, 2], [-1, 2]].forEach(o => e.drawImage(mask, o[0], o[1]));
      const r = rimMask.getContext('2d');
      r.globalCompositeOperation = 'source-over'; r.globalAlpha = 1; r.clearRect(0, 0, lw, lh);
      r.drawImage(mask, 0, 0);
      r.globalCompositeOperation = 'destination-out'; r.drawImage(er, 0, 0);
      r.globalCompositeOperation = 'source-over'; r.globalAlpha = L.photo ? .16 : .5; r.drawImage(mask, 0, 0); r.globalAlpha = 1;

      rh = Math.max(1, Math.ceil((h - L.hy) / 4));
      cv.reflect.width = gw; cv.reflect.height = rh;
      cv.reflect.style.top = L.hy + 'px'; cv.reflect.style.height = (h - L.hy) + 'px';
      cv.reflect.style.display = L.water ? 'block' : 'none';
      clear();
    }
    function clear() {
      parts.length = rockets.length = lights.length = emitters.length = flashes.length = smokes.length = 0;
      queue = [];
      bctx.clearRect(0, 0, w, h); fctx.clearRect(0, 0, w, h);
      gctx.clearRect(0, 0, gw, gh); g2ctx.clearRect(0, 0, gw, gh);
      lctx.clearRect(0, 0, lw, lh); mctx.clearRect(0, 0, lw, lh); rctx.clearRect(0, 0, gw, rh);
      nextAuto = time + 500; nextSet = time + rand(5000, 9000);
    }
    const at = (ms, fn) => queue.push({ t: time + ms, fn });

    /* ---------- 粒子 ---------- */
    function spawn(x, y, vx, vy, ttl, c, size, ex) {
      if (parts.length >= MAX) return;
      const p = { x, y, px: x, py: y, vx, vy, age: 0, ttl, c, size, drag: .965, grav: .035, hold: .45, hot: .1, head: 3.2,
        trail: 0, tc: null, tglit: 0, glit: 0, tw: 0, split: 0, pop: 0, c2: null, sw: .55, front: false };
      if (ex) for (const key in ex) p[key] = ex[key];
      parts.push(p);
    }
    function sphere(x, y, n, S, c, ttl, size, ex) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, z = Math.random() * 2 - 1;
        const sp = S * Math.sqrt(1 - z * z) * rand(.94, 1.06);
        spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, ttl * rand(.82, 1.18), c, size * rand(.8, 1.15), ex);
      }
    }
    function ringBurst(x, y, n, S, c, ex, sq) {
      const rot = rand(0, Math.PI), cr = Math.cos(rot), sr = Math.sin(rot);
      sq = sq || rand(.3, .9);
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU, vx = Math.cos(a) * S, vy = Math.sin(a) * S * sq;
        spawn(x, y, vx * cr - vy * sr, vx * sr + vy * cr, rand(74, 98), c, 2, ex);
      }
    }

    function burst(x, y, type, o) {
      o = o || {};
      type = type || pick(TYPES);
      const scale = o.scale || 1, sc = scale * k, front = !!o.front;
      const S = 8.4 * sc, sz = 1.75 * Math.sqrt(k);
      const n = m => Math.max(8, Math.round(m * q * Math.pow(scale, .9)));
      const c1 = o.col || pick(BRIGHT);
      let c2 = pick(BRIGHT); if (c2 === c1) c2 = C.white;
      let lc = c1, lk = 1;
      switch (type) {
        case 'chrys':
          sphere(x, y, n(125), S * 1.05, c1, 100, sz, { front, trail: .45, glit: .03 }); break;
        case 'dual':
          sphere(x, y, n(120), S, c1, 86, sz, { front });
          sphere(x, y, n(70), S * .56, c2, 76, sz, { front }); break;
        case 'ring':
          ringBurst(x, y, n(84), S, c1, { front }); ringBurst(x, y, n(52), S * .6, c2, { front });
          sphere(x, y, n(30), S * .22, C.white, 50, sz * .8, { front, glit: .1 }); break;
        case 'saturn':
          sphere(x, y, n(110), S * .62, c1, 84, sz, { front });
          ringBurst(x, y, n(90), S * 1.12, c2, { front, glit: .04 }, rand(.22, .4)); break;
        case 'kamuro':   // 锦冠：金色长尾垂落到天际线
          lc = C.gold; lk = 1.25;
          sphere(x, y, n(150), S * .94, C.gold, 235, sz * .9, { front, trail: .95, tc: C.amber, tglit: .035, drag: .975, grav: .056, hold: .4, head: 2.6, glit: .03 }); break;
        case 'willow':
          lc = C.gold;
          sphere(x, y, n(80), S * .82, C.gold, 190, sz * .85, { front, trail: .7, tc: C.amber, drag: .972, grav: .05, hold: .5, head: 2.4 }); break;
        case 'crackle':  // 每颗星燃尽时再炸一次
          sphere(x, y, n(115), S * .96, c1, 72, sz, { front, pop: 1 });
          sphere(x, y, n(34), S * .4, C.white, 60, sz, { front, pop: 1 }); break;
        case 'strobe':
          lc = C.silver;
          sphere(x, y, n(150), S * .94, pick([C.white, C.silver, C.gold]), 130, sz, { front, tw: rand(.7, 1.1), drag: .957, glit: .06 }); break;
        case 'cross':
          sphere(x, y, n(24), S * .88, c1, 90, sz * 1.5, { front, split: rand(26, 34), trail: .45, head: 4 }); break;
        case 'palm':
          lc = C.gold;
          sphere(x, y, n(18), S * 1.16, C.gold, 118, sz * 1.7, { front, trail: 1.3, tc: C.amber, grav: .052, head: 4.2, pop: 1 });
          sphere(x, y, n(40), S * .3, c2, 55, sz, { front }); break;
        case 'multi': {  // 子母弹：母弹炸开后甩出一圈子弹再各自爆开
          sphere(x, y, n(70), S * .6, c1, 66, sz, { front });
          const m = Math.round(7 * Math.min(1.3, scale)), a0 = rand(0, TAU);
          for (let i = 0; i < m; i++) {
            const a = a0 + i / m * TAU, v = S * .78;
            rockets.push({ x, y, px: x, py: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, g: .05 * k, type: pick(['peony', 'crackle', 'strobe']),
              o: { scale: scale * .42, col: c2, front }, fuse: rand(22, 28), age: 0, front, drag: .95 });
          }
          break;
        }
        case 'heart': {
          const m = n(110);
          for (let i = 0; i < m; i++) {
            const t = i / m * TAU, hx = 16 * Math.pow(Math.sin(t), 3);
            const hyy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
            spawn(x, y, hx / 16 * S * .8, hyy / 16 * S * .8, rand(85, 100), o.col || C.rose, sz * 1.1, { front, grav: .02 });
          }
          lc = C.rose; break;
        }
        default: {       // 牡丹：可带花芯、可中途变色
          const change = Math.random() < .35;
          sphere(x, y, n(165), S, c1, 90, sz, { front, c2: change ? c2 : null, glit: .015 });
          if (Math.random() < .5) sphere(x, y, n(48), S * .42, change ? C.white : c2, 72, sz, { front });
        }
      }
      const inten = Math.min(1.5, (.55 + scale * .5) * lk);
      lights.push({ x, y, c: lc, i: inten, rad: S * 34, wt: Math.min(1.3, scale) });
      flashes.push({ x, y, r: S * 9, i: 1, front });
      smokes.push({ x, y, r: S * 15, a: .07 * Math.min(1.4, scale), age: 0, c: lc });
      if (!calm) shake = Math.min(5, shake + scale * scale * 1.5);
      if (cb.onBurst) cb.onBurst(scale, x / w, type);
    }

    function textBurst(str, cx, cy, width, c) {
      const tc = document.createElement('canvas'), t = tc.getContext('2d'), fsz = 120;
      const font = `800 ${fsz}px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif`;
      t.font = font;
      tc.width = Math.ceil(t.measureText(str).width) + 12; tc.height = Math.round(fsz * 1.2);
      t.font = font; t.textBaseline = 'middle'; t.fillStyle = '#fff'; t.fillText(str, 6, tc.height / 2);
      const d = t.getImageData(0, 0, tc.width, tc.height).data;
      let filled = 0;
      for (let i = 3; i < d.length; i += 16) if (d[i] > 128) filled++;
      const step = Math.max(3, Math.round(Math.sqrt(filled * 4 / (900 * q))));
      width = Math.min(width, tc.width / tc.height * h * .2);
      const s = width / tc.width, dr = .9, f = (1 - dr) / dr;
      for (let y = 0; y < tc.height; y += step) for (let x = 0; x < tc.width; x += step) {
        if (d[(y * tc.width + x) * 4 + 3] < 128) continue;
        spawn(cx, cy, (x - tc.width / 2) * s * f, (y - tc.height / 2) * s * f, rand(170, 220), c, 2.1 * Math.sqrt(k),
          { drag: dr, grav: .003, front: true, tw: rand(.6, 1), hold: .3, head: 3, glit: .05 });
      }
      lights.push({ x: cx, y: cy, c, i: 1.3, rad: width * .9, wt: 1.2 });
      flashes.push({ x: cx, y: cy, r: width * .25, i: 1, front: true });
      if (!calm) shake = Math.min(5, shake + 3);
      if (cb.onBurst) cb.onBurst(1.6, cx / w, 'text');
    }

    /* ---------- 升空 ---------- */
    function launch(x, ty, type, o) {
      o = o || {};
      const y0 = o.y0 != null ? o.y0 : L.hy, g = .1 * k;
      const vy = -Math.sqrt(2 * g * Math.max(60, y0 - ty));
      rockets.push({ x, y: y0, px: x, py: y0, vx: o.vx != null ? o.vx : rand(-.35, .35) * k, vy, g, type, o, fuse: 0, age: 0, front: !!o.front });
    }
    function comet(m, type, o, v) {   // 斜向射出的彗星弹
      const a = (m.a + rand(-6, 6)) * Math.PI / 180;
      v = (v || rand(5.2, 7)) * k;
      rockets.push({ x: m.x, y: m.y, px: m.x, py: m.y, vx: Math.sin(a) * v, vy: -Math.cos(a) * v, g: .05 * k, type, o, fuse: o.fuse || rand(20, 30), age: 0, front: !!o.front, tail: 1 });
    }
    /* 水岸/地面的扇形齐射 */
    function fan(x, count, spread, c, type) {
      for (let i = 0; i < count; i++) {
        const a = count === 1 ? 0 : -spread / 2 + spread * i / (count - 1);
        comet({ x, y: L.hy - 2, a }, type || 'peony', { scale: rand(.32, .44), col: c, fuse: rand(34, 44) }, rand(8.5, 10.5));
      }
    }
    function combs(c) {   // 沿整条水岸依次打出扇面
      const m = Math.max(4, Math.round(w / 240)), cc = c || pick(BRIGHT);
      for (let i = 0; i < m; i++) at(i * 110, () => fan(w * (.08 + .84 * i / (m - 1)), 3, 50, cc, pick(['peony', 'strobe', 'crackle'])));
    }

    /* ---------- 地标焰火 ---------- */
    function mountFountain(ms, c) {
      L.mounts.forEach(m => emitters.push({ x: m.x, y: m.y, a: m.a * Math.PI / 180, ttl: ms / 16.67, c: c || C.gold, acc: 0, rate: 1.8 }));
    }
    function shoreFountain(ms, c) {
      const m = Math.max(5, Math.round(w / 170));
      for (let i = 0; i < m; i++) emitters.push({ x: w * (.05 + .9 * i / (m - 1)), y: L.hy - 2, a: 0, ttl: ms / 16.67, c: c || C.gold, acc: 0, rate: 2.4, pow: 1.5, back: true });
    }
    function mountVolley(stagger, c, type) {
      const cc = c || pick(BRIGHT);
      L.mounts.forEach((m, i) => at(i * (stagger || 0), () => comet(m, type || pick(['peony', 'strobe', 'crackle']), { scale: rand(.3, .44), col: cc, front: true })));
    }

    /* ---------- 编排 ---------- */
    function autoShell(big) {
      launch(rand(.07, .93) * w, L.hy * rand(.13, .56), null, { scale: big ? rand(1.2, 1.55) : rand(.75, 1.3) });
    }
    function row(nn, type, c, yk, stagger, scale) {
      for (let i = 0; i < nn; i++) {
        at(i * stagger, () => launch(w * (.1 + .8 * (nn === 1 ? .5 : i / (nn - 1))), L.hy * (yk - .1 * Math.sin(i / Math.max(1, nn - 1) * Math.PI)), type, { col: c, scale, vx: 0 }));
      }
    }
    function volley() {
      const c = pick(BRIGHT), type = pick(['peony', 'chrys', 'kamuro', 'crackle', 'saturn']);
      for (let i = 0; i < 6; i++) at(i * 110, () => launch(w * rand(.1, .9), L.hy * rand(.14, .45), type, { col: c, scale: rand(1, 1.4) }));
      at(300, () => combs(c));
    }
    function setPiece() {
      const r = (Math.random() * 6) | 0;
      if (r === 0) row(5, pick(['peony', 'chrys', 'crackle']), pick(BRIGHT), .3, 120, 1.15);
      else if (r === 1) combs();
      else if (r === 2 && L.mounts.length) mountVolley(rand(30, 80));
      else if (r === 3 || r === 2) row(3, 'kamuro', null, .24, 260, 1.45);
      else if (r === 4) { if (L.mounts.length) mountFountain(2600, pick([C.gold, C.silver, C.white])); combs(C.gold); }
      else launch(w * rand(.3, .7), L.hy * rand(.16, .3), 'multi', { scale: 1.5 });
    }
    function wave(i) {
      switch (i % 7) {
        case 0: row(7, 'peony', pick(BRIGHT), .3, 100, 1.2); combs(); break;
        case 1: row(4, 'kamuro', null, .24, 220, 1.55); mountVolley(60, C.gold, 'strobe'); break;
        case 2: for (let j = 0; j < 6; j++) at(j * 160, () => launch(w * rand(.15, .85), L.hy * rand(.16, .42), 'saturn', { scale: rand(1, 1.35) })); break;
        case 3: row(5, 'chrys', C.red, .32, 0, 1.3); at(650, () => row(4, 'chrys', C.cyan, .2, 0, 1.3)); at(1200, () => combs(C.white)); break;
        case 4: mountFountain(2600, pick([C.gold, C.silver, C.white])); shoreFountain(2400, C.gold); row(6, 'crackle', null, .24, 130, 1.2); break;
        case 5: row(3, 'multi', null, .26, 300, 1.5); combs(); break;
        default: for (let j = 0; j < 10; j++) at(j * 120, () => autoShell(true));
      }
    }
    function finale(text, wish) {
      queue = []; mode = 'finale';
      const tw = Math.min(w * .86, 900), ty = L.hy * .62;
      row(7, 'chrys', C.gold, .26, 110, 1.25);
      mountFountain(5200, C.gold); shoreFountain(4200, C.gold);
      at(250, () => combs(C.gold));
      at(500, () => textBurst(text, w / 2, ty, tw, C.gold));
      at(1500, () => mountVolley(45, C.white, 'strobe'));
      const waves = 24;
      for (let i = 0; i < waves; i++) at(3200 + i * 2400, () => wave(i));
      [[5, C.rose], [11, C.cyan], [17, C.gold], [22, C.rose]].forEach((s, j) =>
        at(3200 + s[0] * 2400 + 900, () => textBurst(wish && j % 2 === 0 ? wish : text, w / 2, ty, tw, s[1])));
      const end = 3200 + waves * 2400;
      at(end, () => { row(8, 'kamuro', null, .22, 90, 1.5); mountFountain(6500, C.gold); shoreFountain(6500, C.gold); mountVolley(40, C.gold, 'strobe'); });
      at(end + 700, () => combs(C.gold));
      at(end + 1100, () => row(9, 'palm', null, .34, 60, 1.4));
      at(end + 2200, () => row(5, 'kamuro', null, .3, 110, 1.7));
      at(end + 6500, () => { mode = 'celebrate'; nextAuto = time + 400; });
    }
    function setMode(m) {
      if (m === mode) return;
      if (mode === 'finale') queue = [];
      mode = m; nextAuto = time + 300;
    }
    function tickBurst(nLeft) {   // 最后十秒：每秒一组对称礼花，越来越大
      const c = nLeft <= 3 ? C.gold : pick(BRIGHT), s = 1.05 + (10 - nLeft) * .06;
      const type = nLeft <= 3 ? 'kamuro' : 'peony';
      launch(w * .24, L.hy * .3, type, { col: c, scale: s, vx: 0 });
      launch(w * .76, L.hy * .3, type, { col: c, scale: s, vx: 0 });
      if (nLeft <= 5) fan(w / 2, 5, 70, c);
      if (nLeft <= 3) mountVolley(20, C.gold, 'strobe');
    }
    /* 音乐节拍：不走升空，直接在夜空里炸开，才能踩在拍子上 */
    function beat(strength) {
      if (mode !== 'ambient' && mode !== 'build' && mode !== 'celebrate') return;
      if (parts.length > MAX * .7) return;
      beats++;
      burst(rand(.1, .9) * w, L.hy * rand(.14, .52), pick(['peony', 'peony', 'chrys', 'crackle', 'saturn', 'strobe']), { scale: .75 + strength * .65 });
      if (beats % 8 === 0) combs();
      else if (beats % 4 === 0) fan(rand(.2, .8) * w, 5, 64, pick(BRIGHT));
      nextAuto = Math.max(nextAuto, time + 900);
    }
    function director() {
      const base = { ambient: 1, build: 2.4, celebrate: 1.9, finale: 1.3 }[mode];
      if (!base) return;
      const dens = base * [.55, 1, 1.7][level] * (calm ? .4 : 1);
      if (time >= nextAuto) {
        autoShell(Math.random() < .2);
        if (Math.random() < .34) at(rand(120, 320), autoShell);
        if (Math.random() < .12 * dens) at(rand(300, 520), autoShell);
        nextAuto = time + rand(620, 1500) / dens;
      }
      if (mode !== 'finale' && time >= nextSet) { setPiece(); nextSet = time + rand(8000, 14000) / dens; }
    }

    /* ---------- 每帧 ---------- */
    function step(dt) {
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].t <= time) { const f = queue[i].fn; queue.splice(i, 1); f(); }

      for (let i = emitters.length - 1; i >= 0; i--) {
        const e = emitters[i];
        e.ttl -= dt; if (e.ttl <= 0) { emitters.splice(i, 1); continue; }
        e.acc += e.rate * q * dt;
        while (e.acc >= 1) {
          e.acc--;
          const a = e.a + rand(-.2, .2), v = rand(3.4, 6.4) * k * (e.pow || 1);
          spawn(e.x, e.y, Math.sin(a) * v, -Math.cos(a) * v, rand(36, 62), Math.random() < .25 ? C.white : e.c, 1.3 * Math.sqrt(k),
            { drag: .972, grav: .1, hold: .7, front: !e.back, head: 2.4, glit: .1 });
        }
      }

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.age += dt; r.vy += r.g * dt;
        if (r.drag) { const d = Math.pow(r.drag, dt); r.vx *= d; r.vy *= d; }
        r.px = r.x; r.py = r.y; r.x += r.vx * dt; r.y += r.vy * dt;
        if (Math.random() < (r.tail ? .95 : .6)) spawn(r.x, r.y, rand(-.2, .2), rand(.1, .6), rand(8, r.tail ? 26 : 18), r.tail ? C.gold : C.amber, r.tail ? 1.2 : .9,
          { drag: .93, grav: .02, hold: 1, hot: 0, head: 0, glit: r.tail ? .08 : 0, front: r.front });
        if (r.fuse ? r.age >= r.fuse : r.vy >= -.9) { rockets.splice(i, 1); burst(r.x, r.y, r.type, r.o); }
      }

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        if (p.age >= p.ttl) {
          const px = p.x, py = p.y, pop = p.pop, pf = p.front;
          parts[i] = parts[parts.length - 1]; parts.pop();
          if (pop && parts.length < MAX * .9) {   // 爆裂火花
            pops++;
            for (let j = 0; j < 5; j++) {
              const a = Math.random() * TAU, v = rand(1.2, 3.2) * k;
              spawn(px, py, Math.cos(a) * v, Math.sin(a) * v, rand(7, 15), Math.random() < .5 ? C.white : C.gold, 1, { drag: .9, grav: .02, hold: 1, hot: .5, head: 2.2, glit: .5, front: pf });
            }
          }
          continue;
        }
        const d = Math.pow(p.drag, dt);
        p.vx *= d; p.vy = p.vy * d + p.grav * k * dt;
        p.px = p.x; p.py = p.y; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.trail && parts.length < MAX * .85 && Math.random() < p.trail * dt * q)
          spawn(p.x, p.y, rand(-.2, .2), rand(-.2, .2), rand(10, 26), p.tc || p.c, p.size * .7, { drag: .9, grav: .025, hold: 1, hot: 0, head: 0, glit: p.tglit, front: p.front });
        if (p.split && p.age > p.split) {
          p.split = 0; p.age = p.ttl; p.pop = 0;
          const a0 = Math.random() * TAU;
          for (let j = 0; j < 4; j++) {
            const a = a0 + j * Math.PI / 2;
            spawn(p.x, p.y, Math.cos(a) * 3 * k, Math.sin(a) * 3 * k, rand(24, 36), p.c, p.size * .8, { trail: .6, front: p.front, drag: .95, head: 3 });
          }
        }
      }
      if (pops) { if (cb.onCrackle) cb.onCrackle(Math.min(1, pops / 40)); pops = 0; }

      for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].i -= .2 * dt; if (flashes[i].i <= 0) flashes.splice(i, 1); }
      for (let i = smokes.length - 1; i >= 0; i--) {
        const m = smokes[i]; m.age += dt; m.x += .16 * dt; m.y -= .03 * dt; m.r += .26 * dt;
        if (m.age > 520) smokes.splice(i, 1);
      }
      let e = 0;
      for (let i = lights.length - 1; i >= 0; i--) {
        const l = lights[i];
        l.i *= Math.pow(.95, dt);
        if (l.i < .03) { lights.splice(i, 1); continue; }
        e += l.i * l.wt;
      }
      expo += (Math.min(1.6, e) - expo) * Math.min(1, .4 * dt);
    }

    function fade(ctx, dt) {
      ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(0,0,0,${1 - Math.pow(.85, dt)})`; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
    }
    function drawParts() {
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i], ctx = p.front ? fctx : bctx;
        const f = p.age / p.ttl;
        let a = 1 - f; a = a < p.hold ? a / p.hold : 1;
        if (p.tw && f > .42 && Math.sin(p.age * p.tw + p.x * .7) > .15) a *= .1;
        a *= .8 + Math.random() * .2;
        const c = p.c2 && f > p.sw ? p.c2 : p.c, hot = f < p.hot;
        ctx.globalAlpha = a; ctx.lineWidth = p.size;
        ctx.strokeStyle = hot ? '#fffaf0' : f > .8 && !p.tw ? c.e : c.s;   // 白热 → 本色 → 余烬
        ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
        if (p.head) {
          const r = p.size * p.head * (hot ? 1.5 : 1);
          ctx.globalAlpha = a * (hot ? .85 : .45);
          ctx.drawImage(hot ? C.white.sp : c.sp, p.x - r, p.y - r, r * 2, r * 2);
        }
        if (p.glit && Math.random() < p.glit) {
          const r = p.size * rand(4, 9);
          ctx.globalAlpha = Math.min(1, a * 1.3);
          ctx.drawImage(GLINT, p.x - r, p.y - r, r * 2, r * 2);
        }
      }
      for (let i = 0; i < rockets.length; i++) {
        const r = rockets[i], ctx = r.front ? fctx : bctx;
        ctx.globalAlpha = .95; ctx.strokeStyle = C.gold.s; ctx.lineWidth = (r.tail ? 2 : 1.5) * Math.sqrt(k);
        ctx.beginPath(); ctx.moveTo(r.px, r.py); ctx.lineTo(r.x, r.y); ctx.stroke();
        const s = (r.tail ? 7 : 5) * Math.sqrt(k);
        ctx.globalAlpha = .8; ctx.drawImage(C.gold.sp, r.x - s, r.y - s, s * 2, s * 2);
      }
      for (let i = 0; i < flashes.length; i++) {   // 炸开瞬间的白热核心与星芒
        const fl = flashes[i], ctx = fl.front ? fctx : bctx;
        ctx.globalAlpha = 1; radial(ctx, fl.x, fl.y, fl.r * (1.5 - fl.i * .5), C.white, fl.i * .95);
        const g = fl.r * 2.6 * fl.i;
        ctx.globalAlpha = fl.i * .9; ctx.drawImage(GLINT, fl.x - g, fl.y - g, g * 2, g * 2);
      }
      if (L.sparks.length) {   // 建筑上的闪灯
        const m = Math.max(1, Math.round(L.sparks.length * .035));
        for (let i = 0; i < m; i++) {
          const s = L.sparks[(Math.random() * L.sparks.length) | 0], r = rand(2.5, 6);
          fctx.globalAlpha = rand(.5, 1);
          fctx.drawImage(GLINT, s.x - r, s.y - r, r * 2, r * 2);
        }
      }
    }
    function radial(ctx, x, y, r, c, a) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);
      g.addColorStop(.4, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a * .35})`);
      g.addColorStop(1, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},0)`);
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    function post(dt) {
      /* 曝光与震动作用在整个舞台上 */
      if (cv.stage) {
        if (Math.abs(expo - lastExpo) > .01) { lastExpo = expo; cv.stage.style.setProperty('--exp', (1 + expo * (L.photo ? .15 : .1)).toFixed(3)); }
        if (shake > .12) {
          cv.stage.style.transform = `translate(${((Math.random() - .5) * shake).toFixed(2)}px,${((Math.random() - .5) * shake).toFixed(2)}px) scale(${(1 + shake * .0025).toFixed(4)})`;
          shake *= Math.pow(.86, dt); shaking = true;
        } else if (shaking) { cv.stage.style.transform = ''; shaking = false; shake = 0; }
      }
      const busy = parts.length || rockets.length || lights.length || smokes.length;
      idle = busy ? 0 : idle + 1;
      if (idle > 45) {
        if (idle === 46) { bctx.clearRect(0, 0, w, h); gctx.clearRect(0, 0, gw, gh); g2ctx.clearRect(0, 0, gw, gh); lctx.clearRect(0, 0, lw, lh); mctx.clearRect(0, 0, lw, lh); rctx.clearRect(0, 0, gw, rh); }
        if (!L.sparks.length) return;
      }

      // 近泛光：夜空闪光 + 被照亮的硝烟 + 烟花本体
      gctx.globalCompositeOperation = 'source-over'; gctx.globalAlpha = 1; gctx.clearRect(0, 0, gw, gh);
      gctx.globalCompositeOperation = 'lighter';
      if (!calm) for (const l of lights) radial(gctx, l.x / 4, l.y / 4, l.rad * 1.9 / 4, l.c, .22 * l.i);
      for (const m of smokes) {
        let lr = 0, lg = 0, lb = 0;
        for (const l of lights) {
          const dd = Math.hypot(l.x - m.x, l.y - m.y), reach = l.rad * 2.2;
          if (dd < reach) { const f = l.i * (1 - dd / reach); lr += l.c[0] * f; lg += l.c[1] * f; lb += l.c[2] * f; }
        }
        const life = Math.min(1, m.age / 25) * (1 - m.age / 520), lit = (lr + lg + lb) / 600;
        const al = m.a * life * (.5 + lit * 2.6);
        radial(gctx, m.x / 4, m.y / 4, m.r / 4, [Math.min(255, 120 + lr * .5), Math.min(255, 118 + lg * .5), Math.min(255, 130 + lb * .5)], Math.min(.34, al));
      }
      gctx.globalAlpha = 1;
      gctx.drawImage(cv.back, 0, 0, gw, gh);
      gctx.globalAlpha = Math.max(.25, 1 - expo * .55); gctx.drawImage(cv.back, 0, 0, gw, gh); gctx.globalAlpha = 1;   // 画面已经很亮时少叠一层，避免整片过曝
      // 倒影要用「没被建筑挡住之前」的光，所以先留一份，再把建筑范围内的泛光压掉（否则烟花会透到楼前面）
      if (L.water) { g3ctx.globalCompositeOperation = 'copy'; g3ctx.drawImage(cv.glow, 0, 0); }
      gctx.globalCompositeOperation = 'destination-out'; gctx.globalAlpha = .96; gctx.drawImage(mask, 0, 0, gw, gh);
      gctx.globalCompositeOperation = 'lighter'; gctx.globalAlpha = 1;
      gctx.drawImage(cv.front, 0, 0, gw, gh);
      // 远泛光
      g2ctx.globalCompositeOperation = 'copy'; g2ctx.drawImage(cv.glow, 0, 0, cv.glow2.width, cv.glow2.height);

      // 建筑受光 + 轮廓光
      lctx.globalCompositeOperation = 'source-over'; lctx.clearRect(0, 0, lw, lh);
      mctx.globalCompositeOperation = 'source-over'; mctx.clearRect(0, 0, lw, lh);
      if (lights.length) {
        lctx.globalCompositeOperation = 'lighter'; mctx.globalCompositeOperation = 'lighter';
        for (const l of lights) {
          radial(lctx, l.x / 2, l.y / 2, l.rad * 3.4 / 2, l.c, Math.min(.5, .36 * l.i));
          radial(mctx, l.x / 2, l.y / 2, l.rad * 3 / 2, l.c, Math.min(1, .95 * l.i));
        }
        lctx.globalCompositeOperation = 'destination-in'; lctx.drawImage(mask, 0, 0);
        mctx.globalCompositeOperation = 'destination-in'; mctx.drawImage(rimMask, 0, 0);
      }

      // 水面倒影：纵向拉长的光带 + 波纹
      if (L.water) {
        rctx.globalCompositeOperation = 'source-over'; rctx.globalAlpha = 1; rctx.clearRect(0, 0, gw, rh);
        rctx.globalCompositeOperation = 'lighter';
        const hy4 = Math.floor(L.hy / 4), ph = time * .0024, comp = Math.max(1.4, L.hy * .94 / (h - L.hy)), band = Math.max(2, Math.ceil(comp * 2.2));
        for (let y = 0; y < rh; y++) {
          const sy = hy4 - 1 - Math.floor(y * comp) - band;
          if (sy + band <= 0) break;
          const dx = Math.sin(y * .8 + ph * (1 + y * .03)) * (.5 + y * .08), a = Math.pow(1 - y / rh, .9);
          rctx.globalAlpha = a * .8;
          rctx.drawImage(pre, 0, Math.max(0, sy), gw, band, dx, y, gw, 1);
          rctx.drawImage(pre, 0, Math.max(0, sy), gw, band, -dx * .7, y, gw, 1);
        }
      }
    }

    function frame(ms) {
      const dt = Math.min(ms / 16.667, 3);
      time += ms;
      slow = slow * .95 + ms * .05;
      if (slow > 26) q = Math.max(.35, q - .012); else if (slow < 18.5) q = Math.min(1, q + .002);
      director();
      step(dt);
      fade(bctx, dt); fade(fctx, dt);
      drawParts();
      post(dt);
    }

    return {
      resize, setScene, clear, frame, launch, burst, volley, finale, setMode, tickBurst, beat, textBurst, combs,
      wish(text) { textBurst(text, w / 2, L.hy * .5, Math.min(w * .86, 900), pick([C.gold, C.rose, C.cyan, C.white])); combs(C.gold); },
      setCalm(v) { calm = v; },
      setLevel(v) { level = Math.max(0, Math.min(2, v | 0)); },
      get mode() { return mode; },
      stats() { return { parts: parts.length, rockets: rockets.length, lights: lights.length, q, mode }; }
    };
  };
})();
