/* 声音：烟花音效与两首内置曲目都用 Web Audio 实时合成，不带任何音频文件。 */
(function () {
  'use strict';
  let ctx = null, sfxBus, musicBus, musicGain, noise, analyser, bins, lastBoom = 0, lastCrackle = 0;
  const hooked = new WeakSet();
  let sfxOn = true, volume = .7;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      sfxBus = ctx.createGain(); sfxBus.gain.value = .75; sfxBus.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0; musicGain.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.connect(musicGain);
      analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = .55;
      bins = new Uint8Array(analyser.frequencyBinCount);
      musicGain.connect(analyser);
      const delay = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain();
      delay.delayTime.value = .34; fb.gain.value = .3; wet.gain.value = .28;
      musicBus.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(musicGain);
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const live = () => ctx && ctx.state === 'running';

  /* ---------- 烟花音效 ---------- */
  function boom(size, pan, type) {
    if (!sfxOn || !live()) return;
    const now = ctx.currentTime;
    if (now - lastBoom < .045) return;
    lastBoom = now;
    const t = now + .1 + Math.random() * .12;           // 光先到，声后到
    const v = Math.min(.55, .2 * size);
    const out = ctx.createGain(); out.gain.value = 1;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, (pan - .5) * 1.6));
      out.connect(p); p.connect(sfxBus);
    } else out.connect(sfxBus);

    const src = ctx.createBufferSource(); src.buffer = noise; src.playbackRate.value = .55 + Math.random() * .5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2200, t); lp.frequency.exponentialRampToValueAtTime(90, t + .8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .012); g.gain.exponentialRampToValueAtTime(.001, t + 1.4);
    src.connect(lp); lp.connect(g); g.connect(out); src.start(t, Math.random()); src.stop(t + 1.5);

    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(38, t + .35);
    og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(v * .9, t + .01); og.gain.exponentialRampToValueAtTime(.001, t + .5);
    o.connect(og); og.connect(out); o.start(t); o.stop(t + .55);

    if (type === 'strobe' || type === 'willow' || type === 'text') {   // 噼啪的尾声
      const cs = ctx.createBufferSource(); cs.buffer = noise;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3200;
      const cg = ctx.createGain(); cg.gain.setValueAtTime(0, t);
      for (let i = 0; i < 26; i++) {
        const tt = t + .35 + Math.random() * 1.1;
        cg.gain.setValueAtTime(v * (.15 + Math.random() * .3), tt); cg.gain.setValueAtTime(0, tt + .012);
      }
      cs.connect(hp); hp.connect(cg); cg.connect(out); cs.start(t, Math.random()); cs.stop(t + 1.6);
    }
  }

  function crackle(amount, pan) {   // 爆裂弹的噼啪声
    if (!sfxOn || !live()) return;
    const now = ctx.currentTime;
    if (now - lastCrackle < .09) return;
    lastCrackle = now;
    const src = ctx.createBufferSource(); src.buffer = noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, now);
    const n = 3 + Math.round(amount * 10);
    for (let i = 0; i < n; i++) {
      const t = now + .08 + Math.random() * .16;
      g.gain.setValueAtTime(.05 + Math.random() * .16 * (.4 + amount), t); g.gain.setValueAtTime(0, t + .009);
    }
    src.connect(hp); hp.connect(g); g.connect(sfxBus); src.start(now, Math.random()); src.stop(now + .3);
  }

  /* ---------- 节拍：给「跟随音乐燃放」用 ---------- */
  function hook(el) {   // 把 <audio> 接进分析器；file:// 下跨源音频会被静音，所以只在 http(s) 下接
    if (!ensure() || hooked.has(el) || !/^https?:$/.test(location.protocol)) return;
    try { const src = ctx.createMediaElementSource(el); src.connect(ctx.destination); src.connect(analyser); hooked.add(el); } catch (e) { /* 已接过或不支持 */ }
  }
  function bass() {     // 低频能量 0~1
    if (!live() || !analyser) return 0;
    analyser.getByteFrequencyData(bins);
    let s = 0;
    for (let i = 1; i < 9; i++) s += bins[i];
    return s / (8 * 255);
  }
  const EDGES = [1, 3, 6, 11, 19, 33, 58, 100, 170];
  function bands(out) { // 8 段对数频带 0~1（要先调用过 bass() 才是当前帧的数据）
    const ok = live() && analyser;
    for (let k = 0; k < 8; k++) {
      let s = 0;
      if (ok) for (let i = EDGES[k]; i < EDGES[k + 1]; i++) s += bins[i];
      out[k] = ok ? s / ((EDGES[k + 1] - EDGES[k]) * 255) : 0;
    }
    return out;
  }
  function level() {    // 全频平均能量 0~1（八音盒这类没有低频的音乐用它）
    if (!live() || !analyser) return 0;
    let s = 0;
    for (let i = 1; i < 120; i++) s += bins[i];
    return s / (119 * 255);
  }

  /* ---------- 内置曲目：八音盒音色 ---------- */
  const CH = { I: [0, 4, 7], IV: [5, 9, 12], V: [7, 11, 14], vi: [9, 12, 16] };
  function song(o) {
    const ev = []; let b = 0;
    o.mel.forEach(n => { ev.push({ b, s: n[0] + 12, v: .2, d: 1.3 + n[1] * .5 }); b += n[1]; });
    const len = b;
    o.chords.forEach((name, i) => {
      const c = CH[name], b0 = o.pickup + i * 4;
      [[0, c[0] - 12, .1], [1, c[1], .06], [2, c[2], .06], [3, c[1], .05]].forEach(a => {
        if (b0 + a[0] < len) ev.push({ b: b0 + a[0], s: a[1], v: a[2], d: 1.8 });
      });
    });
    ev.sort((x, y) => x.b - y.b);
    return { root: o.root, bpm: o.bpm, len, ev };
  }
  const SONGS = {
    auld: song({
      root: 349.23, bpm: 84, pickup: 1,
      mel: [[-5, 1],
        [0, 1.5], [0, .5], [0, 1], [4, 1], [2, 1.5], [0, .5], [2, 1], [4, 1], [0, 1.5], [0, .5], [4, 1], [7, 1], [9, 3], [9, 1],
        [7, 1.5], [4, .5], [4, 1], [0, 1], [2, 1.5], [0, .5], [2, 1], [4, 1], [0, 1.5], [-3, .5], [-3, 1], [-5, 1], [0, 3], [9, 1],
        [7, 1.5], [4, .5], [4, 1], [0, 1], [2, 1.5], [0, .5], [2, 1], [9, 1], [7, 1.5], [4, .5], [4, 1], [7, 1], [9, 3], [12, 1],
        [7, 1.5], [4, .5], [4, 1], [0, 1], [2, 1.5], [0, .5], [2, 1], [4, 1], [0, 1.5], [-3, .5], [-3, 1], [-5, 1], [0, 3]],
      chords: ['I', 'V', 'I', 'IV', 'I', 'V', 'IV', 'I', 'I', 'V', 'I', 'IV', 'I', 'V', 'IV', 'I']
    }),
    joy: song({
      root: 293.66, bpm: 104, pickup: 0,
      mel: [[4, 1], [4, 1], [5, 1], [7, 1], [7, 1], [5, 1], [4, 1], [2, 1], [0, 1], [0, 1], [2, 1], [4, 1], [4, 1.5], [2, .5], [2, 2],
        [4, 1], [4, 1], [5, 1], [7, 1], [7, 1], [5, 1], [4, 1], [2, 1], [0, 1], [0, 1], [2, 1], [4, 1], [2, 1.5], [0, .5], [0, 2],
        [2, 1], [2, 1], [4, 1], [0, 1], [2, 1], [4, .5], [5, .5], [4, 1], [0, 1], [2, 1], [4, .5], [5, .5], [4, 1], [2, 1], [0, 1], [2, 1], [-5, 2],
        [4, 1], [4, 1], [5, 1], [7, 1], [7, 1], [5, 1], [4, 1], [2, 1], [0, 1], [0, 1], [2, 1], [4, 1], [2, 1.5], [0, .5], [0, 2]],
      chords: ['I', 'V', 'I', 'V', 'I', 'V', 'I', 'I', 'V', 'I', 'V', 'V', 'I', 'V', 'I', 'I']
    })
  };

  function pluck(f, t, vel, dur) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
    o.frequency.value = f; o2.frequency.value = f * 3.01; g2.gain.value = .11;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + .006); g.gain.exponentialRampToValueAtTime(.0006, t + dur);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(musicBus);
    o.start(t); o2.start(t); o.stop(t + dur + .05); o2.stop(t + dur + .05);
  }

  const Synth = {
    song: null, i: 0, base: 0, t0: 0, beat: 0, loops: 0, timer: null, endTimer: null, onEnd: null, playing: false,
    play(id) {
      if (!ensure()) return false;
      const s = SONGS[id];
      if (this.song !== s) { this.song = s; this.beat = 0; this.loops = 0; }
      const spb = 60 / s.bpm;
      this.base = 0; this.i = s.ev.findIndex(e => e.b >= this.beat); if (this.i < 0) { this.i = 0; this.beat = 0; }
      this.t0 = ctx.currentTime + .1 - this.beat * spb;
      musicGain.gain.cancelScheduledValues(ctx.currentTime);
      musicGain.gain.setTargetAtTime(volume, ctx.currentTime, .05);
      clearInterval(this.timer); clearTimeout(this.endTimer);
      this.timer = setInterval(() => this.sched(), 90);
      this.playing = true; this.sched();
      return true;
    },
    sched() {
      const s = this.song, spb = 60 / s.bpm, until = ctx.currentTime + .4;
      for (;;) {
        const e = s.ev[this.i], t = this.t0 + (this.base + e.b) * spb;
        if (t > until) return;
        if (t > ctx.currentTime - .05) pluck(s.root * Math.pow(2, e.s / 12), Math.max(t, ctx.currentTime), e.v, e.d);
        if (++this.i >= s.ev.length) {
          this.i = 0; this.base += s.len;
          if (++this.loops >= 2) {       // 播两遍算一首结束，交给播放列表
            clearInterval(this.timer);
            this.endTimer = setTimeout(() => { this.reset(); if (this.onEnd) this.onEnd(); }, Math.max(0, (this.t0 + this.base * spb - ctx.currentTime) * 1000 + 600));
            return;
          }
        }
      }
    },
    pause() {
      if (!this.playing) return;
      const s = this.song, spb = 60 / s.bpm;
      this.beat = Math.max(0, ((ctx.currentTime - this.t0) / spb) % s.len);
      clearInterval(this.timer); clearTimeout(this.endTimer);
      musicGain.gain.cancelScheduledValues(ctx.currentTime);
      musicGain.gain.setTargetAtTime(0, ctx.currentTime, .04);
      this.playing = false;
    },
    reset() { if (this.playing) this.pause(); this.song = null; this.beat = 0; this.loops = 0; }
  };

  window.AudioKit = {
    ensure, boom, crackle, hook, bass, level, bands, Synth,
    setSfx(v) { sfxOn = v; },
    setVolume(v) { volume = v; if (ctx && Synth.playing) musicGain.gain.setTargetAtTime(v, ctx.currentTime, .03); }
  };
})();
