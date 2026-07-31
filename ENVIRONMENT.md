# Environment setup

1. Copy `.env.example` to `.env` in the project root:

```bash
cp .env.example .env
```

2. Fill in the real values in `.env`. Do NOT commit `.env` — it is already ignored by `.gitignore`.

3. CI / GitHub Actions: this repository reads sensitive environment variables from GitHub Secrets. To deploy or run CI builds that require these variables, add the matching secrets in the repository settings (for example `VITE_SUPABASE_URL`, `VITE_FIREBASE_API_KEY`, `VITE_TURN_SERVER_CREDENTIAL`, etc.).

4. Notes on TURN and WebRTC:
- `VITE_TURN_SERVER_URL` should use `turn:` or `turns:` scheme depending on your server.
- Keep TURN credentials secret — do not commit them.

5. Local development:
- Use the local `.env` for dev work. For production/staging builds, use CI secrets and do not commit secrets to the repo or PRs.