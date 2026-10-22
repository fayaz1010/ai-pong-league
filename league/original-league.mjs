// League: every player vs every other, home and away, on seeds 1-2 (4 matches per pairing). Win 3, draw 1. -> league.json
import fs from 'node:fs'; import {load, match} from './arena.mjs';
const NAMES = {'google__gemini-4-argon': 'Gemini', 'openai__gpt-6-astra': 'GPT-6 Astra', 'anthropic__claude-opus-5.5': 'Opus 5.5', 'anthropic__claude-fable-5.1': 'Fable 5.1', 'x-ai__grok-4.7': 'Grok 4.7'};
const teams = [];
for (const d of Object.keys(NAMES)) for (const f of fs.readdirSync(`s2/players/${d}`).filter((x) => /^\d\.js$/.test(x)).sort()) {
  const id = `${NAMES[d]} #${f[0]}`; try { teams.push({id, model: NAMES[d], make: load(fs.readFileSync(`s2/players/${d}/${f}`, 'utf8'), id)}); } catch (e) { console.log('LOAD FAIL', id, e.message); teams.push({id, model: NAMES[d], make: null}); } }
const tab = Object.fromEntries(teams.map((t) => [t.id, {team: t.id, model: t.model, P: 0, W: 0, D: 0, L: 0, F: 0, A: 0, Pts: 0, errors: 0, slow: 0, msPerCall: 0, calls: 0}]));
const games = [];
for (let i = 0; i < teams.length; i++) for (let j = 0; j < teams.length; j++) { if (i === j) continue; for (const seed of [1, 2]) {
  const H = teams[i], A = teams[j]; let r;
  if (!H.make || !A.make) r = {sL: H.make ? 7 : 0, sR: A.make ? 7 : 0, frames: 0, stats: {L: {}, R: {}}}; else r = match(H.make, A.make, seed);
  games.push({home: H.id, away: A.id, seed, score: `${r.sL}-${r.sR}`, frames: r.frames, points: r.points});
  for (const [t, f, a, s] of [[H.id, r.sL, r.sR, r.stats.L], [A.id, r.sR, r.sL, r.stats.R]]) { const x = tab[t]; x.P++; x.F += f; x.A += a;
    if (f > a) { x.W++; x.Pts += 3; } else if (f === a) { x.D++; x.Pts += 1; } else x.L++; x.errors += s.errors || 0; x.slow += s.slow || 0; x.msPerCall += s.ms || 0; x.calls += s.calls || 0; }
} }
const rows = Object.values(tab).map((x) => ({...x, GD: x.F - x.A, msPerCall: +(x.msPerCall / Math.max(1, x.calls)).toFixed(4)})).sort((a, b) => b.Pts - a.Pts || b.GD - a.GD || b.F - a.F);
const byModel = {}; for (const r of rows) { const m = byModel[r.model] ||= {model: r.model, W: 0, D: 0, L: 0, Pts: 0, GD: 0}; m.W += r.W; m.D += r.D; m.L += r.L; m.Pts += r.Pts; m.GD += r.GD; }
fs.writeFileSync('s2/league.json', JSON.stringify({rows, byModel: Object.values(byModel).sort((a, b) => b.Pts - a.Pts), games}, null, 1));
console.log('Pos Team            P   W  D  L   F   A   GD  Pts  err slow ms/call');
rows.forEach((r, k) => console.log(`${String(k + 1).padStart(2)}  ${r.team.padEnd(14)} ${String(r.P).padStart(3)} ${String(r.W).padStart(3)} ${String(r.D).padStart(2)} ${String(r.L).padStart(2)} ${String(r.F).padStart(4)} ${String(r.A).padStart(3)} ${String(r.GD).padStart(4)} ${String(r.Pts).padStart(4)} ${String(r.errors).padStart(4)} ${String(r.slow).padStart(4)} ${r.msPerCall}`));
console.log('\nBy model:'); for (const m of Object.values(byModel).sort((a, b) => b.Pts - a.Pts)) console.log(`${m.model.padEnd(12)} W${m.W} D${m.D} L${m.L}  GD ${m.GD}  Pts ${m.Pts}`);
