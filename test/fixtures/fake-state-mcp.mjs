import readline from 'node:readline';

const version = process.argv[2] ?? '0.0.0';
const teamDir = process.argv[3] ?? process.cwd();
const mode = process.argv[4] ?? 'healthy';

if (mode === 'etarget') {
  process.stderr.write('npm error code ETARGET\nnpm error notarget No matching version found\n');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', line => {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return;
  }

  if (request.method === 'initialize') {
    send(request.id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'squad-state', version },
    });
  } else if (request.method === 'tools/list') {
    send(request.id, {
      tools: [
        { name: 'squad_state_health', description: 'health', inputSchema: { type: 'object', properties: {} } },
        { name: 'squad_state_read', description: 'read', inputSchema: { type: 'object', properties: {} } },
      ],
    });
  } else if (request.method === 'tools/call') {
    send(request.id, {
      content: [{
        type: 'text',
        text: `squad-state ${version}\nState backend: local\nState backend storage: FSStorageProvider\nTeam squad dir: ${teamDir}`,
      }],
    });
  }
});

function send(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}
