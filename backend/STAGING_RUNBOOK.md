# Radio Ava o Nava — isolated Cloudflare staging

This runbook applies to the integrated Worker in `backend/worker.js`. It supersedes the earlier PR #27 token-based Worker steps. The live radio site, production D1 and Clubhouse account must remain untouched.

## Verified local state

- Branch: `feature/radio-staging-integration-20261120`, created from local candidate `4d41848` and latest PR #27.
- `v2/request-config.json` retains empty `apiBase`, `clubEnabled=false` and false feature flags. The account portal at `v2/radio-club.html` stays inactive until a staging API URL and its separate `clubEnabled` flag are explicitly configured.
- No verified Clubhouse presence observer exists. Keep `ATTENDANCE_OBSERVER_ENABLED=false` and do not set `OBSERVER_TOKEN`.
- Cloudflare account authentication, account plan and quota must be verified before any provisioning. No Cloudflare resource was created while writing this runbook.

## Exact staging sequence

1. In the intended account, run `npx wrangler whoami`. Verify account ID and Free plan in the Cloudflare dashboard without copying credentials into logs or chat. Confirm available Worker and D1 quota. Do not upgrade or add a payment method.
2. Check the account for existing D1 databases and Workers named `ava-radio-staging`. Use a different isolated name if either already exists; never reuse a production resource.
3. From `backend`, copy `wrangler.staging.toml.example` to the ignored `wrangler.staging.toml`. Keep `RADIO_FEATURES_ENABLED`, `REGISTRATION_ENABLED` and `ATTENDANCE_OBSERVER_ENABLED` false. Set `ALLOWED_ORIGIN` to the exact future staging frontend HTTPS origin, never the live radio origin.
4. Create a **new empty staging D1**: `npx wrangler d1 create ava-radio-staging`. Put only its new ID into the ignored staging config. Verify the name and ID before any SQL command.
5. Apply each file once, in this exact order, using `--remote --config wrangler.staging.toml` and confirming the named staging target each time:
   - `npx wrangler d1 execute ava-radio-staging --remote --config wrangler.staging.toml --file=./schema.sql`
   - `npx wrangler d1 execute ava-radio-staging --remote --config wrangler.staging.toml --file=./attendance.sql`
   - `npx wrangler d1 execute ava-radio-staging --remote --config wrangler.staging.toml --file=./migrations/0002_radio_platform.sql`
6. The `0002` migration rebuilds `song_requests` and preserves legacy requests without inventing point charges. It intentionally does not import old `listener_scores` into the new ledger; those observations do not prove attendance. The migration is one-time, not idempotent. Use a fresh staging database and retain a backup before any future populated migration.
7. Set a unique random staging-only `AUTH_RATE_SECRET` with `npx wrangler secret put AUTH_RATE_SECRET --config wrangler.staging.toml`. Do not set legacy `ADMIN_TOKEN` or `IP_HASH_SECRET`; the integrated Worker does not use them. Keep `OBSERVER_TOKEN` unset.
8. Deploy only `ava-radio-staging` with `npx wrangler deploy --config wrangler.staging.toml`. With feature flags still false, verify `GET /health` and `503 service_disabled` for `/api/catalog`. Do not bind a production route or custom domain.
9. Before enabling registration or the points UI, prepare a separate HTTPS staging frontend and a same-site API origin so `Secure; SameSite=Lax` cookies work. A cross-site `workers.dev` API may not support this browser session design. Verify exact CORS origin, session cookies, wrong-origin 403, unauthorized 401, rate limiting, D1 transaction behavior, catalog validation, queue privacy, refunds and concurrent spending with invented users and dummy songs. Cloudflare Workers Free CPU limits may affect PBKDF2 authentication; measure this in staging before enabling sign-in.
10. Only after those checks, change staging-only flags deliberately. The staging frontend may set `clubEnabled=true` while the legacy `features.requests`, `queue` and `leaderboard` flags stay false. Keep the live `v2/request-config.json` disabled. Never enable Clubhouse observation or real messages without a separately verified presence source and explicit authorization.

## Rollback and boundaries

Disable the staging Worker or revert its staging version if a check fails; do not delete or change production resources. Record staging test-data retention. The existing request-song page from PR #27 retains its safe placeholder form and styling; its old submission contract must remain off. The linked `radio-club.html` account portal uses the integrated authenticated API. No automatic song playback is promised.

Official reference: Cloudflare D1 Wrangler commands and Free-plan limits should be rechecked before provisioning. Account-specific quotas and billing state cannot be inferred from public documentation.
