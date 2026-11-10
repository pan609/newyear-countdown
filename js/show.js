/* 城堡灯光烟花秀：给「童话城堡」场景用的整套演出。
 *   proj   —— 城堡灯光秀。用 WebGL 着色器逐像素计算「打在城堡上的光」，再乘上城堡照片自己的明暗，
 *             以 screen 叠回去：颜色只落在亮着的墙面上，窗洞、屋檐的轮廓还能被单独描亮。
 *             一共 12 种灯光效果（极光、灌注、光环、霓虹描边、频谱柱、火焰、冰封、彩虹、星夜、马赛克、心跳、开幕），
 *             每一幕轮换其中几种，切换时交叉淡入。
 *   beams  —— 城堡两侧的探照光柱和塔尖射出的激光，画在城堡后面。
 *   script —— 按时间轴排好的烟花：序章流星 → 粉紫 → 冰蓝 → 暗场 → 金红 → 终场，循环播放，左右严格对称。 */
(function () {
  'use strict';
  const rand = (a, b) => a + Math.random() * (b - a);
  const hex = s => [parseInt(s.slice(1, 3), 16) / 255, parseInt(s.slice(3, 5), 16) / 255, parseInt(s.slice(5, 7), 16) / 255];

  const VS = 'attribute vec2 p; varying vec2 v; void main(){ v = vec2(p.x*.5+.5, .5-p.y*.5); gl_Position = vec4(p, 0., 1.); }';
  const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v;
uniform sampler2D uTex;
uniform vec2 uPx;
uniform float uT, uMix, uKick, uInten, uAsp, uFxA, uFxB, uLtA, uLtB;
uniform vec3 uPalA[3];
uniform vec3 uPalB[3];
uniform float uBands[8];

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1.,0.)), f.x), mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++) { s += a*noise(p); p *= 2.03; a *= .5; } return s; }
vec3 pal3(vec3 a, vec3 b, vec3 c, float t){ t = fract(t)*3.; if (t < 1.) return mix(a, b, t); if (t < 2.) return mix(b, c, t-1.); return mix(c, a, t-2.); }
vec3 hsv(float h){ return clamp(abs(fract(h+vec3(0., .6667, .3333))*6.-3.)-1., 0., 1.); }

/* 返回 rgb = 打在墙面上的光，a = 轮廓描边的强度 */
vec4 fx(float id, vec2 uv, vec3 a, vec3 b, vec3 c, float t, float lt){
  vec2 q = vec2((uv.x-.5)*uAsp, uv.y);
  float up = 1.-uv.y;
  if (id < .5) {            /* 极光：缓慢流动的色带，一道亮带自下而上扫过 */
    float n = fbm(q*2.2 + vec2(t*.12, -t*.2));
    float s = sin(q.x*5. + n*4. + t*.9)*.5+.5;
    vec3 col = pal3(a, b, c, n*1.3 + up*.5 + t*.06) * (.55 + .75*s);
    float band = smoothstep(.12, 0., abs(up - fract(t*.22)*1.5 + .2));
    return vec4(col + band*.8, .25 + band);
  }
  if (id < 1.5) {           /* 灌注：颜色从地面涨到塔尖，液面是一道白光 */
    float lvl = smoothstep(0., 2.6, lt)*1.2;
    float d = up - lvl - (noise(vec2(q.x*6., t*.8))-.5)*.06;
    vec3 col = pal3(a, b, c, up*.9 + t*.05) * step(d, 0.) * (.72 + .28*sin(up*40. - t*6.));
    float line = smoothstep(.035, 0., abs(d));
    return vec4(col + line*1.3, .2 + line*1.5);
  }
  if (id < 2.5) {           /* 光环：从城门向外一圈圈荡开 */
    float r = length(q - vec2(0., .82));
    float ring = smoothstep(.2, 1., sin(r*26. - t*5.5));
    return vec4(pal3(a, b, c, r*1.2 - t*.15) * (.25 + ring*1.1), .2 + ring*.6);
  }
  if (id < 3.5) {           /* 霓虹描边：墙面压暗，只留轮廓线发光，横竖两道扫描线划过 */
    float ly = smoothstep(.03, 0., abs(uv.y - fract(t*.3)));
    float lx = smoothstep(.02, 0., abs(uv.x - fract(t*.21 + .4)));
    float grid = smoothstep(.9, 1., sin(uv.y*90.)*.5+.5)*.2;
    float pulse = .6 + .4*sin(t*3. - up*8.);
    return vec4(a*.14 + b*(.3 + grid) + (ly + lx)*1.2, 2.6*pulse + (ly + lx)*3.);
  }
  if (id < 4.5) {           /* 频谱柱：八根灯柱随音乐起落 */
    float ci = floor(uv.x*8.), fxp = fract(uv.x*8.), bv = 0.;
    for (int i = 0; i < 8; i++) if (float(i) == ci) bv = uBands[i];
    float hgt = .16 + .82*bv;
    float on = step(up, hgt) * step(.14, fract(up*22.)) * smoothstep(0., .08, fxp) * smoothstep(1., .92, fxp);
    float cap = smoothstep(.02, 0., abs(up - hgt));
    return vec4(pal3(a, b, c, ci/8. + up*.35)*on*1.25 + cap*1.3 + a*.07, .3 + cap);
  }
  if (id < 5.5) {           /* 火焰：自下而上翻卷 */
    float n = fbm(vec2(q.x*4., uv.y*3. + t*1.6)), n2 = fbm(vec2(q.x*9. + 3., uv.y*6. + t*2.6));
    float f = clamp(n*.8 + n2*.5 - up*.75 + .35, 0., 1.5);
    vec3 col = mix(a, b, smoothstep(.2, .7, f)); col = mix(col, c, smoothstep(.7, 1.1, f));
    return vec4(col*(f*1.5 + .08), .25);
  }
  if (id < 6.5) {           /* 冰封：一道霜线斜着扫过，身后留下冰晶纹路和闪点 */
    float n = fbm(q*7. + t*.05), cr = abs(sin(n*18.));
    float pos = (uv.x*.6 + up) - (fract(t*.14)*2.2 - .3);
    float front = smoothstep(-.1, .1, pos);
    vec3 col = mix(c, mix(a, b, n), .7) * (.5 + smoothstep(.75, 1., cr));
    col += step(.985, hash(floor(uv*vec2(90., 110.)) + floor(t*6.)))*1.5;
    float edge = smoothstep(.06, 0., abs(pos));
    return vec4(col*(1.15 - front*.6) + edge*1.2, .7 + edge*2.);
  }
  if (id < 7.5) {           /* 彩虹：整条色谱斜向流过 */
    return vec4(hsv(uv.x*.7 + up*.5 - t*.35) * (.8 + .35*sin(up*30. - t*8.)) * 1.15, .3);
  }
  if (id < 8.5) {           /* 星夜：深蓝底色上的点点星光 */
    vec2 g = uv*vec2(60.*uAsp, 60.); float hs = hash(floor(g));
    float star = step(.93, hs) * (.5 + .5*sin(t*(2. + hs*5.) + hs*40.)) * smoothstep(.45, .05, length(fract(g)-.5));
    return vec4(mix(a, b, fbm(q*2. + t*.05))*.55 + star*1.6, .5);
  }
  if (id < 9.5) {           /* 马赛克：一格一格的色块轮流翻新 */
    vec2 g = vec2(uv.x*uAsp, uv.y)*11., gi = floor(g), gf = fract(g);
    float ph = t*2.2 + hash(gi)*3.;
    vec3 col = pal3(a, b, c, hash(gi + floor(ph)*.37) + t*.03);
    float bd = smoothstep(0., .08, gf.x)*smoothstep(1., .92, gf.x)*smoothstep(0., .08, gf.y)*smoothstep(1., .92, gf.y);
    float lit = step(.28, hash(gi*1.7 + floor(ph)*.11));   /* 每轮有三成的格子熄灭，才有明暗跳动 */
    return vec4(col*bd*(lit*.85 + .06 + .9*smoothstep(.25, 0., fract(ph))), .2);
  }
  if (id < 10.5) {          /* 心跳：整座城堡一下一下地亮，光波从中心推开 */
    float r = length(q - vec2(0., .6)), bt = fract(t*1.1);
    float wave = smoothstep(.09, 0., abs(r - bt*1.3));
    return vec4(mix(a, b, r*1.2)*(.45 + exp(-bt*4.)*.9) + wave*c*1.3, .25 + wave);
  }
  /* 开幕：光从中轴向两侧拉开 */
  float d = abs(uv.x - .5)*2., open = lt*.55;
  float lit = smoothstep(open, open - .18, d), edge = smoothstep(.06, 0., abs(d - open + .04));
  return vec4(mix(a, b, up)*lit*(.85 + .2*sin(up*50. + t*4.)) + edge*c*1.5, .3 + edge*2.);
}

void main(){
  vec4 tx = texture2D(uTex, v);
  vec2 o = uPx*1.5;
  float l = dot(tx.rgb, vec3(.3, .59, .11));
  float gx = dot(texture2D(uTex, v + vec2(o.x, 0.)).rgb - texture2D(uTex, v - vec2(o.x, 0.)).rgb, vec3(.333));
  float gy = dot(texture2D(uTex, v + vec2(0., o.y)).rgb - texture2D(uTex, v - vec2(0., o.y)).rgb, vec3(.333));
  float e = smoothstep(.05, .3, abs(gx) + abs(gy));
  float m = tx.a * min(min(texture2D(uTex, v + vec2(o.x*2., 0.)).a, texture2D(uTex, v - vec2(o.x*2., 0.)).a),
                       min(texture2D(uTex, v + vec2(0., o.y*2.)).a, texture2D(uTex, v - vec2(0., o.y*2.)).a));
  m *= smoothstep(1., .9, v.y);
  vec3 alb = min(pow(mix(vec3(l), tx.rgb, .12), vec3(1.4)) * 1.3, vec3(1.12));   /* 墙面几乎当成白幕，颜色才正；封顶防止一片死白 */
  vec4 f = mix(fx(uFxA, v, uPalA[0], uPalA[1], uPalA[2], uT, uLtA), fx(uFxB, v, uPalB[0], uPalB[1], uPalB[2], uT, uLtB), uMix);
  vec3 col = f.rgb*alb + e*f.a*(f.rgb*.8 + .22) + alb*uKick*.45;
  gl_FragColor = vec4(col*uInten*m, 1.);
}`;

  const LOOKS = {
    stars: { fx: 8, pal: ['#1a2a9a', '#4a22b0', '#0c1452'] },
    curtainRose: { fx: 11, pal: ['#ff7ac0', '#b06bff', '#ffffff'] },
    curtainGold: { fx: 11, pal: ['#ffb02e', '#ff5a2a', '#fff2c0'] },
    aurora: { fx: 0, pal: ['#ff4fa8', '#b04bff', '#ff9ad0'] },
    pulse: { fx: 10, pal: ['#ff3f9a', '#7a3bff', '#ffd0ee'] },
    riseRose: { fx: 1, pal: ['#ff5fb8', '#c06bff', '#7ab8ff'] },
    rippleRose: { fx: 2, pal: ['#ff4fa8', '#8a5bff', '#ffc0e6'] },
    ice: { fx: 6, pal: ['#35e0ff', '#3a6bff', '#eaffff'] },
    scan: { fx: 3, pal: ['#0a2a66', '#35e0ff', '#ffffff'] },
    mosaicIce: { fx: 9, pal: ['#35e0ff', '#3a6bff', '#b06bff'] },
    eqIce: { fx: 4, pal: ['#35e0ff', '#3a6bff', '#b06bff'] },
    fire: { fx: 5, pal: ['#ff2a1a', '#ff9a1e', '#fff0a0'] },
    mosaicFire: { fx: 9, pal: ['#ff5a2a', '#ffb02e', '#ff2f6a'] },
    rippleGold: { fx: 2, pal: ['#ffb02e', '#ff4a2a', '#ffe9a0'] },
    riseGold: { fx: 1, pal: ['#ffb02e', '#ff5a2a', '#ffe9a0'] },
    rainbow: { fx: 7, pal: ['#ff4fd0', '#ffd24a', '#4fd8ff'] },
    eqGala: { fx: 4, pal: ['#ff4fd0', '#ffd24a', '#4fd8ff'] },
    mosaicGala: { fx: 9, pal: ['#ff4fd0', '#ffd24a', '#4fd8ff'] },
    scanGold: { fx: 3, pal: ['#3a1a05', '#ffc24a', '#ffffff'] }
  };
  Object.keys(LOOKS).forEach(k => { LOOKS[k].name = k; LOOKS[k].rgb = LOOKS[k].pal.map(hex); LOOKS[k].flat = new Float32Array([].concat(...LOOKS[k].rgb)); });

  /* looks 这一幕轮换的灯光效果；every 每个效果停留多久；dim 城堡原片保留多少；beam 光柱颜色；bmode 光柱摆法；laser 是否打激光；fx 这一幕烟花的主色名 */
  const THEMES = {
    night: { looks: ['stars'], inten: .85, dim: .18, beam: null, fx: 'silver' },
    rose: { looks: ['curtainRose', 'aurora', 'pulse', 'riseRose', 'rippleRose'], every: 4600, dim: .12, beam: [190, 205, 255], bmode: 'fan', fx: 'rose' },
    ice: { looks: ['ice', 'scan', 'mosaicIce', 'eqIce'], every: 5200, dim: .1, beam: [120, 220, 255], bmode: 'sweep', laser: 1, fx: 'cyan' },
    dark: { looks: ['stars'], inten: .4, dim: .05, beam: [225, 232, 255], bmode: 'up', bk: .45, fx: 'gold' },
    fire: { looks: ['curtainGold', 'fire', 'mosaicFire', 'rippleGold', 'scanGold', 'riseGold'], every: 4600, dim: .12, beam: [255, 205, 150], bmode: 'cross', fx: 'gold' },
    gala: { looks: ['rainbow', 'eqGala', 'mosaicGala', 'rainbow', 'scan'], every: 3200, dim: .16, beam: [255, 255, 255], bmode: 'sweep', laser: 1, fx: 'white' }
  };
  Object.keys(THEMES).forEach(k => { THEMES[k].name = k; });

  window.Show = function (fw, el) {   // el: { proj, beams, stage }
    const Q = fw.cue, C = Q.C;
    const bctx = el.beams.getContext('2d');
    const tex = document.createElement('canvas');
    const bandsBuf = new Float32Array(8);
    let gl = null, prog = null, U = {}, glTex = null;
    let L = null, active = false, hasProj = false, w = 1, h = 1, pw = 1, ph = 1, bw = 1, bh = 1, cx = 0, topY = 0, span = 1;
    let time = 0, t = 0, cues = [], ci = 0, total = 0, loops = 0, scripted = 'night';
    let theme = THEMES.night, lookA = LOOKS.stars, lookB = LOOKS.stars, mix = 1, tA = 0, tB = 0, lookI = 0, lookT = 0;
    let inten = 0, kick = 0, dim = 1, lastDim = -1, beam = 0, beamOn = 0, lastBeat = 0, locked = false;

    /* ---------- WebGL ---------- */
    function initGL() {
      try { gl = el.proj.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' }); } catch (e) { gl = null; }
      if (!gl) return false;
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      try {
        prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      } catch (e) { if (window.console) console.warn('灯光秀着色器不可用，城堡改为普通照明', e); gl = null; return false; }
      gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      ['uTex', 'uPx', 'uT', 'uMix', 'uKick', 'uInten', 'uAsp', 'uFxA', 'uFxB', 'uLtA', 'uLtB', 'uPalA', 'uPalB', 'uBands'].forEach(n => { U[n] = gl.getUniformLocation(prog, n); });
      glTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, glTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(U.uTex, 0);
      return true;
    }
    function upload() {
      gl.viewport(0, 0, pw, ph);
      gl.bindTexture(gl.TEXTURE_2D, glTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tex);
      gl.uniform2f(U.uPx, 1 / pw, 1 / ph); gl.uniform1f(U.uAsp, pw / ph);
    }
    initGL();
    el.proj.addEventListener('webglcontextlost', e => { e.preventDefault(); hasProj = false; });
    el.proj.addEventListener('webglcontextrestored', () => { if (initGL() && L && L.proj && active) { upload(); hasProj = true; } });

    /* ---------- 场景 ---------- */
    function setScene(layout, sceneCv, on) {
      L = layout; active = !!on; w = L.w; h = L.h;
      el.proj.style.display = el.beams.style.display = active ? 'block' : 'none';
      fw.setShellScale(active && h < 520 && w > h ? .78 : 1);
      if (!active) { el.stage.style.setProperty('--dim', '1'); lastDim = 1; return; }
      cx = L.cx != null ? L.cx : w / 2; topY = L.topY != null ? L.topY : L.hy * .42;
      const cw = L.proj ? L.proj.w : L.u * .9;
      span = Math.min(w * .47, Math.max(w * .36, cw * 1.45));
      hasProj = !!(L.proj && gl);
      if (hasProj) {
        const P = L.proj, sx = sceneCv.width / w, sc = Math.min(2, sx, 1300 / Math.max(P.w, P.h));
        pw = Math.max(2, Math.round(P.w * sc)); ph = Math.max(2, Math.round(P.h * sc));
        el.proj.width = pw; el.proj.height = ph; tex.width = pw; tex.height = ph;
        Object.assign(el.proj.style, { left: P.x + 'px', top: P.y + 'px', width: P.w + 'px', height: P.h + 'px' });
        const x = tex.getContext('2d');
        x.clearRect(0, 0, pw, ph);
        x.drawImage(sceneCv, P.x * sx, P.y * sx, P.w * sx, P.h * sx, 0, 0, pw, ph);   // 城堡自己的明暗就是「银幕」
        upload();
      } else el.proj.style.display = 'none';
      bw = Math.ceil(w / 2); bh = Math.ceil(h / 2); el.beams.width = bw; el.beams.height = bh;
      restart();
    }
    function restart() {
      t = 0; ci = 0; cues = script(); theme = THEMES.night; lookA = lookB = LOOKS.stars; mix = 1; lookI = 0; lookT = 0;
      inten = 0; kick = 0; beam = 0; beamOn = 0; scripted = 'night';
    }
    function setLook(name) {
      const lk = LOOKS[name];
      if (!lk || (lk === lookB && mix < 1)) return;
      if (mix >= .5) { lookA = lookB; tA = tB; }
      lookB = lk; tB = time; mix = 0;
    }
    function setTheme(name) {
      const th = THEMES[name];
      if (!th || th === theme) return;
      theme = th; lookI = 0; lookT = 0; setLook(th.looks[0]);
    }
    const beams = v => { beamOn = v; };

    /* ---------- 编排用的小工具：一切以城堡中轴为对称轴 ---------- */
    const X = f => cx + f * span, Y = f => L.hy * f;
    const pair = (f, y, type, o) => {
      Q.launch(X(-f), Y(y), type, Object.assign({ vx: 0 }, o));
      Q.launch(X(f), Y(y), type, Object.assign({ vx: 0 }, o));
    };
    const one = (f, y, type, o) => Q.launch(X(f), Y(y), type, Object.assign({ vx: 0 }, o));
    const boom2 = (f, y, type, o) => { Q.burst(X(-f), Y(y), type, o); Q.burst(X(f), Y(y), type, o); };
    /* 从外向内（dir=-1）或从内向外（dir=1）依次点燃的一排地面礼花，左右同时进行 */
    function mineChase(c, count, dir, o) {
      for (let i = 0; i < count; i++) {
        const f = .22 + .8 * (dir > 0 ? i : count - 1 - i) / Math.max(1, count - 1);
        Q.at(i * 130, () => { Q.mine(X(-f), c, Object.assign({ a: -6 }, o)); Q.mine(X(f), c, Object.assign({ a: 6 }, o)); });
      }
    }
    function mineSweep(c, count, dir, o) {   // 横扫整个舞台
      for (let i = 0; i < count; i++) {
        const f = -1.02 + 2.04 * (dir > 0 ? i : count - 1 - i) / (count - 1);
        Q.at(i * 95, () => Q.mine(X(f), c, o));
      }
    }
    /* 两侧斜向射出的长彗星。lean>0 向外张开，lean<0 向内交叉 */
    function streaks(c, count, lean, o) {
      for (let i = 0; i < count; i++) {
        const f = .3 + .72 * i / Math.max(1, count - 1), a = (16 + i * 6) * lean;
        Q.at(i * 120, () => { Q.streak(X(-f), -a, c, o); Q.streak(X(f), a, c, o); });
      }
    }
    function peacock(c) {   // 两个点位同时打出扇面
      [-.5, .5].forEach(f => { for (let i = 0; i < 5; i++) Q.streak(X(f), -36 + i * 18, c, { v: 9.5, fuse: 52 }); });
    }
    function wall(fs, y, type, cols, scale, stagger, direct) {
      fs.forEach((f, i) => Q.at(i * (stagger || 0), () => {
        const o = { col: cols[i % cols.length], scale: scale * rand(.92, 1.08), vx: 0 }, yy = Y(y + rand(-.03, .03));
        if (direct) Q.burst(X(f) + rand(-12, 12), yy, type, o); else Q.launch(X(f), yy, type, o);
      }));
    }
    const pixieTo = (fromLeft, c, done) => Q.pixie(fromLeft ? -40 : w + 40, Y(.62), cx + (fromLeft ? 4 : -4), topY - 6, L.hy * .34, 3000, c, done);

    /* ---------- 演出脚本 ---------- */
    function script() {
      const c = [], lv = Math.max(0, fw.level - (Math.min(w, h) < 520 ? 1 : 0));   // 手机屏幕小，同样多的烟花会糊成一片，自动降一档密度
      const add = (ms, fn, min) => { if (lv >= (min || 0)) c.push([ms, fn]); };
      const th = (ms, name, bm) => add(ms, () => { scripted = name; setTheme(name); beams(bm); });

      /* 序章：城堡暗着，一颗流星划过夜空，落在塔尖，把城堡点亮 */
      th(0, 'night', 0);
      add(1000, () => Q.field(C.silver, 70, { dur: 2200, y1: .7 }));
      add(1400, () => pixieTo(true, C.gold, (x, y) => {
        scripted = 'rose'; setTheme('rose'); beams(1);
        Q.burst(x, y, 'glitter', { scale: .8, front: true, col: C.white });
        Q.fountain(2800, C.silver); Q.field(C.white, 130, { dur: 1200 });
      }));

      /* 第一幕：粉紫 */
      add(6200, () => pair(.55, .3, 'peony', { col: C.rose, scale: 1.25 }));
      add(7500, () => pair(.92, .38, 'peony', { col: C.magenta, scale: 1.1 }), 1);
      add(8700, () => one(0, .13, 'chrys', { col: C.white, scale: 1.55 }));
      add(10200, () => streaks(C.white, 5, 1));
      add(12000, () => { pair(.36, .22, 'ring', { col: C.rose, scale: 1.2 }); });
      add(12500, () => pair(.78, .3, 'peony', { col: C.violet, scale: 1.2 }), 1);
      add(13700, () => mineChase(C.rose, 5, -1));
      add(15200, () => { pair(.6, .26, 'dual', { col: C.magenta, scale: 1.3 }); one(0, .12, 'peony', { col: C.rose, scale: 1.55 }); });
      add(17000, () => pair(.5, .28, 'heart', { col: C.rose, scale: 1.25 }));
      add(18600, () => streaks(C.rose, 4, -1));
      add(20400, () => { wall([-.82, 0, .82], .2, 'chrys', [C.white], 1.35, 0); });
      add(20900, () => pair(.42, .36, 'peony', { col: C.rose, scale: 1.1 }), 1);
      add(22500, () => { Q.field(C.rose, 190); Q.fountain(2600, C.silver); });
      add(24300, () => pair(.7, .24, 'brocade', { col: C.rose, scale: 1.35 }));
      add(25300, () => pair(.3, .16, 'peony', { col: C.violet, scale: 1.3 }), 2);
      add(26000, () => one(0, .14, 'glitter', { scale: 1.5 }));

      /* 第二幕：冰蓝 */
      th(27600, 'ice', 1);
      add(28500, () => mineSweep(C.cyan, 9, 1, { pow: 1.05 }));
      add(30300, () => pair(.5, .28, 'saturn', { col: C.cyan, scale: 1.2 }));
      add(31600, () => { pair(.86, .36, 'ring', { col: C.teal, scale: 1.15 }); one(0, .14, 'peony', { col: C.blue, scale: 1.55 }); });
      add(33300, () => mineSweep(C.teal, 9, -1, { pow: 1.05 }));
      add(34900, () => { boom2(.6, .3, 'bees', { col: C.cyan, scale: 1.2 }); Q.at(260, () => Q.burst(X(0), Y(.17), 'bees', { col: C.white, scale: 1.3 })); });
      add(36800, () => { pair(.4, .2, 'strobe', { scale: 1.25 }); });
      add(37300, () => pair(.82, .3, 'peony', { col: C.blue, scale: 1.2 }), 1);
      add(38700, () => peacock(C.cyan));
      add(40500, () => wall([-.72, 0, .72], .24, 'crackle', [C.cyan], 1.3, 90));
      add(42500, () => { Q.field(C.cyan, 230); pair(.55, .3, 'glitter', { scale: 1.2 }); });
      add(44500, () => { pair(.3, .18, 'saturn', { col: C.teal, scale: 1.25 }); });
      add(45000, () => pair(.92, .34, 'peony', { col: C.white, scale: 1.15 }), 1);
      add(46200, () => { Q.fountain(2200, C.silver); mineChase(C.white, 4, 1, { tw: 1 }); });

      /* 暗场：灯全收掉，只留一枚垂柳和零星的闪，再由第二颗流星重新点亮 */
      th(48500, 'dark', 1);
      add(50200, () => one(0, .1, 'willow', { scale: 1.75 }));
      add(52600, () => Q.field(C.gold, 90, { dur: 2600 }));
      add(54200, () => pixieTo(false, C.gold, (x, y) => {
        scripted = 'fire'; setTheme('fire'); beams(1);
        Q.burst(x, y, 'glitter', { scale: .8, front: true, col: C.gold });
        Q.fountain(3000, C.gold);
      }));

      /* 第三幕：金红 */
      add(58600, () => pair(.5, .26, 'crackle', { col: C.orange, scale: 1.3 }));
      add(60000, () => mineChase(C.gold, 5, 1, { pop: 1 }));
      add(61500, () => { pair(.86, .34, 'palm', { scale: 1.2 }); one(0, .13, 'brocade', { scale: 1.55 }); });
      add(63200, () => streaks(C.gold, 5, -1));
      add(63800, () => pair(.3, .2, 'peony', { col: C.red, scale: 1.2 }), 1);
      add(65000, () => wall([-.76, 0, .76], .2, 'kamuro', [C.gold], 1.4, 0));
      add(67200, () => { mineSweep(C.red, 7, 1); });
      add(67700, () => pair(.6, .3, 'dual', { col: C.red, scale: 1.25 }), 1);
      add(69000, () => boom2(.55, .28, 'bees', { col: C.gold, scale: 1.25 }));
      add(70800, () => { pair(.45, .22, 'brocade', { scale: 1.35 }); });
      add(71300, () => pair(.95, .36, 'crackle', { col: C.amber, scale: 1.15 }), 1);
      add(72600, () => Q.mountVolley(60, C.gold, 'strobe'));
      add(74400, () => wall([-.9, -.45, 0, .45, .9], .24, 'chrys', [C.red, C.gold], 1.25, 120));
      add(76500, () => { Q.field(C.gold, 210); Q.fountain(3000, C.gold); });
      add(78500, () => pair(.6, .24, 'multi', { scale: 1.4 }));
      add(80500, () => { pair(.3, .16, 'kamuro', { scale: 1.5 }); });
      add(81000, () => pair(.86, .3, 'palm', { scale: 1.2 }), 1);

      /* 终场：一种主色接一种主色，整面夜空同时开满，最后收在金色的锦冠上 */
      th(83600, 'gala', 1);
      const types = ['brocade', 'peony', 'chrys', 'brocade', 'crackle'];
      const tint = [[C.gold], [C.rose, C.magenta], [C.white], [C.rose], [C.cyan, C.white]];
      for (let j = 0; j < 15; j++) {
        const ms = 84200 + j * 820, k = j % 5;
        add(ms, () => {
          if (j % 2) wall([-.62, 0, .62], .17, types[k], tint[k], 1.4, 70, true);
          else wall([-.9, -.32, .32, .9], .3, types[k], tint[k], 1.25, 60, true);
        });
        add(ms + 400, () => wall([-.75, -.2, .2, .75], .42, 'peony', tint[(k + 1) % 5], 1, 50, true), 2);
        if (j % 2 === 0) add(ms + 300, () => (j % 4 ? mineChase : mineSweep)(C.white, j % 4 ? 5 : 9, j % 8 < 4 ? 1 : -1, { tw: 1 }));
      }
      add(88000, () => streaks(C.white, 5, 1));
      add(90000, () => { Q.field(C.white, 260); Q.fountain(6500, C.gold); });
      add(92400, () => streaks(C.gold, 5, -1));
      add(96800, () => {
        wall([-.92, -.46, 0, .46, .92], .2, 'kamuro', [C.gold], 1.65, 0, true);
        mineSweep(C.white, 11, 1, { tw: 1, pow: 1.1 }); Q.field(C.gold, 300); Q.fountain(5000, C.gold);
      });
      add(98900, () => { wall([-.7, -.24, .24, .7], .3, 'brocade', [C.white], 1.45, 0, true); Q.burst(X(0), Y(.14), 'glitter', { scale: 1.9 }); });
      add(100600, () => { wall([-.9, 0, .9], .18, 'kamuro', [C.gold], 1.8, 0, true); peacock(C.gold); }, 1);
      add(102400, () => { wall([-.5, .5], .22, 'glitter', [C.white], 1.7, 0, true); Q.field(C.white, 200, { dur: 2500 }); });
      th(105500, 'night', 0);
      total = 110000;
      c.sort((a, b) => a[0] - b[0]);
      return c;
    }

    /* ---------- 每帧 ---------- */
    function drawProj() {
      const lv = AudioKit.level(), sec = time / 1000;
      if (lv > .02) AudioKit.bands(bandsBuf);
      else for (let i = 0; i < 8; i++) bandsBuf[i] = Math.max(0, Math.min(1, .42 + .3 * Math.sin(sec * 2.1 + i * 1.3) + .22 * Math.sin(sec * 5.3 + i * 2.7)));
      gl.uniform1f(U.uT, sec); gl.uniform1f(U.uMix, mix * mix * (3 - 2 * mix));
      gl.uniform1f(U.uKick, Math.min(1, kick)); gl.uniform1f(U.uInten, inten * (1 + Math.min(.5, lv * 1.2)));
      gl.uniform1f(U.uFxA, lookA.fx); gl.uniform1f(U.uFxB, lookB.fx);
      gl.uniform1f(U.uLtA, (time - tA) / 1000); gl.uniform1f(U.uLtB, (time - tB) / 1000);
      gl.uniform3fv(U.uPalA, lookA.flat); gl.uniform3fv(U.uPalB, lookB.flat);
      gl.uniform1fv(U.uBands, bandsBuf);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function drawBeams() {
      bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.globalCompositeOperation = 'source-over'; bctx.clearRect(0, 0, bw, bh);
      const th = theme;
      if (beam < .02 || !th.beam) return;
      bctx.globalCompositeOperation = 'lighter';
      const col = th.beam.join(','), len = h * 1.3 / 2, wid = len * .036, tt = time, pwr = beam * (th.bk || 1);
      for (let side = -1; side <= 1; side += 2) for (let i = 0; i < 3; i++) {
        let a;
        switch (th.bmode) {
          case 'sweep': a = side * (16 + i * 9) + Math.sin(tt * .0011 + i * .5) * 24; break;
          case 'cross': a = -side * (12 + i * 10) + Math.sin(tt * .0007 + i) * 8 * side; break;
          case 'up': a = side * i * 5 + Math.sin(tt * .0004 + i) * 3; break;
          default: a = side * (12 + i * 16) + Math.sin(tt * .0005 + i * 1.3) * 7 * side;
        }
        bctx.setTransform(1, 0, 0, 1, (cx + side * span * (.5 + i * .19)) / 2, (L.hy + 8) / 2);
        bctx.rotate(a * Math.PI / 180);
        const g = bctx.createLinearGradient(0, 0, 0, -len);
        g.addColorStop(0, `rgba(${col},${(.32 * pwr).toFixed(3)})`); g.addColorStop(.45, `rgba(${col},${(.09 * pwr).toFixed(3)})`); g.addColorStop(1, `rgba(${col},0)`);
        bctx.fillStyle = g;
        bctx.beginPath(); bctx.moveTo(-1, 0); bctx.lineTo(-wid, -len); bctx.lineTo(wid, -len); bctx.lineTo(1, 0); bctx.closePath(); bctx.fill();
      }
      if (th.laser) {   // 塔尖后面射出的一扇激光，颜色跟着当前的灯光效果
        bctx.setTransform(1, 0, 0, 1, cx / 2, (topY + 6) / 2);
        bctx.lineWidth = 1; bctx.lineCap = 'round';
        const ll = Math.hypot(w, h) / 2, pal = lookB.rgb;
        for (let i = 0; i < 12; i++) {
          const side = i % 2 ? 1 : -1, j = i >> 1;
          const a = side * (14 + j * 13 + Math.sin(tt * .0013 + j * 1.1) * 9 + Math.sin(tt * .00047) * 6) * Math.PI / 180;
          const c = pal[j % 3], x1 = Math.sin(a) * ll, y1 = -Math.cos(a) * ll;
          const g = bctx.createLinearGradient(0, 0, x1, y1), k = `${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)}`;
          g.addColorStop(0, `rgba(${k},${(.75 * beam).toFixed(3)})`); g.addColorStop(1, `rgba(${k},${(.12 * beam).toFixed(3)})`);
          bctx.strokeStyle = g; bctx.beginPath(); bctx.moveTo(0, 0); bctx.lineTo(x1, y1); bctx.stroke();
        }
      }
    }

    function frame(ms) {
      if (!active) return;
      const dt = Math.min(ms / 16.667, 3), m = fw.mode;
      time += ms;
      if (locked) { /* 调试：停在指定的灯光效果上 */ }
      else if (m === 'show') {
        setTheme(scripted);
        t += ms;
        while (ci < cues.length && cues[ci][0] <= t) cues[ci++][1]();
        if (t >= total) { loops++; t = 0; ci = 0; cues = script(); }
      } else if (m === 'finale' || m === 'celebrate') { setTheme('gala'); beamOn = 1; }
      else if (m === 'quiet') { setTheme('night'); beamOn = 0; }

      lookT += ms;
      if (!locked && theme.looks.length > 1 && lookT > theme.every) { lookT = 0; lookI = (lookI + 1) % theme.looks.length; setLook(theme.looks[lookI]); }
      mix = Math.min(1, mix + ms / 750);
      inten += ((theme.inten || 1) - inten) * Math.min(1, .06 * dt);
      dim += (theme.dim - dim) * Math.min(1, .05 * dt);
      beam += (beamOn - beam) * Math.min(1, .04 * dt);
      kick *= Math.pow(.9, dt);

      const d = hasProj ? dim : Math.max(dim, .75);   // 没有灯光秀时不能把城堡压黑
      if (Math.abs(d - lastDim) > .004) { lastDim = d; el.stage.style.setProperty('--dim', d.toFixed(3)); }
      if (hasProj) drawProj();
      drawBeams();
    }

    return {
      setScene, frame, restart, setLook,
      pulse(size) { if (active) kick = Math.min(1, kick + size * .2); },
      beat(strength) {   // 音乐的拍点：城堡闪一下，两侧各补一束地面礼花
        if (!active || fw.mode !== 'show') return;
        kick = Math.min(1, kick + .3 + strength * .3);
        if (fw.level < 1 || theme === THEMES.dark || theme === THEMES.night || time - lastBeat < 700) return;
        lastBeat = time;
        const f = rand(.3, 1);
        Q.mine(X(-f), C[theme.fx], { a: -5, n: 30 }); Q.mine(X(f), C[theme.fx], { a: 5, n: 30 });
      },
      hold(v) { locked = !!v; if (v) { mix = 1; setLook(v); } },   // 调试：停在某个灯光效果上，传空值恢复
      get active() { return active; },
      get looks() { return Object.keys(LOOKS); },
      state() { return { t, theme: theme.name, look: lookB.name, inten, dim, beam, loops, gl: !!gl, hasProj }; },
      seek(ms) { t = ms; ci = 0; while (ci < cues.length && cues[ci][0] < ms) ci++; }
    };
  };
})();
