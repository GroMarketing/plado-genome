// node probe/run-shard.mjs --shard 0 --of 20 [--limit N] [--jobs 4]  → out/contracts-<shard>.jsonl
import fs from 'node:fs';
import { runOne } from './sandbox.mjs';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SHARD = +arg('--shard', 0), OF = +arg('--of', 1), LIMIT = +arg('--limit', 0), JOBS = +arg('--jobs', 4);
const all = JSON.parse(fs.readFileSync('data/servers.json', 'utf8'));
let mine = all.filter((_, i) => i % OF === SHARD); if (LIMIT) mine = mine.slice(0, LIMIT);
fs.mkdirSync('out', { recursive: true });
const outPath = `out/contracts-${SHARD}.jsonl`; const out = fs.createWriteStream(outPath, { flags: 'a' });
let i = 0, ok = 0;
async function worker() { while (i < mine.length) { const e = mine[i++]; const r = await runOne(e); if (r.ok) ok++; out.write(JSON.stringify(r) + '\n'); console.log(`${r.ok ? 'OK ' : 'ERR'} ${e.id} ${r.ok ? r.tools.length + ' tools' : r.stage + ': ' + String(r.error).slice(0, 120)}`); } }
await Promise.all(Array.from({ length: JOBS }, worker)); out.end();
console.log(`shard ${SHARD}/${OF}: ${ok}/${mine.length} ok`);
