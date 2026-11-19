# Radio Ava o Nava integration and staging verification — 20 November 2026

## Scope and state

- Integration branch: `feature/radio-staging-integration-20261120`, merging local candidate `4d41848` with PR #27 head `280ad4514fb7ae42c60bd25ce8522d5cd50a3183`.
- PR #27's current listener landing page, styling and browser tests are preserved. Its page links to the new authenticated club portal. The old request payload is disabled when the new portal is enabled.
- The integrated Worker provides account sessions, catalog, moderated song requests, atomic point spending/refunds, attendance observations from a trusted source, opt-in leaderboard and admin APIs. Its feature, registration and observer flags default to false.
- No Cloudflare staging resource was created. `CI=true npx wrangler whoami` reported no authentication, so the intended account and Free plan could not be verified.
- No Clubhouse account was connected. No real room activity, message, attendance tracking or music playback was tested.

## Verification

| Check | Result |
| --- | --- |
| Frontend Node tests | 65/65 passed |
| Backend syntax and Node tests | `npm run check` passed; 11/11 passed |
| SQLite migration tests | 6/6 passed |
| Browser tests with local Chrome and mocked API | 6 scenarios passed: four listener widths, old form mock, new portal login/catalog at 390 and 1440 px |
| Official Wrangler local D1 migrations | `schema.sql`, `attendance.sql`, `migrations/0002_radio_platform.sql` applied in that order; 3, 2 and 29 statements |
| Local Wrangler Worker, features disabled | `/health` 200, `/api/catalog` 503, allowed-origin OPTIONS 204 |
| Local Wrangler Worker, invented users and enabled flags | Registration/login, role denial, catalog, insufficient balance, credit, approval, queue, rejection/refund and wrong-origin checks matched expected responses |
| Existing Clubhouse bot | TypeScript check passed; isolated build passed; 286/286 tests passed across 32 files |

The frontend suite includes existing public archive HEAD/Range diagnostics; four recordings still report byte-range warnings under issue #15, with no failed tests. The prior bot dependency audit found 0 critical/high and 14 moderate advisories; no fresh dependency audit was run in this integration.

## Security and staging boundary

- Registration, radio features and Clubhouse attendance observer remain disabled in the staging template. No observer token or account credential is configured.
- The local D1 test used invented accounts, dummy songs and a local-only test secret. The Worker and D1 were bound to loopback or local Wrangler persistence; no remote Cloudflare resource was contacted for testing.
- Legacy requests are preserved by `0002` without assigning fictitious point charges or importing unverified old attendance scores. The migration is one-time and should target a fresh isolated staging D1.
- The browser account portal needs a same-site HTTPS staging frontend for `Secure; SameSite=Lax` cookies. A separate `workers.dev` API origin is insufficient until that session behavior is verified.
- Cloudflare Workers Free CPU behavior of the PBKDF2 login path remains unverified. A local Wrangler success does not prove it will fit the intended account's limits.
- The bot adapter has no verified Clubhouse presence feed; simulated observations must not be presented as real attendance.

## Next action

Securely authenticate Wrangler to the intended Cloudflare account on the authorized PC and verify that account's Free plan and resource quota. Then follow `backend/STAGING_RUNBOOK.md` to create an isolated D1 and Worker with all external features disabled.
