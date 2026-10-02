// Runs ONE catalog MCP server inside a throwaway Docker container on a GitHub runner:
//   1) install the exact pinned package WITH network, lifecycle scripts disabled (npm --ignore-scripts)
//   2) disconnect the container from every network
//   3) start the server over stdio and read its declared contract (mcp-client.mjs). No tool is ever called.
//   4) remove the container
// No credentials exist anywhere in this environment.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { probe } from './mcp-client.mjs';
const sh = promisify(execFile);
const IMG = { npx: 'node:22-bookworm-slim', uvx: 'ghcr.io/astral-sh/uv:python3.12-bookworm-slim' };

const docker = (args, t = 240000) => sh('docker', args, { timeout: t, maxBuffer: 8 << 20 });

// "npx -y name@1.2.3 --flag x" → { pkg: 'name@1.2.3', name: 'name', args: ['--flag','x'] }
export function parse(cmd) {
  const parts = cmd.trim().split(/\s+/); const kind = parts[0];
  const rest = parts.slice(1).filter((p) => !['-y', '--yes'].includes(p));
  if (kind === 'npx') {
    const pkg = rest[0]; const at = pkg.lastIndexOf('@');
    return { kind, pkg, name: at > 0 ? pkg.slice(0, at) : pkg, args: rest.slice(1) };
  }
  if (kind === 'uvx') {
    let i = 0, from = null;
    if (rest[0] === '--from') { from = rest[1]; i = 2; }
    const spec = rest[i]; const name = spec.split(/[=<>!~\[]/)[0];
    return { kind, pkg: from || spec, exe: name, args: rest.slice(i + 1) };
  }
  return null;
}

export async function runOne(entry, { timeoutMs = 60000 } = {}) {
  const p = parse(entry.cmd); const base = { id: entry.id, cmd: entry.cmd, at: new Date().toISOString() };
  if (!p) return { ...base, ok: false, stage: 'parse', error: 'unsupported command' };
  const name = `pg-${entry.id.replace(/[^a-z0-9]/gi, '').slice(0, 40)}-${process.pid}-${Math.random().toString(36).slice(2, 7)}`;
  try {
    await docker(['run', '-d', '--name', name, '--memory', '1g', '--cpus', '1', '--pids-limit', '256', '--security-opt', 'no-new-privileges', '--cap-drop', 'ALL', IMG[p.kind], 'sleep', '600']);
    let runCmd;
    if (p.kind === 'npx') {
      await docker(['exec', name, 'sh', '-c', `mkdir -p /app && cd /app && npm init -y >/dev/null && npm install --ignore-scripts --no-audit --no-fund ${JSON.stringify(p.pkg)}`]);
      const { stdout } = await docker(['exec', name, 'node', '-e', `const p=require('/app/node_modules/${p.name}/package.json');const b=typeof p.bin==='string'?p.bin:(p.bin&&(p.bin[p.name.split('/').pop()]||Object.values(p.bin)[0]));process.stdout.write(b||p.main||'index.js')`]);
      runCmd = ['node', `/app/node_modules/${p.name}/${stdout.trim()}`, ...p.args];
    } else {
      const { stdout: io, stderr: ie } = await docker(['exec', name, 'uv', 'tool', 'install', '--no-build', p.pkg]);
      // uv prints "Installed N executable(s): a, b"; prefer the one named like the package
      const exes = ((io + ie).match(/Installed \d+ executables?: ([^\n]+)/)?.[1] || '').split(',').map((x) => x.trim()).filter(Boolean);
      const exe = exes.find((x) => x === p.exe) || exes.find((x) => x.includes(p.exe)) || exes[0] || p.exe;
      if (!/^[A-Za-z0-9._-]+$/.test(exe)) throw new Error(`unexpected executable name: ${exe}`);
      runCmd = ['env', 'PATH=/root/.local/bin:/usr/local/bin:/usr/bin:/bin', exe, ...p.args];
    }
    // cut every network the container is attached to
    const { stdout: nets } = await docker(['inspect', '-f', '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}', name]);
    for (const n of nets.trim().split(/\s+/).filter(Boolean)) await docker(['network', 'disconnect', '-f', n, name]);
    const r = await probe('docker', ['exec', '-i', name, ...runCmd], { timeoutMs });
    // measure, don't assume: the container must have no networks attached while the server ran
    const { stdout: after } = await docker(['inspect', '-f', '{{len .NetworkSettings.Networks}}', name]);
    return { ...base, ...r, networkCut: after.trim() === '0' };
  } catch (e) {
    return { ...base, ok: false, stage: 'install', error: String(e.stderr || e.message || e).slice(-1500) };
  } finally {
    await docker(['rm', '-f', name]).catch(() => {});
  }
}
