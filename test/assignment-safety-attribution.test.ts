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
  permissions?: Record<string, string>;
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
  dispatchError = '',
  eventName = 'issues',
  issueLabels,
  autoAssign = true,
}: {
  label?: string; token?: string; title?: string;
  response?: unknown; requestError?: string; dispatchError?: string;
  eventName?: string; issueLabels?: string[]; autoAssign?: boolean;
} = {}) {
  const calls: string[] = [];
  const comments: string[] = [];
  const labels: string[][] = [];
  const dispatches: unknown[] = [];
  const failures: string[] = [];
  const infos: string[] = [];
  const currentLabels = issueLabels ?? (label === 'squad' ? ['squad'] : ['squad', label]);
  const issue = { number: 42, title, body: '', labels: currentLabels.map(name => ({ name })), assignees: [] };
  const context = {
    repo: { owner: 'example', repo: 'project' },
    eventName,
    payload: eventName === 'workflow_dispatch'
      ? { inputs: { issue_number: '42' }, repository: { default_branch: 'dev' } }
      : { issue, label: { name: label }, repository: { default_branch: 'dev' } },
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
      actions: {
        createWorkflowDispatch: async (input: unknown) => {
          calls.push('dispatch');
          dispatches.push(input);
          if (dispatchError) throw new Error(dispatchError);
        },
      },
      issues: {
        listForRepo: async () => ({ data: [issue] }),
        get: async () => {
          calls.push('issue-read');
          return { data: issue };
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
    '.squad/team.md': autoAssign ? team : team.replace('copilot-auto-assign: true', 'copilot-auto-assign: false'),
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
        .replace(/github\.event_name/g, 'eventName')
        .replace(/github\.event\.label\.name/g, 'label')
        .replace(/github\.event\.inputs\.issue_number/g, "'42'")
        .replace(/steps\.check-script\.outputs\.has_script/g, "'true'"),
      {
        eventName, label, startsWith: (value: string, prefix: string) => value.startsWith(prefix),
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
  return { calls, comments, labels, dispatches, failures, infos, github };
}

for (const root of roots) {
  describe(`${root}: executable assignment and attribution contract`, () => {
    const assignment = () => load(root, 'squad-issue-assign.yml');

    it('supports an issue-scoped workflow-dispatch handoff', () => {
      expect(assignment().on.workflow_dispatch, root).toMatchObject({
        inputs: { issue_number: { required: true, type: 'string' } },
      });
    });

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
      expect(result.labels, `${root}: ${input} must not repair the parent label after failure`).toEqual([]);
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

    it('repairs a missing parent label only after assignment acknowledgment using the default token', async () => {
      const result = await execute(assignment(), { issueLabels: ['squad:copilot'] });
      expect(result.failures, root).toEqual([]);
      expect(result.labels, root).toContainEqual(['squad']);
      expect(result.calls.indexOf('label'), `${root}: parent repair must follow the acknowledgment`)
        .toBeGreaterThan(result.calls.indexOf('comment'));
      const step = Object.values(assignment().jobs).flatMap(job => job.steps)
        .find(step => step.name === 'Ensure parent squad label');
      expect(step?.with?.['github-token'], `${root}: parent repair must use GITHUB_TOKEN`).toBeUndefined();
    });

    it('accepts explicit workflow-dispatch handoffs only while the Copilot label remains', async () => {
      const result = await execute(assignment(), { eventName: 'workflow_dispatch' });
      expect(result.failures, root).toEqual([]);
      expect(result.calls).toContain('agent-assignment');
      expect(result.comments.join('\n'), root).toContain('API accepted');
      expect(result.dispatches, root).toEqual([]);

      const stale = await execute(assignment(), {
        eventName: 'workflow_dispatch',
        issueLabels: ['squad'],
      });
      expect(stale.failures.join('\n'), root).toContain('refusing stale Copilot handoff');
      expect(stale.calls).not.toContain('agent-assignment');
    });

    it('preserves named member routing without requiring a Copilot token', async () => {
      const result = await execute(assignment(), { label: 'squad:moss', token: '' });
      expect(result.failures, root).toEqual([]);
      expect(result.comments.join('\n'), root).toContain('Assigned to Moss (Runtime Engineer)');
      expect(result.calls, root).not.toContain('agent-assignment');
    });

    it('manual Copilot label assignment remains available when auto-assign is disabled', async () => {
      const result = await execute(assignment(), { autoAssign: false });
      expect(result.failures, root).toEqual([]);
      expect(result.calls, root).toContain('agent-assignment');
    });

    it('heartbeat explicitly hands enabled Copilot auto-routing to issue-assign', async () => {
      const workflow = load(root, 'squad-heartbeat.yml');
      expect(workflow.on, `${root}: monitoring triggers must remain`).toMatchObject({
        issues: { types: ['closed', 'labeled'] },
        pull_request_target: { types: ['closed'] },
        workflow_dispatch: null,
      });
      const result = await execute(workflow);
      expect(result.failures, root).toEqual([]);
      expect(result.labels, `${root}: heartbeat must still apply triage decisions`).toContainEqual(['squad:copilot']);
      expect(result.dispatches, `${root}: heartbeat must explicitly dispatch issue-assign`).toHaveLength(1);
      expect(workflow.permissions?.actions, `${root}: handoff requires workflow dispatch permission`).toBe('write');
      expect(result.dispatches, root).toContainEqual({
        owner: 'example',
        repo: 'project',
        workflow_id: 'squad-issue-assign.yml',
        ref: 'dev',
        inputs: { issue_number: '42' },
      });
      expect(result.calls, `${root}: heartbeat delegates assignment to issue-assign`).not.toContain('agent-assignment');
      expect(result.calls, root).not.toContain('ordinary-assignment');

      const disabled = await execute(workflow, { autoAssign: false });
      expect(disabled.dispatches, `${root}: disabled auto-assign must not dispatch`).toEqual([]);

      const failedDispatch = await execute(workflow, { dispatchError: 'workflow dispatch denied' });
      expect(failedDispatch.failures.join('\n'), `${root}: dispatch failure must be visible`)
        .toContain('workflow dispatch denied');
    });

    it.each([
      ['bug fix', 'squad:copilot', 'matches capability profile'],
      ['refactoring', 'squad:copilot', 'needs review'],
      ['runtime session lifecycle', 'squad:moss', 'Matched routing rule'],
      ['security regression gate', 'squad:vale', 'Matched routing rule'],
      ['unknown subject', 'squad:river', 'No specific domain match'],
      ['runtime quality', 'squad:river', 'No specific domain match'],
    ])('triage "%s" preserves routing and reports deterministic provenance, not Lead analysis', async (title, label, reason) => {
      const workflow = load(root, 'squad-triage.yml');
      const result = await execute(workflow, { label: 'squad', title });
      expect(result.failures, `${root}: ${title}`).toEqual([]);
      expect(workflow.permissions?.actions, `${root}: handoff requires workflow dispatch permission`).toBe('write');
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
      expect(result.dispatches, `${root}: only auto-routed Copilot cases dispatch`).toHaveLength(
        label === 'squad:copilot' ? 1 : 0,
      );
      if (label === 'squad:copilot') {
        expect(result.dispatches, `${root}: triage must dispatch the issue-specific handoff`).toContainEqual({
          owner: 'example',
          repo: 'project',
          workflow_id: 'squad-issue-assign.yml',
          ref: 'dev',
          inputs: { issue_number: '42' },
        });
      }
    });

    it('triage preserves the disabled auto-assign mode and skips pre-owned issues', async () => {
      const workflow = load(root, 'squad-triage.yml');
      const disabled = await execute(workflow, { label: 'squad', autoAssign: false });
      expect(disabled.labels[0], root).toEqual(['squad:copilot']);
      expect(disabled.dispatches, root).toEqual([]);

      const alreadyOwned = await execute(workflow, {
        label: 'squad',
        issueLabels: ['squad', 'squad:copilot'],
      });
      expect(alreadyOwned.labels, root).toEqual([]);
      expect(alreadyOwned.comments, root).toEqual([]);
      expect(alreadyOwned.dispatches, root).toEqual([]);
    });

    it('triage fails visibly when its authorized assignment handoff is rejected', async () => {
      const result = await execute(load(root, 'squad-triage.yml'), {
        label: 'squad',
        title: 'bug fix',
        dispatchError: 'workflow dispatch denied',
      });
      expect(result.failures.join('\n'), root).toContain('workflow dispatch denied');
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
