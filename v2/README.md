# Radio Ava o Nava — v2 candidate

Status: **work in progress / PR only**. The live station and the current GitHub Pages entrypoint are unchanged.

## Included

- Responsive Persian RTL editorial redesign and single-page navigation.
- Unified live and replay playback with shared bottom dock; stop competing streams.
- Live Icecast streaming with retry/backoff, 7-second public-stats timeout, stale/unknown state and no hardcoded listener counts.
- The 16 SoundCloud items already curated in the existing site's `music.html`, grouped by genre and artist, official embedded player, source link, local favorites and next/previous entry buttons.
- Four existing MP3 recordings using the current archive host, with seek, next/previous and local resume position.
- Tehran 22:00 Saturday–Wednesday program; automatic Stockholm and London clock conversion.
- Clubhouse, Telegram, WhatsApp and existing Google contest form links.
- Installable PWA shell with isolated service worker. No audio is cached or copied.
- A publicly readable **management guide** (`manage.html`) linking GitHub content sources. **Not** an authenticated editing panel; no editing secrets should ever be embedded in client code.

## Content files

- `shows.json`: timetable, public links, title, recordings.
- `catalog.json`: curated music references; official SoundCloud sources only.
- `index.html`: static, accessible RTL UI.
- `app.js`: live audio, archive and UI state.
- `site.css`: responsive theme.
- `sw.js` + `manifest.webmanifest`: offline shell / install metadata.

## Local smoke test

Run from the repository root with Node 22 or later:

```sh
node --test v2/tests/smoke.test.mjs
```

Serve the repository root with any static HTTP server, then visit `/v2/`. Avoid opening `file://`, as content fetch and service workers require HTTP(S).

## Manual acceptance tests BEFORE merge

1. iPhone Safari, Android Chrome, desktop Chrome and Edge, both portrait and landscape.
2. LIVE button, Icecast streaming, mobile background/lock screen, pause, reconnect, network drop and offline messages.
3. Verify LIVE/OFFLINE status and listener count against a real server event. If stats route is inaccessible due CORS, keep **unknown** rather than inventing numbers.
4. Browse all 16 music references; verify actual playable sources. Confirm each provider's usage rights and availability. The app embeds the provider and does **not** bypass restrictions.
5. Test archive files for HTTP availability, playback and seek. Confirm audio formats and partial-content/range support.
6. Confirm never playing live, archive and SoundCloud simultaneously.
7. Verify timezone edge dates (Stockholm daylight-saving changes) and Clubhouse direct-room link when provided.
8. Test Google Form submission and private response access in Google Drive; do not expose participants' data on this static website.
9. Install to home screen on iOS and Android; verify icon appearance and update behavior.
10. Check keyboard navigation, screen-reader announcements, reduced-motion and contrast; inspect Core Web Vitals in a real browser.
11. Validate social/share URLs, metadata and mobile safe-area layout.
12. Review PWA caching, content CSP approach and production rollback plan.

## Not yet implemented / requires an authorized backend

- Authenticated admin login and direct content editing inside the site.
- Song requests, public chat, interactive polls and notification subscriptions (requires persistence, moderation, abuse prevention and consent).
- Scheduled automatic recordings/uploading or a server-side audio failover.
- Browser and server end-to-end tests: **not yet run**, so deployment is blocked pending acceptance.

## Deployment guardrails

- **Do not merge** until manual acceptance checks pass.
- Do not change the `main` branch, GitHub Pages settings, domain, DNS, Icecast credentials or Cloudflare Tunnel in this PR.
- For production launch, choose whether to promote `v2/` to `/` or retain the isolated path; update manifest scope, service-worker path, metadata and management links together.
- Preserve a tagged backup of the current `main` and keep rollback documented.
