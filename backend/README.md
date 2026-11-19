# Radio Ava o Nava — song request backend (not deployed)

Cloudflare Workers + D1. This is a separate staging implementation; the current radio stream and GitHub Pages site are unchanged.

## Capabilities
- POST /api/requests — submit a song (title, artist, requestedBy), pending approval
- GET /api/queue — public approved queue, without requester names
- GET /api/admin/requests?status=pending — private review
- PATCH /api/admin/requests/:id — approve/reject/mark played
- GET /health — process health (not a database readiness check)
- POST /api/admin/attendance — admin-only observation (`clubhouseUserId`, `displayName`, `roomId`, `state`: `seen` or `left`)
- GET /api/admin/leaderboard — private score table (1 point per complete 60 credited seconds)

## Setup
1. Install Wrangler and log in to the correct Cloudflare account.
2. Create a D1 database: `npx wrangler d1 create ava-radio-requests`.
3. Copy `wrangler.toml.example` to `wrangler.toml`, set the returned database_id. Do not commit secrets.
4. Run `npx wrangler d1 execute ava-radio-requests --remote --file=./schema.sql` and `npx wrangler d1 execute ava-radio-requests --remote --file=./attendance.sql` from this directory after reviewing the DB target.
5. Set distinct strong secrets with `npx wrangler secret put ADMIN_TOKEN` and `npx wrangler secret put IP_HASH_SECRET`. Keep the admin token only in a trusted admin client; never embed it in public HTML or JavaScript.
6. Deploy only after a staging review with `npx wrangler deploy`, then configure the desired API domain and test CORS.

## Security and operational limits
- Requesters enter a display name only. Clubhouse attendance is **not connected**; points only accrue through a privileged observation API. No public accounts, automatic audio playback or point redemption yet.
- The private leaderboard is not published. Never publish names without consent or opt-in; IDs may be identifying.
- The observation endpoint **must not** be directly accessible to visitors. The current shared token is only a staging credential. Before production, create a separate scoped credential for the trusted presence observer, with robust server authentication.
- A trusted observer must supply a stable Clubhouse account ID and reliably record `seen`/`left` events. Do not infer attendance from a display name, and do not claim observations are automatic.
- A first observation earns zero; successive `seen` messages in the same room credit elapsed time only for gaps of at most 75 seconds; a `left` event ends the session without crediting the unobserved interval. Missing heartbeats cannot accrue unlimited points.
- Unique IDs, names and observation records should be processed under an appropriate privacy notice and retention policy. Obtain consent before public rankings.
- Keep private requester names out of the public queue. Never expose ADMIN_TOKEN to public browser code.
- Per-IP hash throttling: one submission/minute. NAT users share a bucket; tune if needed.
- Admin authentication is a shared bearer secret intended only as a first-stage private API. Production admin UI should use server-managed sessions/Cloudflare Access, not browser-stored secrets.
- Add retention and cleanup policies for the database and request_limits. Add CAPTCHA/Turnstile if abuse rises.
- This code is not a music rights or source verification system; human approval is required.
- No live integration tests or deployment have been executed in this PR.
