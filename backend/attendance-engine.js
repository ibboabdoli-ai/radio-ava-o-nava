export const MAX_OBSERVED_GAP_MS = 75_000;

export function normalizeObservation(body) {
  const observationId = typeof body?.observationId === 'string' ? body.observationId.trim() : '';
  const clubhouseUserId = typeof body?.clubhouseUserId === 'string' ? body.clubhouseUserId.trim() : '';
  const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
  const state = body?.state;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(observationId) ||
      !/^[A-Za-z0-9_:-]{2,100}$/.test(clubhouseUserId) ||
      !/^[A-Za-z0-9_:-]{2,120}$/.test(roomId) ||
      (state !== 'seen' && state !== 'left')) return null;
  return { observationId, clubhouseUserId, roomId, state };
}

// This pure model is used for simulated presence tests. The D1 trigger applies
// the same rule atomically for accepted observations. A chat message is never
// a presence observation.
export function processVerifiedObservation(previous, observation, trusted = false) {
  if (!trusted) throw new Error('unverified_presence');
  const now = observation.receivedMs;
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('invalid_observation_time');
  if (observation.state === 'left') {
    return { active: false, roomId: observation.roomId, lastSeenMs: now, creditSeconds: 0, newSession: false };
  }
  if (observation.state !== 'seen') throw new Error('invalid_observation_state');
  const delta = previous == null ? -1 : now - previous.lastSeenMs;
  const continuous = previous?.active === true && previous.roomId === observation.roomId &&
    delta >= 0 && delta <= MAX_OBSERVED_GAP_MS;
  return {
    active: true,
    roomId: observation.roomId,
    lastSeenMs: now,
    creditSeconds: continuous ? Math.floor(delta / 1000) : 0,
    newSession: !continuous
  };
}
