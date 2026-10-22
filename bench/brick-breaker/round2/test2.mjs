// Frozen round-2 suite for ep018 (v1.1: test 08 fix, see audit/) (written and fixed BEFORE any round-2 model output was seen). usage: node test2.mjs file.html [out.json]
import {chromium} from 'playwright';
import fs from 'node:fs';
const EXE = '/Users/sundirectpower/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const file = process.argv[2]; const out = process.argv[3];
const b = await chromium.launch({executablePath: EXE});
const results = []; const errors = []; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fresh() {
  const ctx = await b.newContext({viewport: {width: 1000, height: 800}}); const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await p.route(/^https?:/, (r) => { errors.push('network: ' + r.request().url()); r.abort(); });
  await p.goto('file://' + fs.realpathSync(file)); await sleep(800); return p;
}
const S = (p) => p.evaluate(() => { const g = window.game; if (!g) return null; const o = {score: g.score, lives: g.lives, level: g.level, state: g.state, autopilot: g.autopilot, bricksLeft: g.bricksLeft,
  balls: (g.balls || []).map((x) => ({x: x.x, y: x.y, dx: x.dx, dy: x.dy})), paddle: g.paddle && {x: g.paddle.x, y: g.paddle.y, w: g.paddle.w},
  bricks: (g.bricks || []).map((k) => ({x: k.x, y: k.y, w: k.w, h: k.h, hits: k.hits}))}; return JSON.parse(JSON.stringify(o)); });
async function test(name, fn, ms = 20000) {
  let p; try { p = await fresh(); const ok = await Promise.race([fn(p), sleep(ms).then(() => 'timeout')]); results.push({name, pass: ok === true, note: ok === true ? '' : String(ok).slice(0, 220)}); }
  catch (e) { results.push({name, pass: false, note: 'threw: ' + e.message.slice(0, 180)}); }
  finally { if (p) await p.context().close(); }
}
const box = (p) => p.$eval('canvas#game', (c) => { const r = c.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height}; });

await test('01 loads with no console errors', async () => { await sleep(1500); return errors.length === 0 || errors.join(' | '); });
await test('02 test interface is complete', async (p) => p.evaluate(() => { const g = window.game; if (!g) return 'no window.game';
  const miss = ['score', 'lives', 'level', 'bricksLeft'].filter((k) => typeof g[k] !== 'number').concat(typeof g.state === 'string' ? [] : ['state'], Array.isArray(g.balls) ? [] : ['balls'], Array.isArray(g.bricks) ? [] : ['bricks'],
    g.paddle ? [] : ['paddle'], typeof g.autopilot === 'boolean' ? [] : ['autopilot'], ['tick', 'seed', 'setBall', 'spawnPowerUp'].filter((f) => typeof g[f] !== 'function')); return miss.length === 0 || 'missing ' + miss.join(','); }));
await test('03 starts on level 1: 50 one-hit bricks, 3 lives', async (p) => { const g = await S(p);
  return (g.level === 1 && g.bricks.length === 50 && g.bricksLeft === 50 && g.bricks.every((k) => k.hits === 1) && g.lives === 3 && g.score === 0 && g.state === 'ready' && g.balls.length === 1) || JSON.stringify({lv: g.level, n: g.bricks.length, l: g.lives, st: g.state, balls: g.balls.length}); });
await test('04 tick(n) advances exactly n frames', async (p) => { const [a, c] = await p.evaluate(() => { const g = window.game; g.autopilot = false; g.setBall(400, 470, 1.5, -1);
  const a = {x: g.balls[0].x, y: g.balls[0].y}; g.tick(20); return [a, {x: g.balls[0].x, y: g.balls[0].y}]; });
  return (Math.abs(c.x - a.x - 30) < 1.01 && Math.abs(c.y - a.y + 20) < 1.01) || `ball moved ${(c.x - a.x).toFixed(1)},${(c.y - a.y).toFixed(1)} in tick(20) (want 30,-20)`; });
await test('05 brick hits score 10 each', async (p) => { const g0 = await S(p); const k = g0.bricks[g0.bricks.length - 1];
  await p.evaluate(([x, y]) => { window.game.autopilot = false; window.game.setBall(x, y, 0, -3); }, [k.x + k.w / 2, k.y + k.h + 40]); await p.evaluate(() => window.game.tick(40)); const g = await S(p);
  return (g.bricksLeft < 50 && g.score >= 10 && g.score % 10 === 0) || `bricksLeft ${g.bricksLeft}, score ${g.score}`; });
await test('06 losing the ball costs a life', async (p) => { const c = await box(p); await p.mouse.move(c.x + 3, c.y + c.h - 3); await sleep(150);
  await p.evaluate(() => { window.game.autopilot = false; window.game.setBall(760, 450, 0, 6); window.game.tick(120); }); const g = await S(p); return g.lives === 2 || `lives ${g.lives}`; });
await test('07 "multi" power-up gives 3 balls', async (p) => { await p.evaluate(() => { window.game.autopilot = false; window.game.seed(3); window.game.setBall(400, 330, 0.2, -4); });
  const g0 = await S(p); const cx = g0.paddle.x + g0.paddle.w / 2; await p.evaluate(([x, y]) => window.game.spawnPowerUp('multi', x, y), [cx, g0.paddle.y - 120]);
  let most = 0; for (let i = 0; i < 200; i++) { const n = await p.evaluate(() => { window.game.tick(1); return window.game.balls.length; }); most = Math.max(most, n); if (most >= 3) break; }
  return most >= 3 || `max balls ${most}`; });
await test('08 "wide" doubles the paddle for 600 frames', async (p) => { await p.evaluate(() => { window.game.autopilot = false; window.game.setBall(400, 330, 0.2, -4); });
  const g0 = await S(p); const w0 = g0.paddle.w; await p.evaluate(([x, y]) => window.game.spawnPowerUp('wide', x, y), [g0.paddle.x + w0 / 2, g0.paddle.y - 120]);
  let wide = 0, at = -1; for (let i = 0; i < 200; i++) { const w = await p.evaluate(() => { window.game.tick(1); return window.game.paddle.w; }); if (w >= w0 * 1.9) { wide = w; at = i; break; } }
  if (!wide) return `paddle never widened (w0 ${w0})`;
  // v1.2 (2026-10-21): keep a slow ball in play below the bricks (no hits, no drops, no lost life) while timing the power-up, so a life lost (which may legitimately reset the paddle) can't end it early
  const run = (n) => p.evaluate((n) => { const g = window.game; for (let i = 0; i < n; i += 40) { g.setBall(400, 470, 0, -1); g.tick(Math.min(40, n - i)); } return g.paddle.w; }, n);
  const mid = await run(560); const end = await run(80);   // both measured from the catch
  return (Math.abs(wide - 2 * w0) < 3 && mid >= w0 * 1.9 && Math.abs(end - w0) < 3) || `w0 ${w0}, wide ${wide}, at+560 ${mid}, at+640 ${end}`; });

// one long autopilot run feeds tests 09-12
let run = null;
await test('09 autopilot clears level 1 without losing a life', async (p) => {
  await p.evaluate(() => window.game.seed(7)); await p.keyboard.press('KeyA'); await sleep(200);
  const on = (await S(p)).autopilot; if (!on) { run = {error: 'A did not turn autopilot on'}; return run.error; }
  const r = {minLives: 3, l2: null, l3: null, wonAt: null, frames: 0, level1At: null};
  while (r.frames < 60000) {
    const g = await p.evaluate(() => { window.game.tick(20); const g = window.game; return {lv: g.level, st: g.state, lives: g.lives, bricks: g.bricks.map((k) => k.hits)}; }); r.frames += 20;
    r.minLives = Math.min(r.minLives, g.lives);
    if (g.lv === 2 && !r.l2) { r.l2 = g.bricks; r.level1At = r.frames; r.livesAtL2 = r.minLives; } if (g.lv === 3 && !r.l3) r.l3 = g.bricks;
    if (g.st === 'won') { r.wonAt = r.frames; break; } if (g.st === 'over') { r.over = r.frames; break; }
  }
  run = r; return (r.level1At !== null && r.livesAtL2 === 3) || `level 2 reached at ${r.level1At ?? 'never'} frames, lives then ${r.livesAtL2 ?? '-'}`; }, 600000);
results.push({name: '10 autopilot wins all 3 levels with no life lost', pass: !!(run && run.wonAt && run.minLives === 3),
  note: run ? (run.wonAt ? `won at ${run.wonAt} frames, min lives ${run.minLives}` : `not won in ${run.frames} frames (level-1 clear ${run.level1At ?? 'never'}, over ${run.over ?? '-'}, min lives ${run.minLives})`) : 'no run'});
const twoHit = (a) => a ? a.filter((h) => h === 2).length : -1;
results.push({name: '11 level 2: 60 bricks, top two rows need 2 hits', pass: !!(run && run.l2 && run.l2.length === 60 && twoHit(run.l2) === 20), note: run && run.l2 ? `${run.l2.length} bricks, ${twoHit(run.l2)} two-hit` : 'level 2 never reached'});
results.push({name: '12 level 3: 40+ bricks, 10+ need 2 hits', pass: !!(run && run.l3 && run.l3.length >= 40 && twoHit(run.l3) >= 10), note: run && run.l3 ? `${run.l3.length} bricks, ${twoHit(run.l3)} two-hit` : 'level 3 never reached'});
await test('13 high score is saved to localStorage', async (p) => { const c = await box(p);
  const k = (await S(p)).bricks[45]; await p.evaluate(([x, y]) => { window.game.autopilot = false; window.game.setBall(x, y, 0, -3); window.game.tick(40); }, [k.x + k.w / 2, k.y + k.h + 40]);
  await p.mouse.move(c.x + 3, c.y + c.h - 3); await sleep(100); const sc = (await S(p)).score;
  for (let i = 0; i < 4; i++) { const st = (await S(p)).state; if (st === 'over') break; await p.evaluate(() => { window.game.setBall(760, 450, 0, 6); window.game.tick(150); }); }
  const g = await S(p); const hs = await p.evaluate(() => localStorage.getItem('bb_highscore'));
  return (g.state === 'over' && sc > 0 && Number(hs) >= sc) || `state ${g.state}, score ${sc}, bb_highscore ${hs}`; });
await test('14 P pauses and resumes', async (p) => { await p.evaluate(() => { window.game.autopilot = false; window.game.setBall(400, 420, 3, -3); }); await sleep(120); await p.keyboard.press('KeyP'); await sleep(120);
  const a = await S(p); await sleep(400); const b2 = await S(p); await p.keyboard.press('KeyP'); await sleep(300); const c2 = await S(p);
  return (a.state === 'paused' && a.balls[0].x === b2.balls[0].x && c2.state === 'playing' && c2.balls[0].x !== b2.balls[0].x) || `states ${a.state}/${c2.state}`; });
await test('15 runs at 50+ frames per second', async (p) => { const n = await p.evaluate(() => new Promise((r) => { let k = 0; const t0 = performance.now(); const f = () => { k++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(k / 2); }; requestAnimationFrame(f); })); return n >= 50 || `fps ${n}`; });
await b.close();
const passed = results.filter((r) => r.pass).length; const res = {file, passed, total: results.length, results, errors: errors.slice(0, 10), run: run && {...run, l2: run.l2 && run.l2.length, l3: run.l3 && run.l3.length}};
if (out) fs.writeFileSync(out, JSON.stringify(res, null, 1));
console.log(`${passed}/${results.length}`, file); for (const r of results) console.log(r.pass ? 'PASS' : 'FAIL', r.name, r.note);
process.exit(0);
