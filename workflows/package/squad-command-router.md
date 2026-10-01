---
name: Squad Command Router
description: Discover /squad commands outside the start-only slash-command activation path
on:
  roles: all
  issues:
    types:
      - opened
      - edited
      - reopened
  issue_comment:
    types:
      - created
      - edited
if: |-
  (
    github.event_name == 'issues' &&
    contains(github.event.issue.body, '/squad') &&
    !(startsWith(github.event.issue.body, '/squad ') ||
      startsWith(github.event.issue.body, '/squad\n') ||
      startsWith(github.event.issue.body, '/squad\r') ||
      github.event.issue.body == '/squad') &&
    !(github.actor == 'github-actions[bot]' &&
      github.event.issue.title == '[Research Proposals] Agent-discovered repo opportunities' &&
      contains(github.event.issue.body, '<!-- squad:bootstrap-opportunities schema=1 -->'))
  ) || (
    github.event_name == 'issue_comment' &&
    contains(github.event.comment.body, '/squad') &&
    !(startsWith(github.event.comment.body, '/squad ') ||
      startsWith(github.event.comment.body, '/squad\n') ||
      startsWith(github.event.comment.body, '/squad\r') ||
      github.event.comment.body == '/squad')
  )
permissions:
  contents: read
  copilot-requests: write
safe-outputs:
  steps:
    - name: Checkout executing workflow commit for command routing
      uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
      with:
        ref: ${{ github.workflow_sha }}
        persist-credentials: false
        path: .squad-command-trusted-base
    - name: Route or reject discovered command
      uses: actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3
      env:
        SQUAD_EVENT_NAME: ${{ github.event_name }}
      with:
        script: |
          const nodePath = require('node:path');
          const { pathToFileURL } = require('node:url');
          const trustedRoot = nodePath.join(process.env.GITHUB_WORKSPACE, '.squad-command-trusted-base');
          const contract = await import(pathToFileURL(nodePath.join(
            trustedRoot,
            '.github/workflows/shared/squad-command-contract.mjs',
          )).href);
          const result = contract.classifySquadCommand(
            context.payload,
            process.env.SQUAD_EVENT_NAME,
          );
          const issueNumber = Number(context.payload.issue?.number);
          if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
            core.setFailed('Squad command discovery requires a valid issue or pull request number.');
            return;
          }
          if (result.status === 'rejected') {
            await github.rest.issues.createComment({
              ...context.repo,
              issue_number: issueNumber,
              body: contract.rejectionComment(result),
            });
            core.setFailed(`Squad rejected command: ${result.rejectedCommand}`);
            return;
          }
          if (result.status !== 'accepted') {
            core.info('No standalone Squad command was found after excluding code contexts.');
            return;
          }
          if (contract.commandRequiresAuthorization(result)) {
            const eventActor = typeof context.actor === 'string' && context.actor.trim()
              ? context.actor.trim()
              : null;
            const commandAuthorCandidate = process.env.SQUAD_EVENT_NAME === 'issue_comment'
              ? context.payload.comment?.user?.login
              : process.env.SQUAD_EVENT_NAME === 'issues'
                ? context.payload.issue?.user?.login
                : null;
            const commandAuthor = typeof commandAuthorCandidate === 'string' && commandAuthorCandidate.trim()
              ? commandAuthorCandidate.trim()
              : null;
            const permissionByLogin = new Map();
            const resolvePermission = async (login, principal) => {
              if (!login) return 'unresolved';
              if (permissionByLogin.has(login)) return permissionByLogin.get(login);
              let permission = 'unresolved';
              try {
                permission = (await github.rest.repos.getCollaboratorPermissionLevel({
                  ...context.repo,
                  username: login,
                })).data.permission || 'unresolved';
              } catch (error) {
                core.warning(`Unable to resolve repository permission for ${principal} ${login}: ${error.message}`);
              }
              permissionByLogin.set(login, permission);
              return permission;
            };
            const actorPermission = await resolvePermission(eventActor, 'event actor');
            const authorPermission = await resolvePermission(commandAuthor, 'command author');
            const actorAuthorized = Boolean(eventActor) &&
              contract.isAuthorizedPermission(actorPermission);
            const authorAuthorized = Boolean(commandAuthor) &&
              contract.isAuthorizedPermission(authorPermission);
            if (!actorAuthorized || !authorAuthorized) {
              const actorEvidence = eventActor
                ? `@${eventActor} (${actorPermission})`
                : 'unresolved (unresolved)';
              const authorEvidence = commandAuthor
                ? `@${commandAuthor} (${authorPermission})`
                : 'unresolved (unresolved)';
              await github.rest.issues.createComment({
                ...context.repo,
                issue_number: issueNumber,
                body: `⛔ /squad ${result.argumentText || 'cast'} was refused. Mutating /squad modes require write, maintain, or admin repository permission for both the event actor and the author of the classified command text. Event actor: ${actorEvidence}; command author: ${authorEvidence}. Ask a repository maintainer to author and run this command.`,
              });
              core.setFailed(
                `Squad refused mutating mode ${result.mode}; event actor ${eventActor || 'unresolved'}=${actorPermission}, command author ${commandAuthor || 'unresolved'}=${authorPermission}.`,
              );
              return;
            }
          }
          // Forward the originating comment (when this run was triggered by
          // one) through the typed `aw_context` relay input. The dispatched
          // squad.md run has no native `comment` event of its own, so without
          // this, `/squad approve-improvement` relayed here can never supply
          // a real `approval_comment_id` (#3). `comment_id` is read back by
          // the worker-side gate, which re-fetches and independently
          // re-validates the live comment before trusting anything — the
          // relay only carries a pointer, never the approval itself.
          const awContext = JSON.stringify({
            item_type: context.payload.issue?.pull_request ? 'pull_request' : 'issue',
            item_number: issueNumber,
            comment_id: context.payload.comment?.id ?? null,
          });
          await github.rest.actions.createWorkflowDispatch({
            ...context.repo,
            workflow_id: 'squad.lock.yml',
            ref: context.payload.repository.default_branch,
            inputs: {
              command: result.argumentText || 'cast',
              issue_number: String(issueNumber),
              aw_context: awContext,
            },
          });
  add-comment:
    max: 1
    target: "*"
  dispatch-workflow:
    workflows:
      - squad
    max: 1
  noop:
    max: 1
---

<!-- Generated by the Squad integrity tool. Edit workflows/*.md and run npm run gh-aw:integrity:write. -->
Command routing and rejection are enforced deterministically by the safe-output
guard. Call `noop` with the message `Deterministic Squad command routing complete.`
and emit no other output.
