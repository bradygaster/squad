---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Fix #1142: `ralph-triage.js` hardcoded `hostname: 'api.github.com'` in its `https.request()` call, so `Squad Heartbeat (Ralph)` failed with a 401 on GitHub Enterprise (the `GITHUB_TOKEN` there is only valid against the enterprise API host, not github.com).

Added a `resolveGithubApiBase()` helper that picks the API base in order — `GITHUB_API_URL` (set by Actions on both github.com and GHE runners), then `GITHUB_SERVER_URL` + `/api/v3`, then `https://api.github.com` as a last-resort fallback — and builds the request from a `URL` object instead of a hardcoded hostname/path pair. No behavior change on github.com-hosted repos, since `GITHUB_API_URL` there already resolves to `https://api.github.com`.

Fixed in the canonical `.squad-templates/ralph-triage.js` and synced to all 3 mirror targets (`templates/`, `packages/squad-cli/templates/`, `packages/squad-sdk/templates/`).
