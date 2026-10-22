// AI Pong League engine: a browser (and Node) port of league/arena.mjs.
// Same constants, same serve RNG (mulberry32), same mirrored view, same frame order, same rules.
// Differences from the frozen Node arena, all on purpose:
//   - players run in a plain function scope (Math.random blocked) instead of a node:vm context;
//   - Math.sin, cos, asin, atan, atan2, exp and hypot come from fdlibm.js, a bit-exact copy of what
//     Node computed when the league was played, because browsers round these differently;
//   - the "slower than 5 ms counts as 0" rule is dropped, because wall-clock timing is not
//     deterministic. An exception still counts as 0 for that frame, exactly as in the arena.
// Load fdlibm.js first. Works as a classic <script> (sets window.PongEngine) and in Node
// (import fdlibm.js and engine.js, then use globalThis.PongEngine).
(function (root) {
  'use strict';
  const W = 800, H = 500, PH = 80, PS = 5, FACE_L = 30, FACE_R = 770, R = 6, V0 = 6, VMAX = 24, UP = 1.05,
    MAXANG = 55 * Math.PI / 180, SERVE = 30 * Math.PI / 180, WIN = 7, MAX_FRAMES = 36000;

  const X = root.FdlibmMath; if (!X) throw new Error('load fdlibm.js before engine.js');
  // the Math every player sees: exact transcendental functions, no Math.random
  const SAFE_MATH = Object.create(Math, {sin: {value: X.sin}, cos: {value: X.cos}, asin: {value: X.asin}, atan: {value: X.atan}, atan2: {value: X.atan2},
    exp: {value: X.exp}, hypot: {value: X.hypot}, random: {value: () => { throw new Error('Math.random not allowed'); }}});
  const {sin, cos, hypot} = X;

  function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // Globals a player could reach are shadowed by parameters set to undefined. This keeps honest code
  // honest (no Math.random, no timers, no DOM); it is not a security boundary for hostile code.
  const SHADOW = ['window', 'self', 'globalThis', 'document', 'fetch', 'XMLHttpRequest', 'WebSocket', 'setTimeout', 'setInterval',
    'requestAnimationFrame', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator', 'location', 'performance', 'Date', 'PongEngine', 'FdlibmMath'];

  // code: the player's source, which must define createPlayer(). Returns make(), called once per match.
  function load(code, label) {
    let factory;
    try { factory = new Function('Math', 'console', ...SHADOW, code + '\n;return typeof createPlayer === "function" ? createPlayer : null;'); }
    catch (e) { throw new Error((label || 'player') + ': ' + e.message); }
    const cp = factory(SAFE_MATH, {log() {}, warn() {}, error() {}, info() {}});
    if (!cp) throw new Error((label || 'player') + ': no createPlayer');
    return () => ({mv: cp(), say: null, target: null});
  }

  function call(p, s, stats) {
    let v;
    try { v = p.mv(s); } catch (e) { stats.errors++; return 0; }
    stats.calls++;
    let say = null, target = null;
    if (v && typeof v === 'object') { say = typeof v.say === 'string' ? v.say.slice(0, 48) : null; target = typeof v.target === 'number' && isFinite(v.target) ? v.target : null; v = v.move; }
    if (typeof v !== 'number' || !isFinite(v)) { stats.bad++; return 0; }
    p.say = say; p.target = target; return Math.max(-1, Math.min(1, v));
  }

  // The arena mirrors the world for the right-hand player, so every AI thinks it is on the left.
  function view(side, st) {
    const m = side === 'R'; const b = st.ball;
    return {me: {y: m ? st.yR : st.yL}, opp: {y: m ? st.yL : st.yR}, ball: {x: m ? W - b.x : b.x, y: b.y, dx: m ? -b.dx : b.dx, dy: b.dy, r: R}, court: {w: W, h: H},
      paddle: {h: PH, speed: PS, faceX: FACE_L, oppFaceX: FACE_R}, score: {me: m ? st.sR : st.sL, opp: m ? st.sL : st.sR}, frame: st.frame};
  }

  function ret(b, py, dir) {
    const sp = Math.min(VMAX, hypot(b.dx, b.dy) * UP); const off = Math.max(-1, Math.min(1, (b.y - py) / (PH / 2))); const a = off * MAXANG;
    b.dx = dir * sp * cos(a); b.dy = sp * sin(a); b.x = dir > 0 ? FACE_L + R : FACE_R - R;
  }

  // A match you can step one frame at a time (for drawing) or run to the end (for the league).
  function createMatch(makeL, makeR, seed, {maxFrames = MAX_FRAMES} = {}) {
    const rnd = mulberry(seed); const L = makeL(), Rr = makeR();
    const stats = {L: {errors: 0, bad: 0, calls: 0}, R: {errors: 0, bad: 0, calls: 0}};
    const st = {yL: H / 2, yR: H / 2, sL: 0, sR: 0, frame: 0, ball: null, server: 'L', rally: 0};
    const points = []; let lastPoint = null; let hit = null;
    const serve = () => { const a = (rnd() * 2 - 1) * SERVE; const dir = st.server === 'L' ? 1 : -1; st.ball = {x: W / 2, y: H / 2, dx: dir * V0 * cos(a), dy: V0 * sin(a)}; st.rally = 0; };
    serve();
    const over = () => !(st.sL < WIN && st.sR < WIN && st.frame < maxFrames);
    function step() {
      if (over()) return false;
      lastPoint = null; hit = null;
      const mL = call(L, view('L', st), stats.L), mR = call(Rr, view('R', st), stats.R);
      st.yL = Math.max(PH / 2, Math.min(H - PH / 2, st.yL + mL * PS)); st.yR = Math.max(PH / 2, Math.min(H - PH / 2, st.yR + mR * PS));
      const b = st.ball; b.x += b.dx; b.y += b.dy;
      if (b.y < R) { b.y = 2 * R - b.y; b.dy = -b.dy; } if (b.y > H - R) { b.y = 2 * (H - R) - b.y; b.dy = -b.dy; }
      let scored = null;
      if (b.dx < 0 && b.x - R <= FACE_L) { if (Math.abs(b.y - st.yL) <= PH / 2 + R) { ret(b, st.yL, 1); st.rally++; hit = 'L'; } else scored = 'R'; }
      else if (b.dx > 0 && b.x + R >= FACE_R) { if (Math.abs(b.y - st.yR) <= PH / 2 + R) { ret(b, st.yR, -1); st.rally++; hit = 'R'; } else scored = 'L'; }
      if (scored) { if (scored === 'L') st.sL++; else st.sR++; lastPoint = {frame: st.frame, to: scored, rally: st.rally, x: b.x, y: b.y}; points.push({frame: st.frame, to: scored, rally: st.rally}); st.server = st.server === 'L' ? 'R' : 'L'; serve(); }
      st.frame++;
      return true;
    }
    function result() { return {sL: st.sL, sR: st.sR, winner: st.sL > st.sR ? 'L' : st.sR > st.sL ? 'R' : null, frames: st.frame, points, stats}; }
    function runToEnd(budget = Infinity) { let n = 0; while (n < budget && step()) n++; return over(); }
    return {
      step, runToEnd, result, over, state: st, stats,
      get say() { return {L: L.say, R: Rr.say}; },
      get target() { return {L: L.target, R: Rr.target}; },
      get lastPoint() { return lastPoint; },
      get hit() { return hit; },
    };
  }

  function match(makeL, makeR, seed, opts) { const m = createMatch(makeL, makeR, seed, opts); m.runToEnd(); return m.result(); }

  root.PongEngine = {math: SAFE_MATH, W, H, PH, PS, FACE_L, FACE_R, R, V0, VMAX, UP, WIN, MAX_FRAMES, load, createMatch, match, view, mulberry};
})(typeof window !== 'undefined' ? window : globalThis);
