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
