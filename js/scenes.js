/* 地标夜景：全部用 Canvas 程序化绘制，不依赖任何图片素材。
 * 地标在「单位坐标」里绘制：原点在地平线上的构图中心，y 向上，1 个单位 ≈ 最高地标的高度。 */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const WIN = ['#ffd38a', '#ffe7b8', '#ffc777', '#a9d4ff', '#fff3d6'];

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function lg(c, x0, y0, x1, y1, stops) {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    stops.forEach((s, i) => g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), s));
    return g;
  }
  function glowOn(c, color, blur) { c.shadowColor = color; c.shadowBlur = blur * (c.B || 1); }
  function glowOff(c) { c.shadowColor = 'transparent'; c.shadowBlur = 0; }

  /* 左右对称的轮廓：只描述左半边（自下而上），右半边自动镜像。
   * 每段是 [x,y]（直线）或 [cx,cy,x,y]（二次曲线）。 */
  function sym(c, sx, sy, segs) {
    const pts = [[sx, sy]];
    c.moveTo(sx, sy);
    for (const s of segs) {
      if (s.length === 2) { c.lineTo(s[0], s[1]); pts.push(s); }
      else { c.quadraticCurveTo(s[0], s[1], s[2], s[3]); pts.push([s[2], s[3]]); }
    }
    const last = pts[pts.length - 1];
    c.lineTo(-last[0], last[1]);
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i], p = pts[i];
      if (s.length === 2) c.lineTo(-p[0], p[1]);
      else c.quadraticCurveTo(-s[0], s[1], -p[0], p[1]);
    }
    c.closePath();
  }
  function wins(c, R, x0, y0, x1, y1, nx, ny, p, alpha, cols) {
    cols = cols || WIN;
    const cw = (x1 - x0) / nx, ch = (y1 - y0) / ny;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (R() > p) continue;
      c.globalAlpha = alpha * (.35 + R() * .65);
      c.fillStyle = cols[(R() * cols.length) | 0];
      c.fillRect(x0 + i * cw + cw * .22, y0 + j * ch + ch * .25, cw * .56, ch * .5);
    }
    c.globalAlpha = 1;
  }
  function dot(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }

  /* ---------------- 悉尼 ---------------- */
  function sydney(c, R, L) {
    const P0 = [-1.08, .105], P1 = [-.12, .105], C1 = [-.6, .62], C2 = [-.6, .47];
    const q = (t, C) => [
      (1 - t) * (1 - t) * P0[0] + 2 * t * (1 - t) * C[0] + t * t * P1[0],
      (1 - t) * (1 - t) * P0[1] + 2 * t * (1 - t) * C[1] + t * t * P1[1]];
    const N = 26;
    // 引桥与桥面
    c.fillStyle = '#131a36';
    for (let x = -1.75; x < -1.12; x += .11) c.fillRect(x, 0, .012, .1);
    c.fillRect(-1.9, .094, 1.86, .02);
    // 桁架与吊杆
    c.strokeStyle = '#1f2950'; c.lineWidth = .0034; c.beginPath();
    for (let i = 0; i <= N; i++) {
      const a = q(i / N, C1), b = q(i / N, C2);
      c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
      if (i < N) { const b2 = q((i + 1) / N, C2); c.moveTo(a[0], a[1]); c.lineTo(b2[0], b2[1]); }
      if (b[1] > .13) { c.moveTo(b[0], b[1]); c.lineTo(b[0], .11); }
    }
    c.stroke();
    c.strokeStyle = '#2b3765'; c.lineWidth = .009; c.beginPath();
    c.moveTo(P0[0], P0[1]); c.quadraticCurveTo(C1[0], C1[1], P1[0], P1[1]);
    c.moveTo(P0[0], P0[1]); c.quadraticCurveTo(C2[0], C2[1], P1[0], P1[1]);
    c.stroke();
    // 桥塔
    c.fillStyle = lg(c, 0, 0, 0, .22, ['#8a7358', '#3a3244']);
    [-1.135, -1.075, -.135, -.075].forEach(x => c.fillRect(x, 0, .042, .2));
    // 拱上灯串
    glowOn(c, 'rgba(255,205,130,.95)', 7); c.fillStyle = '#ffe6b5';
    for (let i = 0; i <= N; i++) {
      const a = q(i / N, C1); dot(c, a[0], a[1], .0036); L.spark(a[0], a[1]);
      if (i % 3 === 1) L.mount(a[0], a[1], (i / N - .5) * 46);
    }
    for (let x = -1.85; x < -.05; x += .045) dot(c, x, .118, .0024);
    glowOff(c);

    // 歌剧院基座
    c.fillStyle = lg(c, 0, 0, 0, .05, ['#4a3832', '#1b1622']);
    c.fillRect(-.04, 0, .96, .045);
    wins(c, R, -.02, .008, .9, .036, 70, 1, .55, .9);
    // 贝壳屋顶
    const fin = (xb, xf, tx, hh) => {
      const y0 = .043;
      c.beginPath(); c.moveTo(xb, y0);
      c.quadraticCurveTo(xb + (tx - xb) * .36, y0 + hh * .98, tx, y0 + hh);
      c.quadraticCurveTo(xf + (tx - xf) * .72, y0 + hh * .42, xf, y0);
      c.closePath(); c.fill(); c.stroke();
      L.mount(tx, y0 + hh, tx > xb ? 18 : -18);
    };
    glowOn(c, 'rgba(255,225,190,.45)', 16);
    c.fillStyle = lg(c, 0, .04, 0, .36, ['#fff3da', '#efe0cf', '#b9aec4']);
    c.strokeStyle = 'rgba(70,58,86,.55)'; c.lineWidth = .003;
    fin(.15, .07, .01, .12);
    fin(.1, .27, .37, .3);
    fin(.28, .41, .49, .225);
    fin(.42, .51, .57, .15);
    fin(.69, .63, .59, .09);
    fin(.64, .76, .83, .2);
    fin(.77, .85, .895, .125);
    glowOff(c);
  }

  /* ---------------- 上海 ---------------- */
  function shanghai(c, R, L) {
    // 上海中心
    c.save(); c.translate(.47, 0);
    glowOn(c, 'rgba(150,190,255,.4)', 16);
    c.fillStyle = lg(c, -.07, 0, .07, 0, ['#1d2c52', '#7ea3d8', '#e4f0ff', '#6a8cc2', '#1a2748']);
    c.beginPath(); c.moveTo(-.072, 0); c.quadraticCurveTo(-.062, .6, -.034, .95);
    c.lineTo(.028, 1); c.quadraticCurveTo(.058, .6, .072, 0); c.closePath(); c.fill(); glowOff(c);
    c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = .0028; c.beginPath();
    c.moveTo(-.05, .15); c.quadraticCurveTo(.04, .6, -.012, .965); c.stroke();
    wins(c, R, -.05, .02, .05, .7, 9, 46, .3, .55, ['#cfe4ff', '#ffffff']);
    c.restore();
    L.mount(.47, 1, 0); L.mount(.42, .7, -50); L.mount(.52, .7, 50);

    // 环球金融中心
    c.save(); c.translate(.245, 0);
    c.fillStyle = lg(c, -.06, 0, .06, 0, ['#15213f', '#6e95cc', '#b9d3f5', '#22335c']);
    c.beginPath(); c.moveTo(-.06, 0); c.lineTo(-.04, .79); c.lineTo(.03, .79); c.lineTo(.06, 0); c.closePath(); c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.moveTo(-.022, .69); c.lineTo(-.027, .758); c.lineTo(.02, .758); c.lineTo(.016, .69); c.closePath(); c.fill();
    c.globalCompositeOperation = 'source-over';
    wins(c, R, -.04, .02, .04, .66, 7, 44, .28, .5, ['#cfe4ff', '#ffe7b8']);
    c.restore();
    L.mount(.24, .79, 0);

    // 金茂大厦
    c.save(); c.translate(.03, 0);
    glowOn(c, 'rgba(255,200,120,.35)', 12);
    c.fillStyle = lg(c, 0, 0, 0, .7, ['#e3bd7c', '#9c8463', '#4b4560']);
    c.beginPath();
    sym(c, -.056, 0, [[-.056, .26], [-.05, .27], [-.05, .38], [-.044, .39], [-.044, .47], [-.037, .48], [-.037, .54],
      [-.029, .55], [-.029, .59], [-.018, .6], [-.018, .625], [-.008, .635], [-.002, .65], [0, .7]]);
    c.fill(); glowOff(c);
    wins(c, R, -.046, .02, .046, .58, 8, 40, .45, .7);
    c.restore();
    L.mount(.03, .7, 0);

    // 东方明珠
    c.save(); c.translate(-.42, 0);
    c.strokeStyle = '#a583c2'; c.lineWidth = .012; c.lineCap = 'round'; c.beginPath();
    c.moveTo(-.078, 0); c.lineTo(-.012, .2); c.moveTo(.078, 0); c.lineTo(.012, .2); c.stroke();
    c.fillStyle = lg(c, 0, 0, 0, .76, ['#f0cdf7', '#b58ad0', '#8a6aa8']);
    c.fillRect(-.036, 0, .012, .2); c.fillRect(.024, 0, .012, .2);
    c.fillRect(-.016, 0, .032, .5); c.fillRect(-.009, .5, .018, .12); c.fillRect(-.0028, .62, .0056, .14);
    const ball = (y, r) => {
      const g = c.createRadialGradient(-r * .3, y + r * .3, r * .1, 0, y, r);
      g.addColorStop(0, '#ffe0f7'); g.addColorStop(.5, '#ff62c6'); g.addColorStop(1, '#7b1e8e');
      glowOn(c, 'rgba(255,80,200,.85)', 22); c.fillStyle = g; dot(c, 0, y, r); glowOff(c);
    };
    ball(.2, .064); ball(.5, .044); ball(.632, .017);
    c.fillStyle = '#ffd9f5'; [.09, .13].forEach(y => { dot(c, -.05 + y * .22, y, .011); dot(c, .05 - y * .22, y, .011); });
    c.restore();
    L.mount(-.42, .76, 0); L.mount(-.484, .2, -62); L.mount(-.356, .2, 62); L.mount(-.464, .5, -48); L.mount(-.376, .5, 48);
  }

  /* ---------------- 迪拜 ---------------- */
  function dubai(c, R, L) {
    const T = [[0, .115, .105], [.16, .094, .105], [.27, .094, .082], [.37, .071, .082], [.46, .071, .06], [.54, .05, .06],
      [.62, .05, .042], [.69, .034, .042], [.75, .034, .027], [.81, .021, .027], [.86, .021, .014], [.905, .01, .014], [.94, .01, .006], [.965, .004, .004]];
    const top = i => (T[i + 1] ? T[i + 1][0] : .985);
    glowOn(c, 'rgba(170,205,255,.5)', 20);
    c.fillStyle = lg(c, -.11, 0, .11, 0, ['#2a3654', '#8ea6d0', '#f3f8ff', '#a9c0e6', '#34446a']);
    c.beginPath(); c.moveTo(-T[0][1], 0);
    for (let i = 0; i < T.length; i++) { c.lineTo(-T[i][1], T[i][0]); c.lineTo(-T[i][1] * .95, top(i)); }
    c.lineTo(0, 1);
    for (let i = T.length - 1; i >= 0; i--) { c.lineTo(T[i][2] * .95, top(i)); c.lineTo(T[i][2], T[i][0]); }
    c.closePath(); c.fill(); glowOff(c);
    c.strokeStyle = 'rgba(30,44,80,.5)'; c.lineWidth = .0022; c.beginPath();
    [-.06, -.03, 0, .03, .06].forEach(x => { c.moveTo(x, 0); c.lineTo(x * .2, .86); });
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,.7)';
    for (let i = 1; i < T.length; i++) {
      c.fillRect(-T[i - 1][1], T[i][0] - .003, T[i - 1][1] + T[i - 1][2], .003);
      if (i < 12) L.mount(i % 2 ? -T[i - 1][1] : T[i - 1][2], T[i][0], i % 2 ? -58 : 58);
    }
    L.mount(0, 1, 0);
    for (let i = 0; i < 46; i++) { const y = .04 + R() * .88; L.spark((R() - .5) * .19 * (1 - y), y); }
  }

  /* ---------------- 巴黎 ---------------- */
  function paris(c, R, L) {
    const segs = [[-.135, .1, -.108, .19], [-.12, .19], [-.12, .206], [-.1, .206], [-.072, .3, -.056, .38], [-.064, .38],
      [-.064, .393], [-.05, .393], [-.022, .64, -.012, .9], [-.018, .9], [-.018, .914], [-.008, .914], [-.004, .955], [0, 1]];
    glowOn(c, 'rgba(255,176,64,.65)', 26);
    c.fillStyle = lg(c, 0, 0, 0, 1, ['#ffe2a0', '#f4b853', '#e0962f']);
    c.beginPath(); sym(c, -.21, 0, segs); c.fill(); glowOff(c);
    // 铁格
    c.save(); c.beginPath(); sym(c, -.21, 0, segs); c.clip();
    c.strokeStyle = 'rgba(110,52,8,.5)'; c.lineWidth = .0024; c.beginPath();
    for (let i = -24; i < 40; i++) {
      const y = i * .03;
      c.moveTo(-.25, y); c.lineTo(.25, y + .5); c.moveTo(.25, y); c.lineTo(-.25, y + .5);
    }
    c.stroke();
    c.fillStyle = '#fff2c8'; c.fillRect(-.13, .19, .26, .016); c.fillRect(-.07, .38, .14, .013); c.fillRect(-.02, .9, .04, .014);
    c.restore();
    // 镂空：底拱与二层之间
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.moveTo(-.152, -.01); c.bezierCurveTo(-.13, .11, -.07, .156, 0, .156);
    c.bezierCurveTo(.07, .156, .13, .11, .152, -.01); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-.05, .215); c.quadraticCurveTo(0, .43, .05, .215); c.closePath(); c.fill();
    c.globalCompositeOperation = 'source-over';
    glowOn(c, '#fff', 14); c.fillStyle = '#fff'; dot(c, 0, .998, .006); glowOff(c);

    const hw = y => (y < .19 ? .21 - (y / .19) * .1 : y < .38 ? .1 - ((y - .19) / .19) * .044 : .05 - ((y - .38) / .52) * .04);
    for (let i = 0; i < 190; i++) {
      const y = R() * .93, x = (R() * 2 - 1) * hw(y);
      if (y < .15 && Math.abs(x) < .145 * Math.sqrt(1 - (y / .156) * (y / .156))) continue;
      L.spark(x, y);
    }
    [.2, .39, .62, .82].forEach(y => { L.mount(-hw(y), y, -56); L.mount(hw(y), y, 56); });
    L.mount(0, 1, 0);
  }

  /* ---------------- 伦敦 ---------------- */
  function london(c, R, L) {
    // 伦敦眼
    const ex = -.78, ey = .37, er = .3;
    c.strokeStyle = '#27304e'; c.lineWidth = .013; c.lineCap = 'round'; c.beginPath();
    c.moveTo(ex, ey); c.lineTo(ex - .13, 0); c.moveTo(ex, ey); c.lineTo(ex + .13, 0); c.stroke();
    c.strokeStyle = 'rgba(175,215,255,.34)'; c.lineWidth = .0016; c.beginPath();
    for (let i = 0; i < 32; i++) { const a = i / 32 * TAU; c.moveTo(ex, ey); c.lineTo(ex + Math.cos(a) * er, ey + Math.sin(a) * er); }
    c.stroke();
    glowOn(c, 'rgba(110,185,255,.85)', 14);
    c.strokeStyle = '#b4dcff'; c.lineWidth = .007; c.beginPath(); c.arc(ex, ey, er, 0, TAU); c.stroke();
    c.lineWidth = .003; c.beginPath(); c.arc(ex, ey, er * .92, 0, TAU); c.stroke();
    c.fillStyle = '#eef8ff';
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * TAU, x = ex + Math.cos(a) * er * 1.03, y = ey + Math.sin(a) * er * 1.03;
      dot(c, x, y, .0085);
      if (i % 2 === 0 && Math.sin(a) > -.55) L.mount(x, y, Math.atan2(Math.cos(a), Math.sin(a)) * 180 / Math.PI);
    }
    dot(c, ex, ey, .018); glowOff(c);

    // 威斯敏斯特宫
    const stone = lg(c, 0, 0, 0, .4, ['#e2b467', '#a67a3c', '#5a4226']);
    c.fillStyle = stone;
    c.fillRect(-.36, 0, .61, .15);
    c.beginPath();
    for (let x = -.36; x <= .25; x += .0305) { c.moveTo(x - .005, .15); c.lineTo(x, .195); c.lineTo(x + .005, .15); }
    c.moveTo(-.1, .15); c.lineTo(-.091, .32); c.lineTo(-.082, .15);
    c.fill();
    c.fillRect(-.45, 0, .09, .34);
    c.beginPath();
    [-.45, -.36].forEach(x => { c.moveTo(x - .008, .34); c.lineTo(x, .41); c.lineTo(x + .008, .34); });
    c.fill();
    c.fillRect(-.406, .34, .002, .09);
    wins(c, R, -.35, .02, .245, .135, 40, 3, .8, .9, ['#ffe9ad', '#ffd27a', '#fff4d0']);
    wins(c, R, -.44, .03, -.37, .31, 4, 8, .55, .8, ['#ffe9ad', '#ffd27a']);
    L.mount(-.405, .41, 0); L.mount(-.091, .32, 0);

    // 大本钟
    c.save(); c.translate(.3, 0);
    glowOn(c, 'rgba(255,196,110,.5)', 18);
    c.fillStyle = lg(c, 0, 0, 0, 1, ['#f0c478', '#c4934a', '#7a5a30', '#3d3026']);
    c.beginPath();
    sym(c, -.046, 0, [[-.046, .55], [-.057, .56], [-.057, .686], [-.05, .696], [-.031, .79], [-.035, .796], [-.035, .83], [-.026, .842], [-.004, .93], [0, .985]]);
    c.fill(); glowOff(c);
    c.strokeStyle = 'rgba(70,44,14,.5)'; c.lineWidth = .003; c.beginPath();
    [-.028, -.01, .01, .028].forEach(x => { c.moveTo(x, .01); c.lineTo(x, .54); });
    c.stroke();
    glowOn(c, 'rgba(255,240,190,.95)', 18); c.fillStyle = '#fff6d6'; dot(c, 0, .623, .039); glowOff(c);
    c.strokeStyle = '#3a2a16'; c.lineWidth = .004; c.beginPath(); c.arc(0, .623, .039, 0, TAU); c.stroke();
    c.lineWidth = .0045; c.lineCap = 'round'; c.beginPath();
    c.moveTo(0, .623); c.lineTo(-.004, .654); c.moveTo(0, .623); c.lineTo(-.002, .644); c.stroke();
    wins(c, R, -.02, .8, .02, .826, 3, 1, 1, .9, ['#ffe9ad']);
    c.restore();
    L.mount(.3, .985, 0); L.mount(.243, .69, -55); L.mount(.357, .69, 55);
  }

  /* ---------------- 纽约 ---------------- */
  function newyork(c, R, L) {
    // 布鲁克林大桥
    const deck = .07, tx = [-1.42, -.93];
    c.strokeStyle = 'rgba(170,150,130,.55)'; c.lineWidth = .0032; c.beginPath();
    c.moveTo(-1.9, .1); c.quadraticCurveTo(-1.62, .08, tx[0], .27);
    c.quadraticCurveTo((tx[0] + tx[1]) / 2, -.07, tx[1], .27);
    c.quadraticCurveTo(-.82, .1, -.72, deck); c.stroke();
    c.lineWidth = .0012; c.beginPath();
    for (let x = tx[0]; x <= tx[1]; x += .022) {
      const t = (x - tx[0]) / (tx[1] - tx[0]);
      const y = (1 - t) * (1 - t) * .27 + 2 * t * (1 - t) * -.07 + t * t * .27;
      if (y > deck) { c.moveTo(x, y); c.lineTo(x, deck); }
    }
    c.stroke();
    c.fillStyle = '#1a1826'; c.fillRect(-1.9, deck - .008, 1.2, .016);
    c.fillStyle = lg(c, 0, 0, 0, .28, ['#8f7458', '#40364a']);
    tx.forEach(x => {
      c.fillRect(x - .04, 0, .08, .27);
      L.mount(x, .27, 0);
    });
    c.globalCompositeOperation = 'destination-out';
    tx.forEach(x => [-.019, .019].forEach(d => {
      c.beginPath(); c.moveTo(x + d - .011, deck + .01); c.lineTo(x + d - .011, .19);
      c.quadraticCurveTo(x + d, .235, x + d + .011, .19); c.lineTo(x + d + .011, deck + .01); c.closePath(); c.fill();
    }));
    c.globalCompositeOperation = 'source-over';
    glowOn(c, 'rgba(255,215,150,.9)', 6); c.fillStyle = '#ffe6b5';
    for (let x = -1.88; x < -.72; x += .04) dot(c, x, deck + .012, .0024);
    glowOff(c);

    // 世贸中心一号楼
    c.save(); c.translate(-.5, 0);
    glowOn(c, 'rgba(140,190,255,.4)', 16);
    c.fillStyle = lg(c, -.06, 0, .06, 0, ['#1f3157', '#5f86c0', '#cfe3ff', '#4b6da6', '#182645']);
    c.beginPath(); sym(c, -.058, 0, [[-.058, .1], [-.031, .78], [-.012, .79], [-.012, .805], [-.003, .805], [-.0015, .995]]); c.fill(); glowOff(c);
    c.fillStyle = 'rgba(255,255,255,.16)';
    c.beginPath(); c.moveTo(-.058, .1); c.lineTo(0, .78); c.lineTo(.058, .1); c.closePath(); c.fill();
    wins(c, R, -.04, .02, .04, .7, 8, 50, .3, .5, ['#d6e8ff', '#ffffff']);
    glowOn(c, '#fff', 12); c.fillStyle = '#fff'; dot(c, 0, .995, .005); glowOff(c);
    c.restore();
    L.mount(-.5, .995, 0); L.mount(-.535, .7, -52); L.mount(-.465, .7, 52);

    // 帝国大厦
    c.save(); c.translate(.12, 0);
    const esb = [[-.08, .1], [-.062, .1], [-.062, .44], [-.05, .44], [-.05, .55], [-.038, .55], [-.038, .61], [-.024, .61],
      [-.024, .655], [-.012, .67], [-.012, .712], [-.004, .722], [-.0025, .86]];
    c.fillStyle = lg(c, 0, 0, 0, .86, ['#3a3550', '#252742', '#1c1f38']);
    c.beginPath(); sym(c, -.08, 0, esb); c.fill();
    c.save(); c.beginPath(); sym(c, -.08, 0, esb); c.clip();
    c.fillStyle = lg(c, 0, .5, 0, .74, ['rgba(255,190,90,0)', 'rgba(255,200,110,.95)', '#fff4d6']);
    c.fillRect(-.1, .5, .2, .4);
    c.restore();
    wins(c, R, -.058, .02, .058, .54, 10, 40, .5, .75);
    c.restore();
    L.mount(.12, .86, 0); L.mount(.07, .55, -55); L.mount(.17, .55, 55);

    // 克莱斯勒大厦
    c.save(); c.translate(.5, 0);
    const chr = [[-.042, .46], [-.034, .47], [-.03, .52], [-.022, .565], [-.014, .6], [-.006, .632], [-.0018, .745]];
    c.fillStyle = lg(c, 0, 0, 0, .75, ['#343650', '#22243e', '#1a1c34']);
    c.beginPath(); sym(c, -.042, 0, chr); c.fill();
    c.save(); c.beginPath(); sym(c, -.042, 0, chr); c.clip();
    c.fillStyle = lg(c, 0, .45, 0, .66, ['rgba(220,235,255,0)', 'rgba(225,238,255,.95)', '#ffffff']);
    c.fillRect(-.05, .45, .1, .3);
    c.restore();
    wins(c, R, -.034, .02, .034, .44, 6, 34, .5, .7);
    c.restore();
    L.mount(.5, .745, 0);
  }

  /* ---------------- 台北 ---------------- */
  function taipei(c, R, L) {
    const segs = [[-.066, .2]];
    for (let i = 0; i < 8; i++) { const y = .2 + i * .075; segs.push([-.054, y + .004], [-.071, y + .075]); }
    segs.push([-.046, .8], [-.046, .835], [-.03, .842], [-.03, .866], [-.012, .876], [-.008, .92], [-.003, .93], [0, 1]);
    glowOn(c, 'rgba(110,240,210,.45)', 20);
    c.fillStyle = lg(c, -.075, 0, .075, 0, ['#0f2b2e', '#3a8f88', '#b4f0df', '#3f958c', '#0f2b2e']);
    c.beginPath(); sym(c, -.086, 0, segs); c.fill(); glowOff(c);
    for (let i = 0; i < 8; i++) {
      const y = .2 + i * .075;
      c.fillStyle = 'rgba(8,30,34,.5)'; c.fillRect(-.06, y + .004, .12, .012);
      c.fillStyle = 'rgba(210,255,240,.85)'; c.fillRect(-.071, y + .07, .142, .005);
      L.mount(-.071, y + .075, -66); L.mount(.071, y + .075, 66);
    }
    wins(c, R, -.06, .02, .06, .19, 12, 12, .5, .7, ['#cffff0', '#ffe7b8']);
    wins(c, R, -.05, .215, .05, .8, 10, 60, .22, .5, ['#e6fff7', '#ffffff']);
    glowOn(c, '#fff', 12); c.fillStyle = '#fff'; dot(c, 0, .998, .005); glowOff(c);
    L.mount(0, 1, 0);
  }

  /* ---------------- 通用：远近城市天际线（像素坐标） ---------------- */
  function skyline(c, R, w, hy, u, ox, o) {
    let x = -R() * o.maxW * u;
    while (x < w) {
      const bw = (o.minW + R() * (o.maxW - o.minW)) * u;
      const e = o.env ? o.env((x + bw / 2 - ox) / u) : 1;
      const bh = Math.max(2, (o.minH + Math.pow(R(), o.pow || 1.8) * (o.maxH - o.minH)) * u * e);
      c.globalAlpha = 1; c.fillStyle = o.fill;
      c.fillRect(x, hy - bh, bw + .6, bh + 1);
      const r = R();
      if (r < .22) c.fillRect(x + bw * .46, hy - bh * 1.14, Math.max(1, bw * .05), bh * .14);
      else if (r < .42) c.fillRect(x + bw * .2, hy - bh - u * .012, bw * .6, u * .012);
      if (o.win) {
        const cw = Math.max(1.2, u * .0042), gx = cw * 2.5, gy = cw * 3.1;
        for (let yy = hy - bh + gy; yy < hy - gy * .6; yy += gy) {
          if (R() < .22) continue;
          for (let xx = x + gx * .6; xx < x + bw - gx * .7; xx += gx) {
            if (R() > o.win) continue;
            c.globalAlpha = .22 + R() * .62;
            c.fillStyle = WIN[(R() * WIN.length) | 0];
            c.fillRect(xx, yy, cw, cw * 1.35);
          }
        }
      }
      x += bw + (R() < (o.gap || 0) ? R() * o.maxW * u : 0);
    }
    c.globalAlpha = 1;
  }
  function ridge(c, R, w, hy, amp, fill, rough) {
    c.fillStyle = fill; c.beginPath(); c.moveTo(0, hy + 2);
    const p1 = R() * 9, p2 = R() * 9, p3 = R() * 9;
    for (let x = 0; x <= w; x += 6) {
      const t = x / w;
      const y = (Math.sin(t * 5 + p1) * .5 + Math.sin(t * 11 + p2) * .3 + Math.sin(t * 29 + p3) * rough) * .5 + .55;
      c.lineTo(x, hy - y * amp);
    }
    c.lineTo(w, hy + 2); c.closePath(); c.fill();
  }

  const SCENES = [
    {
      id: 'sydney', city: '悉尼', country: '澳大利亚', mark: '悉尼歌剧院 · 海港大桥', tz: 'Australia/Sydney', seed: 11,
      horizon: .8, top: .5, span: 2.2, ox: .12, draw: sydney,
      sky: ['#040818', '#0b1a46', '#2b3c7c'], glow: 'rgba(255,170,120,.3)', water: ['#0c1a40', '#03050d'],
      far: { minW: .02, maxW: .06, minH: .02, maxH: .2, fill: '#18224c', win: .1, env: x => (x > 0 ? 1 : .4) },
      near: { minW: .025, maxW: .07, minH: .02, maxH: .3, fill: '#0b1026', win: .26, pow: 2.2, env: x => (x > .15 ? 1 : .22) }
    },
    {
      id: 'taipei', city: '台北', country: '中国台湾', mark: '台北 101', tz: 'Asia/Taipei', seed: 23,
      horizon: .86, top: 1, span: .9, ox: 0, draw: taipei, mountains: true,
      sky: ['#04070f', '#0c1a3a', '#274064'], glow: 'rgba(120,235,210,.22)', ground: ['#070a14', '#020308'],
      far: { minW: .03, maxW: .08, minH: .03, maxH: .16, fill: '#141f3e', win: .1 },
      near: { minW: .035, maxW: .09, minH: .03, maxH: .24, fill: '#090d1c', win: .26, env: x => Math.min(1, .35 + Math.abs(x) * 1.2) }
    },
    {
      id: 'shanghai', city: '上海', country: '中国', mark: '陆家嘴 · 东方明珠', tz: 'Asia/Shanghai', seed: 37,
      horizon: .8, top: 1, span: 1.3, ox: 0, draw: shanghai,
      sky: ['#070617', '#1a1246', '#4a2b72'], glow: 'rgba(255,110,210,.26)', water: ['#150f3a', '#04040e'],
      far: { minW: .03, maxW: .08, minH: .05, maxH: .34, fill: '#211a52', win: .12 },
      near: { minW: .035, maxW: .09, minH: .04, maxH: .42, fill: '#0c0a22', win: .3, env: x => Math.min(1, .3 + Math.abs(x) * .9) }
    },
    {
      id: 'dubai', city: '迪拜', country: '阿联酋', mark: '哈利法塔', tz: 'Asia/Dubai', seed: 41,
      horizon: .8, top: 1, span: .9, ox: 0, draw: dubai,
      sky: ['#05071a', '#131c4a', '#3d386c'], glow: 'rgba(255,190,120,.26)', water: ['#101a40', '#03040c'],
      far: { minW: .03, maxW: .07, minH: .04, maxH: .26, fill: '#1c2350', win: .1 },
      near: { minW: .03, maxW: .08, minH: .04, maxH: .4, fill: '#0a0d22', win: .28, pow: 2.4, env: x => Math.min(1, .2 + Math.abs(x) * 1.1) }
    },
    {
      id: 'paris', city: '巴黎', country: '法国', mark: '埃菲尔铁塔', tz: 'Europe/Paris', seed: 53,
      horizon: .8, top: 1, span: .95, ox: 0, draw: paris, trees: true,
      sky: ['#05071a', '#101a46', '#2f356c'], glow: 'rgba(255,196,110,.3)', water: ['#0e1638', '#03040c'],
      far: { minW: .03, maxW: .09, minH: .03, maxH: .09, fill: '#1a2048', win: .12 },
      near: { minW: .04, maxW: .11, minH: .035, maxH: .075, fill: '#0b0d20', win: .34 }
    },
    {
      id: 'london', city: '伦敦', country: '英国', mark: '大本钟 · 伦敦眼', tz: 'Europe/London', seed: 67,
      horizon: .8, top: 1, span: 1.75, ox: .36, draw: london,
      sky: ['#04070f', '#0c1632', '#263556'], glow: 'rgba(150,190,255,.22)', water: ['#0b1430', '#02040a'],
      far: { minW: .03, maxW: .08, minH: .03, maxH: .2, fill: '#141d3c', win: .1 },
      near: { minW: .035, maxW: .09, minH: .03, maxH: .12, fill: '#090c1a', win: .28, env: x => (x > .42 || x < -1.15 ? 1 : .35) }
    },
    {
      id: 'newyork', city: '纽约', country: '美国', mark: '曼哈顿天际线', tz: 'America/New_York', seed: 79,
      horizon: .8, top: 1, span: 1.35, ox: 0, draw: newyork,
      sky: ['#04060f', '#0a1536', '#22315f'], glow: 'rgba(255,170,100,.26)', water: ['#0a1432', '#02040a'],
      far: { minW: .03, maxW: .07, minH: .08, maxH: .4, fill: '#161f44', win: .14, env: x => (x > -.78 ? 1 : .25) },
      near: { minW: .035, maxW: .085, minH: .06, maxH: .46, fill: '#090c1e', win: .34, env: x => (x > -.72 ? 1 : .12) }
    }
  ];

  function size(cv, w, h, dpr) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); return c;
  }

  function renderScene(sc, skyCv, sceneCv, w, h, dpr) {
    const R = rng(sc.seed);
    const hy = Math.round(h * sc.horizon);
    const u = Math.min(hy * .56 / sc.top, w / sc.span);
    const ox = w / 2 + sc.ox * u * Math.min(1, w / (sc.span * u));

    /* 天空 */
    const s = size(skyCv, w, h, dpr);
    s.fillStyle = lg(s, 0, 0, 0, hy, sc.sky); s.fillRect(0, 0, w, h);
    const stars = Math.round(w * hy / 2400);
    for (let i = 0; i < stars; i++) {
      const y = Math.pow(R(), 1.6) * hy * .92, r = .25 + R() * R() * 1.2;
      s.globalAlpha = (.25 + R() * .75) * (1 - y / hy);
      s.fillStyle = R() < .18 ? '#bcd4ff' : R() < .1 ? '#ffe2b8' : '#ffffff';
      s.beginPath(); s.arc(R() * w, y, r, 0, TAU); s.fill();
    }
    s.globalAlpha = 1;
    s.save(); s.translate(ox, hy); s.scale(1, .5);
    const gr = Math.max(w * .6, u * 1.5);
    const g = s.createRadialGradient(0, 0, 0, 0, 0, gr);
    g.addColorStop(0, sc.glow); g.addColorStop(1, 'rgba(0,0,0,0)');
    s.fillStyle = g; s.fillRect(-gr, -gr, gr * 2, gr * 2); s.restore();

    /* 城市与地标 */
    const c = size(sceneCv, w, h, dpr);
    c.clearRect(0, 0, w, h);
    if (sc.mountains) { ridge(c, R, w, hy, u * .2, '#0f1832', .12); ridge(c, R, w, hy, u * .11, '#0b1226', .2); }
    skyline(c, R, w, hy, u, ox, sc.far);
    skyline(c, R, w, hy, u, ox, sc.near);

    const L = {
      mounts: [], sparks: [],
      mount(x, y, a) { this.mounts.push({ x: ox + x * u, y: hy - y * u, a: a || 0 }); },
      spark(x, y) { this.sparks.push({ x: ox + x * u, y: hy - y * u }); }
    };
    const tmp = document.createElement('canvas');
    tmp.width = sceneCv.width; tmp.height = sceneCv.height;
    const lc = tmp.getContext('2d');
    lc.setTransform(dpr * u, 0, 0, -dpr * u, ox * dpr, hy * dpr);
    lc.B = dpr; lc.lineJoin = 'round';
    sc.draw(lc, R, L);
    c.drawImage(tmp, 0, 0, w, h);

    if (sc.trees) {
      c.fillStyle = '#070a16'; c.beginPath(); c.moveTo(0, hy + 1);
      for (let x = 0; x <= w; x += 5) {
        const d = Math.abs(x - ox) / u;
        const k = d < .26 ? .25 : 1;
        c.lineTo(x, hy - (u * .022 + Math.abs(Math.sin(x * .045 + R() * .6)) * u * .03) * k);
      }
      c.lineTo(w, hy + 1); c.closePath(); c.fill();
    }

    /* 岸线灯 */
    c.fillStyle = '#04050c'; c.fillRect(0, hy - 2, w, 3);
    const shore = [];
    for (let x = R() * 20; x < w; x += u * .02 + R() * u * .05) shore.push([x, WIN[(R() * WIN.length) | 0], .5 + R() * .5]);
    shore.forEach(p => { c.globalAlpha = p[2]; c.fillStyle = p[1]; c.beginPath(); c.arc(p[0], hy - 2, 1.2, 0, TAU); c.fill(); });
    c.globalAlpha = 1;

    /* 水面（静态倒影）或地面 */
    const wh = h - hy;
    if (sc.water) {
      const snap = document.createElement('canvas');
      snap.width = sceneCv.width; snap.height = Math.round(hy * dpr);
      snap.getContext('2d').drawImage(sceneCv, 0, 0);
      c.fillStyle = lg(c, 0, hy, 0, h, sc.water); c.fillRect(0, hy, w, wh);
      for (let y = 0; y < wh; y += 2) {
        const sy = hy - 3 - y * 1.55;
        if (sy < 0) break;
        const k = y / wh;
        c.globalAlpha = .6 * Math.pow(1 - k, 1.3);
        c.drawImage(snap, 0, sy * dpr, snap.width, 2 * dpr, (R() - .5) * (1.5 + y * .14), hy + y, w, 2);
      }
      shore.forEach(p => {
        const len = u * (.03 + p[2] * .05);
        const sg = c.createLinearGradient(0, hy, 0, hy + len);
        sg.addColorStop(0, p[1]); sg.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalAlpha = .4 * p[2]; c.fillStyle = sg; c.fillRect(p[0] - 1, hy, 2, len);
      });
      c.globalAlpha = 1;
      c.strokeStyle = 'rgba(190,215,255,.07)'; c.lineWidth = 1; c.beginPath();
      for (let i = 0; i < wh * w / 5200; i++) {
        const k = Math.pow(R(), .7), y = hy + 4 + k * (wh - 6), x = R() * w, len = 10 + k * 70 * R();
        c.moveTo(x, y); c.lineTo(x + len, y);
      }
      c.stroke();
      c.fillStyle = lg(c, 0, hy, 0, h, ['rgba(2,3,10,0)', 'rgba(2,3,10,.55)']); c.fillRect(0, hy, w, wh);
    } else {
      c.fillStyle = lg(c, 0, hy, 0, h, sc.ground); c.fillRect(0, hy - 1, w, wh + 1);
      ridge(c, R, w, h + wh * .1, wh * .9, '#04060d', .1);
      for (let i = 0; i < w / 14; i++) {
        c.globalAlpha = .2 + R() * .5; c.fillStyle = WIN[(R() * WIN.length) | 0];
        c.fillRect(R() * w, hy + 1 + R() * R() * wh * .35, 1.5, 1.5);
      }
      c.globalAlpha = 1;
    }

    return { w, h, hy, u, ox, water: !!sc.water, mounts: L.mounts, sparks: L.sparks };
  }

  /* ================= 实景照片模式 =================
   * 每张照片在加载后自动把「夜空」从建筑里分离出来（matte），于是：
   *   - 完整照片铺在最底层，烟花画在它上面；
   *   - 同一张照片抠掉天空后再盖在烟花上面 → 烟花出现在建筑「后面」；
   *   - 抠图同时用作建筑受光的遮罩。
   * 坐标均为照片内的比例（0~1）。base = 水面/地平线，top = 地标顶端，focus = 横向视觉重心。 */
  const arch = [[.05, .155], [.15, .175], [.25, .195], [.35, .22], [.45, .25], [.55, .29], [.65, .345], [.75, .405]];
  const PHOTOS = {
    sydney: {
      src: 'images/sydney.jpg', base: .765, top: .3, focus: .6, dim: 0, water: true, jump: 5, solid: [[0, .495, .86, .537]], seeds: [[.2, .62], [.45, .6]],
      mounts: arch.map((p, i) => [p[0], p[1], (i - 3.5) * 5]).concat([[.925, .36, 0]]),
      credit: ['Poidabro', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Sydney_opera_house_and_Sydney_harbour_bridge.jpg']
    },
    taipei: {
      src: 'images/taipei.jpg', base: .57, top: .15, focus: .51, dim: 0, water: false, jump: 2,
      mounts: [[.508, .115, 0]].concat([.28, .32, .36, .4, .44, .48, .52, .56].flatMap(y => [[.484, y, -64], [.532, y, 64]])),
      credit: ['毛貓大少爺', 'CC BY-SA 2.0', 'https://commons.wikimedia.org/wiki/File:Taipei_night_skyline_2020.png']
    },
    shanghai: {
      src: 'images/shanghai.jpg', base: .94, top: .08, focus: .46, dim: 0, water: true, jump: 2,
      mounts: [[.248, .08, 0], [.236, .41, -55], [.26, .41, 55], [.23, .75, -60], [.266, .75, 60], [.702, .25, 0], [.616, .44, 0]],
      credit: ['King of Hearts', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Pudong_Shanghai_November_2017_HDR_panorama.jpg']
    },
    dubai: {
      src: 'images/dubai.jpg', base: .7, top: .126, focus: .6, dim: 0, water: true, jump: 0, rt: 5, tol: 4,
      mounts: [[.65, .13, 0], [.645, .25, -55], [.655, .33, 55], [.643, .42, -55], [.657, .5, 55], [.64, .58, -55]],
      credit: ['Michaelbibin (Pixabay)', 'CC0', 'https://commons.wikimedia.org/wiki/File:Dubai_skyscrapers_at_night_2011.jpg']
    },
    paris: {
      src: 'images/paris.jpg', skyTo: .61, base: .833, top: .088, focus: .56, dim: 0, water: true, jump: 0, rt: 5, tol: 4,
      mounts: [[.562, .09, 0], [.553, .3, -55], [.571, .3, 55], [.545, .45, -58], [.579, .45, 58]],
      sparks(R) {
        const out = [], hw = y => .003 + Math.pow((y - .1) / .5, 1.7) * .044;
        for (let i = 0; i < 170; i++) { const y = .1 + R() * .5; out.push([.562 + (R() * 2 - 1) * hw(y), y]); }
        return out;
      },
      credit: ['Ladislav Luppa', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Paris_-_La_tour_Eiffel_de_nuit.jpg']
    },
    london: {
      src: 'images/london.jpg', base: .86, top: .085, focus: .6, dim: 0, water: true, jump: 0, rt: 7, tol: 6,
      mounts: [[.86, .09, 0], [.845, .33, -55], [.875, .33, 55], [.182, .31, 0], [.362, .34, 0]],
      credit: ['Pierre Alain Marchand', 'CC BY 3.0', 'https://commons.wikimedia.org/wiki/File:Westminster_(59295502).jpeg']
    },
    newyork: {
      src: 'images/newyork.jpg', base: .853, top: .147, focus: .42, dim: 0, water: true, jump: 0, rt: 5, tol: 4,
      mounts: [[.27, .15, 0], [.262, .3, -50], [.278, .3, 50], [.476, .41, 0], [.83, .5, 0]],
      credit: ['VynedJ', 'CC BY 4.0', 'https://commons.wikimedia.org/wiki/File:Lower_Manhattan_night_skyline_20261003_%E2%80%93_2.jpg']
    }
  };
  SCENES.forEach(sc => { sc.photo = PHOTOS[sc.id] || null; });

  /* 天空分离：从照片顶边向下做区域生长。相邻像素足够接近、且不比夜空亮太多才算天空；
   * 允许跨过几像素宽的细构件（桥桁架、缆索），这样桁架之间的空隙也算天空。 */
  function computeMatte(img, P) {
    const W = Math.min(960, img.naturalWidth), H = Math.round(W * img.naturalHeight / img.naturalWidth), N = W * H;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d', { willReadFrequently: true });
    c.drawImage(img, 0, 0, W, H);
    const id = c.getImageData(0, 0, W, H), d = id.data;     // file:// 下会抛错，由调用方回退到手绘场景
    const lum = new Float32Array(N);
    for (let i = 0; i < N; i++) lum[i] = .299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2];
    (P.solid || []).forEach(r => {   // 手工标注的实体区域（例如没有灯光的桥面），永远不算天空
      for (let y = Math.floor(r[1] * H); y < r[3] * H; y++) for (let x = Math.floor(r[0] * W); x < r[2] * W; x++) lum[y * W + x] = 999;
    });
    const band = Array.from(lum.subarray(0, W * Math.max(4, Math.round(H * .06)))).sort((a, b) => a - b);
    const cap = P.cap || Math.min(170, band[band.length >> 1] * 1.9 + 34);
    const tol = P.tol || 9, strict = P.strict || 12, J = P.jump || 0, lim = Math.floor(H * (P.skyTo || P.base));
    const dist = (a, b) => Math.abs(d[a * 4] - d[b * 4]) + Math.abs(d[a * 4 + 1] - d[b * 4 + 1]) + Math.abs(d[a * 4 + 2] - d[b * 4 + 2]);
    const sky = new Uint8Array(N), stack = new Int32Array(N), ref = new Float32Array(N), rt = P.rt || 11;
    let sp = 0;
    for (let x = 0; x < W; x++) if (lum[x] < cap) { sky[x] = 1; ref[x] = lum[x]; stack[sp++] = x; }
    (P.seeds || []).forEach(q => {   // 被实体围住、从顶边到不了的天空（例如桥面下方）
      const i = Math.floor(q[1] * H) * W + Math.floor(q[0] * W);
      if (!sky[i] && lum[i] < cap) { sky[i] = 1; ref[i] = lum[i]; stack[sp++] = i; }
    });
    const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
    while (sp) {
      const p = stack[--sp], x = p % W, y = (p / W) | 0;
      for (let k = 0; k < 8; k++) {
        for (let r = 1; r <= (k < 4 ? Math.max(1, J) : J); r++) {
          const nx = x + DX[k] * r, ny = y + DY[k] * r;
          if (nx < 0 || nx >= W || ny < 0 || ny >= lim) break;
          const n = ny * W + nx;
          if (sky[n]) continue;
          if (lum[n] >= cap || Math.abs(lum[n] - ref[p]) > rt) continue;   // ref：沿途缓慢更新的天空亮度，防止顺着暗部渐变漏进建筑
          if (r === 1 && k < 4 ? (Math.abs(lum[n] - lum[p]) < tol && dist(n, p) < tol * 2.4) : dist(n, p) < strict) {
            sky[n] = 1; ref[n] = ref[p] * .93 + lum[n] * .07; stack[sp++] = n;
          }
        }
      }
    }
    /* 没有和地面连在一起的前景（星星、噪点、孤立的云）并不会挡住烟花，归回天空 */
    const keep = new Uint8Array(N);
    sp = 0;
    for (let x = 0; x < W; x++) { const i = Math.min(H - 1, lim) * W + x; keep[i] = 1; stack[sp++] = i; }
    while (sp) {
      const p = stack[--sp], x = p % W, y = (p / W) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const n = ny * W + nx;
        if (!keep[n] && !sky[n]) { keep[n] = 1; stack[sp++] = n; }
      }
    }
    /* 只清掉小块的悬浮前景；大块的（例如塔基被暗树丛「断开」的铁塔）要留下 */
    const small = N * .0012, comp = [];
    for (let i0 = 0; i0 < lim * W; i0++) {
      if (keep[i0] || sky[i0]) continue;
      comp.length = 0; sp = 0; keep[i0] = 2; stack[sp++] = i0;
      while (sp) {
        const p = stack[--sp], x = p % W, y = (p / W) | 0;
        comp.push(p);
        for (let k = 0; k < 8; k++) {
          const nx = x + DX[k], ny = y + DY[k];
          if (nx < 0 || nx >= W || ny < 0 || ny >= lim) continue;
          const n = ny * W + nx;
          if (!keep[n] && !sky[n]) { keep[n] = 2; stack[sp++] = n; }
        }
      }
      if (comp.length < small) for (let j = 0; j < comp.length; j++) sky[comp[j]] = 1;
    }
    if (P.auto) {   // 自定义照片：把「还能看到天空的最低一行」当作地平线
      let low = Math.floor(H * .5);
      for (let y = 0; y < lim; y++) { let cnt = 0; for (let x = 0; x < W; x += 2) cnt += sky[y * W + x]; if (cnt > W * .02) low = y; }
      P.base = Math.min(.92, Math.max(.3, (low + 3) / H));
    }
    for (let i = 0; i < N; i++) {   // 前景略微外扩 1px，保住建筑边缘的光晕
      const x = i % W;
      const fg = !sky[i] || (x > 0 && !sky[i - 1]) || (x < W - 1 && !sky[i + 1]) || (i >= W && !sky[i - W]) || (i < N - W && !sky[i + W]);
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255; d[i * 4 + 3] = fg ? 255 : 0;
    }
    c.putImageData(id, 0, 0);
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const o = out.getContext('2d');
    if ('filter' in o) o.filter = 'blur(1.1px)';
    o.drawImage(cv, 0, 0);
    return out;
  }

  const photoCache = {};
  function loadPhoto(sc) {
    if (!sc.photo) return Promise.reject(new Error('no photo'));
    if (!photoCache[sc.id]) {
      photoCache[sc.id] = new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => { try { sc.ph = { img, matte: computeMatte(img, sc.photo) }; res(sc.ph); } catch (e) { rej(e); } };
        img.onerror = () => rej(new Error('image failed'));
        img.src = sc.photo.src;
      });
    }
    return photoCache[sc.id];
  }

  function renderPhoto(sc, skyCv, sceneCv, w, h, dpr) {
    const P = sc.photo, img = sc.ph.img, iw = img.naturalWidth, ih = img.naturalHeight;
    const s = Math.max(w / iw, h * .62 / ih), dw = iw * s, dh = ih * s;
    const dx = Math.min(0, Math.max(w - dw, w / 2 - P.focus * dw));
    let dy = Math.max(h - dh, .31 * h - P.top * dh);
    dy = Math.max(h - dh, Math.min(dy, .9 * h - P.base * dh));
    const hy = Math.round(dy + P.base * dh);

    const c0 = size(skyCv, w, h, dpr);
    c0.fillStyle = '#02030a'; c0.fillRect(0, 0, w, h);
    c0.imageSmoothingQuality = 'high';
    if (dy > 0) {
      /* 照片不够高：把顶部一条天空的颜色向上延伸，再让照片顶端渐隐进去 */
      const strip = document.createElement('canvas'); strip.width = 40; strip.height = 1;
      strip.getContext('2d').drawImage(img, 0, ih * .01, iw, ih * .04, 0, 0, 40, 1);
      c0.drawImage(strip, 0, 0, 40, 1, dx, 0, dw, dy + dh * .12);
      const tmp = document.createElement('canvas'); tmp.width = skyCv.width; tmp.height = skyCv.height;
      const t = tmp.getContext('2d'); t.setTransform(dpr, 0, 0, dpr, 0, 0); t.imageSmoothingQuality = 'high';
      t.drawImage(img, dx, dy, dw, dh);
      t.globalCompositeOperation = 'destination-in';
      t.fillStyle = lg(t, 0, dy, 0, dy + dh * .12, ['rgba(0,0,0,0)', 'rgba(0,0,0,1)']); t.fillRect(0, 0, w, h);
      c0.drawImage(tmp, 0, 0, w, h);
      c0.fillStyle = lg(c0, 0, 0, 0, dy + dh * .1, ['rgba(2,3,10,.6)', 'rgba(2,3,10,0)']); c0.fillRect(0, 0, w, dy + dh * .1);
    } else c0.drawImage(img, dx, dy, dw, dh);
    if (P.dim) c0.fillStyle = lg(c0, 0, 0, 0, hy, [`rgba(2,3,12,${P.dim})`, `rgba(2,3,12,${P.dim * .75})`, `rgba(2,3,12,${P.dim * .2})`]);
    if (P.dim) c0.fillRect(0, 0, w, hy);

    const c = size(sceneCv, w, h, dpr);
    c.clearRect(0, 0, w, h); c.imageSmoothingQuality = 'high';
    c.drawImage(img, dx, dy, dw, dh);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(sc.ph.matte, dx, dy, dw, dh);
    c.globalCompositeOperation = 'source-over';

    const map = p => ({ x: dx + p[0] * dw, y: dy + p[1] * dh, a: p[2] || 0 });
    return {
      w, h, hy, u: Math.min(h * .42, w * .5), ox: w / 2, water: !!P.water, photo: true,
      mounts: (P.mounts || []).map(map), sparks: P.sparks ? P.sparks(rng(sc.seed)).map(map) : []
    };
  }

  window.SCENES = SCENES;
  window.renderScene = renderScene;
  window.renderPhoto = renderPhoto;
  window.loadPhoto = loadPhoto;
  window.forgetPhoto = id => { delete photoCache[id]; };
})();
