#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NODE_MODULES = join(ROOT, 'node_modules');
const SYNTHETIC_MARKER = 'QUARTZ_NAVIGATOR_SYNTHETIC_TEAM';

if (!existsSync(NODE_MODULES)) {
  throw new Error('node_modules is required; restore the locked dependencies before running this check');
}

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
    .filter(file => file !== '.squad' && !file.startsWith('.squad/'));
}

function trackedTeamFiles() {
  return execFileSync('git', ['ls-files', '-z', '--', '.squad'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
}

function copyTrackedTree(destination) {
  for (const file of trackedFiles()) {
    const source = join(ROOT, file);
    const target = join(destination, file);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, {
      dereference: false,
      preserveTimestamps: true,
    });
  }
  linkDependencies(destination);
}

function linkDependencies(destination) {
  const destinationModules = join(destination, 'node_modules');
  mkdirSync(destinationModules);

  for (const entry of readdirSync(NODE_MODULES, { withFileTypes: true })) {
    const source = join(NODE_MODULES, entry.name);
    const target = join(destinationModules, entry.name);

    if (entry.name !== '@bradygaster') {
      symlinkSync(source, target, entry.isDirectory() ? 'dir' : 'file');
      continue;
    }

    mkdirSync(target);
    for (const scopedEntry of readdirSync(source, { withFileTypes: true })) {
      const scopedTarget = join(target, scopedEntry.name);
      if (scopedEntry.name === 'squad-sdk') {
        symlinkSync(join(destination, 'packages', 'squad-sdk'), scopedTarget, 'dir');
      } else {
        symlinkSync(
          join(source, scopedEntry.name),
          scopedTarget,
          scopedEntry.isDirectory() ? 'dir' : 'file',
        );
      }
    }
  }
}

function copyLiveTeam(destination) {
  const files = trackedTeamFiles();
  for (const file of files) {
    const source = join(ROOT, file);
    const target = join(destination, file);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, {
      dereference: false,
      preserveTimestamps: true,
    });
  }
  return files.length > 0;
}

function writeSyntheticTeam(destination) {
  const teamDir = join(destination, '.squad');
  mkdirSync(join(teamDir, 'agents', 'quartz-navigator'), { recursive: true });
  mkdirSync(join(teamDir, 'casting'), { recursive: true });
  mkdirSync(join(teamDir, 'decisions', 'inbox'), { recursive: true });
  mkdirSync(join(teamDir, 'templates'), { recursive: true });
  mkdirSync(join(teamDir, 'skills', 'synthetic-only'), { recursive: true });
  writeFileSync(
    join(teamDir, 'team.md'),
    [
      '# Synthetic Isolation Team',
      '',
      '## Members',
      '',
      '| Name | Role | Charter | Status |',
      '| --- | --- | --- | --- |',
      '| Quartz Navigator | Lead | `.squad/agents/quartz-navigator/charter.md` | Active |',
      '| Moss Verifier | Quality | `.squad/agents/moss-verifier/charter.md` | Active |',
      '',
      `<!-- ${SYNTHETIC_MARKER} -->`,
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(teamDir, 'routing.md'),
    [
      '# Synthetic Routing',
      '',
      '| Work Type | Agent | Examples |',
      '| --- | --- | --- |',
      '| Runtime | Quartz Navigator | adapter, session pool |',
      '| Quality | Moss Verifier | tests, verification |',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(teamDir, 'agents', 'quartz-navigator', 'charter.md'),
    `# Quartz Navigator\n\n${SYNTHETIC_MARKER}\n`,
  );
  writeFileSync(
    join(teamDir, 'skills', 'synthetic-only', 'SKILL.md'),
    `# Synthetic-only skill\n\n${SYNTHETIC_MARKER}\n`,
  );
  for (const [path, content] of [
    ['config.json', `{"marker":"${SYNTHETIC_MARKER}"}`],
    ['decisions.md', `# Decisions\n\n${SYNTHETIC_MARKER}\n`],
    ['casting/registry.json', `{"marker":"${SYNTHETIC_MARKER}","agents":[]}`],
    ['templates/synthetic-only.md', `# Synthetic template\n\n${SYNTHETIC_MARKER}\n`],
  ]) {
    writeFileSync(join(teamDir, path), content);
  }
}

function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    env: {
      ...process.env,
      CI: 'true',
      SKIP_BUILD_BUMP: '1',
    },
    stdio: 'inherit',
  });
}

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function hashFile(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function packageManifest(root, packageDirectory) {
  const output = execFileSync(
    'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts'],
    {
      cwd: join(root, packageDirectory),
      encoding: 'utf8',
      env: { ...process.env, CI: 'true' },
    },
  );
  const result = JSON.parse(output);
  if (!Array.isArray(result) || result.length !== 1 || !Array.isArray(result[0].files)) {
    throw new Error(`Unexpected npm pack output for ${packageDirectory}`);
  }
  return result[0].files
    .map(({ path }) => {
      const file = join(root, packageDirectory, path);
      const stat = lstatSync(file);
      return {
        path,
        mode: stat.mode & 0o777,
        hash: hashFile(file),
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

function buildManifest(root) {
  run('node', ['scripts/sync-templates.mjs', '--sync'], root);
  run('npm', ['run', 'build'], root);
  run(
    'npm',
    [
      'test',
      '--',
      'test/recast-identity-neutrality.test.ts',
      'test/template-extra-classification.test.ts',
      'test/template-sync.test.ts',
      'test/cli-packaging-smoke.test.ts',
    ],
    root,
  );

  const packageDirectories = ['packages/squad-sdk', 'packages/squad-cli'];
  const packages = Object.fromEntries(
    packageDirectories.map(packageDirectory => [
      packageDirectory,
      packageManifest(root, packageDirectory),
    ]),
  );

  for (const [packageDirectory, files] of Object.entries(packages)) {
    const leaked = files
      .map(file => file.path)
      .filter(file => file === '.squad' || file.startsWith('.squad/'));
    if (leaked.length > 0) {
      throw new Error(`${packageDirectory} package includes team state: ${leaked.join(', ')}`);
    }
  }

  const outputRoots = [
    '.squad-templates',
    'templates',
    '.github/agents/squad.agent.md',
    'packages/squad-sdk/dist',
    'packages/squad-sdk/templates',
    'packages/squad-cli/dist',
    'packages/squad-cli/templates',
  ];
  const requiredOutputs = [
    '.squad-templates',
    'templates',
    '.github/agents/squad.agent.md',
    'packages/squad-sdk/dist/index.js',
    'packages/squad-sdk/dist/index.d.ts',
    'packages/squad-sdk/templates',
    'packages/squad-cli/dist/cli-entry.js',
    'packages/squad-cli/templates',
  ];
  for (const output of requiredOutputs) {
    if (!existsSync(join(root, output))) {
      throw new Error(`Expected product output is missing: ${output}`);
    }
  }

  const files = outputRoots.flatMap(path => {
    const absolute = join(root, path);
    return lstatSync(absolute).isDirectory() ? filesUnder(absolute) : [absolute];
  });

  const hashes = Object.fromEntries(
    files
      .map(file => [relative(root, file), hashFile(file)])
      .sort(([left], [right]) => left.localeCompare(right)),
  );

  for (const file of files) {
    if (readFileSync(file).includes(Buffer.from(SYNTHETIC_MARKER))) {
      throw new Error(`Synthetic team content leaked into product output: ${relative(root, file)}`);
    }
  }

  return { hashes, packages };
}

const scratch = mkdtempSync(join(tmpdir(), 'squad-team-isolation-'));
const noTeamRoot = join(scratch, 'without-team');
const syntheticTeamRoot = join(scratch, 'synthetic-team');
const liveTeamRoot = join(scratch, 'live-team');

try {
  mkdirSync(noTeamRoot);
  mkdirSync(syntheticTeamRoot);
  mkdirSync(liveTeamRoot);
  copyTrackedTree(noTeamRoot);
  copyTrackedTree(syntheticTeamRoot);
  copyTrackedTree(liveTeamRoot);
  writeSyntheticTeam(syntheticTeamRoot);
  const hasLiveTeam = copyLiveTeam(liveTeamRoot);

  const withoutTeam = buildManifest(noTeamRoot);
  const withSyntheticTeam = buildManifest(syntheticTeamRoot);

  if (JSON.stringify(withoutTeam) !== JSON.stringify(withSyntheticTeam)) {
    throw new Error('Product build or package output changed when synthetic .squad state was present');
  }

  if (hasLiveTeam) {
    const withLiveTeam = buildManifest(liveTeamRoot);
    if (JSON.stringify(withoutTeam) !== JSON.stringify(withLiveTeam)) {
      throw new Error('Product build or package output changed when the repository .squad state was present');
    }
  }

  console.log('Product build, templates, and package contents are identical without .squad and with a synthetic team.');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
