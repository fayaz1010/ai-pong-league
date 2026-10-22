// Pong arena for ep018 face-off. Each AI sees itself on the left (mirrored). Deterministic given the seed.
import vm from 'node:vm';
export const W = 800, H = 500, PH = 80, PS = 5, FACE_L = 30, FACE_R = 770, R = 6, V0 = 6, VMAX = 24, UP = 1.05, MAXANG = 55 * Math.PI / 180, SERVE = 30 * Math.PI / 180, WIN = 7;
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function load(code, label) {
  const ctx = vm.createContext({Math: Object.create(Math, {random: {value: () => { throw new Error('Math.random not allowed'); }}}), console: {log() {}}});
  new vm.Script(code + '\n;this.__cp = typeof createPlayer === "function" ? createPlayer : null;', {filename: label}).runInContext(ctx, {timeout: 2000});
  if (!ctx.__cp) throw new Error(label + ': no createPlayer');
  return () => { const mv = vm.runInContext('__cp()', ctx, {timeout: 2000}); return {mv, ctx}; };
}
const fn = new vm.Script('__r = __mv(__s)');
function call(p, s, stats) {
  p.ctx.__mv = p.mv; p.ctx.__s = s; const t0 = performance.now();
  try { fn.runInContext(p.ctx, {timeout: 50}); } catch (e) { stats.errors++; return 0; }
  const dt = performance.now() - t0; stats.ms += dt; stats.calls++; if (dt > 5) { stats.slow++; return 0; }
  const v = p.ctx.__r; if (typeof v !== 'number' || !isFinite(v)) { stats.bad++; return 0; } return Math.max(-1, Math.min(1, v));
}
// mirror the world for the right-hand player
const view = (side, st) => { const m = side === 'R'; const b = st.ball;
  return {me: {y: m ? st.yR : st.yL}, opp: {y: m ? st.yL : st.yR}, ball: {x: m ? W - b.x : b.x, y: b.y, dx: m ? -b.dx : b.dx, dy: b.dy, r: R}, court: {w: W, h: H},
    paddle: {h: PH, speed: PS, faceX: FACE_L, oppFaceX: FACE_R}, score: {me: m ? st.sR : st.sL, opp: m ? st.sL : st.sR}, frame: st.frame}; };
export function match(makeL, makeR, seed, {record = false, maxFrames = 36000} = {}) {
  const rnd = mulberry(seed); const L = makeL(), Rr = makeR(); const stats = {L: {errors: 0, slow: 0, bad: 0, ms: 0, calls: 0}, R: {errors: 0, slow: 0, bad: 0, ms: 0, calls: 0}};
  const st = {yL: H / 2, yR: H / 2, sL: 0, sR: 0, frame: 0, ball: null, server: 'L', rally: 0, hits: 0}; const frames = []; const points = [];
  const serve = () => { const a = (rnd() * 2 - 1) * SERVE; const dir = st.server === 'L' ? 1 : -1; st.ball = {x: W / 2, y: H / 2, dx: dir * V0 * Math.cos(a), dy: V0 * Math.sin(a)}; st.rally = 0; };
  serve();
  while (st.sL < WIN && st.sR < WIN && st.frame < maxFrames) {
    const mL = call(L, view('L', st), stats.L), mR = call(Rr, view('R', st), stats.R);
    st.yL = Math.max(PH / 2, Math.min(H - PH / 2, st.yL + mL * PS)); st.yR = Math.max(PH / 2, Math.min(H - PH / 2, st.yR + mR * PS));
    const b = st.ball; b.x += b.dx; b.y += b.dy;
    if (b.y < R) { b.y = 2 * R - b.y; b.dy = -b.dy; } if (b.y > H - R) { b.y = 2 * (H - R) - b.y; b.dy = -b.dy; }
    let scored = null;
    if (b.dx < 0 && b.x - R <= FACE_L) { if (Math.abs(b.y - st.yL) <= PH / 2 + R) { ret(b, st.yL, 1); st.rally++; } else scored = 'R'; }
    else if (b.dx > 0 && b.x + R >= FACE_R) { if (Math.abs(b.y - st.yR) <= PH / 2 + R) { ret(b, st.yR, -1); st.rally++; } else scored = 'L'; }
    if (record) frames.push([+st.yL.toFixed(1), +st.yR.toFixed(1), +b.x.toFixed(1), +b.y.toFixed(1), st.sL, st.sR]);
    if (scored) { if (scored === 'L') st.sL++; else st.sR++; points.push({frame: st.frame, to: scored, rally: st.rally}); st.server = st.server === 'L' ? 'R' : 'L'; serve(); }
    st.frame++;
  }
  return {sL: st.sL, sR: st.sR, winner: st.sL > st.sR ? 'L' : st.sR > st.sL ? 'R' : null, frames: st.frame, points, stats, ...(record ? {log: frames} : {})};
}
function ret(b, py, dir) { const sp = Math.min(VMAX, Math.hypot(b.dx, b.dy) * UP); const off = Math.max(-1, Math.min(1, (b.y - py) / (PH / 2))); const a = off * MAXANG;
  b.dx = dir * sp * Math.cos(a); b.dy = sp * Math.sin(a); b.x = dir > 0 ? FACE_L + R : FACE_R - R; }
