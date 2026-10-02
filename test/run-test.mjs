import { probe } from '../probe/mcp-client.mjs';
const r = await probe('node', [new URL('./fake-server.mjs', import.meta.url).pathname], { timeoutMs: 5000 });
const ok = r.ok && r.tools.length === 2 && r.tools[0].outputSchema && r.prompts.length === 1 && r.envHints.includes('FAKE_SERVICE_API_KEY');
console.log(JSON.stringify({ ok: r.ok, tools: r.tools.map(t => t.name), prompts: r.prompts.length, env: r.envHints, ms: r.ms }));
const bad = await probe('node', ['-e', 'process.exit(3)'], { timeoutMs: 3000 });
console.log('crash case:', bad.ok, bad.error);
const hang = await probe('node', ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 1500 });
console.log('hang case:', hang.ok, hang.error);
process.exit(ok && !bad.ok && !hang.ok ? 0 : 1);
