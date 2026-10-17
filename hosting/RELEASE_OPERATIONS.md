# Verified native release rollout

The app is native Android. Firebase Hosting serves the website, download redirects
and update registry. Signed APK/AAB files are mirrored to immutable GitHub Releases.
Google Play publishing is a separate account operation.

1. Require the client release/unit and emulator checks to pass. Compare the CI
   source snapshot with the intended native source. Sign the compact APK and normal
   AAB with the pinned existing certificate, then verify package/version, signatures,
   native alignment, byte sizes and SHA-256 hashes.
2. Use `prepare_android_release.py` to prepare version labels, registry and redirects.
   Keep the Play channel version unchanged until a Play rollout is actually available.
3. Temporarily deploy `release_upload.ts` with a generated `release_config.mjs`
   containing exact non-secret file sizes/hashes, version and short deadline. Retain
   gateway JWT verification. Also require a Google-signed ID token whose audience,
   publisher email and numeric subject match `release_publisher_identity.mjs` checks.
   Never place private keys, access tokens or signed identity tokens in source control.
4. Stage only the APK, checksums and signature report in the existing public release
   bucket. Verify public bytes. Merge the prepared rollout so the publication workflow
   verifies signatures and mirrors the APK, checksums and source to GitHub Releases.
5. Verify the GitHub APK's size/hash, then remove only that newly staged duplicate.
   The temporary operation handler independently verifies the GitHub mirror before
   permitting deletion of its pinned new-version binary. Older releases and user media
   are outside its allowlist. This keeps staging below the current storage allowance.
6. Stage the AAB, add its verified GitHub URL/hash/size under registry `artifacts.aab`,
   and run the publication workflow again by merging the registry update. GitHub
   releases are immutable: existing APK assets must match exactly, and the AAB is
   published as a separate `bundle-VERSION` companion release with `--latest=false`.
   Verify the GitHub AAB and remove only its newly staged duplicate. Retire the temporary
   operation endpoint immediately with JWT enforcement retained.
7. `deploy_verified_release.py` refuses partial rollout metadata: both GitHub APK and
   AAB must exist with pinned bytes. It stages a Hosting version and, with `--publish`,
   makes it live only if no intervening release replaced the previously observed one.
   Google authorization headers are sent only to allowlisted Google API hosts; public
   artifact downloads use separate unauthenticated requests. Retain the deployment
   receipt and previous Hosting version for rollback.
8. Verify the live first-party registry, download redirects, asset hashes and signing
   identity. Publishing a registry makes the update discoverable by update-aware
   installed clients; installation still requires the user's Android confirmation.

`release_backend_preflight.ts` is a temporary, publisher-authenticated validation
handler. It creates isolated `.invalid` test accounts, tests real media transfer and
Firebase identity/configuration, then removes its own fixtures. It must be retired
after use. It never sends notifications to existing users.

No billing-plan increase, storage-policy widening, old-release deletion, database
reset or bulk historical migration replay is part of this rollout. Hardware update
preservation, real push delivery/calling, Play internal testing and historical
migration reconciliation remain separate qualification work.
