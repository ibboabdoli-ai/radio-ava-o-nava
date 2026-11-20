# Authentication fix and staging validation — 20 November 2026

The subsequent source-level security review and race-condition fixes are documented in [SECURITY_RELEASE_AUDIT_20261120.md](SECURITY_RELEASE_AUDIT_20261120.md).

## Root cause and decision

The original Worker used Web Crypto PBKDF2-HMAC-SHA256. Its Cloudflare runtime rejected more than 100,000 iterations (`NotSupportedError` at 310,000); staging temporarily used 100,000, below OWASP's 600,000-round PBKDF2-SHA256 guidance. A local Wrangler probe accepted `node:crypto.pbkdf2` at 600,000, but the actual staging Worker returned HTTP 500 with `NotSupportedError` on login. Local runtime success did not establish Free-plan compatibility.

The replacement uses built-in `node:crypto.scrypt` with random 256-bit salts, 32-byte hashes, and `N=8192, r=8, p=10`, one of [OWASP's listed minimum configurations](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). [Cloudflare documents `node:crypto` support](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/) except for specified APIs including Argon2. The two existing synthetic staging accounts logged in successfully on the actual Workers Free staging deployment and were upgraded from legacy PBKDF2. A scheme tag allows verification of old hashes during migration without resetting accounts.

## Changes and protections

- Added IP and username rate limits (20 and 10 attempts per 15 minutes respectively). Registration remains closed.
- Added authenticated password change and one-time 256-bit recovery codes, displayed once and stored only as SHA-256 hashes. No email account or verified out-of-band recovery channel exists. Users must save a code or undergo a separately defined manual identity check.
- Added D1 migrations `0003_auth_recovery.sql` and `0004_auth_atomic_recovery.sql` after `0002`. The final D1 trigger invalidates all older sessions and recovery codes atomically when the password hash changes. Concurrent recovery accepts the same code only once.
- Kept 7-day `HttpOnly`, `Secure`, `SameSite=Lax`, `/api` cookies, D1-hashed session tokens, exact-origin mutation checks, and role checks. The Persian portal now exposes password and recovery controls.
- Updated the staging Wrangler template to enable Node compatibility. The live radio config and original Clubhouse repository were not changed.

## Actual staging state

- Cloudflare account `6df4c7d2129ca857885972ef0028c280` and existing D1 `ava-radio-staging` / `abe077d0-b360-4beb-864a-0e3ab354cfd0` were verified with Wrangler before deployment. The account dashboard showed Workers Free earlier on the same day; no plan upgrade or paid product was enabled.
- `0003` and `0004` were applied to the same staging D1 after gitignored local SQL exports. D1 currently has 2 users, both with scrypt hashes, 0 unused recovery codes, 1 atomic auth trigger, 0 active songs, 0 approved requests, 0 Clubhouse identities and 0 attendance observations. Existing users were preserved.
- Worker `ava-radio-staging` version `cdaf981c-4228-410c-9173-6065bfc8456c` serves [the staging portal](https://ava-radio-staging.ibbo-abdoli.workers.dev/v2/radio-club.html) and [API health](https://ava-radio-staging.ibbo-abdoli.workers.dev/health). `REGISTRATION_ENABLED=false`, `ATTENDANCE_OBSERVER_ENABLED=false`, and preview URLs are disabled. No production route is bound.

## Test evidence

| Test | Result |
| --- | --- |
| Backend Node tests | 15/15 passed, including strong hashing, legacy upgrade, password change, session revocation, one-time and concurrent recovery, CSRF, rate limits, points and attendance mocks |
| SQLite migration tests | 6/6 passed; `0003` and `0004` apply in order and are repeatable in local SQLite |
| Frontend Node tests | 65/65 passed; approved player and portal assets preserved. Archive range checks still warned on four historical recordings (issue #15) |
| Real HTTPS API | Both invented accounts logged in after scrypt deploy; cookies had required flags. Full dummy catalog/request/ledger/refund/privacy flow passed after correcting the test's stale zero-balance assumption |
| Real HTTPS authentication | Password change 200, old session 401, one-time recovery 200, original QA password restored and login 200. On final `0004` deployment, admin QA login 200, recovery code issue 200, atomic recovery 200 and old session 401 |
| Real Chrome | Listener portal/login/logout at 390 and 1440 px, admin controls at 1440 px, mobile homepage and install images passed |
| Final deployment smoke | `/health`, portal HTML/JS and config 200; registration 503, wrong origin 403, Clubhouse observer 503 |

The initial post-deploy API QA script stopped because the persistent QA listener already had 2 points. Its dummy request was rejected/refunded through the admin API, and its dummy song was deactivated. The script was corrected to derive cost from the initial balance and passed on rerun. No real listener or music entry was used.

`PRAGMA integrity_check` remains unavailable on remote D1 (`SQLITE_AUTH`) and is not counted as a pass. No Clubhouse account was connected, and no room actions, messages or real attendance were attempted.

## Release gate

The hashing blocker is resolved for the two staging accounts at low load. Production review still needs an independent security assessment of auth and account recovery, a policy for users who lose recovery codes, abuse/Free-quota load testing, privacy and data-retention approval, and confirmation of music rights. Keep public registration disabled and PR #28 Draft until those checks pass. Clubhouse attendance remains disabled until an authorized, reliable presence source is verified.
