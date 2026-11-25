const verifiedTrackCovers = {
  "8556ee96-a709-5922-8bbb-bcde34fae5b1": "https://www.alirezaghorbani.com/storage/single-tracks/1001-nights/alireza-ghorbani-1001-night.jpg",
  "09583875-8819-5caf-8eb7-1cdb3dfab038": "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/c6/79/cc/c679cc01-9474-655d-d748-5fd42fd147bc/cover.jpg/512x512bb.jpg"
};

try {
  if (navigator.audioSession) navigator.audioSession.type = 'playback';
} catch {}

function radioTrackArtwork(track, portrait) {
  const artwork = [];
  for (const src of [verifiedTrackCovers[track.id], portrait]) {
    if (!src) continue;
    try { artwork.push({ src: new URL(src, location.href).href }); } catch {}
  }
  artwork.push({
    src: new URL('/radio-icon-512.png', location.href).href,
    sizes: '512x512',
    type: 'image/png',
  });
  return artwork;
}

function setQueueMediaSession(audio, metadata, { previous = null, next = null } = {}) {
  const session = navigator.mediaSession;
  if (!session) return;

  if (typeof MediaMetadata === 'function') {
    try { session.metadata = new MediaMetadata(metadata); } catch {}
  }
  for (const [action, handler] of [
    ['play', () => { void audio.play().catch(() => {}); }],
    ['pause', () => audio.pause()],
    ['previoustrack', previous],
    ['nexttrack', next],
  ]) {
    try { session.setActionHandler(action, handler); } catch {}
  }
}
