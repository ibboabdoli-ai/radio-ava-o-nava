const verifiedTrackCovers = {
  "8556ee96-a709-5922-8bbb-bcde34fae5b1": "https://www.alirezaghorbani.com/storage/single-tracks/1001-nights/alireza-ghorbani-1001-night.jpg",
  "09583875-8819-5caf-8eb7-1cdb3dfab038": "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/c6/79/cc/c679cc01-9474-655d-d748-5fd42fd147bc/cover.jpg/512x512bb.jpg"
};

try {
  if (navigator.audioSession) navigator.audioSession.type = 'playback';
} catch {}

const radioFallbackArtwork = {
  src: new URL('/radio-icon-512.png', location.href).href,
  sizes: '512x512',
  type: 'image/png',
};

function radioTrackArtwork(track, portrait) {
  const preferred = verifiedTrackCovers[track.id] || portrait;
  if (preferred) {
    try { return [{ src: new URL(preferred, location.href).href }]; } catch {}
  }
  return [radioFallbackArtwork];
}

function setQueueMediaSession(audio, metadata, { previous = null, next = null } = {}) {
  const session = navigator.mediaSession;
  if (!session) return;

  if (typeof MediaMetadata === 'function') {
    try {
      const media = new MediaMetadata(metadata);
      session.metadata = media;
      const artwork = metadata.artwork?.[0];
      if (artwork && artwork !== radioFallbackArtwork) {
        const probe = new Image();
        probe.onerror = () => { if (session.metadata === media) media.artwork = [radioFallbackArtwork]; };
        probe.src = artwork.src;
      }
    } catch {}
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
