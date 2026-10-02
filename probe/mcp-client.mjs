// Minimal MCP stdio client: spawn a server command, run initialize → initialized → tools/list (paged),
// prompts/list and resources/list when advertised. Never calls a tool. Returns a declared-contract record.
import { spawn } from 'node:child_process';

const ENV_RE = /\b[A-Z][A-Z0-9_]{2,}_(?:API_KEY|KEY|TOKEN|SECRET|ID|URL|PASSWORD|HOST)\b/g;

export function probe(cmd, args, { timeoutMs = 45000, spawnOpts = {} } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const out = { ok: false, stage: 'spawn', server: null, protocolVersion: null, capabilities: null, tools: [], prompts: [], resources: [], stderrTail: '', envHints: [], ms: 0, error: null };
    let child;
    try { child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], ...spawnOpts }); }
    catch (e) { out.error = String(e.message || e); return resolve(out); }
    let buf = '', stderr = '', nextId = 1; const pending = new Map();
    const finish = (err) => {
      if (out.ms) return; out.ms = Date.now() - started; if (err) out.error = err;
      out.stderrTail = stderr.slice(-2000); out.envHints = [...new Set(stderr.match(ENV_RE) || [])].slice(0, 20);
      try { child.kill('SIGKILL'); } catch {} resolve(out);
    };
    const timer = setTimeout(() => finish(`timeout at stage ${out.stage}`), timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); finish(String(e.message || e)); });
    child.on('exit', (code) => { clearTimeout(timer); if (!out.ok) finish(`exited ${code} at stage ${out.stage}`); });
    child.stderr.on('data', (d) => { stderr += d; if (stderr.length > 20000) stderr = stderr.slice(-20000); });
    child.stdout.on('data', (d) => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; } // servers that log to stdout
        if (msg.id != null && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); p(msg); }
      }
    });
    const send = (method, params) => new Promise((res) => { const id = nextId++; pending.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
    const notify = (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
    const list = async (method, key) => {
      const items = []; let cursor;
      for (let page = 0; page < 20; page++) {
        const r = await send(method, cursor ? { cursor } : {});
        if (r.error) throw new Error(`${method}: ${r.error.message}`);
        items.push(...(r.result?.[key] || [])); cursor = r.result?.nextCursor; if (!cursor) break;
      }
      return items;
    };
    (async () => {
      out.stage = 'initialize';
      const init = await send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'plado-genome', version: '0.1' } });
      if (init.error) throw new Error(`initialize: ${init.error.message}`);
      out.server = init.result?.serverInfo || null; out.protocolVersion = init.result?.protocolVersion || null; out.capabilities = init.result?.capabilities || {};
      notify('notifications/initialized');
      out.stage = 'tools/list';
      if (out.capabilities.tools) out.tools = (await list('tools/list', 'tools')).map((t) => ({ name: t.name, title: t.title, description: (t.description || '').slice(0, 1500), inputSchema: t.inputSchema || null, outputSchema: t.outputSchema || null, annotations: t.annotations || null }));
      out.stage = 'prompts/list';
      if (out.capabilities.prompts) out.prompts = (await list('prompts/list', 'prompts').catch(() => [])).map((p) => ({ name: p.name, description: (p.description || '').slice(0, 500), arguments: p.arguments || [] }));
      out.stage = 'resources/list';
      if (out.capabilities.resources) out.resources = (await list('resources/list', 'resources').catch(() => [])).slice(0, 50).map((r) => ({ uri: r.uri, name: r.name, mimeType: r.mimeType }));
      out.stage = 'done'; out.ok = true; clearTimeout(timer); finish(null);
    })().catch((e) => { clearTimeout(timer); finish(String(e.message || e)); });
  });
}
