---
name: Security Review
domain: security
triggers: [security, xss, csrf, injection, auth, token, session, vulnerability]
roles: [lead, developer, tester]
confidence: high
---
## Security Review Patterns

Never store JWTs in localStorage — use httpOnly cookies instead.
Validate all user input on the server side, not just the client.
Use Content-Security-Policy headers to mitigate XSS.
Apply SameSite=Strict on cookies to prevent CSRF.
Rate-limit authentication endpoints.
Audit dependencies for known vulnerabilities regularly.
