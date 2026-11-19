# Approved Radio Ava o Nava v2 visual decisions — 19 Nov 2026

This is the existing production website at `https://radio.ibboabdoli.com/v2/`. Do not create or publish a different radio website when making future visual changes.

## User-approved, source-backed changes

1. **Main playback controls** — squared, softly rounded, deep purple background, restrained gold outline and clearly visible gold play / pause icons. Previous and next buttons are smaller with the same design vocabulary. Play and pause states keep identical dimensions.
2. **Five recorded-program images** and **five music-genre images** come from the exact photo-heavy composite image the user explicitly approved. These are **crops of that composite**, not new illustrations or external placeholders. Files are `gallery/recording-1.webp` through `gallery/recording-5.webp` and `gallery/genre-traditional.webp`, `genre-pop.webp`, `genre-jazz.webp`, `genre-instrumental.webp`, and `genre-electronic.webp`. Git blob hashes are asserted in the smoke tests to prevent accidental visual substitution. Program art is decorative, not an assertion that its fictional label describes the recording. Verified date titles remain below each card.
3. **Full recorded-player and global mini-player** use the purple-and-gold rounded-square play/pause treatment from the approved mock. Archive shuffle and repeat controls must be operational, never decorative-only. Existing next/previous, time-seeking and audio sources remain.
4. **Main banner** shows the existing **official station logo**, replacing the generic microphone illustration. Keep the violet background and stylized waveform.
5. **Live-stream equalizer** is a gold/magenta/purple moving column visualization while local live audio is playing and static otherwise; it is a visual animation, not a claim to be a frequency analysis of the remote stream. Reduced-motion preference must stop the animation.
6. **iOS native volume** — hide the site's unusable volume sliders on iPhone/iPad. Apple's native device buttons remain the volume control. Desktop slider continues functioning.
7. **Correct section and navigation order** — Home, Live broadcast with Arash, Recorded programs, Music, Genre filters, Weekly schedule, Community, Install, About. The full recorded programs panel is directly under Live, while home retains its featured preview shelves.

## Preserve without regressions

- The 5 existing R2 MP3 URLs, archive selection/seek/position, Icecast live playback, Audius search/catalog/player and provider links
- Tehran, Sweden, UK show schedule, competition registration, Telegram/WhatsApp/Clubhouse links
- All eight previously user-approved installation screenshots and four-step guides per platform
- Existing branding, responsive desktop/tablet/mobile arrangements, accessibility, PWA and web URL
- Music and voice copyright requirements; do not treat pictures as rights to host protected audio

## Validation

Run `node --test v2/tests/smoke.test.mjs` and `node --test v2/tests/media-health.test.mjs`. The latter verifies public media metadata/HEAD and reports the separately tracked byte-range CDN issue; no automated test alone proves audible mobile playback.

Review the design at 1440px, 768px, and 390px, test Safari iOS volume, confirm square play/pause state, all ten images, accordion/steps, and section order. Browser QA must be completed wherever a browser is available.
