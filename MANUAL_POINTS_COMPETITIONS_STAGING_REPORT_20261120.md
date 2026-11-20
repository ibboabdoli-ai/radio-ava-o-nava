# Manual points and competition staging report — 20 November 2026

## Implemented

- Reused the existing D1 point ledger, authenticated admin session and Persian RTL listener dashboard. Manual adjustments require a nonzero integer within ±1000, a reason and a UUID `Idempotency-Key`. The ledger records the admin, timestamp and `source_type='manual'`; a D1 trigger writes the admin audit event atomically. Another trigger rejects any debit that would make the balance negative.
- Added draft/published/closed competition records, admin editing, verified participant linkage, result/winner recording, one prize per competition participant, and opt-in publication of approved results. The administrator cannot set name consent: each participant grants or withdraws it from their own signed-in account. Competition prizes are marked `source_type='competition_prize'` in the same ledger; they are never attendance points. The approved Google Form remains the registration channel. No form submissions or private contact data were imported.
- Added competition controls and transaction reasons to the existing RTL portal, plus approved result display on the staging radio homepage. The tracked live `v2/request-config.json` remains disabled. No live website, Clubhouse account or attendance observer was changed.

## Staging resources and migration

- Verified Wrangler account `6df4c7d2129ca857885972ef0028c280` and the existing D1 `ava-radio-staging`, UUID `abe077d0-b360-4beb-864a-0e3ab354cfd0`. The account was reported on Workers Free earlier the same day; this run did not independently recheck the dashboard's billing panel. No new Cloudflare resource or paid feature was created.
- Checked remote `sqlite_master` before applying the one-time additive `backend/migrations/0005_manual_competitions.sql`. Created a local, gitignored staging D1 export before migration. The migration processed 12 SQL statements successfully. Old data stayed at 2 users, 21 transactions and net 6 points; the four competition tables and three new triggers appeared.
- Deployed only existing Worker `ava-radio-staging`, final version `c061adbe-7059-4ca3-a9ee-0f002555ccad`, to `https://ava-radio-staging.ibbo-abdoli.workers.dev`. Its `/health` reports `registrationEnabled=false` and `attendanceObserverEnabled=false`.
- Bounded HTTPS QA used the two existing invented accounts. Its credit and matching debit restored the starting user balance; retries made additional zero-net audit entries. Two hidden synthetic QA drafts were created during the initial test retry; they have no participants, results or prizes and are not publicly shown. After QA, D1 had 2 users, 27 point transactions, net 6 points, 2 draft competitions, 0 competition participants, 0 awards and 0 attendance observations. These synthetic records were preserved.

## Tests and evidence

| Check | Result |
| --- | --- |
| Backend including auth, requests, refunds, manual concurrency, prize uniqueness and privacy | 21/21 passed |
| Frontend and radio player regression | 65/65 passed; media-health tests contacted the public archive, not Clubhouse |
| Local SQLite migration/order suite | 6/6 passed |
| Existing local mocked Chromium browser scenarios | 6/6 passed (360, 390, 768, 1440 px and mocked forms) |
| New isolated competition/manual-points Chromium flow | Passed at 390 and 1440 px; external requests blocked, untrusted result rendered as text |
| Real staging browser with two invented accounts | Passed at 390 and 1440 px; admin/listener role separation, logout, disabled registration and attendance visible |
| Real HTTPS staging API | Health 200, wrong origin 403, listener admin access 403, manual credit 200, duplicate retry 200 without second credit, negative debit 409, compensating debit 200, admin audit present, draft create/edit 201/200, unverified participant 400, ineligible prize 409, hidden draft absent from public API |
| Staging assets | Portal, competition module and approved registration page returned 200 after same-origin Cloudflare canonical redirects |

## Limits and next gate

The complete prize flow passed only with local synthetic accounts and D1 mocks. No staging competition participant was marked as verified because the existing approved Google Form was not used for these invented accounts, and no real registration was changed. A human administrator must verify any real form response and account identity before linking a participant, recording a winner or awarding points. Public display additionally requires the participant's own consent. Public registration and Clubhouse attendance remain disabled. Prior authentication, privacy, retention and music-rights release gates still apply before production.
