---
"@bradygaster/squad-sdk": patch
"@bradygaster/squad-cli": patch
---

Bump @types/node from ^22.0.0 to ^25.9.3 in cli and sdk packages. Removes a no-longer-needed @ts-expect-error directive in cli-entry.ts now that process.emit is properly typed.