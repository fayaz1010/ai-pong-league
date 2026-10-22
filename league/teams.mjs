// The 15 players, in the same order the original league used: model folders in this order, then 1.js, 2.js, 3.js.
// Any extra folder you add under players/ (your own AI) is picked up after them, named after the folder.
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const NAMES = {'google__gemini-4-argon': 'Gemini', 'openai__gpt-6-astra': 'GPT-6 Astra', 'anthropic__claude-opus-5.5': 'Opus 5.5', 'anthropic__claude-fable-5.1': 'Fable 5.1', 'x-ai__grok-4.7': 'Grok 4.7'};

export function listTeams(dir = path.join(ROOT, 'players')) {
  const teams = [];
  for (const d of Object.keys(NAMES)) {
    if (!fs.existsSync(path.join(dir, d))) continue;
    for (const f of fs.readdirSync(path.join(dir, d)).filter((x) => /^\d\.js$/.test(x)).sort()) teams.push({id: `${NAMES[d]} #${f[0]}`, model: NAMES[d], file: path.join(dir, d, f)});
  }
  for (const d of fs.readdirSync(dir).filter((x) => !NAMES[x] && fs.statSync(path.join(dir, x)).isDirectory()).sort())
    for (const f of fs.readdirSync(path.join(dir, d)).filter((x) => /^\d\.js$/.test(x)).sort()) teams.push({id: `${d} #${f[0]}`, model: d, file: path.join(dir, d, f)});
  return teams;
}

