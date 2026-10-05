# CI for the Firebase migration

`firebase-migration-verify.yml` is the deterministic, backend-only verification
gate for the Supabase -> Firebase migration. It runs on Node 20 and:

1. parses every `supabase/functions/**/*.ts` edge function with `esbuild`
   (syntax gate for the Deno-style sources),
2. runs the trusted-backend edge-function tests (`livekit-token`,
   `create-call`, `delete-account-secure`) under `tsx --test`,
3. runs the history-migration tooling tests (`tools/migration`, `node --test`),
4. validates the Firebase config JSON (`firebase.json`,
   `firestore.indexes.json`, `database.rules.json`).

## Why it lives here instead of `.github/workflows/`

The migration branch was pushed with a GitHub App installation token that does
not carry the `workflows` permission, so the App is refused when creating or
updating files under `.github/workflows/`. To keep the gate in version control
and reviewable, the workflow is committed here.

To activate it, copy the file into place on a branch pushed with a token that
has the `workflows` scope (or add it through the GitHub UI):

```sh
mkdir -p .github/workflows
cp docs/ci/firebase-migration-verify.yml .github/workflows/firebase-migration-verify.yml
git add .github/workflows/firebase-migration-verify.yml
git commit -m "ci: enable Firebase migration verification"
git push
```
