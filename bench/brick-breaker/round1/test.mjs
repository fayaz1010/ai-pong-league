// Frozen test suite for ep018 (written and fixed BEFORE any model output was seen). usage: node test.mjs file.html [out.json]
import {chromium} from 'playwright';
import fs from 'node:fs';
const EXE = '/Users/sundirectpower/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const file = process.argv[2]; const out = process.argv[3];
const b = await chromium.launch({executablePath: EXE});
const results = []; const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fresh() {
  const p = await b.newPage({viewport: {width: 1000, height: 800}});
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await p.route(/^https?:/, (r) => { errors.push('network: ' + r.request().url()); r.abort(); });
  await p.goto('file://' + fs.realpathSync(file)); await sleep(800); return p;
}
const G = (p) => p.evaluate(() => { const g = window.game; return g ? JSON.parse(JSON.stringify({score: g.score, lives: g.lives, bricksLeft: g.bricksLeft, state: g.state, ball: g.ball, paddle: g.paddle})) : null; });
async function test(name, fn) {
  let p; try { p = await fresh(); const ok = await Promise.race([fn(p), sleep(15000).then(() => 'timeout')]); results.push({name, pass: ok === true, note: ok === true ? '' : String(ok)}); }
  catch (e) { results.push({name, pass: false, note: 'threw: ' + e.message.slice(0, 160)}); }
  finally { if (p) await p.close(); }
}
const canvasBox = (p) => p.$eval('canvas#game', (c) => { const r = c.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height}; });

await test('01 loads with no console errors', async (p) => { await sleep(1500); return errors.length === 0 || errors.join(' | ').slice(0, 200); });
await test('02 canvas #game is 800x600', async (p) => p.evaluate(() => { const c = document.querySelector('canvas#game'); return !!c && c.width === 800 && c.height === 600 || (c ? `${c.width}x${c.height}` : 'no canvas'); }));
await test('03 window.game has the test interface', async (p) => p.evaluate(() => { const g = window.game; if (!g) return 'no window.game';
  const ok = ['score', 'lives', 'bricksLeft'].every((k) => typeof g[k] === 'number') && typeof g.state === 'string' && g.ball && g.paddle && typeof g.setBall === 'function'
    && ['x', 'y', 'dx', 'dy'].every((k) => typeof g.ball[k] === 'number') && ['x', 'y', 'w'].every((k) => typeof g.paddle[k] === 'number'); return ok || 'fields missing/wrong type'; }));
await test('04 starts ready: 50 bricks, 3 lives, score 0', async (p) => { const g = await G(p); return g && g.bricksLeft === 50 && g.lives === 3 && g.score === 0 && g.state === 'ready' || JSON.stringify(g && {b: g.bricksLeft, l: g.lives, s: g.score, st: g.state}); });
await test('05 arrow keys move the paddle', async (p) => { await p.click('canvas#game', {position: {x: 400, y: 300}}).catch(() => {}); await p.mouse.move(5, 5); const a = (await G(p)).paddle.x;
  await p.keyboard.down('ArrowRight'); await sleep(400); await p.keyboard.up('ArrowRight'); const r = (await G(p)).paddle.x;
  await p.keyboard.down('ArrowLeft'); await sleep(400); await p.keyboard.up('ArrowLeft'); const l = (await G(p)).paddle.x; return (r > a + 20 && l < r - 20) || `x ${a} -> ${r} -> ${l}`; });
await test('06 mouse moves the paddle', async (p) => { const c = await canvasBox(p); await p.mouse.move(c.x + c.w * 0.2, c.y + c.h * 0.5); await sleep(200); const g1 = await G(p);
  await p.mouse.move(c.x + c.w * 0.8, c.y + c.h * 0.5); await sleep(200); const g2 = await G(p); const cx = (g) => (g.paddle.x + g.paddle.w / 2) * (c.w / 800);
  return (Math.abs(cx(g1) - c.w * 0.2) < 60 && Math.abs(cx(g2) - c.w * 0.8) < 60) || `centres ${Math.round(cx(g1))}, ${Math.round(cx(g2))}`; });
await test('07 Space launches the ball', async (p) => { await p.keyboard.press('Space'); await sleep(300); const a = await G(p); await sleep(300); const b2 = await G(p);
  return (a.state === 'playing' && (Math.abs(b2.ball.x - a.ball.x) + Math.abs(b2.ball.y - a.ball.y)) > 5) || `state ${a.state}, moved ${Math.round(Math.abs(b2.ball.y - a.ball.y))}`; });
await test('08 paddle stays inside the canvas', async (p) => { await p.mouse.move(0, 0); await p.keyboard.down('ArrowLeft'); await sleep(2500); await p.keyboard.up('ArrowLeft'); const a = await G(p);
  await p.keyboard.down('ArrowRight'); await sleep(3500); await p.keyboard.up('ArrowRight'); const b2 = await G(p); return (a.paddle.x >= -1 && b2.paddle.x + b2.paddle.w <= 801) || `left ${a.paddle.x}, right edge ${b2.paddle.x + b2.paddle.w}`; });
await test('09 hitting a brick removes it and scores 10', async (p) => { await p.evaluate(() => window.game.setBall(400, 300, 0.3, -6)); await sleep(1200); const g = await G(p);
  return (g.bricksLeft < 50 && g.score === (50 - g.bricksLeft) * 10) || `bricksLeft ${g.bricksLeft}, score ${g.score}`; });
await test('10 missing the ball costs a life', async (p) => { const c = await canvasBox(p); await p.mouse.move(c.x + 5, c.y + c.h - 5); await sleep(200);
  await p.evaluate(() => window.game.setBall(700, 450, 0, 7)); await sleep(1500); const g = await G(p); return g.lives === 2 || `lives ${g.lives}`; });
await test('11 P pauses and resumes', async (p) => { await p.evaluate(() => window.game.setBall(400, 420, 3, -3)); await sleep(150); await p.keyboard.press('KeyP'); await sleep(150);
  const a = await G(p); await sleep(400); const b2 = await G(p); await p.keyboard.press('KeyP'); await sleep(300); const c2 = await G(p);
  return (a.state === 'paused' && a.ball.x === b2.ball.x && a.ball.y === b2.ball.y && c2.state === 'playing' && (c2.ball.x !== b2.ball.x || c2.ball.y !== b2.ball.y)) || `states ${a.state}/${c2.state}`; });
await test('12 game over at 0 lives, Space restarts', async (p) => { const c = await canvasBox(p);
  for (let i = 0; i < 3; i++) { await p.mouse.move(c.x + 5, c.y + c.h - 5); await p.evaluate(() => window.game.setBall(700, 450, 0, 7)); await sleep(1300); }
  const a = await G(p); await p.keyboard.press('Space'); await sleep(500); const b2 = await G(p);
  return (a.lives === 0 && a.state === 'over' && b2.lives === 3 && b2.bricksLeft === 50 && b2.score === 0) || `at end lives ${a.lives} state ${a.state}; after Space lives ${b2.lives} bricks ${b2.bricksLeft}`; });
await test('13 runs at 50+ frames per second', async (p) => { const n = await p.evaluate(() => new Promise((r) => { let k = 0; const t0 = performance.now(); const f = () => { k++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(k / 2); }; requestAnimationFrame(f); }));
  return n >= 50 || `fps ${n}`; });
await b.close();
const passed = results.filter((r) => r.pass).length;
const res = {file, passed, total: results.length, results, errors: errors.slice(0, 10)};
if (out) fs.writeFileSync(out, JSON.stringify(res, null, 1));
console.log(`${passed}/${results.length}`, file); for (const r of results) console.log(r.pass ? 'PASS' : 'FAIL', r.name, r.note);
