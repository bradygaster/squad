import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { parse } from 'yaml';
import { describe, expect, it, vi } from 'vitest';

type Step = {
  name?: string;
  if?: string;
  env?: Record<string, string>;
  with?: { script?: string; 'github-token'?: string };
};
type Workflow = {
  on: Record<string, unknown>;
  jobs: Record<string, { if?: string; steps: Step[] }>;
};

const roots = [
  '.squad-templates',
  'templates',
  join('packages', 'squad-cli', 'templates'),
  join('packages', 'squad-sdk', 'templates'),
  '.github',
];
const team = `## Members
| Name | Role |
| --- | --- |
| River | Lead |
| Moss | Runtime Engineer |
| Vale | Quality Engineer |
## Coding Agent
🤖 Coding Agent
<!-- copilot-auto-assign: true -->
🟢 Good fit: bug fix, test coverage, documentation
🟡 Needs review: refactoring
🔴 Not suitable: security
`;
const routing = `| Work Type | Route To | Examples |
| --- | --- | --- |
| Runtime | Moss | session lifecycle |
| Quality | Vale | regression gate |
`;
const accepted = { status: 201, data: { assignees: [{ login: 'copilot-swe-agent[bot]' }] } };

function load(root: string, name: string): Workflow {
  return parse(readFileSync(join(root, 'workflows', name), 'utf8')) as Workflow;
}

async function execute(workflow: Workflow, {
  label = 'squad:copilot',
  token = 'test-pat',
  title = 'bug fix',
  response = accepted,
  requestError = '',
}: {
  label?: string; token?: string; title?: string;
  response?: unknown; requestError?: string;
} = {}) {
  const calls: string[] = [];
  const comments: string[] = [];
  const labels: string[][] = [];
  const failures: string[] = [];
  const infos: string[] = [];
  const issue = { number: 42, title, body: '', labels: [{ name: 'squad' }], assignees: [] };
  const context = {
    repo: { owner: 'example', repo: 'project' },
    payload: { issue, label: { name: label } },
  };
  const core = {
    info: (message: string) => infos.push(message),
    warning: vi.fn(),
    setSecret: vi.fn(),
    setFailed: (message: string) => failures.push(message),
  };
  const github = {
    request: vi.fn(async (...args: unknown[]) => {
      calls.push('agent-assignment');
      if (requestError) throw new Error(requestError);
      return response;
    }),
    rest: {
      rateLimit: { get: async () => ({ data: { rate: { remaining: 5000, limit: 5000, reset: 0 } } }) },
      repos: { get: async () => {
        calls.push('repo-read');
        return { data: { default_branch: 'dev' } };
      } },
      issues: {
        listForRepo: async () => ({ data: [issue] }),
        get: async () => {
          calls.push('issue-read');
          return response;
        },
        addAssignees: async () => {
          calls.push('ordinary-assignment');
          return accepted;
        },
        addLabels: async (input: { labels: string[] }) => {
          calls.push('label');
          labels.push(input.labels);
        },
        createComment: async (input: { body: string }) => {
          calls.push('comment');
          comments.push(input.body);
        },
      },
    },
  };
  const files: Record<string, string> = {
    '.squad/team.md': team,
    '.squad/routing.md': routing,
    'triage-results.json': JSON.stringify([
      { issueNumber: 42, label: 'squad:copilot', assignTo: '@copilot', reason: 'keyword', source: 'routing' },
    ]),
  };
  const fs = {
    existsSync: (file: string) => file in files,
    readFileSync: (file: string) => {
      if (!(file in files)) throw new Error(`Unexpected file read: ${file}`);
      return files[file];
    },
  };
  function condition(expression?: string) {
    if (!expression) return true;
    return Boolean(runInNewContext(
      expression
        .replace(/github\.event\.label\.name/g, 'label')
        .replace(/steps\.check-script\.outputs\.has_script/g, "'true'"),
      {
        label, startsWith: (value: string, prefix: string) => value.startsWith(prefix),
        success: () => failures.length === 0, hashFiles: () => 'fixture',
      },
    ));
  }
  for (const job of Object.values(workflow.jobs)) {
    if (!condition(job.if)) continue;
    for (const step of job.steps) {
      if (failures.length || !condition(step.if) || !step.with?.script) continue;
      const env = Object.fromEntries(Object.entries(step.env ?? {}).map(([key, value]) => {
        if (value !== '${{ secrets.COPILOT_ASSIGN_TOKEN }}') {
          throw new Error(`Unsupported env expression in ${step.name}: ${value}`);
        }
        return [key, token];
      }));
      try {
        await runInNewContext(`(async () => { ${step.with.script}\n })()`, {
          context, github, core, process: { env },
          require: (name: string) => {
            if (name !== 'fs') throw new Error(`Unexpected require: ${name}`);
            return fs;
          },
        }, { timeout: 1000 });
      } catch (error) {
        failures.push(`${step.name}: ${String(error)}`);
      }
    }
  }
  return { calls, comments, labels, failures, infos, github };
}

for (const root of roots) {
  describe(`${root}: executable assignment and attribution contract`, () => {
    const assignment = () => load(root, 'squad-issue-assign.yml');

    it('missing COPILOT_ASSIGN_TOKEN fails before any routing comment or API mutation', async () => {
      const result = await execute(assignment(), { token: '' });
      expect(result.failures.join('\n'), `${root}: missing token must visibly fail`).toContain('COPILOT_ASSIGN_TOKEN');
      expect(result.calls, `${root}: missing token must not route or attempt assignment`).toEqual([]);
    });

    it.each([
      ['API 403', accepted, '403 Resource not accessible'],
      ['missing assignee', { status: 201, data: { assignees: [] } }, ''],
      ['missing data', { status: 201 }, ''],
      ['null response', null, ''],
      ['malformed assignees', { status: 201, data: { assignees: 'copilot-swe-agent[bot]' } }, ''],
      ['ordinary bot login', { status: 201, data: { assignees: [{ login: 'copilot-swe-agent' }] } }, ''],
      ['failed status', { status: 403, data: accepted.data }, ''],
    ])('%s cannot claim handoff or fall back to ordinary assignment', async (input, response, requestError) => {
      const result = await execute(assignment(), { response, requestError });
      expect(result.failures.length, `${root}: ${input} must fail visibly`).toBeGreaterThan(0);
      expect(result.calls, `${root}: ${input} must never use ordinary bot assignment`).not.toContain('ordinary-assignment');
      expect(result.comments, `${root}: ${input} must not announce successful routing`).toEqual([]);
    });

    it('acknowledges only the verified API acceptance, after assignment, without promising a session', async () => {
      const result = await execute(assignment());
      expect(result.failures, root).toEqual([]);
      expect(result.github.request).toHaveBeenCalledExactlyOnceWith(
        'POST /repos/{owner}/{repo}/issues/{issue_number}/assignees',
        expect.objectContaining({
          assignees: ['copilot-swe-agent[bot]'],
          agent_assignment: expect.objectContaining({ target_repo: 'example/project', base_branch: 'dev' }),
        }),
      );
      expect(result.calls.indexOf('comment'), `${root}: acknowledgment must follow verified assignment`)
        .toBeGreaterThan(result.calls.indexOf('agent-assignment'));
      expect(result.comments.join('\n'), root).toContain('API accepted');
      expect(result.comments.join('\n'), root).toContain('session');
      expect(result.comments.join('\n'), root).not.toContain('will pick this up automatically');
      const step = Object.values(assignment().jobs).flatMap(job => job.steps)
        .find(step => step.name === 'Assign @copilot coding agent');
      expect(step?.with?.['github-token'], `${root}: assignment must use only the explicit PAT`)
        .toBe('${{ secrets.COPILOT_ASSIGN_TOKEN }}');
    });

    it('preserves named member routing without requiring a Copilot token', async () => {
      const result = await execute(assignment(), { label: 'squad:moss', token: '' });
      expect(result.failures, root).toEqual([]);
      expect(result.comments.join('\n'), root).toContain('Assigned to Moss (Runtime Engineer)');
      expect(result.calls, root).not.toContain('agent-assignment');
    });

    it('heartbeat monitors and labels but never assigns Copilot', async () => {
      const workflow = load(root, 'squad-heartbeat.yml');
      expect(workflow.on, `${root}: monitoring triggers must remain`).toMatchObject({
        issues: { types: ['closed', 'labeled'] },
        pull_request_target: { types: ['closed'] },
        workflow_dispatch: null,
      });
      const result = await execute(workflow);
      expect(result.failures, root).toEqual([]);
      expect(result.labels, `${root}: heartbeat must still apply triage decisions`).toContainEqual(['squad:copilot']);
      expect(result.calls, `${root}: heartbeat cannot compete with issue-assign`).not.toContain('agent-assignment');
      expect(result.calls, root).not.toContain('ordinary-assignment');
    });

    it.each([
      ['bug fix', 'squad:copilot', 'matches capability profile'],
      ['refactoring', 'squad:copilot', 'needs review'],
      ['runtime session lifecycle', 'squad:moss', 'Matched routing rule'],
      ['security regression gate', 'squad:vale', 'Matched routing rule'],
      ['unknown subject', 'squad:river', 'No specific domain match'],
      ['runtime quality', 'squad:river', 'No specific domain match'],
    ])('triage "%s" preserves routing and reports deterministic provenance, not Lead analysis', async (title, label, reason) => {
      const result = await execute(load(root, 'squad-triage.yml'), { label: 'squad', title });
      expect(result.failures, `${root}: ${title}`).toEqual([]);
      expect(result.labels, `${root}: ${title} routing changed`).toEqual([[label], ['go:needs-research']]);
      expect(result.comments.join('\n'), `${root}: ${title}`).toContain(reason);
      expect(result.comments.join('\n'), `${root}: ${title} must disclose keyword provenance`)
        .toContain('Deterministic keyword matching');
      expect(result.comments.join('\n'), `${root}: ${title}`).toContain('.squad/routing.md');
      expect(result.comments.join('\n'), `${root}: ${title} must not impersonate Lead analysis`)
        .not.toContain('Squad Triage — River');
      expect(result.calls, `${root}: ${title} labels delegate to sole assignment authority`)
        .not.toContain('ordinary-assignment');
      expect(result.calls, root).not.toContain('agent-assignment');
    });
  });
}

it('root, CLI and SDK workflow mirrors exactly match canonical source', () => {
  for (const name of ['squad-issue-assign.yml', 'squad-heartbeat.yml', 'squad-triage.yml']) {
    const canonical = readFileSync(join(roots[0], 'workflows', name), 'utf8').replace(/\r\n/g, '\n');
    for (const root of roots.slice(1, 4)) {
      expect(readFileSync(join(root, 'workflows', name), 'utf8').replace(/\r\n/g, '\n'),
        `${root}: ${name} differs from canonical source`).toBe(canonical);
    }
  }
});
