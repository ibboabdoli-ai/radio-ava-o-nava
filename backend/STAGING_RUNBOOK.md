# Radio Ava o Nava: isolated Cloudflare staging — NOT deployed yet

## Current blockers
- The complete Codex candidate is currently local-only: branch `feature/radio-platform-candidate`, commit `4d41848`, inside `D:\Projects\Clubbot\radio-ava-o-nava-pr27`. Do not deploy the older Worker while the local implementation is pending integration.
- No authenticated Cloudflare control-plane access is available in this conversation. Cloudflare D1 database and Worker have **not** been created.
- This PR does not authorize connecting a real Clubhouse account, changing production, paid usage, or publishing participant details.

## Stage preparation (operator checklist)
1. With Codex, reconcile the locally committed candidate with current PR #27. Preserve both contributors' changes. Review the full diff and tests before pushing a dedicated staging branch.
2. Connect **the intended Cloudflare account** securely using Wrangler on the authorized Windows PC. Never send its token through chat or commit it. Check `npx wrangler whoami`, verify account and available Free plan capacity.
3. Before any remote action confirm the target name is exactly `ava-radio-staging`, not the production Worker or D1 database. Check current resources to avoid name collisions.
4. From the reviewed `backend` directory run `npx wrangler d1 create ava-radio-staging`. Copy `wrangler.staging.toml.example` to gitignored `wrangler.staging.toml` and set the returned **new** staging database ID.
5. Set `ALLOWED_ORIGIN` to the actual isolated HTTPS staging frontend origin. Do not set this to the live site; leave the live `request-config.json` feature flags **off**.
6. Ensure migration order is compatible with the Codex candidate's `backend/migrations/0002_radio_platform.sql`. This file was *reported* by Codex but is not available in the PR; do not guess its dependencies or apply it before inspecting it.
7. Apply only the reviewed migrations against the named staging DB with explicit `--remote --config wrangler.staging.toml`. For the older draft schemas, commands are:
   - `npx wrangler d1 execute ava-radio-staging --remote --config wrangler.staging.toml --file=./schema.sql`
   - `npx wrangler d1 execute ava-radio-staging --remote --config wrangler.staging.toml --file=./attendance.sql`
   If the reconciled candidate provides new ordered migrations, use its reviewed migration plan **instead**, not both indiscriminately.
8. Set unique **staging-only** secrets using `npx wrangler secret put ADMIN_TOKEN --config wrangler.staging.toml` and `npx wrangler secret put IP_HASH_SECRET --config wrangler.staging.toml`. Never print, paste or commit secrets. Separate bot-ingestion credentials from admin before testing automatic observations.
9. After reviewing the entire configuration, run `npx wrangler deploy --config wrangler.staging.toml`. The URL should be a staging-specific workers.dev endpoint; do not bind a production custom domain or route.
10. Verify health, unauthorized admin 401, wrong-origin 403, submission 201, duplicate throttling 429, queue privacy and approval lifecycle. Test only invented users and dummy songs. Verify the HTTPS frontend against this staging API and its cookie/session protections. Keep public leaderboard and Clubhouse observation features disabled until their separate approvals.
11. Keep logs/snapshots of results and explicit rollback: disable the staging Worker or revert its version; do not delete production resources. Handle staging test data retention separately.

## Current verification boundary
Existing GitHub CI tests for the radio and club UI are passing. Offline SQLite tests in `backend/tests/test_staging_schema.py` validate the older schema only; they are **not** Cloudflare D1 runtime or end-to-end verification of the newer Codex candidate. No browser session has been validated against a real staging backend yet.

## Cost controls
Cloudflare has a Workers Free plan and D1 Free quotas. Confirm the account's plan and quotas **before** creating resources. Do not upgrade, add payment, enable paid products or exceed user-approved budget. If a free resource is unavailable, stop and report it.
