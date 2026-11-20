# Radio Ava o Nava — isolated Cloudflare staging

This runbook applies to the integrated Worker in `backend/worker.js`. It supersedes the earlier PR #27 token-based Worker steps. The live radio site, production D1 and Clubhouse account must remain untouched.

## Verified local state

- Branch: `feature/radio-staging-integration-20261120`, created from local candidate `4d41848` and latest PR #27.
- `v2/request-config.json` retains empty `apiBase`, `clubEnabled=false` and false feature flags. The account portal at `v2/radio-club.html` stays inactive until a staging API URL and its separate `clubEnabled` flag are explicitly configured.
- No verified Clubhouse presence observer exists. Keep `ATTENDANCE_OBSERVER_ENABLED=false` and do not set `OBSERVER_TOKEN`.
- The owner reports an existing D1 database named `ava-radio-staging`, UUID `abe077d0-b360-4beb-864a-0e3ab354cfd0`, in account `6df4c7d2129ca857885972ef0028c280`. These identifiers must be verified against Cloudflare before use. Do not create another database.

## Exact staging sequence

1. In the intended account, run `npx wrangler whoami`. Verify account ID and Free plan in the Cloudflare dashboard without copying credentials into logs or chat. Confirm available Worker and D1 quota. Do not upgrade or add a payment method.
2. List D1 databases and Workers in that account. Confirm the existing `ava-radio-staging` D1 UUID is exactly `abe077d0-b360-4beb-864a-0e3ab354cfd0`; inspect its tables and migration state before writing. Check whether a Worker of that name already exists. Never create or alter a production resource.
3. From `backend`, copy `wrangler.staging.toml.example` to the ignored `wrangler.staging.toml` and insert only the verified account and database IDs. Keep `RADIO_FEATURES_ENABLED`, `REGISTRATION_ENABLED` and `ATTENDANCE_OBSERVER_ENABLED` false. Use the isolated staging Worker `workers.dev` origin for `ALLOWED_ORIGIN`, never the live radio origin.
4. Apply **only missing** schema files in this exact dependency order, using `--remote --config wrangler.staging.toml` and confirming the database name and UUID each time:
   - `npx wrangler d1 execute ava-radio-staging --remote --config wrangler.staging.toml --file=./schema.sql`
   - `npx wrangler d1 execute ava-radio-staging --remote --config wrangler.staging.toml --file=./attendance.sql`
   - `npx wrangler d1 execute ava-radio-staging --remote --config wrangler.staging.toml --file=./migrations/0002_radio_platform.sql`
5. The `0002` migration rebuilds `song_requests` and preserves legacy requests without inventing point charges. It intentionally does not import old `listener_scores` into the new ledger; those observations do not prove attendance. The migration is one-time, not idempotent. If the existing D1 contains data, take a staging-only backup and review its state before applying it.
6. Run `node scripts/prepare-staging-frontend.mjs https://ava-radio-staging.<verified-subdomain>.workers.dev`. This copies the approved `v2` UI into ignored `.wrangler/staging-frontend/v2`, writes a staging-only API config and leaves the live site unchanged. The same Worker serves static assets and API at one HTTPS origin, which supports its secure same-site session cookie.
7. Set a unique random staging-only `AUTH_RATE_SECRET` with `npx wrangler secret put AUTH_RATE_SECRET --config wrangler.staging.toml`. Do not set legacy `ADMIN_TOKEN` or `IP_HASH_SECRET`; the integrated Worker does not use them. Keep `OBSERVER_TOKEN` unset.
8. Deploy only `ava-radio-staging` with `npx wrangler deploy --config wrangler.staging.toml`. With feature flags still false, verify `GET /health`, `503 service_disabled` for `/api/catalog`, static pages, `robots.txt`, and no production route or custom domain.
9. Before enabling registration or the points UI, verify exact same-origin cookies, wrong-origin 403, unauthorized 401, rate limiting, D1 transaction behavior, catalog validation, queue privacy, refunds and concurrent spending with invented users and dummy songs. Cloudflare Workers Free CPU limits may affect PBKDF2 authentication; measure this in staging before enabling sign-in.
10. Only after those checks, change staging-only flags deliberately. The generated frontend may set `clubEnabled=true` while the legacy `features.requests`, `queue` and `leaderboard` flags stay false. Keep the live `v2/request-config.json` disabled. Never enable Clubhouse observation or real messages without a separately verified presence source and explicit authorization.

## Rollback and boundaries

Disable the staging Worker or revert its staging version if a check fails; do not delete or change production resources. Record staging test-data retention. The existing request-song page from PR #27 retains its safe placeholder form and styling; its old submission contract must remain off. The linked `radio-club.html` account portal uses the integrated authenticated API. No automatic song playback is promised.

Official reference: Cloudflare D1 Wrangler commands and Free-plan limits should be rechecked before provisioning. Account-specific quotas and billing state cannot be inferred from public documentation.
