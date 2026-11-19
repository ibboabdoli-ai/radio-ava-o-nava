# Listener club website — integration contract (staging only)

The Persian listener club is available at /v2/request-song.html in PR #27.
The website links to it from the desktop sidebar, primary navigation, community section and footer.
The existing live radio player, recordings and Telegram message link remain intact.

## What exists today
- Responsive RTL layout: song request form, approved song queue, points explanation, personal-stat placeholders and privacy-conscious leaderboard placeholder.
- Safe client code: the queue and leaderboard are rendered with DOM text nodes, never with HTML injection.
- Runtime configuration in /v2/request-config.json is OFF by default. The config is fetched over the network and excluded from service-worker caching.
- Live request form stays disabled until a verified HTTPS API endpoint and a specific feature flag are configured.
- No account connection, points lookup, public attendance data, automatic song playback or ranked user data are live.

## Runtime config

Use this shape only after endpoint verification:

{
  "apiBase": "https://<trusted-verified-requests-api-host>",
  "features": {
    "requests": true,
    "queue": true,
    "leaderboard": false
  }
}

Never insert credentials, tokens, personal information or session identifiers here. The frontend requires HTTPS with a root-only API base and rejects URL credentials, query strings and fragments.

### Current API contract
- POST /api/requests {title:string,artist:string,requestedBy:string} -> HTTP 201 {id,status:"pending"}
- GET /api/queue -> {queue:[{id,title,artist,created_at}]} only admin-approved songs
- GET /api/public/leaderboard -> {leaders:[{displayName,points}]} **NOT IMPLEMENTED**. Enable only after server-side verified user consent / opt-in and authorization and privacy review.
- Personal points and attendance are intentionally *not queried*. Implement secure user identity/session and authorization before adding them. Never trust client-submitted Clubhouse IDs as authenticated identities.

### QA / safety gates
1. Deploy D1 and Worker only to staging and run both SQL schemas on the intended database.
2. Test request rate limiting, input length validation, error states and queue ordering with real D1.
3. Add independent Clubhouse presence verification; offline mocked presence is not sufficient to award real points.
4. Build secure admin and identity flow; do not expose ADMIN_TOKEN in a public browser.
5. Add backend public leaderboard endpoint with affirmative opt-in and safe deletion/retention policies before enabling the flag.
6. Verify UI at narrow phone and desktop widths, using keyboard navigation and screen readers as applicable.
7. Run existing radio player smoke tests and check live streaming/recordings.
8. Remove noindex from club page only at the approved live launch.
9. Review deployment diff, confirm rollback plan, obtain approval, then merge/deploy.

## Tests
- node --test v2/tests/listener-hub.test.mjs
- node --test v2/tests/smoke.test.mjs

This branch currently contains test source; running these commands on the contributor's Node environment and collecting output remains mandatory.
