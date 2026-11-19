# Radio Ava o Nava — song request backend (not deployed)

Cloudflare Workers + D1. This is a separate staging implementation; the current radio stream and GitHub Pages site are unchanged.

## Capabilities
- POST /api/requests — submit a song (title, artist, requestedBy), pending approval
- GET /api/queue — public approved queue, without requester names
- GET /api/admin/requests?status=pending — private review
- PATCH /api/admin/requests/:id — approve/reject/mark played
- GET /health — process health (not a database readiness check)

## Setup
1. Install Wrangler and log in to the correct Cloudflare account.
2. Create a D1 database: `npx wrangler d1 create ava-radio-requests`.
3. Copy `wrangler.toml.example` to `wrangler.toml`, set the returned database_id. Do not commit secrets.
4. Run `npx wrangler d1 execute ava-radio-requests --remote --file=./schema.sql` from this directory after reviewing the DB target.
5. Set distinct strong secrets with `npx wrangler secret put ADMIN_TOKEN` and `npx wrangler secret put IP_HASH_SECRET`. Keep the admin token only in a trusted admin client; never embed it in public HTML or JavaScript.
6. Deploy only after a staging review with `npx wrangler deploy`, then configure the desired API domain and test CORS.

## Security and operational limits
- Requesters enter a display name only. No accounts, points, Clubhouse integration or automatic audio playback yet.
- Keep private requester names out of the public queue. Never expose ADMIN_TOKEN to public browser code.
- Per-IP hash throttling: one submission/minute. NAT users share a bucket; tune if needed.
- Admin authentication is a shared bearer secret intended only as a first-stage private API. Production admin UI should use server-managed sessions/Cloudflare Access, not browser-stored secrets.
- Add retention and cleanup policies for the database and request_limits. Add CAPTCHA/Turnstile if abuse rises.
- This code is not a music rights or source verification system; human approval is required.
- No live integration tests or deployment have been executed in this PR.
