This PR improves real-time calling, chat performance, and dependency hygiene.

Summary
- Improves WebRTC media constraints, transceiver usage, and error handling (`src/lib/webrtc.ts`).
- Replaces fragile list-windowing with `react-virtuoso` where applicable and fixes incremental message merge (`src/components/...`, `src/store/useChatStore.ts`).
- Adds `.copilot-assistant/instances.json` to assist local Copilot workflows.
- Adds safe `.env.example` and `ENVIRONMENT.md` to document environment variables and avoid committing secrets.
- Upgrades a small set of dev/runtime packages (non-breaking patches applied).

How to test locally
1. Copy the environment example:

```bash
cp .env.example .env
# fill in real values in .env for Supabase, Firebase, TURN server, etc.
```

2. Install and build:

```bash
npm ci
npm run build
```

3. Run local dev server:

```bash
npm run dev
```

CI and Node version
- CI workflows are pinned to Node 20 (`actions/setup-node@v4` with `node-version: '20'`).
- If you run into engine warnings locally, use Node 20 to match CI.

Secrets and deploy
- Do NOT commit `.env` with real secrets. Add required variables to GitHub Secrets for CI deploys.
- The GitHub Actions workflow uses secrets like `VITE_SUPABASE_URL`, `VITE_FIREBASE_API_KEY`, and `VITE_TURN_SERVER_CREDENTIAL` during build and deploy.

Next steps
- Run integration tests for WebRTC with TURN server configured in staging.
- Prepare follow-up PRs for semver-major dependency upgrades flagged by `npm audit`.

Notes
- This PR intentionally avoids committing real secret values. Use `.env` locally and GitHub Secrets in CI.