// AI Pong League site. No dependencies. Uses window.PongEngine (engine.js) and window.LEAGUE (data.js).
(function () {
  'use strict';
  const D = window.LEAGUE, E = window.PongEngine;
  D.games = D.games.map((g) => Array.isArray(g) ? {home: g[0], away: g[1], seed: g[2], score: g[3], frames: g[4]} : g);
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const fmt = (n) => n.toLocaleString('en-US');
  const clock = (f) => { const s = Math.floor(f / 60); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  const TEAM = Object.fromEntries(D.teams.map((t) => [t.id, t]));
  const ROW = Object.fromEntries(D.rows.map((r, i) => [r.team, {...r, pos: i + 1}]));
  const model = (id) => D.models[TEAM[id] ? TEAM[id].model : id] || {color: '#ffd54a', maker: '', logo: null};
  const LOGO = {};
  for (const [m, info] of Object.entries(D.models)) { const img = new Image(); img.src = info.logo; LOGO[m] = img; }
  const whoHTML = (id) => { const m = model(id); return `${m.logo ? `<img src="${m.logo}" alt="">` : ''}<b>${esc(id)}</b><span>${esc(m.maker)}</span>`; };
  const record = (home, away, seed) => D.games.find((g) => g.home === home && g.away === away && g.seed === seed);
  const makers = {};
  const maker = (id) => makers[id] ||= E.load(TEAM[id].code, id);
  const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

  // ---------- tabs ----------
  let activeTab = 'watch';
  function showTab(name, scroll) {
    if (!document.getElementById(name)) name = 'watch';
    activeTab = name;
    $$('.panel').forEach((p) => { p.hidden = p.id !== name; });
    $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    if (history.replaceState) history.replaceState(null, '', '#' + name);
    if (scroll) $('.tabs').scrollIntoView({behavior: 'smooth', block: 'start'});
    if (name === 'play') play.focus();
  }
  $$('[data-tab]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); showTab(b.dataset.tab, b.tagName === 'A'); }));

  // ---------- court renderer ----------
  function court(canvas) {
    const S = 2; canvas.width = E.W * S; canvas.height = E.H * S; const g = canvas.getContext('2d'); g.setTransform(S, 0, 0, S, 0, 0);
    const trail = []; const flash = {L: 0, R: 0, pt: 0, ptSide: null};
    return {
      reset() { trail.length = 0; flash.L = flash.R = flash.pt = 0; },
      draw(m, names) {
        const st = m.state, b = st.ball, cL = model(names.L).color, cR = model(names.R).color;
        if (m.hit) flash[m.hit] = 10; if (m.lastPoint) { flash.pt = 40; flash.ptSide = m.lastPoint.to; trail.length = 0; }
        g.fillStyle = '#070809'; g.fillRect(0, 0, E.W, E.H);
        g.strokeStyle = '#1e232e'; g.lineWidth = 2; g.setLineDash([10, 12]); g.beginPath(); g.moveTo(E.W / 2, 0); g.lineTo(E.W / 2, E.H); g.stroke(); g.setLineDash([]);
        // scores and logos
        g.font = '800 72px system-ui, sans-serif'; g.textBaseline = 'top'; g.textAlign = 'center';
        const glow = (side) => flash.pt > 0 && flash.ptSide === side ? 1 : .42;
        g.fillStyle = cL; g.globalAlpha = glow('L'); g.fillText(st.sL, E.W / 2 - 80, 18);
        g.fillStyle = cR; g.globalAlpha = glow('R'); g.fillText(st.sR, E.W / 2 + 80, 18); g.globalAlpha = 1;
        const lg = (id, x) => { const im = LOGO[TEAM[id] ? TEAM[id].model : '']; if (im && im.complete && im.naturalWidth) { const s = 30, r = im.naturalWidth / im.naturalHeight; const w = r >= 1 ? s : s * r, h = r >= 1 ? s / r : s; g.globalAlpha = .9; g.drawImage(im, x - w / 2, 24 + (s - h) / 2, w, h); g.globalAlpha = 1; } };
        lg(names.L, E.W / 2 - 160); lg(names.R, E.W / 2 + 160);
        // predicted meeting points
        const tg = m.target;
        g.setLineDash([6, 6]); g.lineWidth = 2;
        if (tg.L != null) { g.strokeStyle = cL; g.globalAlpha = .55; g.beginPath(); g.moveTo(E.FACE_L, tg.L); g.lineTo(E.FACE_L + 110, tg.L); g.stroke(); }
        if (tg.R != null) { g.strokeStyle = cR; g.globalAlpha = .55; g.beginPath(); g.moveTo(E.FACE_R, tg.R); g.lineTo(E.FACE_R - 110, tg.R); g.stroke(); }
        g.setLineDash([]); g.globalAlpha = 1;
        // paddles
        const pad = (x, y, c, f) => { g.fillStyle = c; g.shadowColor = c; g.shadowBlur = f > 0 ? 24 : 8; g.fillRect(x, y - E.PH / 2, 10, E.PH); g.shadowBlur = 0; };
        pad(E.FACE_L - 10, st.yL, cL, flash.L); pad(E.FACE_R, st.yR, cR, flash.R);
        // ball and trail
        trail.push([b.x, b.y]); if (trail.length > 10) trail.shift();
        trail.forEach(([x, y], i) => { g.globalAlpha = (i + 1) / trail.length * .25; g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, E.R * (i + 1) / trail.length, 0, 7); g.fill(); });
        g.globalAlpha = 1; g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 12; g.beginPath(); g.arc(b.x, b.y, E.R, 0, 7); g.fill(); g.shadowBlur = 0;
        flash.L = Math.max(0, flash.L - 1); flash.R = Math.max(0, flash.R - 1); flash.pt = Math.max(0, flash.pt - 1);
      },
    };
  }

  function sayBox(el) {
    // each line stays up for at least 700 ms of real time, so it stays readable at 16x and 64x
    const line = $('.line', el), who = $('.who', el); let last, shownAt = 0;
    return {
      who(id, html) { who.innerHTML = html || whoHTML(id); el.style.setProperty('--c', model(id).color); last = undefined; shownAt = 0; },
      set(text, force) { const t = text == null || text === '' ? '…' : text; if (t === last) return; const now = performance.now(); if (!force && now - shownAt < 700) return;
        last = t; shownAt = now; line.textContent = t; line.classList.remove('pop'); void line.offsetWidth; line.classList.add('pop'); },
    };
  }

  // fixed 60 Hz simulation driven by requestAnimationFrame, with a per-frame time budget
  function runner(onFrame) {
    let lastT = 0, acc = 0;
    function tick(t) {
      const dt = lastT ? Math.min(.1, (t - lastT) / 1000) : 0; lastT = t; onFrame(dt);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return {take(dt, speed) { acc += dt * 60 * speed; const n = Math.floor(acc); acc -= n; return n; }, clear() { acc = 0; }};
  }

  // ---------- WATCH ----------
  const watch = (() => {
    const cv = court($('#wCanvas')), sayL = sayBox($('#wSayL')), sayR = sayBox($('#wSayR')), over = $('#wOver'), meta = $('#wMeta');
    let m = null, names = null, seed = 1, speed = 1, paused = false, skipping = false, done = false, gauntlet = null, nextTimer = 0;
    const selL = $('#wL'), selR = $('#wR'), seedIn = $('#wSeed');
    for (const sel of [selL, selR]) {
      for (const mdl of Object.keys(D.models)) {
        const og = document.createElement('optgroup'); og.label = mdl;
        for (const t of D.teams.filter((x) => x.model === mdl)) { const r = ROW[t.id]; const o = document.createElement('option'); o.value = t.id; o.textContent = r ? `${t.id} · ${ord(r.pos)}, ${r.W}-${r.L}` : t.id; og.append(o); }
        sel.append(og);
      }
    }
    function start(L, R, s, keepGauntlet) {
      clearTimeout(nextTimer);
      if (!keepGauntlet) { gauntlet = null; $('#gauntlet').hidden = true; $$('.preset').forEach((p) => p.classList.remove('on')); }
      selL.value = L; selR.value = R; seedIn.value = s;
      names = {L, R}; seed = s; done = false; skipping = false; paused = false; $('#wPause').textContent = 'Pause';
      try { m = E.createMatch(maker(L), maker(R), s); } catch (e) { over.hidden = false; over.innerHTML = `<div class="warn">Could not load a player: ${esc(e.message)}</div>`; m = null; return; }
      cv.reset(); sayL.who(L); sayR.who(R); sayL.set(null); sayR.set(null); over.hidden = true; loop.clear(); cv.draw(m, names); info();
    }
    function info() {
      if (!m) return; const st = m.state; meta.textContent = `Seed ${seed} · frame ${fmt(st.frame)} · ${clock(st.frame)} · rally ${st.rally}`;
    }
    function finish() {
      done = true; const r = m.result(); const rec = record(names.L, names.R, seed);
      const win = r.winner ? names[r.winner] : null;
      let check = '';
      if (rec) check = rec.score === `${r.sL}-${r.sR}` && rec.frames === r.frames
        ? `<div class="ok">✓ Identical to the league record: ${rec.score} in ${fmt(rec.frames)} frames</div>`
        : `<div class="warn">✗ League record says ${rec.score} in ${fmt(rec.frames)} frames</div>`;
      else check = `<div>Not a league fixture (the league used seeds 1 and 2, home and away).</div>`;
      over.innerHTML = `<div class="big">${esc(names.L)} ${r.sL} – ${r.sR} ${esc(names.R)}</div><div>${win ? esc(win) + ' wins' : 'Draw'} · ${fmt(r.frames)} frames (${clock(r.frames)})</div>${check}`
        + (gauntlet ? '' : `<button class="btn primary" id="wAgain">Watch again</button>`);
      over.hidden = false; const again = $('#wAgain'); if (again) again.onclick = () => start(names.L, names.R, seed);
      if (gauntlet) gauntletDone(r, rec);
    }
    const loop = runner((dt) => {
      if (!m || activeTab !== 'watch' || done || skipping) return;
      if (!paused) {
        const n = loop.take(dt, speed); const t0 = performance.now();
        for (let i = 0; i < n; i++) {
          if (!m.step()) break;
          if (i % 8 === 7 && performance.now() - t0 > 14) { loop.clear(); break; }
          if (m.lastPoint && speed <= 2) cv.draw(m, names); // keep the point flash at low speed
        }
        if (m.over() && !done) { cv.draw(m, names); sayL.set(m.say.L); sayR.set(m.say.R); info(); finish(); return; }
      }
      cv.draw(m, names); sayL.set(m.say.L); sayR.set(m.say.R); info();
    });
    function skip() {
      if (!m || done || skipping) return; skipping = true; over.hidden = false; over.innerHTML = '<div class="big">Simulating…</div><div id="wProg"></div>';
      const chunk = () => { const t0 = performance.now(); while (performance.now() - t0 < 30) { if (!m.step()) break; }
        const p = $('#wProg'); if (p) p.textContent = `frame ${fmt(m.state.frame)} · ${m.state.sL}-${m.state.sR}`;
        if (m.over()) { skipping = false; cv.draw(m, names); sayL.set(m.say.L); sayR.set(m.say.R); info(); finish(); } else setTimeout(chunk, 0); };
      chunk();
    }
    // gauntlet: the champion's whole season, in league order, each result checked against league.json
    function startGauntlet() {
      const id = 'GPT-6 Astra #3';
      gauntlet = {id, list: D.games.filter((g) => g.home === id || g.away === id), i: 0, w: 0, l: 0, ok: 0};
      $('#gList').innerHTML = gauntlet.list.map((g, i) => { const home = g.home === id; return `<li data-i="${i}">${i + 1}. ${home ? 'v' : '@'} ${esc(home ? g.away : g.home)} s${g.seed}</li>`; }).join('');
      $('#gauntlet').hidden = false; setSpeed(16); gauntletNext();
    }
    function gauntletNext() {
      const g = gauntlet.list[gauntlet.i]; $$('#gList li').forEach((li) => li.classList.toggle('now', +li.dataset.i === gauntlet.i));
      gauntletTally(); start(g.home, g.away, g.seed, true);
    }
    function gauntletTally() { $('#gTally').textContent = `${gauntlet.w}-${gauntlet.l} after ${gauntlet.i} of ${gauntlet.list.length} · ${gauntlet.ok} match the record`; }
    function gauntletDone(r, rec) {
      const side = names.L === gauntlet.id ? 'L' : 'R'; if (r.winner === side) gauntlet.w++; else gauntlet.l++;
      const ok = rec && rec.score === `${r.sL}-${r.sR}` && rec.frames === r.frames; if (ok) gauntlet.ok++;
      const li = $(`#gList li[data-i="${gauntlet.i}"]`); li.classList.remove('now'); li.classList.add(ok ? 'done' : 'bad');
      const mine = side === 'L' ? `${r.sL}-${r.sR}` : `${r.sR}-${r.sL}`; li.textContent += ` ${mine}`;
      gauntlet.i++; gauntletTally();
      if (gauntlet.i < gauntlet.list.length) nextTimer = setTimeout(() => gauntlet && gauntletNext(), speed >= 16 ? 900 : 2500);
      else over.insertAdjacentHTML('beforeend', `<div class="big" style="color:var(--accent)">Season complete: ${gauntlet.w}-${gauntlet.l}</div>`);
    }
    function setSpeed(s) { speed = s; $$('.speeds button').forEach((b) => b.classList.toggle('on', +b.dataset.speed === s)); }

    $$('.speeds button').forEach((b) => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));
    $('#wPause').addEventListener('click', () => { paused = !paused; $('#wPause').textContent = paused ? 'Resume' : 'Pause'; loop.clear(); });
    $('#wSkip').addEventListener('click', skip);
    $('#wGo').addEventListener('click', () => { if (selL.value === selR.value) { /* allowed: a player against itself */ } start(selL.value, selR.value, Math.max(1, Math.floor(+seedIn.value) || 1)); });
    $$('.preset').forEach((p) => p.addEventListener('click', () => {
      const k = p.dataset.preset;
      if (k === 'champion') { startGauntlet(); }
      else if (k === 'upset') { start('Fable 5.1 #1', 'Gemini #1', 1); setSpeed(2); }
      else if (k === 'closest') { start('GPT-6 Astra #2', 'GPT-6 Astra #3', 1); setSpeed(4); }
      $$('.preset').forEach((x) => x.classList.toggle('on', x === p));
      $('#wBox').scrollIntoView({behavior: 'smooth', block: 'center'});
    }));
    return {start, startGauntlet, setSpeed, get match() { return m; }, get done() { return done; }};
  })();

  // ---------- PLAY ----------
  const play = (() => {
    const canvas = $('#pCanvas'), cv = court(canvas), sayR = sayBox($('#pSayR')), sayL = sayBox($('#pSayL')), over = $('#pOver'), meta = $('#pMeta'), sel = $('#pR');
    const keys = {up: false, down: false}; let touchY = null, m = null, names = null, state = 'ready', lastScore = '0-0';
    for (const mdl of Object.keys(D.models)) {
      const og = document.createElement('optgroup'); og.label = mdl;
      for (const t of D.teams.filter((x) => x.model === mdl)) { const r = ROW[t.id]; const o = document.createElement('option'); o.value = t.id; o.textContent = r ? `${t.id} · ${ord(r.pos)}` : t.id; og.append(o); }
      sel.append(og);
    }
    sel.value = 'Gemini #3';
    // you are just another player: same view, same 5 px per frame limit
    const human = () => ({mv: (s) => {
      if (keys.up && !keys.down) return -1; if (keys.down && !keys.up) return 1;
      if (touchY != null) return Math.max(-1, Math.min(1, (touchY - s.me.y) / E.PS));
      return 0;
    }, say: null, target: null});
    function newMatch() {
      const ai = sel.value; names = {L: 'You', R: ai};
      const seed = 1 + Math.floor(Math.random() * 99999);
      m = E.createMatch(human, maker(ai), seed); cv.reset(); state = 'ready'; lastScore = '0-0';
      sayL.who('You', '<b>You</b><span>left paddle</span>'); $('#pSayL').style.setProperty('--c', '#ffd54a'); sayL.set('First to 7. Good luck.', true);
      sayR.who(ai); sayR.set(null); cv.draw(m, names); loop.clear();
      over.hidden = false; over.innerHTML = `<div class="big">You vs ${esc(ai)}</div><div>Press <kbd>Space</kbd> or tap the court to start</div><button class="btn primary" id="pStart">Start</button>`;
      $('#pStart').onclick = (e) => { e.stopPropagation(); go(); };
      meta.textContent = `Serve seed ${seed}`;
    }
    function go() { if (state === 'over') { newMatch(); return; } state = 'playing'; over.hidden = true; loop.clear(); }
    function pause() { if (state === 'playing') { state = 'paused'; over.hidden = false; over.innerHTML = '<div class="big">Paused</div><div>Press <kbd>Space</kbd> or tap to resume</div>'; } else if (state === 'paused' || state === 'ready') go(); else if (state === 'over') newMatch(); }
    const loop = runner((dt) => {
      if (!m || activeTab !== 'play') return;
      if (state === 'playing') {
        const n = Math.min(loop.take(dt, 1), 6);
        for (let i = 0; i < n; i++) if (!m.step()) break;
        const sc = `${m.state.sL}-${m.state.sR}`;
        if (sc !== lastScore) { sayL.set(m.state.sL > +lastScore.split('-')[0] ? `Point to you! ${sc}` : `Point to ${names.R}. ${sc}`, true); lastScore = sc; }
        if (m.over()) {
          state = 'over'; const r = m.result(); const won = r.winner === 'L';
          over.hidden = false; over.innerHTML = `<div class="big">${won ? 'You beat' : 'You lost to'} ${esc(names.R)}</div><div>${r.sL} – ${r.sR} in ${clock(r.frames)}</div><button class="btn primary" id="pAgain">Play again</button>`;
          $('#pAgain').onclick = (e) => { e.stopPropagation(); newMatch(); go(); };
        }
      } else loop.clear();
      cv.draw(m, names); sayR.set(m.say.R);
      if (state !== 'ready') meta.textContent = `${clock(m.state.frame)} · rally ${m.state.rally}`;
    });
    const KEY = {ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down'};
    addEventListener('keydown', (e) => {
      if (activeTab !== 'play' || e.target.closest('select, input')) return;
      if (KEY[e.code]) { keys[KEY[e.code]] = true; touchY = null; e.preventDefault(); if (state === 'ready') go(); }
      else if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) pause(); }
    });
    addEventListener('keyup', (e) => { if (KEY[e.code]) keys[KEY[e.code]] = false; });
    addEventListener('blur', () => { keys.up = keys.down = false; });
    const toCourt = (e) => { const r = canvas.getBoundingClientRect(); return (e.clientY - r.top) / r.height * E.H; };
    const box = $('#pBox');
    box.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; touchY = toCourt(e); if (state !== 'playing') pause(); try { box.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or finished pointer */ } });
    box.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse' || e.buttons) touchY = toCourt(e); });
    box.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') return; touchY = null; });
    box.addEventListener('pointercancel', () => { touchY = null; });
    $('#pGo').addEventListener('click', newMatch);
    sel.addEventListener('change', newMatch);
    newMatch();
    return {focus() {}, get state() { return state; }, get match() { return m; }, go};
  })();

  // ---------- BRICK BREAKER ----------
  (() => {
    let round = 'round2';
    function render() {
      $('#bGrid').innerHTML = D.bricks[round].map((b, i) => { const m = D.models[b.model];
        return `<button class="bcard" data-i="${i}" style="--c:${m.color}"><span class="who"><img src="${m.logo}" alt=""><b>${esc(m.full || b.model)}</b></span>`
          + `<small>Attempt ${b.attempt} · written in ${b.seconds >= 60 ? Math.round(b.seconds / 60) + ' min' : b.seconds + ' s'} · $${b.cost.toFixed(2)}</small>`
          + `<span class="pass">${b.passed}/${b.total} checks passed</span></button>`; }).join('');
      $$('.bcard').forEach((c) => c.addEventListener('click', () => open(D.bricks[round][+c.dataset.i])));
    }
    $$('.seg button').forEach((b) => b.addEventListener('click', () => { round = b.dataset.round; $$('.seg button').forEach((x) => x.classList.toggle('on', x === b)); render(); }));
    const modal = $('#bModal'), frame = $('#bFrame'), wrap = $('.frame');
    const fit = () => { frame.style.transform = `scale(${wrap.clientWidth / 800})`; };
    function open(b) {
      const m = D.models[b.model]; $('#bTitle').textContent = `${m.full || b.model} · attempt ${b.attempt} · ${round === 'round2' ? 'Round 2' : 'Round 1'}`;
      $('#bOpen').href = b.file; modal.hidden = false; frame.src = b.file; fit(); document.body.style.overflow = 'hidden';
      $$('#bPad [data-key="a"]').forEach((x) => { x.hidden = round !== 'round2'; });
      frame.onload = () => { try { frame.contentWindow.focus(); } catch (e) { /* cross-origin on file:// */ } };
    }
    function close() { modal.hidden = true; frame.src = 'about:blank'; document.body.style.overflow = ''; }
    $('#bClose').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
    addEventListener('resize', () => { if (!modal.hidden) fit(); });
    const CODE = {' ': 'Space', a: 'KeyA', p: 'KeyP', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight'}, KC = {' ': 32, a: 65, p: 80, ArrowLeft: 37, ArrowRight: 39};
    function send(type, key) {
      try { const w = frame.contentWindow; const ev = new w.KeyboardEvent(type, {key, code: CODE[key], keyCode: KC[key], which: KC[key], bubbles: true, cancelable: true});
        (w.document.querySelector('canvas') || w.document.body).dispatchEvent(ev); } catch (e) { /* not reachable from file:// */ }
    }
    $$('#bPad button').forEach((b) => {
      const k = b.dataset.key;
      if (b.hasAttribute('data-hold')) {
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); send('keydown', k); });
        for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => send('keyup', k));
      } else b.addEventListener('click', () => { send('keydown', k); setTimeout(() => send('keyup', k), 60); });
    });
    render();
  })();

  // ---------- LEAGUE ----------
  (() => {
    const logo = (mdl) => D.models[mdl] ? `<img src="${D.models[mdl].logo}" alt="">` : '';
    $('#tModel').innerHTML = '<thead><tr><th>#</th><th>Model</th><th>W</th><th>L</th><th>GD</th><th>Pts</th><th class="hide-sm">Best player</th></tr></thead><tbody>'
      + D.byModel.map((r, i) => { const best = D.rows.find((x) => x.model === r.model);
        return `<tr class="${i === 0 ? 'top' : ''}" data-team="${esc(best.team)}"><td>${i + 1}</td><td class="team"><span>${logo(r.model)}${esc(D.models[r.model].full || r.model)}</span></td><td>${r.W}</td><td>${r.L}</td><td>${r.GD > 0 ? '+' : ''}${r.GD}</td><td class="pts">${r.Pts}</td><td class="hide-sm">${esc(best.team)}</td></tr>`; }).join('') + '</tbody>';
    $('#tTeam').innerHTML = '<thead><tr><th>#</th><th>Player</th><th class="hide-sm">P</th><th>W</th><th>L</th><th class="hide-sm">F</th><th class="hide-sm">A</th><th>GD</th><th>Pts</th><th>Write cost</th><th class="hide-sm">Write time</th></tr></thead><tbody>'
      + D.rows.map((r, i) => { const t = TEAM[r.team];
        return `<tr class="${i === 0 ? 'top' : ''}" data-team="${esc(r.team)}"><td>${i + 1}</td><td class="team"><span>${logo(r.model)}${esc(r.team)}</span></td><td class="hide-sm">${r.P}</td><td>${r.W}</td><td>${r.L}</td><td class="hide-sm">${r.F}</td><td class="hide-sm">${r.A}</td><td>${r.GD > 0 ? '+' : ''}${r.GD}</td><td class="pts">${r.Pts}</td><td>$${t.cost.toFixed(2)}</td><td class="hide-sm">${t.seconds >= 60 ? Math.round(t.seconds / 60) + ' min' : t.seconds + ' s'}</td></tr>`; }).join('') + '</tbody>';
    $$('.lt tbody tr').forEach((tr) => tr.addEventListener('click', () => {
      const id = tr.dataset.team; const opp = id === D.rows[0].team ? D.rows[1].team : D.rows[0].team;
      showTab('watch', true); watch.start(id, opp, 1); watch.setSpeed(2);
    }));
  })();

  // ---------- HOW ----------
  $('#specText').textContent = D.spec;
  const c = D.costs;
  $('#costLine').textContent = `All model calls for both games cost $${c.total.toFixed(2)} in total: $${c.pong.toFixed(2)} for the 15 Pong players, $${c.pongTest.toFixed(2)} for a Pong test round, and $${(c.brick1 + c.brick2).toFixed(2)} for 30 Brick Breaker games.`;

  // ---------- start ----------
  showTab((location.hash || '#watch').slice(1));
  watch.start('Fable 5.1 #1', 'Gemini #1', 1); $$('.preset')[1].classList.add('on'); watch.setSpeed(2);
  window.__app = {watch, play};
})();
