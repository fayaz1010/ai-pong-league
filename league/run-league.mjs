// Re-run the AI Pong League and check it reproduces league/league.json, match for match.
//
//   npm run league                      all 420 matches on the browser engine (docs/engine.js)
//   npm run league -- --engine=arena    same, on the frozen Node arena (league/arena.mjs, node:vm)
//   npm run league -- --only="GPT-6 Astra #3"   just one team's matches
//   npm run league -- --limit=20        the first 20 matches only
//   npm run league -- --workers=4       parallel workers (default: CPU cores - 1)
//
// Every match is: home on the left, away on the right, seeds 1 and 2, first to 7, 36,000-frame cap.
// Zero dependencies. Writes league/league.rerun.json (git-ignored) and exits 1 on any mismatch.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';

const HERE = path.dirname(fileURLToPath(import.meta.url));
import {NAMES, listTeams} from './teams.mjs';

async function makeRunner(engine) {
  if (engine === 'arena') { const {load, match} = await import('./arena.mjs'); return {load, match}; }
  await import('../docs/fdlibm.js'); await import('../docs/engine.js'); const E = globalThis.PongEngine; return {load: E.load, match: E.match};
}

if (!isMainThread) {
  const {engine, teams, jobs} = workerData; const {load, match} = await makeRunner(engine); const made = {};
  const mk = (t) => made[t.id] ||= load(fs.readFileSync(t.file, 'utf8'), t.id);
  for (const j of jobs) {
    const H = teams[j.i], A = teams[j.j]; const r = match(mk(H), mk(A), j.seed);
    parentPort.postMessage({k: j.k, home: H.id, away: A.id, seed: j.seed, score: `${r.sL}-${r.sR}`, frames: r.frames, points: r.points, sL: r.sL, sR: r.sR, stats: r.stats});
  }
  parentPort.postMessage({done: true});
} else {
  const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
  const engine = arg('engine', 'port'); const only = arg('only', null); const limit = +arg('limit', 0) || Infinity;
  // The frozen arena counts any call slower than 5 ms (wall clock) as 0, so it is only reproducible on a
  // quiet machine, one match at a time. The browser port drops that rule and is safe to run in parallel.
  const nWorkers = Math.max(1, +arg('workers', engine === 'arena' ? 1 : Math.max(1, os.cpus().length - 1)));
  const teams = listTeams();
  const jobs = []; let k = 0;
  for (let i = 0; i < teams.length; i++) for (let j = 0; j < teams.length; j++) { if (i === j) continue; for (const seed of [1, 2]) { const job = {k: k++, i, j, seed}; if (!only || teams[i].id === only || teams[j].id === only) jobs.push(job); } }
  const todo = jobs.slice(0, limit);
  const recorded = JSON.parse(fs.readFileSync(path.join(HERE, 'league.json'), 'utf8')).games;
  const recKey = (g) => `${g.home}|${g.away}|${g.seed}`; const rec = new Map(recorded.map((g) => [recKey(g), g]));
  console.log(`AI Pong League re-run: ${teams.length} teams, ${todo.length} matches, engine=${engine === 'arena' ? 'frozen node:vm arena' : 'browser port (docs/engine.js)'}, ${Math.min(nWorkers, todo.length)} workers`);
  const t0 = Date.now(); const results = []; let same = 0, diff = 0, unknown = 0;
  const chunks = Array.from({length: Math.min(nWorkers, todo.length)}, () => []); todo.forEach((j, n) => chunks[n % chunks.length].push(j));
  await Promise.all(chunks.map((c) => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), {workerData: {engine, teams, jobs: c}});
    w.on('message', (m) => {
      if (m.done) return resolve();
      results.push(m); const r = rec.get(recKey(m));
      const pts = (a) => JSON.stringify(a.map((p) => [p.frame, p.to, p.rally]));
      if (!r) unknown++; else if (r.score === m.score && r.frames === m.frames && pts(r.points) === pts(m.points)) same++;
      else { diff++; console.log(`  MISMATCH ${m.home} v ${m.away} seed ${m.seed}: got ${m.score} in ${m.frames} frames, league.json says ${r.score} in ${r.frames}`); }
      const n = results.length; if (n % 20 === 0 || n === todo.length) process.stdout.write(`  ${n}/${todo.length} matches, ${same} identical, ${diff} different (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
    });
    w.on('error', reject); w.on('exit', (code) => code && reject(new Error('worker exit ' + code)));
  })));
  results.sort((a, b) => a.k - b.k);

  // league table, same rules and tie-breaks as the original: win 3, draw 1; Pts, then goal difference, then goals for
  const tab = Object.fromEntries(teams.map((t) => [t.id, {team: t.id, model: t.model, P: 0, W: 0, D: 0, L: 0, F: 0, A: 0, Pts: 0}]));
  for (const r of results) for (const [t, f, a] of [[r.home, r.sL, r.sR], [r.away, r.sR, r.sL]]) { const x = tab[t]; x.P++; x.F += f; x.A += a; if (f > a) { x.W++; x.Pts += 3; } else if (f === a) { x.D++; x.Pts += 1; } else x.L++; }
  const rows = Object.values(tab).filter((x) => x.P).map((x) => ({...x, GD: x.F - x.A})).sort((a, b) => b.Pts - a.Pts || b.GD - a.GD || b.F - a.F);
  fs.writeFileSync(path.join(HERE, 'league.rerun.json'), JSON.stringify({engine, rows, games: results.map(({k, sL, sR, stats, ...g}) => g)}, null, 1));
  console.log('\nPos Team               P   W  D  L    F    A    GD  Pts');
  rows.forEach((r, n) => console.log(`${String(n + 1).padStart(2)}  ${r.team.padEnd(16)} ${String(r.P).padStart(3)} ${String(r.W).padStart(3)} ${String(r.D).padStart(2)} ${String(r.L).padStart(2)} ${String(r.F).padStart(4)} ${String(r.A).padStart(4)} ${String(r.GD).padStart(5)} ${String(r.Pts).padStart(4)}`));
  const known = todo.length - unknown;
  console.log('\n' + (known ? `${same}/${known} recorded matches identical to league.json (score, frame count and every point)` + (diff ? `, ${diff} DIFFERENT` : '') : 'No recorded matches in this run')
    + (unknown ? `; ${unknown} new matches involving your players` : '') + `. ${((Date.now() - t0) / 1000).toFixed(0)}s.`);
  const slow = results.reduce((n, r) => n + (r.stats.L.slow || 0) + (r.stats.R.slow || 0), 0);
  if (engine === 'arena') console.log(`Calls over 5 ms (counted as 0 by the frozen arena): ${slow}. The original run had 3.`);
  process.exit(diff ? 1 : 0);
}
