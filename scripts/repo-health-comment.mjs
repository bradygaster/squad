// scripts/repo-health-comment.mjs — zero dependencies
// Shared utility for posting/upserting repo health PR comments.
// DI pattern: run({ github, context, output, job }) for testability.

const JOBS = {
  leakage: {
    marker: '<!-- squad-repo-health-leakage -->',
    parse(output) {
      try {
        const jsonMatch = output.match(/\{[\s\S]*?\}/);
        const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { leaked: false, files: [] };
        return parsed.leaked ? parsed : null;
      } catch {
        return null;
      }
    },
    format(parsed) {
      const fileList = parsed.files.map(f => `- \`${f}\``).join('\n');
      return [
        '## ⚠️ Squad File Leakage Detected',
        '',
        'The following `.squad/` files were modified in this PR:',
        '',
        fileList,
        '',
        'These files affect team routing, agent charters, and decisions.',
        'If intentional, ensure approval from the team lead.',
      ].join('\n');
    },
  },
  architectural: {
    marker: '<!-- squad-architectural-review -->',
    parse(output) {
      try {
        const jsonMatch = output.match(/\{[\s\S]*"findings"[\s\S]*\}/);
        const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        return parsed && parsed.findings.length > 0 ? parsed : null;
      } catch {
        return null;
      }
    },
    format(parsed) {
      const severityIcon = { error: '🔴', warning: '🟡', info: 'ℹ️' };
      const rows = parsed.findings.map(f => {
        const icon = severityIcon[f.severity] || '❓';
        const files = f.files.length > 0
          ? f.files.map(fi => `\`${fi}\``).join(', ')
          : '—';
        return `| ${icon} ${f.severity} | **${f.category}** | ${f.message} | ${files} |`;
      });
      return [
        '## 🏗️ Architectural Review',
        '',
        parsed.summary,
        '',
        '| Severity | Category | Finding | Files |',
        '|----------|----------|---------|-------|',
        ...rows,
        '',
        '---',
        '*Automated architectural review — informational only.*',
      ].join('\n');
    },
  },
  security: {
    marker: '<!-- squad-security-review -->',
    parse(output) {
      try {
        const jsonMatch = output.match(/\{[\s\S]*"findings"[\s\S]*\}/);
        const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        return parsed && parsed.findings.length > 0 ? parsed : null;
      } catch {
        return null;
      }
    },
    format(parsed) {
      const severityIcon = { error: '🔴', warning: '🟡', info: 'ℹ️' };
      const rows = parsed.findings.map(f => {
        const icon = severityIcon[f.severity] || '❓';
        const loc = f.line ? `\`${f.file}:${f.line}\`` : (f.file ? `\`${f.file}\`` : '—');
        return `| ${icon} ${f.severity} | **${f.category}** | ${f.message} | ${loc} |`;
      });
      return [
        '## 🔒 Security Review',
        '',
        parsed.summary,
        '',
        '| Severity | Category | Finding | Location |',
        '|----------|----------|---------|----------|',
        ...rows,
        '',
        '---',
        '*Automated security review — informational only.*',
      ].join('\n');
    },
  },
};

/**
 * Post or update a repo health comment on a PR.
 * @param {object} opts
 * @param {object} opts.github  Octokit instance (DI)
 * @param {object} opts.context GitHub Actions context (DI)
 * @param {string} opts.output  Raw output from the check step
 * @param {string} opts.job     'leakage' | 'architectural' | 'security'
 */
export async function run({ github, context, output, job }) {
  const config = JOBS[job];
  if (!config) throw new Error(`Unknown repo-health job type: ${job}`);

  const parsed = config.parse(output);

  // Fetch all comments (paginated) to find existing marker
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.issue.number,
    per_page: 100,
  });
  const existing = comments.find(c => c.body && c.body.includes(config.marker));

  // No findings — clean up stale marker comment if one exists
  if (!parsed) {
    if (existing) {
      await github.rest.issues.deleteComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        comment_id: existing.id,
      });
    }
    return;
  }

  const body = `${config.marker}\n${config.format(parsed)}`;

  if (existing) {
    await github.rest.issues.updateComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: existing.id,
      body,
    });
  } else {
    await github.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.issue.number,
      body,
    });
  }
}
