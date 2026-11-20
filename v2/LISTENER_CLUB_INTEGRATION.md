# Listener club integration contract — staging candidate

The PR #27 listener landing page remains at `/v2/request-song.html` with its approved Persian RTL design, browser tests, Telegram fallback and safe placeholders. The new authenticated account and points portal is linked at `/v2/radio-club.html`. The production radio player and media assets are unchanged.

## Feature gating

`/v2/request-config.json` remains public, contains no secrets, and is excluded from service-worker caching. Its default `apiBase` is empty, `clubEnabled` is false, and all legacy `features` flags are false. The old request form in `request-song.html` uses the PR #27 unauthenticated title/artist/name contract and **must remain disabled** against the integrated Worker. It is preserved for design and regression coverage, not as a live route.

For an isolated staging frontend only, after backend and cookie verification, set the HTTPS root-only `apiBase` and `clubEnabled=true`; keep `features.requests`, `features.queue` and `features.leaderboard` false. The `radio-club.html` portal uses cookie authentication, a curated catalog, point balance, private requests/attendance, queue, opt-in ranking and admin controls. It never displays a Clubhouse score from unverified messages. Staging API and frontend must be same-site HTTPS for `Secure; SameSite=Lax` cookies, with `ALLOWED_ORIGIN` set to the exact frontend origin.

## Integrated API

- `POST /api/auth/register`, `/api/auth/login`, `/api/auth/logout`; `GET/PATCH /api/me`.
- `GET /api/catalog?q=`, `/api/queue`, `/api/leaderboard` (opt-in names only).
- `POST /api/requests` accepts a curated `catalogSongId` and UUID `Idempotency-Key`. It starts pending at zero cost; an admin approval atomically spends points. Requesters can inspect status and cancel when allowed.
- `GET /api/me/attendance`, `/api/me/transactions`, `/api/me/requests`, and `GET/DELETE /api/me/clubhouse-identity` are private to the signed-in user.
- Admin session routes manage catalog, pending requests, points and consented Clubhouse ID mapping. No shared admin token is exposed in browser code.

The UI does not play requested music automatically. Only sources manually checked for playability and rights may enter the curated catalog. A Clubhouse observer endpoint exists but stays disabled; no real attendance is proven or scored.

## Verification and release boundary

Run `node --test v2/tests/smoke.test.mjs v2/tests/listener-hub.test.mjs v2/tests/listener-hub-flows.test.mjs v2/tests/club-ui.test.mjs` and `node --test backend/tests/*.test.mjs`. The browser workflow runs `v2/tests/listener-hub-browser.mjs` with a mocked API. Before any live launch, validate same-site cookies, CORS, Worker Free CPU limits, D1 triggers/transactions, retention and music rights on isolated staging. Do not enable the live config, Clubhouse account or production route from this branch.
