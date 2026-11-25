const verifiedTrackCovers = {
  '8556ee96-a709-5922-8bbb-bcde34fae5b1': 'ghorbani-1001-nights',
  '09583875-8819-5caf-8eb7-1cdb3dfab038': 'talischi-darigh',
};

try {
  if (navigator.audioSession) navigator.audioSession.type = 'playback';
} catch {}

function radioMediaThumbnail(name) {
  return {
    src: new URL('/v2/music-library/assets/now-playing/' + name + '.jpg', location.href).href,
    sizes: '200x200',
    type: 'image/jpeg',
  };
}

const radioFallbackArtwork = radioMediaThumbnail('radio');

function radioTrackArtwork(track, portrait) {
  const cover = verifiedTrackCovers[track.id];
  if (cover) return [radioMediaThumbnail(cover)];
  if (portrait) {
    try { return [{ src: new URL(portrait, location.href).href }]; } catch {}
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
