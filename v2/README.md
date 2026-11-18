# Radio Ava o Nava — isolated v2 Audius-only release candidate

**Scope:** Branch-only work; the current main website, DNS, and live radio system are unchanged.
**Music source:** Audius public API (https://api.audius.co/v1). No SoundCloud music, script, embed or catalog is present in this v2 candidate.

## Features
- Persian RTL responsive site with live Icecast stream, listener stats, weekly show schedule, archived show recordings, competitions, Clubhouse and social links.
- One native Audius music player: play/pause, previous/next, seek, album artwork, iOS-compatible handling, OS media controls where supported, single-source audio coordination.
- Seven curated Audius tracks as initial metadata (audius-catalog.json).
- Dynamic music catalog: Audius /tracks/search with text search, suggested genres/artist queries, pagination, and source attribution.
- Dynamic albums and playlists: Audius /playlists/search, open /playlists/{id}/tracks in the same native player.
- No self-hosted, copied, downloaded, or re-uploaded third-party audio. Audio streams from Audius.
- Live search returns what Audius indexes and exposes; it cannot guarantee every Persian track, availability or licensing of every uploader.

## Data
- shows.json: schedule, public links, show recordings.
- audius-catalog.json: seven initial curated tracks.
- Search results and albums are fetched dynamically from Audius and are not persisted to GitHub.
- audius.js: native HTML Audio playback and API catalog discovery.
- audius.css: custom radio design and responsive discovery UI.

## Test commands
node --test v2/tests/smoke.test.mjs

## Manual acceptance checklist before merge
1. Preview on iPhone Safari, Android Chrome, desktop Chrome and Edge.
2. Search Persian music by Persian and Latin artist names; verify pagination and source artwork.
3. Search playlists/albums, open their tracks, and verify music plays through native player.
4. Test fast switching, previous/next, seek, lock-screen and background playback, and stream errors.
5. Confirm one audio source at a time across live, Audius and archived programs.
6. Confirm existing contest, socials, install tutorials, program times and listener status unchanged.
7. Check keyboard navigation, small-screen overflow and reduced-motion preference.
8. Validate the rights and availability of individual recordings; fan uploads are not necessarily authorized.
9. Keep main intact with a rollback plan. Never merge without final approval.

## Not included
- Authenticated editing, polls, requests backend, notifications, analytics.
- A copy of every recording on Audius: only searchable public content is accessible.
- Complete live music and mobile QA; do not promote this branch to the main domain yet.
