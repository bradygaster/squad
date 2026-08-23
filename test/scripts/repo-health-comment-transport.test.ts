import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compileFunction, constants as vmConstants } from 'node:vm';

// Regression coverage for #1770.
//
// `actions/github-script` compiles the `script:` body with `new AsyncFunction(...)`.
// Anything a workflow interpolates into that body via `${{ ... }}` becomes JavaScript
// *source*, so a finding message that quotes code in backticks terminates the enclosing
// template literal and the rest of the report is parsed as code
// (`SyntaxError: Unexpected identifier 'git'`).
//
// These tests run the real workflow script text through the real reporter, so they fail
// against the pre-fix workflow and only pass while report content travels through the
// step environment instead of the script source.

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const workflowsDir = join(repoRoot, '.github', 'workflows');

interface Step {
  name: string;
  indent: number;
  body: string[];
}

function readWorkflow(file: string): string {
  return readFileSync(join(workflowsDir, file), 'utf-8');
}

/** Split a workflow into named steps using YAML block indentation. */
function parseSteps(text: string): Step[] {
  const steps: Step[] = [];
  let current: Step | null = null;

  for (const line of text.split(/\r?\n/)) {
    const start = line.match(/^(\s*)- name:\s*(.*)$/);
    if (start) {
      if (current) steps.push(current);
      current = { name: start[2].trim(), indent: start[1].length, body: [line] };
      continue;
    }
    if (!current) continue;
    if (line.trim() === '') {
      current.body.push(line);
      continue;
    }
    const indent = line.match(/^\s*/)![0].length;
    if (indent <= current.indent) {
      steps.push(current);
      current = null;
      continue;
    }
    current.body.push(line);
  }
  if (current) steps.push(current);
  return steps;
}

/** Read the `env:` mapping of a step (raw values, expressions unresolved). */
function stepEnv(step: Step): Record<string, string> {
  const env: Record<string, string> = {};
  const index = step.body.findIndex((line) => /^\s*env:\s*$/.test(line));
  if (index < 0) return env;

  const indent = step.body[index].match(/^\s*/)![0].length;
  for (let i = index + 1; i < step.body.length; i++) {
    const line = step.body[i];
    if (line.trim() === '') continue;
    if (line.match(/^\s*/)![0].length <= indent) break;
    const pair = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (pair) env[pair[1]] = pair[2].trim();
  }
  return env;
}

/** Read the `script: |` literal block of a step, dedented. */
function stepScript(step: Step): string | null {
  const index = step.body.findIndex((line) => /^\s*script:\s*\|\s*$/.test(line));
  if (index < 0) return null;

  const indent = step.body[index].match(/^\s*/)![0].length;
  const lines: string[] = [];
  for (let i = index + 1; i < step.body.length; i++) {
    const line = step.body[i];
    if (line.trim() === '') {
      lines.push('');
      continue;
    }
    if (line.match(/^\s*/)![0].length <= indent) break;
    lines.push(line.slice(indent + 2));
  }
  return lines.join('\n');
}

/** Apply GitHub Actions `${{ }}` expression substitution, as the runner does. */
function substitute(text: string, values: Record<string, string>): string {
  return text.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_match, expression: string) => {
    const key = expression.trim();
    if (!(key in values)) throw new Error(`Test does not model expression: ${key}`);
    return values[key];
  });
}

function makeOctokit() {
  const created: Array<{ body: string }> = [];
  const updated: Array<{ body: string }> = [];
  const github = {
    paginate: async () => [] as Array<{ id: number; body: string }>,
    rest: {
      issues: {
        listComments: () => undefined,
        createComment: async (params: { body: string }) => {
          created.push(params);
        },
        updateComment: async (params: { body: string }) => {
          updated.push(params);
        },
        deleteComment: async () => undefined,
      },
    },
  };
  return { github, created, updated };
}

const context = { repo: { owner: 'bradygaster', repo: 'squad' }, issue: { number: 1770 } };

/**
 * Execute a workflow script body exactly the way `actions/github-script` does:
 * compile the resolved text as an async function and invoke it.
 */
async function runWorkflowScript(step: Step, values: Record<string, string>) {
  const script = stepScript(step);
  expect(script, `step "${step.name}" has no script block`).toBeTruthy();

  const env = stepEnv(step);
  const previous: Record<string, string | undefined> = {};
  const applied: Record<string, string> = { GITHUB_WORKSPACE: pathToFileURL(repoRoot).href };
  for (const [key, raw] of Object.entries(env)) applied[key] = substitute(raw, values);

  for (const [key, value] of Object.entries(applied)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }

  const octokit = makeOctokit();
  try {
    // `actions/github-script` compiles the body as an async function body. We do the
    // same, via `vm.compileFunction` so that the `await import(...)` in the body can
    // resolve. Compilation — not execution — is where the pre-fix bug detonates:
    // a backtick in the report closes the template literal and the rest of the JSON
    // is parsed as code.
    const compiled = compileFunction(
      `return (async () => {\n${substitute(script!, values)}\n})();`,
      ['github', 'context', 'core'],
      { importModuleDynamically: vmConstants.USE_MAIN_CONTEXT_DEFAULT_LOADER },
    ) as (...args: unknown[]) => Promise<unknown>;
    await compiled(octokit.github, context, { info: () => undefined });
  } finally {
    for (const key of Object.keys(applied)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }

  return octokit;
}

// Every hostile character that has ever shown up in a real finding message:
// a backtick pair (quoted code), a bare `${` (template substitution opener),
// an apostrophe, a double quote, and an embedded newline.
//
// The quoted command below is deliberately one the security scanner does NOT
// flag. These fixtures are added lines in the PR diff, so quoting a command on
// the scanner's unsafe-git denylist makes it emit a real finding against this
// very file — and that finding is itself backtick-wrapped, which crashes the
// base-branch reporter. Keep the backticks; keep the command boring.
const HOSTILE_MESSAGE =
  'Unsafe git operation: `git cherry-pick --no-commit` — quoting `code` here, ' +
  'plus a bare ${ opener, an apostrophe \' and a "double quote".\nSecond line of the message.';

const HOSTILE_PATH = 'docs/using-`git cherry-pick`-and-${-in-a-name.md';

function securityReport() {
  const payload = {
    findings: [
      {
        category: 'unsafe-git',
        severity: 'error',
        message: HOSTILE_MESSAGE,
        file: 'scripts/demo.sh',
        line: 12,
      },
    ],
    summary: '🔒 Security review: 1 error(s).',
  };
  return `${JSON.stringify(payload, null, 2)}\n\n${payload.summary}`;
}

function architecturalReport() {
  const payload = {
    findings: [
      {
        category: 'layering',
        severity: 'warning',
        message: HOSTILE_MESSAGE,
        files: ['packages/squad-cli/src/demo.ts'],
      },
    ],
    summary: '🏗️ Architectural review: 1 warning(s).',
  };
  return `${JSON.stringify(payload, null, 2)}\n\n${payload.summary}`;
}

function leakageReport() {
  return JSON.stringify({ leaked: true, files: [HOSTILE_PATH] }, null, 2);
}

function findStep(file: string, predicate: (step: Step) => boolean): Step {
  const step = parseSteps(readWorkflow(file)).find(predicate);
  expect(step, `no matching step found in ${file}`).toBeTruthy();
  return step!;
}

describe('repo-health reporters survive hostile finding content (#1770)', () => {
  it('reports a security finding whose message contains backticks', async () => {
    const step = findStep(
      'squad-repo-health.yml',
      (s) => (stepScript(s) ?? '').includes("job: 'security'"),
    );
    const report = securityReport();

    const { created } = await runWorkflowScript(step, {
      'steps.security.outputs.result': report,
    });

    expect(created).toHaveLength(1);
    expect(created[0].body).toContain('<!-- squad-security-review -->');
    expect(created[0].body).toContain(HOSTILE_MESSAGE);
  });

  it('reports an architectural finding whose message contains backticks', async () => {
    const step = findStep(
      'squad-repo-health.yml',
      (s) => (stepScript(s) ?? '').includes("job: 'architectural'"),
    );

    const { created } = await runWorkflowScript(step, {
      'steps.arch.outputs.result': architecturalReport(),
    });

    expect(created).toHaveLength(1);
    expect(created[0].body).toContain('<!-- squad-architectural-review -->');
    expect(created[0].body).toContain(HOSTILE_MESSAGE);
  });

  it('reports leaked squad files whose paths contain backticks', async () => {
    const step = findStep(
      'squad-repo-health.yml',
      (s) => (stepScript(s) ?? '').includes("job: 'leakage'"),
    );

    const { created } = await runWorkflowScript(step, {
      'steps.leakage.outputs.result': leakageReport(),
    });

    expect(created).toHaveLength(1);
    expect(created[0].body).toContain('<!-- squad-repo-health-leakage -->');
    expect(created[0].body).toContain(HOSTILE_PATH);
  });
});

describe('hand-written github-script bodies never embed workflow expressions', () => {
  // Structural guard: `${{ }}` inside a script body means untrusted-shaped data can
  // become part of the parsed script. Pass it through `env:` instead.
  for (const file of ['squad-repo-health.yml', 'squad-impact.yml']) {
    it(`${file} keeps all interpolation out of script bodies`, () => {
      const offenders = parseSteps(readWorkflow(file))
        .filter((step) => (stepScript(step) ?? '').includes('${{'))
        .map((step) => step.name);

      expect(offenders).toEqual([]);
    });
  }
});
