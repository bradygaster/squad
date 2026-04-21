/**
 * Sample: Issue Pipeline capability
 *
 * Copy to .squad/capabilities/issue-pipeline.js to use.
 * Enforces: issue → branch → implement → PR → review → merge
 *
 * Each LLM invocation is a fresh copilot session — no drift.
 */

export default {
  name: 'issue-pipeline',
  description: 'Deterministic issue→branch→PR→review→merge pipeline',
  configShape: 'object',
  requires: ['gh'],
  phase: 'post-triage',

  async preflight(context) {
    // Check gh CLI is available
    try {
      const { execFileSync } = await import('node:child_process');
      execFileSync('gh', ['--version'], { stdio: 'ignore' });
      return { ok: true };
    } catch {
      return { ok: false, reason: 'gh CLI not available' };
    }
  },

  async execute(context) {
    // This is a reference implementation — customize for your workflow
    const { execFileSync } = await import('node:child_process');

    // Find issues that are triaged but don't have a PR yet
    // (Real implementation would check for squad labels, existing PRs, etc.)

    return {
      success: true,
      summary: 'Issue pipeline: checked for actionable issues (sample — customize for your workflow)',
    };
  },
};
