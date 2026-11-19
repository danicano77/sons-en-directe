(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const ICON = {
    play:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
    stop:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>',
    prev:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg>',
    next:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5l11 7L4 19z"/></svg>',
    save:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>',
    scenes:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
    exp:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M6 11l6 6 6-6M4 21h16"/></svg>',
    imp:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15V3M6 9l6-6 6 6M4 21h16"/></svg>'
  };
  $('prev').innerHTML = ICON.prev;
  $('stop').innerHTML = ICON.stop;
  $('nextb').innerHTML = ICON.next;
  $('sceneSave').innerHTML = ICON.save;
  $('sceneOpen').innerHTML = ICON.scenes;
  $('export').innerHTML = ICON.exp;
  $('import').innerHTML = ICON.imp;
  $('play').innerHTML = ICON.play;

  /* ---------- Emmagatzematge (IndexedDB) ---------- */
  const DB_NAME = 'sons-en-directe-db';
  let db = null;
  function openDB() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('sounds')) d.createObjectStore('sounds', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('scenes')) d.createObjectStore('scenes', { keyPath: 'id' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  const store = (name, mode) => db.transaction(name, mode).objectStore(name);
  function getAll(name) {
    return new Promise((res, rej) => {
      const r = store(name, 'readonly').getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    });
  }
  function put(name, rec) {
    return new Promise((res, rej) => {
      const tx = db.transaction(name, 'readwrite');
      tx.objectStore(name).put(rec);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
  function remove(name, id) {
    return new Promise((res, rej) => {
      const tx = db.transaction(name, 'readwrite');
      tx.objectStore(name).delete(id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
  function clearStore(name) {
    return new Promise((res, rej) => {
      const tx = db.transaction(name, 'readwrite');
      tx.objectStore(name).clear();
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  /* ---------- Estat ---------- */
  let sounds = [];       // {id, name, fileName, type, blob, url, order, volume, mode}
  let scenes = [];       // {id, name, createdAt, masterVolume, currentIndex, items:[{id,volume,mode}]}
  let cur = -1;
  let masterVolume = 100;
  let edit = false;
  let dbReady = false;
  let uid = 0;
  const voices = new Map();            // voiceId -> {id, soundId, audio, ignore}
  const pendingSeek = new Map();       // soundId -> segons on es començarà la reproducció
  const cueAudio = new Audio();        // només per llegir la durada del so carregat
  cueAudio.preload = 'metadata';
  let wakeLock = null, toastTimer = null, volTimer = null;

  const nextId = () => 'x' + Date.now().toString(36) + '_' + (uid++).toString(36) + Math.random().toString(36).slice(2, 6);
  const clampVol = v => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 100; };
  const fmt = s => { if (!Number.isFinite(s)) return '0:00'; s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const volFor = s => Math.min(1, (clampVol(s.volume) / 100) * (masterVolume / 100));

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  /* Diàlegs propis (prompt/confirm poden estar bloquejats en PWA o navegadors integrats) */
  let askResolve = null;
  function ask(opts) {
    return new Promise(resolve => {
      askResolve = resolve;
      $('askTitle').textContent = opts.title || '';
      $('askMsg').textContent = opts.message || '';
      const input = $('askInput');
      input.hidden = opts.value === undefined;
      input.value = opts.value === undefined ? '' : String(opts.value);
      $('askOk').textContent = opts.ok || 'D\'acord';
      $('askModal').hidden = false;
      if (!input.hidden) { input.focus(); input.select(); }
    });
  }
  function closeAsk(value) {
    const resolve = askResolve;
    askResolve = null;
    $('askModal').hidden = true;
    if (resolve) resolve(value);
  }
  $('askOk').onclick = () => closeAsk($('askInput').hidden ? true : ($('askInput').value.trim() || null));
  $('askCancel').onclick = () => closeAsk(null);
  $('askModal').addEventListener('click', e => { if (e.target === $('askModal')) closeAsk(null); });
  $('askInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); $('askOk').click(); }
  });

  /* ---------- Reproductor ---------- */
  function cue(i) {
    if (!sounds.length) {
      cur = -1;
      cueAudio.pause();
      cueAudio.removeAttribute('src');
      cueAudio.load();
      render();
      return;
    }
    i = Math.max(0, Math.min(sounds.length - 1, i));
    cur = i;
    cueAudio.pause();
    cueAudio.src = sounds[i].url;
    cueAudio.load();
    updateSession();
    render();
  }

  function currentVoice() {
    if (cur < 0) return null;
    const id = sounds[cur].id;
    const list = [...voices.values()].filter(v => v.soundId === id);
    return list.find(v => !v.audio.paused) || list[0] || null;
  }

  function stopAll(ignoreEnded) {
    for (const v of voices.values()) {
      v.ignore = !!ignoreEnded;
      try { v.audio.pause(); v.audio.currentTime = 0; } catch (e) { /* ignore */ }
    }
    voices.clear();
    syncPlay();
    renderList();
  }

  function startVoice(s) {
    const a = new Audio(s.url);
    const v = { id: nextId(), soundId: s.id, audio: a, ignore: false };
    a.volume = volFor(s);
    a.loop = !!s.loop;
    a.addEventListener('loadedmetadata', () => {
      if (!pendingSeek.has(s.id)) return;
      const t = pendingSeek.get(s.id);
      pendingSeek.delete(s.id);
      if (Number.isFinite(a.duration) && a.duration > 0) {
        try { a.currentTime = Math.min(t, a.duration - 0.01); } catch (e) { /* ignore */ }
      }
      progress();
    });
    const finish = () => {
      voices.delete(v.id);
      if (!v.ignore && cur >= 0 && sounds[cur] && sounds[cur].id === s.id) {
        // Quan acaba, es carrega el següent i espera a ser reproduït (no arrenca sol).
        if (cur < sounds.length - 1) cue(cur + 1);
        else { try { a.currentTime = 0; } catch (e) { /* ignore */ } render(); }
      } else {
        syncPlay();
        renderList();
        progress();
      }
    };
    a.addEventListener('ended', finish);
    a.addEventListener('error', () => {
      voices.delete(v.id);
      syncPlay();
      renderList();
      toast('No s\'ha pogut reproduir «' + s.name + '»');
    });
    a.addEventListener('timeupdate', progress);
    voices.set(v.id, v);
    a.play().then(() => { syncPlay(); renderList(); }).catch(() => {
      voices.delete(v.id);
      syncPlay();
      renderList();
      toast('El navegador ha bloquejat la reproducció. Torna a tocar play.');
    });
  }

  function playCued() {
    if (cur < 0) return;
    const s = sounds[cur];
    const v = currentVoice();
    if (v) {
      if (v.audio.paused) v.audio.play().then(syncPlay).catch(() => {});
      else v.audio.pause();
      syncPlay();
      renderList();
      return;
    }
    if (s.mode === 'exclusive') stopAll(true); // "apaga els altres"
    startVoice(s);                              // "al damunt" deixa sonar la resta
  }

  function go(d) { if (cur >= 0) cue(cur + d); }

  function progress() {
    const v = currentVoice();
    const dur = v && Number.isFinite(v.audio.duration) ? v.audio.duration
      : (Number.isFinite(cueAudio.duration) ? cueAudio.duration : 0);
    const time = v && Number.isFinite(v.audio.currentTime) ? v.audio.currentTime
      : (cur >= 0 ? (pendingSeek.get(sounds[cur].id) || 0) : 0);
    $('cur').textContent = fmt(time);
    $('dur').textContent = fmt(dur);
    $('fill').style.width = (dur ? time / dur * 100 : 0) + '%';
    const bar = $('progress');
    bar.setAttribute('aria-valuemax', String(dur));
    bar.setAttribute('aria-valuenow', String(Math.min(time, dur)));
    bar.setAttribute('aria-valuetext', fmt(time) + ' de ' + fmt(dur));
  }

  /* Cerca a la barra: tocar o arrossegar qualsevol punt salta a aquell temps */
  function seekRatio(ratio) {
    if (cur < 0) return;
    const v = currentVoice();
    const dur = v && Number.isFinite(v.audio.duration) ? v.audio.duration
      : (Number.isFinite(cueAudio.duration) ? cueAudio.duration : 0);
    if (!dur || !Number.isFinite(dur)) { toast('Encara no es coneix la durada d\'aquest so'); return; }
    const t = Math.max(0, Math.min(dur - 0.01, ratio * dur));
    if (v) {
      try { v.audio.currentTime = t; } catch (e) { toast('No s\'ha pogut saltar a aquest temps'); return; }
    } else {
      pendingSeek.set(sounds[cur].id, t); // s'aplica quan es premi play
    }
    progress();
  }
  function seekFromEvent(e) {
    const rect = $('progress').getBoundingClientRect();
    if (!rect.width) return;
    seekRatio((e.clientX - rect.left) / rect.width);
  }
  let seeking = false;
  const bar = $('progress');
  bar.addEventListener('pointerdown', e => {
    if (cur < 0) return;
    seeking = true;
    try { bar.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    seekFromEvent(e);
  });
  bar.addEventListener('pointermove', e => { if (seeking) seekFromEvent(e); });
  const endSeek = e => {
    if (!seeking) return;
    seeking = false;
    try { bar.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  };
  bar.addEventListener('pointerup', endSeek);
  bar.addEventListener('pointercancel', endSeek);
  bar.addEventListener('keydown', e => {
    const v = currentVoice();
    const dur = v && Number.isFinite(v.audio.duration) ? v.audio.duration : cueAudio.duration;
    if (!Number.isFinite(dur) || !dur) return;
    let t = v && Number.isFinite(v.audio.currentTime) ? v.audio.currentTime : (pendingSeek.get(sounds[cur]?.id) || 0);
    if (e.key === 'ArrowRight') t += 5;
    else if (e.key === 'ArrowLeft') t -= 5;
    else if (e.key === 'Home') t = 0;
    else if (e.key === 'End') t = dur - 0.01;
    else return;
    e.preventDefault();
    e.stopPropagation();
    seekRatio(Math.max(0, Math.min(1, t / dur)));
  });

  /* ---------- Pantalla encesa i controls del sistema ---------- */
  async function wake(on) {
    try {
      if (on && !wakeLock && navigator.wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.onrelease = () => { wakeLock = null; };
      } else if (!on && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch (e) { /* ignore */ }
  }
  function syncPlay() {
    const v = currentVoice();
    const on = !!(v && !v.audio.paused);
    $('play').innerHTML = on ? ICON.pause : ICON.play;
    $('play').classList.toggle('on', on);
    $('play').setAttribute('aria-label', on ? 'Pausar aquest so' : 'Reproduir aquest so');
    $('stop').disabled = voices.size === 0;
    const active = [...voices.values()].filter(x => !x.audio.paused).length;
    $('status').textContent = active ? active + (active === 1 ? ' so sonant' : ' sons sonants') : 'En silenci';
    $('dot').classList.toggle('live', active > 0);
    wake(active > 0);
  }
  function updateSession() {
    if (!('mediaSession' in navigator)) return;
    try { navigator.mediaSession.metadata = new MediaMetadata({ title: cur >= 0 ? sounds[cur].name : 'Sons en directe' }); } catch (e) {}
    const handlers = {
      play: () => playCued(),
      pause: () => { const v = currentVoice(); if (v) v.audio.pause(); },
      previoustrack: () => go(-1),
      nexttrack: () => go(1),
      stop: () => { pendingSeek.clear(); stopAll(); progress(); }
    };
    for (const k in handlers) { try { navigator.mediaSession.setActionHandler(k, handlers[k]); } catch (e) {} }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && [...voices.values()].some(v => !v.audio.paused)) wake(true);
  });

  /* ---------- Interfície ---------- */
  function renderList() {
    const ol = $('ol');
    if (!sounds.length) {
      ol.innerHTML = '<div class="empty">Encara no hi ha cap so.<br>Toca «+ Afegir sons» i tria arxius d\'àudio,<br>o importa una escena desada amb el botó de dalt.</div>';
      return;
    }
    ol.innerHTML = sounds.map((s, i) => {
      const playing = [...voices.values()].some(v => v.soundId === s.id && !v.audio.paused);
      const cls = (i === cur ? 'cur ' : '') + (playing ? 'playing' : '');
      return '<li class="' + cls + '" data-index="' + i + '">' +
        '<span class="row-n"><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span><span class="num">' + (i + 1) + '</span></span>' +
        '<button class="row-t" data-act="cue" title="Toca per carregar · doble toca per reproduir">' + esc(s.name) + '</button>' +
        (edit ? '' : '<span class="chip ' + s.mode + '">' + (s.mode === 'layer' ? 'Al damunt' : 'Apaga els altres') + '</span>' + (s.loop ? '<span class="chip loop" title="Bucle actiu">↻</span>' : '')) +
        (edit ?
          '<input class="vol-mini" type="range" min="0" max="100" value="' + Math.round(clampVol(s.volume)) + '" data-act="vol" aria-label="Volum de ' + esc(s.name) + '">' +
          '<button class="m loop' + (s.loop ? ' on' : '') + '" data-act="loop" title="' + (s.loop ? 'Bucle actiu — toca per desactivar' : 'Bucle desactivat — toca per activar') + '" aria-label="Bucle">' + '↻' + '</button>' +
          '<button class="m mode" data-act="mode" title="Canvia el mode d\'aquest so">' + (s.mode === 'layer' ? '+' : '!') + '</button>' +
          '<button class="m" data-act="rename" title="Canvia el nom">✎</button>' +
          '<button class="m" data-act="up" ' + (i === 0 ? 'disabled' : '') + ' aria-label="Puja">▲</button>' +
          '<button class="m" data-act="down" ' + (i === sounds.length - 1 ? 'disabled' : '') + ' aria-label="Baixa">▼</button>' +
          '<button class="m x" data-act="del" aria-label="Esborra">✕</button>' : '') +
        '</li>';
    }).join('');
  }

  function renderScenes() {
    $('scenesList').innerHTML = scenes.length ? scenes.map(sc =>
      '<div class="scene"><div><b>' + esc(sc.name) + '</b><small>' +
      esc(new Date(sc.createdAt || Date.now()).toLocaleString('ca')) + ' · ' + (sc.items || []).length + ' sons</small></div>' +
      '<div class="scene-actions"><button class="apply" data-scene-act="apply" data-id="' + esc(sc.id) + '">Aplica</button>' +
      '<button class="x" data-scene-act="del" data-id="' + esc(sc.id) + '" aria-label="Esborra l\'escena">✕</button></div></div>'
    ).join('') : '<div class="empty">Encara no hi ha escenes desades.<br>Desa l\'estat actual amb el botó «Desar l\'escena».</div>';
  }

  function render() {
    const has = cur >= 0;
    $('title').textContent = has ? sounds[cur].name : 'Cap so carregat';
    $('next').textContent = has
      ? (cur < sounds.length - 1 ? 'Següent: ' + sounds[cur + 1].name : 'Últim so — es tornarà a carregar')
      : 'Afegeix sons per començar';
    $('prev').disabled = !has || cur <= 0;
    $('nextb').disabled = !has || cur >= sounds.length - 1;
    $('play').disabled = !has;
    $('play').style.opacity = has ? 1 : .35;
    $('vol').disabled = !has;
    $('modeSolo').disabled = !has;
    $('modeLayer').disabled = !has;
    $('modeSolo').setAttribute('aria-pressed', String(has && sounds[cur].mode === 'exclusive'));
    $('modeLayer').setAttribute('aria-pressed', String(has && sounds[cur].mode === 'layer'));
    $('loop').disabled = !has;
    $('loop').setAttribute('aria-pressed', String(has && !!sounds[cur].loop));
    $('count').textContent = sounds.length ? sounds.length + (sounds.length === 1 ? ' so' : ' sons') : 'Sons';
    $('edit').textContent = edit ? 'Fet' : 'Editar';
    $('edit').classList.toggle('hl', edit);
    $('sceneSave').disabled = !sounds.length;
    $('export').disabled = !sounds.length;
    renderList();
    syncPlay();
    progress();
  }

  /* ---------- Accions ---------- */
  async function persistOrder() {
    if (!dbReady) return;
    await Promise.all(sounds.map((s, i) => { s.order = i; return put('sounds', s); }));
  }
  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= sounds.length) return;
    const id = cur >= 0 ? sounds[cur].id : null;
    [sounds[i], sounds[j]] = [sounds[j], sounds[i]];
    if (id) cur = sounds.findIndex(s => s.id === id);
    persistOrder();
    render();
  }
  async function setMode(mode) {
    if (cur < 0) return;
    sounds[cur].mode = mode;
    if (dbReady) await put('sounds', sounds[cur]);
    render();
  }
  async function setLoop(i, val) {
    if (i < 0 || i >= sounds.length) return;
    sounds[i].loop = !!val;
    for (const voice of voices.values()) {
      if (voice.soundId === sounds[i].id) voice.audio.loop = !!val;
    }
    if (dbReady) await put('sounds', sounds[i]);
    render();
  }
  function setMasterVolume(v) {
    masterVolume = clampVol(v);
    for (const voice of voices.values()) voice.audio.volume = volFor(sounds.find(s => s.id === voice.soundId) || { volume: 100 });
    $('volv').textContent = Math.round(masterVolume) + '%';
    try { localStorage.setItem('sons-directe-master', String(masterVolume)); } catch (e) {}
  }
  function setSoundVolume(i, v) {
    sounds[i].volume = clampVol(v);
    for (const voice of voices.values()) if (voice.soundId === sounds[i].id) voice.audio.volume = volFor(sounds[i]);
    clearTimeout(volTimer);
    volTimer = setTimeout(() => { if (dbReady) put('sounds', sounds[i]).catch(() => {}); }, 250);
  }
  async function rename(i) {
    const n = await ask({ title: 'Nom del so', value: sounds[i].name });
    if (!n) return;
    sounds[i].name = n;
    if (dbReady) await put('sounds', sounds[i]);
    updateSession();
    render();
  }
  async function deleteSound(i) {
    if (!(await ask({ title: 'Esborrar so', message: 'Esborrar «' + sounds[i].name + '»?', ok: 'Esborra' }))) return;
    const s = sounds[i];
    for (const [vid, v] of voices) {
      if (v.soundId === s.id) { v.ignore = true; try { v.audio.pause(); } catch (e) {} voices.delete(vid); }
    }
    try { URL.revokeObjectURL(s.url); } catch (e) {}
    if (dbReady) await remove('sounds', s.id);
    sounds.splice(i, 1);
    if (i === cur) {
      if (sounds.length) cue(Math.min(i, sounds.length - 1));
      else cue(-1);
    } else {
      if (i < cur) cur--;
      render();
    }
    persistOrder();
  }

  async function saveScene() {
    if (!sounds.length) { toast('Afegeix sons abans de desar una escena'); return; }
    const name = await ask({ title: 'Nom de l\'escena', value: 'Escena ' + (scenes.length + 1) });
    if (!name) return;
    const sc = {
      id: nextId(), name, createdAt: new Date().toISOString(),
      masterVolume, currentIndex: cur,
      items: sounds.map(s => ({ id: s.id, volume: s.volume, mode: s.mode, loop: !!s.loop }))
    };
    scenes.push(sc);
    if (dbReady) await put('scenes', sc);
    renderScenes();
    toast('Escena «' + sc.name + '» desada');
  }
  async function applyScene(id) {
    const sc = scenes.find(s => s.id === id);
    if (!sc) return;
    stopAll();
    setMasterVolume(sc.masterVolume);
    $('vol').value = masterVolume;
    const byId = new Map(sounds.map(s => [s.id, s]));
    for (const it of (sc.items || [])) {
      const s = byId.get(it.id);
      if (s) { s.volume = clampVol(it.volume); s.mode = it.mode === 'layer' ? 'layer' : 'exclusive'; s.loop = !!it.loop; }
    }
    const order = new Map((sc.items || []).map((it, i) => [it.id, i]));
    sounds.sort((a, b) => (order.has(a.id) ? order.get(a.id) : 1e9) - (order.has(b.id) ? order.get(b.id) : 1e9));
    if (dbReady) await Promise.all(sounds.map(s => put('sounds', s)));
    const idx = Number(sc.currentIndex);
    cue(Number.isFinite(idx) && idx >= 0 ? Math.min(idx, sounds.length - 1) : 0);
    $('scenesModal').hidden = true;
    toast('Escena «' + sc.name + '» aplicada');
  }
  async function deleteScene(id) {
    const sc = scenes.find(s => s.id === id);
    if (!sc || !(await ask({ title: 'Esborrar escena', message: 'Esborrar l\'escena «' + sc.name + '»?', ok: 'Esborra' }))) return;
    scenes = scenes.filter(s => s.id !== id);
    if (dbReady) await remove('scenes', id);
    renderScenes();
  }

  /* ---------- JSON ---------- */
  const toB64 = blob => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  async function exportPack() {
    if (!sounds.length) { toast('No hi ha res per exportar'); return; }
    try {
      const pack = {
        app: 'sons-en-directe', version: 1, exportedAt: new Date().toISOString(),
        masterVolume, currentIndex: cur,
        sounds: await Promise.all(sounds.map(async s => ({
          id: s.id, name: s.name, fileName: s.fileName || s.name, type: s.blob.type || s.type || 'audio/mpeg',
          volume: s.volume, mode: s.mode, loop: !!s.loop, data: await toB64(s.blob)
        }))),
        scenes: scenes.map(sc => ({ ...sc }))
      };
      downloadBlob(new Blob([JSON.stringify(pack)], { type: 'application/json' }),
        'sons-en-directe-' + new Date().toISOString().slice(0, 10) + '.json');
      toast('Escena exportada a JSON');
    } catch (e) { toast('No s\'ha pogut exportar: ' + (e && e.message ? e.message : 'error')); }
  }
  async function importPack(file) {
    let pack;
    try { pack = JSON.parse(await file.text()); } catch (e) { toast('El fitxer no és un JSON vàlid'); return; }
    if (!pack || pack.app !== 'sons-en-directe' || !Array.isArray(pack.sounds)) {
      toast('Aquest JSON no és d\'aquesta app'); return;
    }
    if (!(await ask({ title: 'Importar escena', message: 'Això substituirà tots els sons i escenes actuals pels del fitxer. Continuar?', ok: 'Importa' }))) return;
    stopAll();
    cueAudio.pause(); cueAudio.removeAttribute('src'); cueAudio.load();
    for (const s of sounds) { try { URL.revokeObjectURL(s.url); } catch (e) {} }
    sounds = []; scenes = [];
    if (dbReady) { await clearStore('sounds'); await clearStore('scenes'); }
    let count = 0;
    for (const raw of pack.sounds) {
      if (!raw || typeof raw.name !== 'string' || typeof raw.data !== 'string') continue;
      let bytes;
      try { bytes = Uint8Array.from(atob(raw.data), c => c.charCodeAt(0)); } catch (e) { continue; }
      const type = /^audio\//.test(raw.type || '') ? raw.type : 'audio/mpeg';
      const blob = new Blob([bytes], { type });
      const rec = {
        id: typeof raw.id === 'string' && raw.id ? raw.id : nextId(),
        name: raw.name.trim() || 'So', fileName: raw.fileName || raw.name, type, blob,
        volume: clampVol(raw.volume), mode: raw.mode === 'layer' ? 'layer' : 'exclusive', loop: raw.loop === true, order: count
      };
      if (dbReady) await put('sounds', rec);
      sounds.push({ ...rec, url: URL.createObjectURL(blob) });
      count++;
    }
    for (const raw of (pack.scenes || [])) {
      if (!raw || !Array.isArray(raw.items)) continue;
      const sc = {
        id: typeof raw.id === 'string' && raw.id ? raw.id : nextId(),
        name: String(raw.name || 'Escena'), createdAt: raw.createdAt || new Date().toISOString(),
        masterVolume: clampVol(raw.masterVolume), currentIndex: Number(raw.currentIndex) || 0,
        items: raw.items.filter(it => it && typeof it.id === 'string').map(it => ({
          id: it.id, volume: clampVol(it.volume), mode: it.mode === 'layer' ? 'layer' : 'exclusive', loop: it.loop === true
        }))
      };
      scenes.push(sc);
      if (dbReady) await put('scenes', sc);
    }
    setMasterVolume(pack.masterVolume);
    $('vol').value = masterVolume;
    const idx = Number(pack.currentIndex);
    cue(sounds.length ? (Number.isFinite(idx) && idx >= 0 ? Math.min(idx, sounds.length - 1) : 0) : -1);
    toast(count ? count + (count === 1 ? ' so importat' : ' sons importats') : 'El fitxer no contenia cap so vàlid');
  }

  /* ---------- Esdeveniments ---------- */
  $('play').onclick = playCued;
  $('stop').onclick = () => { pendingSeek.clear(); stopAll(); progress(); };
  $('prev').onclick = () => go(-1);
  $('nextb').onclick = () => go(1);
  $('modeSolo').onclick = () => setMode('exclusive');
  $('modeLayer').onclick = () => setMode('layer');
  $('loop').onclick = () => { if (cur >= 0) setLoop(cur, !sounds[cur].loop); };
  $('vol').oninput = e => setMasterVolume(Number(e.target.value));
  cueAudio.addEventListener('loadedmetadata', progress);

  $('edit').onclick = () => { edit = !edit; render(); };
  $('add').onclick = () => $('file').click();
  $('file').onchange = async e => {
    const ok = f => /^audio\//.test(f.type) || /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|aif|aiff|webm|wma)$/i.test(f.name);
    const all = [...e.target.files];
    const files = all.filter(ok);
    e.target.value = '';
    if (all.length > files.length) toast((all.length - files.length) + ' fitxer(s) ignorat(s) per no ser àudio');
    if (!files.length) return;
    const base = sounds.length;
    for (const [k, f] of files.entries()) {
      const rec = {
        id: nextId(), name: f.name.replace(/\.[^.]+$/, ''), fileName: f.name, type: f.type || '',
        blob: f, volume: 100, mode: 'exclusive', loop: false, order: base + k
      };
      if (dbReady) await put('sounds', rec);
      sounds.push({ ...rec, url: URL.createObjectURL(f) });
    }
    if (cur < 0) cue(0); else render();
    toast(files.length + (files.length === 1 ? ' so afegit' : ' sons afegits'));
  };

  $('ol').addEventListener('click', e => {
    const li = e.target.closest('li[data-index]');
    if (!li) return;
    const i = Number(li.dataset.index);
    const btn = e.target.closest('[data-act]');
    const act = btn && btn.dataset.act;
    if (act === 'cue') cue(i);
    else if (act === 'up') move(i, -1);
    else if (act === 'down') move(i, 1);
    else if (act === 'del') deleteSound(i);
    else if (act === 'rename') rename(i);
    else if (act === 'mode') { sounds[i].mode = sounds[i].mode === 'layer' ? 'exclusive' : 'layer'; if (dbReady) put('sounds', sounds[i]).catch(() => {}); render(); }
    else if (act === 'loop') setLoop(i, !sounds[i].loop);
  });
  $('ol').addEventListener('dblclick', e => {
    const btn = e.target.closest('[data-act="cue"]');
    if (!btn) return;
    const li = btn.closest('li[data-index]');
    if (!li) return;
    cue(Number(li.dataset.index));
    playCued();
  });
  $('ol').addEventListener('input', e => {
    const el = e.target.closest('[data-act="vol"]');
    if (!el) return;
    const li = el.closest('li[data-index]');
    if (li) setSoundVolume(Number(li.dataset.index), Number(el.value));
  });

  const list = $('list');
  list.addEventListener('dragover', e => { e.preventDefault(); list.classList.add('drop'); });
  list.addEventListener('dragleave', () => list.classList.remove('drop'));
  list.addEventListener('drop', e => {
    e.preventDefault(); list.classList.remove('drop');
    const dt = e.dataTransfer;
    if (!dt || !dt.files || !dt.files.length) return;
    addFiles([...dt.files]);
  });
  async function addFiles(files) {
    const ok = f => /^audio\//.test(f.type) || /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|aif|aiff|webm|wma)$/i.test(f.name);
    const kept = files.filter(ok);
    if (files.length > kept.length) toast((files.length - kept.length) + ' fitxer(s) ignorat(s) per no ser àudio');
    if (!kept.length) return;
    const base = sounds.length;
    for (const [k, f] of kept.entries()) {
      const rec = { id: nextId(), name: f.name.replace(/\.[^.]+$/, ''), fileName: f.name, type: f.type || '', blob: f, volume: 100, mode: 'exclusive', loop: false, order: base + k };
      if (dbReady) await put('sounds', rec);
      sounds.push({ ...rec, url: URL.createObjectURL(f) });
    }
    if (cur < 0) cue(0); else render();
    toast(kept.length + (kept.length === 1 ? ' so afegit' : ' sons afegits'));
  }

  $('sceneSave').onclick = saveScene;
  $('sceneOpen').onclick = () => { renderScenes(); $('scenesModal').hidden = false; };
  $('sceneClose').onclick = () => { $('scenesModal').hidden = true; };
  $('scenesModal').addEventListener('click', e => { if (e.target === $('scenesModal')) $('scenesModal').hidden = true; });
  $('scenesList').addEventListener('click', e => {
    const btn = e.target.closest('[data-scene-act]');
    if (!btn) return;
    if (btn.dataset.sceneAct === 'apply') applyScene(btn.dataset.id);
    else if (btn.dataset.sceneAct === 'del') deleteScene(btn.dataset.id);
  });
  $('export').onclick = exportPack;
  $('import').onclick = () => $('jfile').click();
  $('jfile').onchange = async e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) await importPack(f);
  };

  document.addEventListener('keydown', e => {
    if (!$('askModal').hidden) {
      if (e.key === 'Escape') closeAsk(null);
      return;
    }
    if (e.key === 'Escape' && !$('scenesModal').hidden) { $('scenesModal').hidden = true; return; }
    if (e.target instanceof Element && e.target.closest('input,textarea,select,button,[contenteditable="true"]')) return;
    if (!$('scenesModal').hidden) return;
    if (e.code === 'Space') { e.preventDefault(); playCued(); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.code === 'KeyL') { e.preventDefault(); if (cur >= 0) setLoop(cur, !sounds[cur].loop); }
    else if (e.code === 'Escape') { pendingSeek.clear(); stopAll(); progress(); }
  });

  /* ---------- Arrencada ---------- */
  (async () => {
    try {
      db = await openDB();
      dbReady = true;
      const recs = await getAll('sounds');
      sounds = recs.sort((a, b) => (a.order || 0) - (b.order || 0)).map(r => ({ ...r, loop: !!r.loop, url: URL.createObjectURL(r.blob) }));
      scenes = await getAll('scenes');
      const mv = localStorage.getItem('sons-directe-master');
      if (mv !== null) masterVolume = clampVol(mv);
      $('vol').value = masterVolume;
      $('volv').textContent = Math.round(masterVolume) + '%';
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    } catch (e) {
      toast('No s\'ha pogut obrir l\'emmagatzematge local');
    }
    if (sounds.length) cue(0); else render();
  })();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
