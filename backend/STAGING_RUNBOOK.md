# Radio Ava o Nava — isolated Cloudflare staging

This runbook applies to the integrated Worker in `backend/worker.js`. It supersedes the earlier PR #27 token-based Worker steps. The live radio site, production D1 and Clubhouse account must remain untouched.

## Verified local state

- Branch: `feature/radio-staging-integration-20261120`, created from local candidate `4d41848` and latest PR #27.
- `v2/request-config.json` retains empty `apiBase`, `clubEnabled=false` and false feature flags. The account portal at `v2/radio-club.html` stays inactive until a staging API URL and its separate `clubEnabled` flag are explicitly configured.
- No verified Clubhouse presence observer exists. Keep `ATTENDANCE_OBSERVER_ENABLED=false` and do not set `OBSERVER_TOKEN`.
- The existing D1 database `ava-radio-staging` (UUID `abe077d0-b360-4beb-864a-0e3ab354cfd0`) and account `6df4c7d2129ca857885972ef0028c280` were verified through Wrangler. The account dashboard showed Workers Free as the current plan. Do not create another database.
- The staging Worker and approved UI are deployed at `https://ava-radio-staging.ibbo-abdoli.workers.dev`, with `RADIO_FEATURES_ENABLED=true`, `REGISTRATION_ENABLED=false`, `ATTENDANCE_OBSERVER_ENABLED=false`, and preview URLs disabled. `AUTH_RATE_SECRET` is stored only as a Worker secret. The live radio site is unchanged.

## Exact staging sequence

1. In the intended account, run `npx wrangler whoami`. Verify account ID and Free plan in the Cloudflare dashboard without copying credentials into logs or chat. Confirm available Worker and D1 quota. Do not upgrade or add a payment method.
2. List D1 databases and Workers in that account. Confirm the existing `ava-radio-staging` D1 UUID is exactly `abe077d0-b360-4beb-864a-0e3ab354cfd0`; inspect its tables and migration state before writing. Check whether a Worker of that name already exists. Never create or alter a production resource.
3. From `backend`, copy `wrangler.staging.toml.example` to the ignored `wrangler.staging.toml` and insert only the verified account and database IDs. The template starts with all feature flags false; the current tested staging deployment has radio features true, registration false and observer false. Use the isolated staging Worker `workers.dev` origin for `ALLOWED_ORIGIN`, never the live radio origin.
4. The following files were applied in order on 20 November 2026. For a future replacement database, apply **only missing** schema files in this dependency order, using `--remote --config wrangler.staging.toml` and confirming the database name and UUID each time. **Do not rerun `0002` on the current D1:**
   - `npx wrangler d1 execute ava-radio-staging --remote --config wrangler.staging.toml --file=./schema.sql`
   - `npx wrangler d1 execute ava-radio-staging --remote --config wrangler.staging.toml --file=./attendance.sql`
   - `npx wrangler d1 execute ava-radio-staging --remote --config wrangler.staging.toml --file=./migrations/0002_radio_platform.sql`
   - `npx wrangler d1 execute ava-radio-staging --remote --config wrangler.staging.toml --file=./migrations/0003_auth_recovery.sql`
   - `npx wrangler d1 execute ava-radio-staging --remote --config wrangler.staging.toml --file=./migrations/0004_auth_atomic_recovery.sql`
5. The `0002` migration rebuilds `song_requests` and preserves legacy requests without inventing point charges. It intentionally does not import old `listener_scores` into the new ledger; those observations do not prove attendance. The migration is one-time, not idempotent. If the existing D1 contains data, take a staging-only backup and review its state before applying it.
6. Run `node scripts/prepare-staging-frontend.mjs https://ava-radio-staging.ibbo-abdoli.workers.dev` after approved UI changes. This copies the approved `v2` UI and its eight referenced install JPGs into ignored `.wrangler/staging-frontend`, writes a staging-only API config and leaves the live site unchanged. The same Worker serves static assets and API at one HTTPS origin, which supports its secure same-site session cookie.
7. A unique random staging-only `AUTH_RATE_SECRET` was uploaded with `npx wrangler secret put AUTH_RATE_SECRET --config wrangler.staging.toml`; rotate it through secure local tooling when needed. Do not set legacy `ADMIN_TOKEN` or `IP_HASH_SECRET`; the integrated Worker does not use them. Keep `OBSERVER_TOKEN` unset.
8. Deploy only `ava-radio-staging` with `npx wrangler deploy --config wrangler.staging.toml`. The initial disabled deployment returned `GET /health` 200 and `/api/catalog` 503; static pages and `robots.txt` returned 200. The current reviewed deployment has radio features on for signed-in test accounts and registration off. No production route or custom domain is bound.
9. The deployed QA checks verified same-origin cookies, wrong-origin 403, unauthorized 401, role checks, D1 transactions, queue privacy, refunds and concurrent spending with invented users and dummy songs. Registration was temporarily enabled to create two QA users, then disabled. Cloudflare rejected both Web Crypto and `node:crypto` PBKDF2 above 100,000 iterations. The current staging Worker uses built-in scrypt at OWASP-listed `N=8192, r=8, p=10`; both QA accounts upgraded on login. Password change, one-time recovery and session revocation passed HTTPS QA. See `AUTH_STAGING_VALIDATION_REPORT.md` for evidence and remaining review gates. `PRAGMA integrity_check` was refused by remote D1 with `SQLITE_AUTH`; local migration tests and remote schema/table reads succeeded.
10. Change staging-only flags deliberately. The generated frontend sets `clubEnabled=true` while the legacy `features.requests`, `queue` and `leaderboard` flags stay false. Keep the live `v2/request-config.json` disabled. Never enable Clubhouse observation or real messages without a separately verified presence source and explicit authorization.

## Rollback and boundaries

Disable the staging Worker or revert its staging version if a check fails; do not delete or change production resources. Record staging test-data retention. The existing request-song page from PR #27 retains its safe placeholder form and styling; its old submission contract must remain off. The linked `radio-club.html` account portal uses the integrated authenticated API. No automatic song playback is promised.

Official reference: Cloudflare D1 Wrangler commands and Free-plan limits should be rechecked before provisioning. Account-specific quotas and billing state cannot be inferred from public documentation.
