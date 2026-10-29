#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const arg = (name, required = true) => {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : '';
  if (required && !value) throw new Error(`Missing required ${name}`);
  return value;
};

const bundleDir = path.resolve(arg('--bundle'));
const archivePath = path.resolve(arg('--archive'));
const expectedNode = arg('--expected-node').replace(/^v/, '');
const expectedCli = arg('--expected-cli');
const target = arg('--target');
const sourceSha = arg('--source-sha');
const rootDelete = arg('--root-delete');
const outputPath = path.resolve(arg('--output'));
const expectedTarget = `${process.platform}-${process.arch}`;

if (!/^[0-9a-f]{40}$/.test(sourceSha)) {
  throw new Error(`Invalid source SHA ${JSON.stringify(sourceSha)}`);
}
if (target !== expectedTarget) {
  throw new Error(`Target ${target} is UNEXECUTED: runner is ${expectedTarget}`);
}
if (!existsSync(bundleDir) || !existsSync(archivePath)) {
  throw new Error(`Missing bundle or archive for ${target}`);
}

const bundleInfo = JSON.parse(readFileSync(path.join(bundleDir, 'BUNDLE-INFO.json'), 'utf8'));
if (bundleInfo.target !== target || bundleInfo.nodeVersion !== expectedNode) {
  throw new Error(`Bundle metadata mismatch: ${JSON.stringify(bundleInfo)}`);
}

const launcher = process.platform === 'win32'
  ? path.join(bundleDir, 'squad.cmd')
  : path.join(bundleDir, 'squad');
const runtimeCommand = process.platform === 'win32'
  ? path.join(bundleDir, 'squad.exe')
  : path.join(bundleDir, 'runtime', 'bin', 'node');
const runtimeArgs = process.platform === 'win32'
  ? ['--standalone-runtime-version']
  : ['-p', 'process.version'];

const processVersion = runCapture(runtimeCommand, runtimeArgs, false);
const squadVersion = runCapture(launcher, ['--version'], process.platform === 'win32');
if (processVersion !== `v${expectedNode}`) {
  throw new Error(`${target} embedded process.version is ${processVersion}, expected v${expectedNode}`);
}
if (squadVersion !== expectedCli) {
  throw new Error(`${target} squad --version is ${squadVersion}, expected ${expectedCli}`);
}

const smokeId = randomBytes(4).toString('hex');
const smokeRoot = path.join(process.cwd(), `.standalone-smoke-${target}-${smokeId}`);
const homeDir = path.join(process.cwd(), `.standalone-profile-${target}-${smokeId}`);
mkdirSync(path.join(smokeRoot, '.squad'), { recursive: true });
mkdirSync(homeDir, { recursive: true });
writeFileSync(path.join(smokeRoot, '.squad', 'config.json'), '{"stateBackend":"local"}\n');
writeFileSync(path.join(smokeRoot, '.squad', 'team.md'), '# Standalone lifecycle smoke\n');
writeFileSync(
  path.join(smokeRoot, '.mcp.json'),
  `${JSON.stringify({
    mcpServers: {
      squad_state: { command: launcher, args: ['state-mcp'] },
      squad_state_duplicate: { command: launcher, args: ['state-mcp'] },
    },
  }, null, 2)}\n`,
);

let lifecycle;
let workspaceReleaseMs = 0;
try {
  const probes = await Promise.all([
    probeBridge('squad_state', smokeRoot, homeDir),
    probeBridge('squad_state_duplicate', smokeRoot, homeDir),
  ]);
  lifecycle = {
    declarations: 2,
    initialized: probes.length,
    tools: probes.map(probe => probe.tools),
    toolsListed: probes.every(probe => probe.tools.includes('squad_state_health')),
    teardownWithinGrace: probes.every(probe => probe.exited && !probe.pidAliveAfterExit),
    maxTeardownMs: Math.max(...probes.map(probe => probe.teardownMs)),
  };
  if (!lifecycle.toolsListed || !lifecycle.teardownWithinGrace) {
    throw new Error(`Lifecycle smoke failed: ${JSON.stringify(lifecycle)}`);
  }
} finally {
  workspaceReleaseMs = Math.max(
    await removeTreeWithinGrace(smokeRoot, 5_000),
    await removeTreeWithinGrace(homeDir, 5_000),
  );
}
lifecycle.workspaceReleaseMs = workspaceReleaseMs;

const archiveSha256 = createHash('sha256').update(readFileSync(archivePath)).digest('hex');
const report = {
  schemaVersion: 1,
  execution: 'EXECUTED',
  target,
  runner: { platform: process.platform, arch: process.arch },
  sourceSha,
  processVersion,
  squadVersion,
  archive: {
    name: path.basename(archivePath),
    sha256: archiveSha256,
  },
  lifecycle,
  rootDeleteRejection: rootDelete,
};
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `EXECUTED ${target}: process.version=${processVersion}; squad --version=${squadVersion}; `
  + `bridge initialize/tools/list/EOF teardown=PASS; archive sha256=${archiveSha256}`,
);

function runCapture(command, args, shell) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell,
    windowsHide: true,
    timeout: 20_000,
  });
  if (result.status !== 0) {
    throw new Error(
      `${path.basename(command)} ${args.join(' ')} failed (${result.status}): `
      + `${result.stderr || result.stdout}`.trim(),
    );
  }
  return result.stdout.trim();
}

function spawnLauncher(args, cwd, env) {
  if (process.platform === 'win32') {
    return spawn(launcher, args, {
      cwd,
      env,
      detached: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });
  }
  return spawn(launcher, args, {
    cwd,
    env,
    detached: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

async function probeBridge(name, cwd, home) {
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
  };
  const child = spawnLauncher(['state-mcp'], cwd, env);
  const pid = child.pid;
  let stderr = '';
  let buffer = '';
  let tools = [];
  let completed = false;
  const started = Date.now();

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`${name} lifecycle timed out: ${stderr.slice(-2000)}`)),
        20_000,
      );
      const fail = error => {
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
      child.on('error', fail);
      child.on('exit', code => {
        if (!completed) fail(new Error(`${name} exited before tools/list (${code}): ${stderr.slice(-2000)}`));
      });
      child.stdout.on('data', chunk => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let message;
          try {
            message = JSON.parse(line);
          } catch {
            continue;
          }
          if (message.id === 1 && message.result?.serverInfo?.name === 'squad-state') {
            writeJson(child, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
            writeJson(child, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
          } else if (message.id === 2) {
            if (message.error) {
              fail(new Error(`${name} tools/list failed: ${JSON.stringify(message.error)}`));
              return;
            }
            tools = (message.result?.tools ?? []).map(tool => tool.name).filter(Boolean);
            completed = true;
            clearTimeout(timeout);
            resolve();
          }
        }
      });
      writeJson(child, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: `standalone-smoke-${name}`, version: '1' },
        },
      });
    });

    const teardownStarted = Date.now();
    child.stdin.end();
    await waitForExit(child, 5_000);
    return {
      tools,
      exited: child.exitCode !== null,
      pidAliveAfterExit: isPidAlive(pid),
      teardownMs: Date.now() - teardownStarted,
      totalMs: Date.now() - started,
    };
  } finally {
    if (child.exitCode === null && child.pid) child.kill();
  }
}

function writeJson(child, message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`PID ${child.pid} did not exit within ${timeoutMs}ms of stdin EOF`)),
      timeoutMs,
    );
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function removeTreeWithinGrace(dir, timeoutMs) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return Date.now() - started;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new Error(
    `Standalone bridge processes did not release ${dir} within ${timeoutMs}ms: `
    + `${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
