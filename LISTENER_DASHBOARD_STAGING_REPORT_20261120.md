# Listener dashboard staging validation — 20 November 2026

## Scope and implementation

- Reworked the existing `v2/radio-club.html`, CSS and JavaScript into a responsive Persian RTL dashboard with desktop sidebar, compact mobile navigation, welcome panel, server-backed metrics, song discovery, queue, request history, points and attendance history, opt-in leaderboard, account controls, and admin monitoring. The existing radio player, archive and production configuration were not changed. Arymu was used as an information-architecture reference only; no source, branding or asset was copied.
- Added authenticated read-only `/api/me/dashboard` with all-time D1 totals for balance, earned and spent points, credited attendance seconds, pending and approved request counts, and the consenting user's leaderboard rank. Existing D1 tables and migrations were reused; no migration was needed.
- Added admin-only read-only `/api/admin/events` and `/api/admin/transactions`. The Worker checks the live session and admin role before either query. Public `/health` now reports whether registration and attendance observation are enabled.
- The catalog shows only existing approved songs and uses a branded music fallback because the catalog schema has no verified artwork field. The client warns on insufficient points and marks an active request, while the backend remains authoritative for duplicate requests, atomic spending and refunds.
- The login page keeps public registration hidden in static HTML and places one-time-code recovery in a collapsed disclosure with clear lost-code instructions.
- Registration and Clubhouse attendance observation remain disabled. No real Clubhouse account or message was used.

## Evidence

| Check | Result |
| --- | --- |
| Backend syntax and tests | `npm run check` passed; `npm test` 18/18, including auth races, role denial, D1 spending/refund and new dashboard totals |
| Frontend and player | `node --test v2/tests/*.test.mjs` 65/65, including archived-media and player regression checks |
| Database migration tests | Python `test_staging_schema.py` 6/6 |
| Local Chrome browser mocks | 6/6 scenarios; authenticated dashboard at 360, 390, 768 and 1440 px; no horizontal overflow or unlabeled visible controls; low-points warning and active-request button verified |
| GitHub CI on `cf5a799badd9601caaf091f8ffdbe0f5aaf86175` and final UI commit `3e9f5fa5fc12298932fd2e7737b79eab273e2246` | Four workflows passed on each: browser QA, radio v2 regression, staging schema, static checks |
| Cloudflare target | OAuth account `6df4c7d2129ca857885972ef0028c280`; existing D1 `ava-radio-staging` UUID `abe077d0-b360-4beb-864a-0e3ab354cfd0`; Worker `ava-radio-staging`; no production route or domain |
| Staging deployment | Final Worker version `583cfc32-d400-47ef-878b-78218499559a`; [portal](https://ava-radio-staging.ibbo-abdoli.workers.dev/v2/radio-club.html) |
| HTTPS smoke | `/health`, portal, CSS, JS and config 200; anonymous dashboard and admin events 401; closed registration and disabled observer 503; wrong Origin 403; allowed CORS preflight 204 |
| HTTPS authenticated QA | Invented listener login/dashboard 200; balance matched `/api/me`, pending and approved counts matched `/api/me/requests`; listener admin access 403; admin event and transaction reads 200; logout 200 and old session dashboard 401 |
| Live Chrome QA | Repeated after final deployment: listener login/logout at 390 and 1440 px, layout at 360/390/768/1440 px, admin controls and system status, mobile homepage and install images passed. Final HTML, recovery disclosure and disabled registration were verified over HTTPS |

The staging D1 readback showed two existing invented QA users, zero active catalog songs and zero attendance observations. The dashboard therefore has no verified artwork or attendance to demonstrate with real staging data. No user points or attendance were fabricated for the live environment. Browser-mock data is synthetic and is not evidence of real Clubhouse compatibility.

## Release limits

This is a dashboard candidate for production **review**, not a production release. Public registration remains disabled because verified enrollment and a safe lost-password-plus-lost-code recovery channel are absent. An independent human security/privacy review, music-rights approval, authentication-specific Cloudflare Free capacity evidence and a verified participant-presence source remain open gates. Admin events are recorded management actions, not a general Worker error-log feed. Account deletion is not implemented; users can unlink a Clubhouse identity. Keep PR #28 Draft and do not enable attendance or public registration based on this dashboard alone.
