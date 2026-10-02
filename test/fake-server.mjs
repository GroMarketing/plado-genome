// Test-only MCP server (our own code) used to check the client locally. Logs noise to stdout on purpose.
let buf = '';
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
process.stdout.write('starting fake server (noise line)\n');
console.error('warn: FAKE_SERVICE_API_KEY not set');
process.stdin.on('data', (d) => {
  buf += d; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
    if (m.method === 'initialize') reply(m.id, { protocolVersion: '2025-06-18', serverInfo: { name: 'fake', version: '1' }, capabilities: { tools: {}, prompts: {} } });
    if (m.method === 'tools/list') reply(m.id, m.params?.cursor ? { tools: [{ name: 'b', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } }] } : { tools: [{ name: 'a', description: 'tool a', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] }, outputSchema: { type: 'object', properties: { title: { type: 'string' } } } }], nextCursor: 'p2' });
    if (m.method === 'prompts/list') reply(m.id, { prompts: [{ name: 'p1', arguments: [] }] });
  }
});
