---
"@bradygaster/squad-sdk": minor
---

feat(sdk): Add Microsoft Teams communication adapter

BREAKING: `createCommunicationAdapter` is now async (returns `Promise<CommunicationAdapter>`).
Callers must await the result.

New Teams adapter for bidirectional chat via Microsoft Graph API.
Supports browser auth (PKCE), device code flow, token caching,
1:1 chat and channel messaging.
