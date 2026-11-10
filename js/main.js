(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const body = document.body;
  const DAY = 86400000;

  /* ---------- 偏好 ---------- */
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem('nye.prefs') || '{}') || {}; } catch (e) { prefs = {}; }
  const save = patch => { Object.assign(prefs, patch); try { localStorage.setItem('nye.prefs', JSON.stringify(prefs)); } catch (e) { /* 隐私模式下忽略 */ } };

  let toastTimer;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  /* ---------- 场景 ---------- */
  const stage = $('stage');
  const fw = Fireworks(
    { back: $('fxBack'), front: $('fxFront'), glow: $('glow'), glow2: $('glow2'), light: $('light'), rim: $('rim'), reflect: $('reflect'), stage },
    { onBurst: (size, pan, type) => AudioKit.boom(size, pan, type), onCrackle: a => AudioKit.crackle(a) });
  let scene = SCENES.find(s => s.id === prefs.scene) || SCENES[0];
  let layout = null, placeFmt = null;

  function build() {
    const w = Math.max(320, window.innerWidth), h = Math.max(320, window.innerHeight), dpr = Math.min(window.devicePixelRatio || 1, 2);
    layout = (scene.ph ? renderPhoto : renderScene)(scene, $('sky'), $('scene'), w, h, dpr);
    fw.resize(w, h, dpr);
    fw.setScene(layout, $('scene'));
  }
  function paintPlace() {
    $('placeCity').textContent = scene.city;
    $('placeMark').textContent = `${scene.mark} · ${scene.country}`;
    const cr = $('placeCredit'), pc = scene.ph && scene.photo.credit;
    cr.hidden = !pc;
    if (pc) { cr.textContent = `摄影 ${pc[0]} · ${pc[1]}`; cr.href = pc[2]; }
    placeFmt = new Intl.DateTimeFormat('zh-CN', { timeZone: scene.tz, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    document.querySelectorAll('.city[data-id]').forEach(b => {
      if (b.dataset.id === scene.id) { b.setAttribute('aria-current', 'true'); b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
      else b.removeAttribute('aria-current');
    });
  }
  let swapTimer;
  function setScene(sc) {
    if (sc === scene) return;
    scene = sc; save({ scene: sc.id });
    if (preview) endPreview();
    force = true;
    stage.classList.add('swap');
    clearTimeout(swapTimer);
    const ready = ensurePhoto(sc);
    swapTimer = setTimeout(() => ready.then(() => { if (scene !== sc) return; build(); paintPlace(); stage.classList.remove('swap'); }), 380);
    paintPlace();
  }
  /* 实景照片就绪（或失败、超时）后再显示；失败时自动退回手绘场景 */
  function ensurePhoto(sc) {
    if (sc.ph || !sc.photo) return Promise.resolve();
    return Promise.race([loadPhoto(sc).catch(() => {}), new Promise(r => setTimeout(r, 4000))]);
  }
  const stepScene = d => setScene(SCENES[(SCENES.indexOf(scene) + d + SCENES.length) % SCENES.length]);

  const nav = $('cities');
  SCENES.forEach(sc => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'city'; b.dataset.id = sc.id; b.textContent = sc.city;
    b.addEventListener('click', () => setScene(sc));
    nav.appendChild(b);
  });
  const tourBtn = document.createElement('button');
  tourBtn.type = 'button'; tourBtn.className = 'city tour'; tourBtn.textContent = '巡游';
  tourBtn.title = '每 40 秒自动换一座城市';
  nav.appendChild(tourBtn);
  let tourTimer;
  function setTour(on) {
    tourBtn.setAttribute('aria-pressed', String(on)); save({ tour: on });
    clearInterval(tourTimer);
    if (on) tourTimer = setInterval(() => { if (state === 'count' || (state === 'celebrate' && fw.mode !== 'finale')) stepScene(1); }, 40000);
  }
  tourBtn.addEventListener('click', () => setTour(tourBtn.getAttribute('aria-pressed') !== 'true'));

  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(build, 160); });

  /* ---------- 倒计时 ---------- */
  let tzMode = prefs.tz === 'city' ? 'city' : 'local';
  let preview = false, offset = 0, state = '', lastSec = -1, force = true, lastBig = -1;
  const now = () => Date.now() + offset;

  function zoneParts(tz, t) {
    const o = {};
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(new Date(t)).forEach(p => { o[p.type] = +p.value; });
    return o;
  }
  const zoneOffset = (tz, t) => { const o = zoneParts(tz, t); return Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second) - Math.floor(t / 1000) * 1000; };
  const yearIn = (tz, t) => (tz ? zoneParts(tz, t).year : new Date(t).getFullYear());
  function newYear(tz, y) {
    if (!tz) return new Date(y, 0, 1).getTime();
    const guess = Date.UTC(y, 0, 1);
    return guess - zoneOffset(tz, guess - zoneOffset(tz, guess));
  }
  function clock() {
    const t = now(), tz = tzMode === 'city' ? scene.tz : null, y = yearIn(tz, t);
    return { t, y, since: t - newYear(tz, y), remain: newYear(tz, y + 1) - t };
  }

  function setNum(el, str) {
    if (el.dataset.v === str) return;
    el.dataset.v = str;
    el.innerHTML = str.split('').map(d => `<span class="d">${d}</span>`).join('');
  }
  const pad = n => String(n).padStart(2, '0');

  function tick() {
    const sec = Math.floor(now() / 1000);
    if (sec === lastSec && !force) return;
    lastSec = sec; force = false;
    const c = clock();
    const st = c.since < DAY ? 'celebrate' : c.remain <= 10000 ? 'final' : 'count';

    if (st !== state) {
      body.classList.remove('is-count', 'is-final', 'is-celebrate');
      body.classList.add('is-' + st);
      if (st === 'celebrate') {
        $('celeYear').textContent = c.y;
        if (c.since < 4000) fw.finale(String(c.y), wish); else fw.setMode('celebrate');
        $('srLive').textContent = `${c.y} 年到了，新年快乐！`;
      }
      state = st; lastBig = -1;
    }

    $('placeTime').textContent = '当地时间 ' + placeFmt.format(new Date(c.t));
    if (st === 'count') {
      const s = Math.ceil(c.remain / 1000);
      setNum($('dD'), String(Math.floor(s / 86400)));
      setNum($('dH'), pad(Math.floor(s % 86400 / 3600)));
      setNum($('dM'), pad(Math.floor(s % 3600 / 60)));
      setNum($('dS'), pad(s % 60));
      $('eyebrow').textContent = tzMode === 'city' ? `距离${scene.city}迎来 ${c.y + 1} 年还有` : `距离 ${c.y + 1} 年还有`;
      fw.setMode(c.remain <= 60000 ? 'build' : 'ambient');
    } else if (st === 'final') {
      const n = Math.max(1, Math.ceil(c.remain / 1000));
      if (n !== lastBig) {
        lastBig = n;
        const big = $('big'); big.textContent = n;
        big.classList.remove('pop'); void big.offsetWidth; big.classList.add('pop');
        fw.setMode('quiet'); fw.tickBurst(n);
      }
    } else {
      $('eyebrow').textContent = tzMode === 'city' ? `${scene.city}已经进入 ${c.y} 年` : `此刻，${c.y} 年已经到来`;
    }
  }

  function paintTz() {
    $('tzLocal').setAttribute('aria-pressed', String(tzMode === 'local'));
    $('tzCity').setAttribute('aria-pressed', String(tzMode === 'city'));
  }
  function setTz(m) { if (preview) endPreview(); tzMode = m; save({ tz: m }); paintTz(); force = true; }
  $('tzLocal').addEventListener('click', () => setTz('local'));
  $('tzCity').addEventListener('click', () => setTz('city'));

  /* 预演：把时钟拨到跨年前 10 秒，完整走一遍读秒与终场烟花 */
  const previewBtn = $('previewBtn');
  function startPreview() {
    const c = clock();
    preview = true; offset += c.remain - 10600; force = true;
    previewBtn.textContent = '结束预演'; previewBtn.classList.add('on');
  }
  function endPreview() {
    preview = false; offset = 0; force = true;
    previewBtn.textContent = '预演跨年'; previewBtn.classList.remove('on');
    fw.setMode('ambient');
  }
  previewBtn.addEventListener('click', () => { AudioKit.ensure(); preview ? endPreview() : startPreview(); });

  /* ---------- 音乐 ---------- */
  const audio = new Audio();
  audio.preload = 'auto';
  const Synth = AudioKit.Synth;
  const tracks = [
    { id: 'b:auld', name: '友谊地久天长', builtin: 'auld' },
    { id: 'b:joy', name: '欢乐颂', builtin: 'joy' }
  ];
  /* 本机自带的歌曲文件：存在才加入列表（公开发布的版本里不带这个文件） */
  const LOCAL_SONG = { id: 'f:nothings-gonna-change', name: "Nothing's Gonna Change My Love for You", url: 'music/nothings-gonna-change-my-love-for-you.mp3', fixed: true };
  /* 公开版本里这首歌是加密的（music/song.enc），口令放在分享链接的 # 后面，不会发给服务器 */
  async function unlockSong() {
    const m = location.hash.match(/k=([^&]+)/);
    let key = m ? decodeURIComponent(m[1]) : null;
    try { key = key || localStorage.getItem('nye.k'); } catch (e) { /* 忽略 */ }
    if (!key || !window.crypto || !crypto.subtle) return false;
    const res = await fetch('music/song.enc');
    if (!res.ok) return false;
    const buf = new Uint8Array(await res.arrayBuffer());
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), 'PBKDF2', false, ['deriveKey']);
    const aes = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: buf.slice(0, 16), iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(16, 28) }, aes, buf.slice(28));
    LOCAL_SONG.url = URL.createObjectURL(new Blob([plain], { type: 'audio/mpeg' }));
    try { localStorage.setItem('nye.k', key); } catch (e) { /* 忽略 */ }
    return true;
  }
  fetch(LOCAL_SONG.url, { method: 'HEAD' }).then(r => r.ok || unlockSong()).then(ok => {
    if (!ok) return;
    tracks.unshift(LOCAL_SONG);
    if (playing) { cur++; paintTracks(); } else select(prefs.track && prefs.track !== LOCAL_SONG.id ? Math.max(0, tracks.findIndex(t => t.id === prefs.track)) : 0, false);
  }).catch(() => {});
  const MODES = { list: '列表循环', one: '单曲循环', shuffle: '随机播放' };
  let cur = 0, playing = false, playMode = MODES[prefs.mode] ? prefs.mode : 'list';
  let vol = typeof prefs.vol === 'number' ? prefs.vol : .7;

  function db(mode, fn) {
    return new Promise((res, rej) => {
      const open = indexedDB.open('nye-music', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('tracks', { keyPath: 'id' });
      open.onerror = () => rej(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction('tracks', mode), rq = fn(tx.objectStore('tracks'));
        tx.oncomplete = () => res(rq && rq.result);
        tx.onerror = tx.onabort = () => rej(tx.error);
      };
    });
  }

  function setPlaying(v) {
    playing = v;
    $('playBtn').classList.toggle('playing', v);
    $('playBtn').setAttribute('aria-label', v ? '暂停音乐' : '播放音乐');
  }
  function paintTracks() {
    const t = tracks[cur];
    $('trackName').textContent = t.name;
    $('seekRow').style.display = t.builtin ? 'none' : 'flex';
    const ul = $('tracks'); ul.textContent = '';
    tracks.forEach((tr, i) => {
      const li = document.createElement('li'); if (i === cur) li.className = 'cur';
      const b = document.createElement('button'); b.type = 'button'; b.className = 't-play';
      if (i === cur) b.setAttribute('aria-current', 'true');
      const idx = document.createElement('span'); idx.className = 't-idx'; idx.textContent = i === cur && playing ? '♪' : i + 1;
      const nm = document.createElement('span'); nm.className = 't-name'; nm.textContent = tr.name;
      b.append(idx, nm);
      if (tr.builtin) { const tag = document.createElement('span'); tag.className = 't-tag'; tag.textContent = '内置 · 八音盒'; b.append(tag); }
      b.addEventListener('click', () => select(i, true));
      li.append(b);
      if (!tr.builtin && !tr.fixed) {
        const d = document.createElement('button'); d.type = 'button'; d.className = 't-del'; d.textContent = '×';
        d.setAttribute('aria-label', `移除 ${tr.name}`);
        d.addEventListener('click', () => removeTrack(tr));
        li.append(d);
      }
      ul.append(li);
    });
  }
  function start() {
    const t = tracks[cur];
    AudioKit.ensure();
    if (t.builtin) {
      if (Synth.play(t.builtin)) setPlaying(true); else toast('这个浏览器不支持内置曲目，请上传音乐');
      paintTracks();
      return;
    }
    audio.volume = vol;
    AudioKit.hook(audio);
    audio.play().then(() => { setPlaying(true); paintTracks(); }).catch(err => {
      setPlaying(false); paintTracks();
      toast(err && err.name === 'NotAllowedError' ? '已就绪，点一下播放键开始' : `无法播放「${t.name}」，换个格式试试`);
    });
  }
  function pause() { if (tracks[cur].builtin) Synth.pause(); else audio.pause(); setPlaying(false); paintTracks(); }
  function select(i, play) {
    audio.pause(); Synth.reset();
    cur = i;
    const t = tracks[i];
    if (t.builtin) audio.removeAttribute('src'); else audio.src = t.url;
    $('seek').value = 0; $('curTime').textContent = '0:00'; $('durTime').textContent = '0:00';
    save({ track: t.id });
    if (play) start(); else { setPlaying(false); paintTracks(); }
  }
  function stepTrack(d, auto) {
    if (auto && playMode === 'one') return select(cur, true);
    let n = (cur + d + tracks.length) % tracks.length;
    if (playMode === 'shuffle' && tracks.length > 1) do { n = (Math.random() * tracks.length) | 0; } while (n === cur);
    select(n, true);
  }
  audio.addEventListener('ended', () => stepTrack(1, true));
  Synth.onEnd = () => stepTrack(1, true);
  const mmss = s => (isFinite(s) ? `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}` : '0:00');
  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    $('seek').value = Math.round(audio.currentTime / audio.duration * 1000);
    $('curTime').textContent = mmss(audio.currentTime); $('durTime').textContent = mmss(audio.duration);
  });
  $('seek').addEventListener('input', e => { if (audio.duration) audio.currentTime = e.target.value / 1000 * audio.duration; });

  async function addFiles(list) {
    const all = Array.from(list || []);
    const files = all.filter(f => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|oga|flac|opus|weba)$/i.test(f.name));
    if (!files.length) { toast(all.length ? '这些文件不是音频，未添加' : '没有选择文件'); return; }
    const first = tracks.length; let unsaved = 0;
    for (const f of files) {
      const t = { id: 'u:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f) };
      tracks.push(t);
      try { await db('readwrite', s => s.put({ id: t.id, name: t.name, blob: f, added: Date.now() })); } catch (e) { unsaved++; }
    }
    select(first, true);
    const skipped = all.length - files.length;
    toast(`已添加 ${files.length} 首` + (skipped ? `，跳过 ${skipped} 个非音频文件` : '') + (unsaved ? '（浏览器未能保存，刷新后需重新上传）' : ''));
  }
  function removeTrack(tr) {
    const i = tracks.indexOf(tr); if (i < 0) return;
    const wasCur = i === cur, wasPlaying = playing;
    tracks.splice(i, 1);
    URL.revokeObjectURL(tr.url);
    db('readwrite', s => s.delete(tr.id)).catch(() => {});
    if (wasCur) select(Math.min(i, tracks.length - 1), wasPlaying);
    else { if (i < cur) cur--; paintTracks(); }
    toast(`已移除「${tr.name}」`);
  }

  $('playBtn').addEventListener('click', () => (playing ? pause() : start()));
  $('prevBtn').addEventListener('click', () => stepTrack(-1));
  $('nextBtn').addEventListener('click', () => stepTrack(1));
  $('uploadBtn').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  $('vol').value = Math.round(vol * 100);
  $('vol').addEventListener('input', e => { vol = e.target.value / 100; audio.volume = vol; AudioKit.setVolume(vol); save({ vol }); });
  const paintMode = () => { $('modeBtn').textContent = MODES[playMode]; };
  $('modeBtn').addEventListener('click', () => { const k = Object.keys(MODES); playMode = k[(k.indexOf(playMode) + 1) % k.length]; save({ mode: playMode }); paintMode(); });
  $('sfx').checked = prefs.sfx !== false; AudioKit.setSfx($('sfx').checked);
  $('sfx').addEventListener('change', e => { AudioKit.setSfx(e.target.checked); save({ sfx: e.target.checked }); if (e.target.checked) AudioKit.ensure(); });
  AudioKit.setVolume(vol);

  /* 面板 */
  const panel = $('panel'), trackBtn = $('trackBtn'), fxPanel = $('fxPanel'), fxBtn = $('fxBtn');
  const panelOpen = () => !panel.hidden || !fxPanel.hidden;
  function togglePanel(p, btn, open) { p.hidden = !open; btn.setAttribute('aria-expanded', String(open)); if (!open && p.contains(document.activeElement)) btn.focus(); }
  function setPanel(open) { togglePanel(panel, trackBtn, open); if (open) togglePanel(fxPanel, fxBtn, false); }
  function setFx(open) { togglePanel(fxPanel, fxBtn, open); if (open) togglePanel(panel, trackBtn, false); }
  const closePanels = () => { setPanel(false); setFx(false); };
  trackBtn.addEventListener('click', () => setPanel(panel.hidden));
  fxBtn.addEventListener('click', () => setFx(fxPanel.hidden));

  /* ---------- 烟花与场景面板 ---------- */
  let wish = typeof prefs.wish === 'string' ? prefs.wish : '';
  $('wish').value = wish;
  function fireWish() {
    wish = $('wish').value.trim().slice(0, 10); save({ wish });
    if (!wish) { toast('先写一句祝福语'); $('wish').focus(); return; }
    AudioKit.ensure(); setFx(false); hideHint();
    fw.wish(wish);
  }
  $('wishBtn').addEventListener('click', fireWish);
  $('wish').addEventListener('keydown', e => { if (e.key === 'Enter') fireWish(); });
  $('wish').addEventListener('change', () => { wish = $('wish').value.trim().slice(0, 10); save({ wish }); });

  let level = [0, 1, 2].includes(prefs.level) ? prefs.level : 1;
  function paintLevel() {
    fw.setLevel(level);
    document.querySelectorAll('#intensity button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === level)));
  }
  $('intensity').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; level = +b.dataset.v; save({ level }); paintLevel(); });

  let rhythm = prefs.rhythm !== false;
  $('rhythm').checked = rhythm;
  $('rhythm').addEventListener('change', e => { rhythm = e.target.checked; save({ rhythm }); });
  let beatAvg = 0, lastBeat = 0;
  function rhythmTick(t) {   // 低频能量突然高于近期平均 → 算一拍
    if (!rhythm || !playing) return;
    let e = AudioKit.bass();
    const lv = AudioKit.level();
    if (e < .05) e = lv * 1.6;
    beatAvg = beatAvg * .93 + e * .07;
    if (e > beatAvg * 1.28 + .015 && e > .06 && t - lastBeat > 240) { lastBeat = t; fw.beat(Math.min(1, (e - beatAvg) * 4)); }
  }

  /* 自定义背景：和内置照片走同一套天空分离。存在音乐库同一个 IndexedDB 表里，用固定 id 区分 */
  let customScene = null;
  const customChip = document.createElement('button');
  customChip.type = 'button'; customChip.className = 'city'; customChip.dataset.id = 'custom'; customChip.textContent = '我的'; customChip.hidden = true;
  customChip.addEventListener('click', () => customScene && setScene(customScene));
  nav.insertBefore(customChip, tourBtn);
  function setCustom(blob) {
    const sc = {
      id: 'custom', city: '我的夜景', country: '本机照片', mark: '自定义背景', seed: 5, tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      photo: { src: URL.createObjectURL(blob), base: .85, skyTo: .9, top: .15, focus: .5, dim: 0, water: false, jump: 2, auto: true, mounts: [], credit: null }
    };
    forgetPhoto('custom');
    return loadPhoto(sc).then(() => {
      const old = customScene;
      if (old) { SCENES.splice(SCENES.indexOf(old), 1); URL.revokeObjectURL(old.photo.src); }
      customScene = sc; SCENES.push(sc);
      customChip.hidden = false; $('bgClear').hidden = false;
      return sc;
    });
  }
  $('bgBtn').addEventListener('click', () => $('bgFile').click());
  $('bgFile').addEventListener('change', e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast('请选择图片文件'); return; }
    setCustom(f).then(sc => {
      setFx(false); setScene(sc);
      db('readwrite', s => s.put({ id: 'bg:custom', name: f.name, blob: f, added: 0 })).catch(() => toast('背景已启用，但浏览器未能保存，刷新后需重新上传'));
    }).catch(() => toast(location.protocol === 'file:' ? '请用 start.command 打开页面后再上传背景' : '这张图片无法使用，换一张试试'));
  });
  $('bgClear').addEventListener('click', () => {
    if (!customScene) return;
    const old = customScene;
    if (scene === old) setScene(SCENES[0]);
    SCENES.splice(SCENES.indexOf(old), 1); customScene = null;
    customChip.hidden = true; $('bgClear').hidden = true;
    db('readwrite', s => s.delete('bg:custom')).catch(() => {});
    toast('已移除自定义背景');
  });

  /* 拖放上传 */
  let dragDepth = 0;
  const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  window.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; $('drop').hidden = false; });
  window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('dragleave', e => { if (!hasFiles(e)) return; if (--dragDepth <= 0) { dragDepth = 0; $('drop').hidden = true; } });
  window.addEventListener('drop', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; $('drop').hidden = true; addFiles(e.dataTransfer.files); });

  /* ---------- 交互 ---------- */
  const hint = $('hint');
  const hideHint = () => hint.classList.add('gone');
  setTimeout(hideHint, 14000);
  stage.addEventListener('pointerdown', e => {
    AudioKit.ensure();
    if (panelOpen()) { closePanels(); return; }
    hideHint();
    fw.launch(e.clientX, Math.min(e.clientY, layout.hy - 50), null, { scale: 1.1 });
  });

  const fsBtn = $('fsBtn');
  if (!document.documentElement.requestFullscreen) fsBtn.hidden = true;
  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => toast('浏览器拒绝了全屏请求'));
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && panelOpen()) { closePanels(); return; }
    if (e.target !== body || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ' ') { e.preventDefault(); AudioKit.ensure(); fw.volley(); hideHint(); }
    else if (e.key === 'ArrowRight') stepScene(1);
    else if (e.key === 'ArrowLeft') stepScene(-1);
    else if (e.key === 'm' || e.key === 'M') (playing ? pause() : start());
  });

  /* 静止几秒后收起界面，只留夜景与倒计时 */
  let idleTimer;
  function wake() {
    body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      const a = document.activeElement;
      if (panelOpen() || (a && a !== body && a.matches(':focus-visible'))) return wake();
      body.classList.add('idle');
    }, 7000);
  }
  ['pointermove', 'pointerdown', 'keydown', 'focusin'].forEach(ev => window.addEventListener(ev, wake, { passive: true }));

  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  fw.setCalm(calm.matches);
  if (calm.addEventListener) calm.addEventListener('change', e => fw.setCalm(e.matches));

  /* ---------- 启动 ---------- */
  stage.classList.add('swap');
  build(); paintPlace(); paintTz(); paintMode(); paintTracks(); paintLevel(); wake();
  ensurePhoto(scene).then(() => {
    if (scene.ph) { build(); paintPlace(); }
    stage.classList.remove('swap');
    const idle = window.requestIdleCallback || (f => setTimeout(f, 1500));
    idle(() => SCENES.reduce((p, sc) => p.then(() => loadPhoto(sc).catch(() => {})), Promise.resolve()));
  });
  if (prefs.tour) setTour(true); else tourBtn.setAttribute('aria-pressed', 'false');

  db('readonly', s => s.getAll()).then(rows => {
    rows = rows || [];
    const bg = rows.find(r => r.id === 'bg:custom');
    if (bg) setCustom(bg.blob).then(sc => { if (prefs.scene === 'custom') setScene(sc); }).catch(() => {});
    rows.filter(r => r.id !== 'bg:custom').sort((a, b) => a.added - b.added).forEach(r => tracks.push({ id: r.id, name: r.name, url: URL.createObjectURL(r.blob) }));
    const i = tracks.findIndex(t => t.id === prefs.track);
    if (i > 0 && !playing) select(i, false); else paintTracks();
  }).catch(() => {});

  let last = performance.now();
  function loop(t) {
    const ms = Math.min(100, Math.max(0, t - last)); last = t;
    tick();
    rhythmTick(t);
    fw.frame(ms);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  window.__nye = { fw, get scene() { return scene; }, get layout() { return layout; }, tick: () => { force = true; tick(); }, get state() { return state; }, get tracks() { return tracks; }, addFiles };
})();
