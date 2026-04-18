# Squad Role Avatars

Pre-generated avatars for GitHub App identity. One per role.

## Files

| File | Role | Accent Color |
|------|------|-------------|
| `lead.png` | Lead / Architect | Amber `#F0883E` |
| `frontend.png` | Frontend Dev | Cyan `#58A6FF` |
| `backend.png` | Backend Dev | Green `#3FB950` |
| `tester.png` | Tester / QA | Violet `#BC8CFF` |
| `devops.png` | DevOps / Platform | Orange `#D29922` |
| `docs.png` | DevRel / Writer | Teal `#39D2C0` |
| `security.png` | Security | Red `#F85149` |
| `data.png` | Data Engineer | Blue-violet `#79C0FF` |

## How to generate

Use the copy-pastable prompts in [`../agent-avatar-prompts.md`](../agent-avatar-prompts.md#copy-pastable-prompts).

Generate at 1024×1024, then resize to 200×200 for GitHub App upload.

## How to upload

1. Go to **Settings → Developer settings → GitHub Apps → Edit** your app
2. Under **Display information** → **Upload a logo**
3. Select the matching PNG from this directory
4. Set badge background color to `#0D1117`
