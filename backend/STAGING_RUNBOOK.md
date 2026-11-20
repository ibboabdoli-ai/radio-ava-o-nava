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
   - `migrations/0005_manual_competitions.sql` was applied once after verifying it was absent. It adds competition tables and ledger metadata without rebuilding existing tables. Do not rerun it: `ALTER TABLE` statements are not idempotent. Existing counts were confirmed before and after; see `MANUAL_POINTS_COMPETITIONS_STAGING_REPORT_20261120.md`.
5. The `0002` migration rebuilds `song_requests` and preserves legacy requests without inventing point charges. It intentionally does not import old `listener_scores` into the new ledger; those observations do not prove attendance. The migration is one-time, not idempotent. If the existing D1 contains data, take a staging-only backup and review its state before applying it.
6. Run `node scripts/prepare-staging-frontend.mjs https://ava-radio-staging.ibbo-abdoli.workers.dev` after approved UI changes. This copies the approved `v2` UI and its eight referenced install JPGs into ignored `.wrangler/staging-frontend`, writes a staging-only API config and leaves the live site unchanged. The same Worker serves static assets and API at one HTTPS origin, which supports its secure same-site session cookie.
7. A unique random staging-only `AUTH_RATE_SECRET` was uploaded with `npx wrangler secret put AUTH_RATE_SECRET --config wrangler.staging.toml`; rotate it through secure local tooling when needed. Do not set legacy `ADMIN_TOKEN` or `IP_HASH_SECRET`; the integrated Worker does not use them. Keep `OBSERVER_TOKEN` unset.
8. Deploy only `ava-radio-staging` with `npx wrangler deploy --config wrangler.staging.toml`. The initial disabled deployment returned `GET /health` 200 and `/api/catalog` 503; static pages and `robots.txt` returned 200. The current reviewed deployment has radio features on for signed-in test accounts and registration off. No production route or custom domain is bound.
9. The deployed QA checks verified same-origin cookies, wrong-origin 403, unauthorized 401, role checks, D1 transactions, queue privacy, refunds and concurrent spending with invented users and dummy songs. Registration was temporarily enabled to create two QA users, then disabled. Cloudflare rejected both Web Crypto and `node:crypto` PBKDF2 above 100,000 iterations. The current staging Worker uses built-in scrypt at OWASP-listed `N=8192, r=8, p=10`; both QA accounts upgraded on login. Password change, one-time recovery and session revocation passed HTTPS QA. See `AUTH_STAGING_VALIDATION_REPORT.md` for evidence and remaining review gates. `PRAGMA integrity_check` was refused by remote D1 with `SQLITE_AUTH`; local migration tests and remote schema/table reads succeeded.
10. Change staging-only flags deliberately. The generated frontend sets `clubEnabled=true` while the legacy `features.requests`, `queue` and `leaderboard` flags stay false. Keep the live `v2/request-config.json` disabled. Never enable Clubhouse observation or real messages without a separately verified presence source and explicit authorization.

## Rollback and boundaries

Disable the staging Worker or revert its staging version if a check fails. Record staging test-data retention. Keep the legacy request-song submission contract disabled. The linked `radio-club.html` account portal uses the integrated authenticated API.

### Local DJ and website queue

1. Verify that the named staging D1 already has the prior radio and competition schema. Check `song_catalog.genre` and `radio_dj_runtime` before applying `migrations/0007_radio_dj_queue.sql`. Apply it once after `0005_manual_competitions.sql`. The unused number 0006 is reserved for separate profile work.
2. With the migration present, set `RADIO_DJ_ENABLED = "true"` only in the verified staging config and deploy the Worker. Verify that `/api/dj/status` responds, registration and attendance remain disabled, and requests with the wrong origin are rejected. To stop the feature, revoke the player pairing and deploy with the flag false.
3. An administrator can assign a genre to each licensed catalog song and set today's genre in the management area. The day changes at midnight in Europe/Stockholm. Previously approved songs retain their place. New requests must match the selected genre.
4. Use the UUID displayed for each catalog entry as the track ID in the local DJ catalog. Keep a locally licensed audio copy beside that catalog. The files stay on the operator's computer. If the first eligible request lacks a local file, the DJ reports it and keeps the request in the queue for the operator to resolve.
5. The administrator creates a four-hour player code and pastes it into the local DJ before starting. The code is scoped to the staging queue. The dashboard shows progress for claimed website requests after the audio starts. It labels a paused track and clears the status on stop, lease expiry or natural completion. Approval charges the existing ledger once. A skipped track or file error leaves the request approved for operator review. A confirmed rejection or cancellation uses the existing refund rules.

Use **فایل مجاز روی رایانهٔ میز پخش است** for audio licensed for local playback. Confirm the rights and availability and add the matching file to the DJ catalog using the displayed UUID. The site holds metadata. The DJ checks the file before claiming the request. The manager can remove today's genre restriction without changing older days or prior requests.

### Staging DJ acceptance

Run `node backend/scripts/dj-staging-qa.mjs` with Playwright installed. Set `RADIO_STAGING_RUN_DJ_QA=1`, `RADIO_STAGING_QA_CREDENTIALS` to the locally protected file for the two existing synthetic accounts, `RADIO_DJ_BUILD_DIR` to the compiled local bot, and optionally `RADIO_TEST_CHROME` and `RADIO_STAGING_QA_EVIDENCE`. Run only when the verified staging queue and active catalog are empty and there is no DJ pairing or genre selection. The test generates original audio, charges one point to the synthetic listener for the completed request, and deactivates its catalog entries and revokes its pairing. The completed request and its audited debit remain in staging.

### Production approval checklist

- Review Draft PR #28 and the recorded staging acceptance. Confirm GitHub CI and SonarCloud are green before approving the release.
- Verify the destination account, Worker, D1 and HTTPS origin independently. Take the production D1 backup and confirm the migrations already present before any separate production approval.
- Verify the catalog rights and local files for the first show. Validate a rehearsal using the actual output device and confirm who can approve requests, pair the player, stop it and refund points.
- Approve the separate production player target before enabling the DJ. The Windows player uses staging by default. `Start-Clubbot.ps1 -RadioDjCatalog <catalog.json> -RadioDjProductionApi <verified-production-api-origin>` selects the approved production endpoint. Production pairing codes begin with `prod_` and the player checks the code before making a request.
- Keep public registration and automatic Clubhouse attendance off until separately approved. Keep challenge secrets, connection codes and recovery credentials out of logs and commits.
- Prepare the prior Worker version and the feature-off procedure. Check health, login, logout, privacy, queue and the original radio player after release.

Run `node backend/scripts/prepare-production-club.mjs <verified-production-api-origin>` after verifying the production Worker and its D1 binding. The command checks HTTPS health, credentialed CORS, anonymous access and closed registration and attendance. It prepares a config and restricted CSP in an isolated local folder. The checked-in config and the current site stay untouched. Supported production layouts use `https://radio.ibboabdoli.com` or `https://api.radio.ibboabdoli.com` after the chosen endpoint has been verified. Both keep session cookies same-site.

Before enabling access, record who may enroll users, how identity is verified and what support can do when both credentials are lost. The current recovery mechanism uses an issued one-time code. Publish the approved retention terms and contact for access or deletion requests, including account, request, points and competition data. Verify music rights for the first catalog and the audio device used in the rehearsal. Keep the production target and player pairing separate from staging and record the verified identifiers and rollback version with the manual approval.

Official reference: Cloudflare D1 Wrangler commands and Free-plan limits should be rechecked before provisioning. Account-specific quotas and billing state cannot be inferred from public documentation.

### Private production preparation

The production Worker and D1 names are both `ava-radio-production`. Verify the authorized Cloudflare account, the active zone for `ibboabdoli.com`, the current Workers Free plan and the available Worker and D1 capacity before creating either resource. Use the existing GitHub Pages deployment as the live radio during the rehearsal. Begin with DNS and public routing disabled for the new Worker.

After creating and verifying the empty, distinct D1, run `node backend/scripts/prepare-production-worker.mjs <account-id> <production-d1-uuid>`. This generates an ignored Wrangler file with every feature disabled and checks that the D1 UUID differs from staging. Before remote migrations, inspect the target schema and record the backup or recovery bookmark. Apply the base `schema.sql` and `attendance.sql` followed by 0002, 0003, 0004, 0005 and 0007 once, in that order. Create a fresh Worker rate-limit secret through the secret store and record the Worker version and rollback target. The production API hostname is bound only after authentication, policy and acceptance gates pass.

In Workers Free, a private Worker and idle D1 fit within the published free allowances. Worker invocations and D1 rows and storage consume shared account quotas when traffic starts. Verify billing for the selected account, keep the plan unchanged, and document how operators handle quota exhaustion. [Worker pricing](https://developers.cloudflare.com/workers/platform/pricing/) · [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)

### Managed authentication to evaluate

Current scrypt invocations consumed 143 and 188 ms of Worker CPU on two successful staging logins. Workers Free documents a 10 ms HTTP CPU budget. The production password cost remains unchanged while a managed path is evaluated. [Workers execution limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time)

| Option | Security and recovery | Cost and current availability | Migration and impact |
| --- | --- | --- | --- |
| Cloudflare Access | Invite approved email addresses or use a managed IdP. The Worker validates a signed JWT with the configured issuer, audience and key. The identity provider handles recovery. | The published Free plan covers up to 50 users. The accessible account returned HTTP 403 for the Access organization API. | Suggested for a small invite-only QA pilot once the team and app are verified. Keeps the existing D1 ledger and roles. Ties the access gateway to Cloudflare. [Free plan](https://www.cloudflare.com/plans/zero-trust-services/) · [JWT verification](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) |
| Supabase Auth | Managed identity, JWTs and recovery by verified email. Production email delivery needs an approved SMTP service or another verified sign-in method. | The authorized organization is on Free and both Free slots are occupied by unrelated projects. | A separate project and verified enrollment are needed. Supabase would handle identity, with points and site access rules kept in D1. [Free pricing](https://supabase.com/pricing) · [SMTP requirements](https://supabase.com/docs/guides/auth/auth-smtp) |
| Firebase Authentication | Managed identity, verified email recovery and signed ID tokens. Validate project issuer, audience, expiry and subject. | Firebase lists non-phone authentication on Spark. A Radio-owned Spark project and applicable quotas are unverified. | Requires a verified project and protected enrollment. Uses Google for identity and keeps the radio ledger in D1. [Spark pricing](https://firebase.google.com/pricing) · [Token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens) |

For a verified provider, bind each approved identity by issuer and immutable subject to its D1 user and read roles from D1. Link the original synthetic QA users only in staging after a verified enrollment step and use distinct production identities. Keep public signup closed. Test enrollment, recovery, lockout, revocation, authorization and credentialed CORS. Measure actual Worker CPU for the managed flow with margin below 10 ms before advancing the release.

### Cloudflare Access pilot on the existing staging hostname

The owner verified the `lingering-waterfall-4739` Zero Trust Free team. Its public certificate endpoint serves RS256 keys. Cloudflare describes Zero Trust Free as $0 for small teams and publishes a 50-user allowance. Its Access pricing page lists a separate paid option at $7 per user per month when billed annually. Verify free seat headroom for the two QA mailboxes in the team dashboard. The pilot uses one path and an exact email allowlist. [Pricing](https://www.cloudflare.com/sase/products/access/) · [Free allowance](https://www.cloudflare.com/) · [Worker path protection](https://developers.cloudflare.com/workers/configuration/cloudflare-access/#protect-a-specific-hostname-custom-domain-or-path)

The account API returned HTTP 200 for the application and provider listings, with zero entries in both. The seat usage API returned HTTP 401 with the available OAuth scope. The write path, actual seat headroom and invite addresses require separate verification before activation.

In Cloudflare One, go to **Access controls → Applications → Add an application → Self-hosted**. Use these values:

| Setting | Value |
| --- | --- |
| Application name | `Radio Ava o Nava - staging pilot` |
| Public hostname | `ava-radio-staging.ibbo-abdoli.workers.dev` |
| Path | `/api/auth/access/complete` |
| Application session duration | `1 hour` |
| Policy | `Radio staging QA`, action `Allow`, Include `Emails` with the original consenting QA testers' verified addresses only |
| Identity provider | `One-time PIN`, if that provider is already configured |

When One-time PIN is absent, configure it for this team before inviting testers. Verify the app settings and record the application Audience (AUD) alone in the environment reviewed for staging. [Application setup](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/) · [One-time PIN setup](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)

The staging code starts disabled. Activation requires the verified path policy, adequate seats, approval of the two staging identity bindings and the distinct staging D1 target. Apply `0008_staging_access_pilot.sql` only there after verifying the previous schema and recording its recovery bookmark. The migration creates empty tables. The operator matches the verified Access subject to the original QA D1 account and inserts that approved pair into `staging_access_identities`. Roles stay in D1. Email addresses, JWTs and raw session tokens stay out of the identity table. After verification, set `ACCESS_PILOT_AUD` to the app audience and `ACCESS_PILOT_ENABLED` to true in the isolated staging config.

Test a valid invitation, a denied address, bypass attempts without a valid assertion, session expiry, application logout, and unlinking with only the original QA accounts. The app session lasts up to 15 minutes. Cloudflare controls its own sign-in session, and the application's Logout revokes its D1 session. Disable `ACCESS_PILOT_ENABLED` to stop the flow and invalidate pilot sessions immediately. Revoke the affected QA bindings or sessions before any re-enable. Leave public registration and attendance off. Sample Worker CPU on the actual staged Access exchange and required API calls before claiming a Free-budget pass.
