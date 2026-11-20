# Cloudflare staging deployment — 20 November 2026

This is the initial deployment snapshot. The subsequent authentication fix, D1 migrations `0003` and `0004`, and current Worker version are recorded in [AUTH_STAGING_VALIDATION_REPORT.md](AUTH_STAGING_VALIDATION_REPORT.md).

## Actual resources

- Authenticated account: `6df4c7d2129ca857885972ef0028c280`; dashboard displayed **Workers Free** as the current plan, 0/100,000 Worker requests before testing, and D1 usage of 1/10 databases, 0/5 million rows read and 0/100,000 rows written before migration. Billable D1 usage showed $0.00 before deployment. No plan upgrade or paid product was enabled.
- Existing D1: `ava-radio-staging`, UUID `abe077d0-b360-4beb-864a-0e3ab354cfd0`. It had no application tables before migration. No second D1 was created.
- Applied exactly once in order: `backend/schema.sql` (3 statements), `backend/attendance.sql` (2), `backend/migrations/0002_radio_platform.sql` (29). Remote D1 reported 14 tables including Cloudflare's internal table, 11 indexes and 4 triggers. `PRAGMA integrity_check` was denied by D1 with `SQLITE_AUTH`, so it is not counted as a pass.
- Worker: `ava-radio-staging`, current deployed version `e5a5ba8c-e7de-45ed-a89c-57ac4f82f3b2`. Public staging origin: `https://ava-radio-staging.ibbo-abdoli.workers.dev`. The same origin serves the UI at `/v2/` and the API at `/api/`.
- Active settings: `RADIO_FEATURES_ENABLED=true`, `REGISTRATION_ENABLED=false`, `ATTENDANCE_OBSERVER_ENABLED=false`, `preview_urls=false`. `AUTH_RATE_SECRET` exists as a Worker secret; its value was never printed, committed or saved locally. No production domain or route is bound.
- Two invented QA users remain in staging. Their random credentials are only in gitignored `backend/.wrangler/staging-qa-credentials.json` on this PC. Active songs: 0; approved queue items: 0; Clubhouse identities: 0; attendance observations: 0.

## Evidence

| Verification | Result |
| --- | --- |
| Real HTTPS static and API routing | `/`, `/v2/`, portal, copied config, two install JPGs, `/health`, `robots.txt` returned 200; disabled `/api/catalog` returned 503 before enabling QA API |
| CORS | Wrong origin 403; configured origin OPTIONS 204 with exact allow-origin |
| Remote D1 and Worker | Exact account/UUID verified; three migrations succeeded; Worker deployment succeeded |
| Real API with invented data | Login 200; cookie `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/api`; listener admin access 403; anonymous admin 401; closed registration 503; disabled observer 503; catalog/request creation 201; duplicate active request and insufficient points 409; approval, spend, reject/cancel refunds and leaderboard opt-in/out matched expected results |
| Real D1 concurrency | Two parallel approvals returned 200 and 409, balance reached 0, one queue item existed, rejection restored 2 points |
| Real Chrome browser | Listener login/logout at 390 and 1440 px, admin controls at 1440 px, mobile homepage and install images passed; no horizontal overflow |
| Local regression | Frontend 65/65, backend 11/11, SQLite migration 6/6 passed; existing bot 286/286 in the earlier integration run |

The first live registration attempt exposed a real Cloudflare incompatibility: its Web Crypto implementation rejected PBKDF2 counts above 100,000. The staging Worker was corrected from 310,000 to 100,000 and live registration/login then passed. This is below [OWASP's current PBKDF2-HMAC-SHA256 recommendation](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), so password hashing is a **production security blocker**; staging uses random QA passwords and closed registration. The original radio site and Clubhouse bot repository were not changed. No real Clubhouse connection, room action, message or attendance observation occurred.

## Before production

Review production-grade authentication and the 100,000-round PBKDF2 limit, then perform an independent security/privacy review. Clubhouse presence tracking requires a verified source and separate authorization. Do not merge or deploy production based solely on these staging checks.
