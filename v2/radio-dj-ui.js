export function mountRadioDj({ api, notice, refreshCatalog }) {
  const get = id => document.getElementById(id);
  const admin = get('dj-admin'), status = get('dj-status'), genreForm = get('dj-genre-form');
  const trackForm = get('dj-track-form'), trackSelect = trackForm.elements.track;
  const secret = get('dj-token'), secretField = get('dj-token-field'), copy = get('dj-copy');
  const clearGenre = get('dj-genre-clear');
  const catalog = get('catalog-form'), localAudio = catalog.elements.localAudio, sourceUrl = catalog.elements.sourceUrl;
  let role, generation = 0, enabled = false, todayGenre = null, trackGenres = new Map();
  function syncCatalogSource() {
    const allowed = enabled && role === 'admin';
    get('catalog-local-audio').hidden = !allowed;
    localAudio.disabled = !allowed;
    if (!allowed) localAudio.checked = false;
    const local = allowed && localAudio.checked;
    get('catalog-source-field').hidden = local;
    sourceUrl.disabled = local;
    sourceUrl.required = !local;
  }
  localAudio.addEventListener('change', syncCatalogSource);
  catalog.addEventListener('reset', () => { queueMicrotask(syncCatalogSource); });
  function clearToken() {
    secret.value = '';
    secretField.hidden = copy.hidden = true;
  }
  async function poll() {
    try {
      const data = await api('/api/dj/status');
      enabled = data.enabled === true;
      todayGenre = data.genre;
      clearGenre.hidden = !todayGenre;
      status.hidden = !enabled;
      admin.hidden = !enabled || role !== 'admin';
      syncCatalogSource();
      if (!enabled) clearToken();
      get('dj-genre').textContent = data.genre ? 'ژانر امروز · ' + data.genre : 'ژانر امروز هنوز تعیین نشده است.';
      const track = data.playback;
      get('dj-playback').textContent = track
        ? (track.state === 'paused' ? 'مکث · ' : 'در حال پخش · ') + [track.title, track.artist].filter(Boolean).join(' — ')
        : 'از صف سایت آهنگی در حال پخش نیست.';
    } catch {
      if (enabled) get('dj-playback').textContent = 'وضعیت فعلی پخش در دسترس نیست.';
    }
  }
  function selectTrack() {
    const id = trackSelect.value;
    get('dj-track-id').textContent = id;
    trackForm.elements.genre.value = trackGenres.get(id) || '';
  }
  async function refresh(nextRole) {
    const turn = ++generation;
    if (role !== nextRole) clearToken();
    role = nextRole;
    if (role !== 'admin') {
      admin.hidden = true;
      syncCatalogSource();
      trackSelect.replaceChildren();
      trackGenres.clear();
    }
    await poll();
    if (admin.hidden || generation !== turn) return;
    try {
      const { tracks } = await api('/api/admin/dj/catalog');
      if (generation !== turn) return;
      const prior = trackSelect.value;
      trackGenres = new Map(tracks.map(track => [track.id, track.genre]));
      trackSelect.replaceChildren(...tracks.map(track => new Option([track.title, track.artist].filter(Boolean).join(' — '), track.id)));
      if (trackGenres.has(prior)) trackSelect.value = prior;
      selectTrack();
    } catch { trackSelect.replaceChildren(); selectTrack(); }
  }
  const act = (button, task) => async event => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    try { await task(); }
    catch (error) { notice(error.message, true); }
    finally { button.disabled = false; }
  };
  genreForm.addEventListener('submit', act(genreForm.querySelector('button'), async () => {
    await api('/api/admin/dj/genre', { method: 'PUT', data: { genre: genreForm.elements.genre.value } });
    notice('ژانر امروز ثبت شد.');
    await Promise.all([poll(), refreshCatalog()]);
  }));
  clearGenre.addEventListener('click', act(clearGenre, async () => {
    if (!todayGenre) return;
    await api('/api/admin/dj/genre', { method: 'DELETE', data: { genre: todayGenre } });
    notice('محدودیت ژانر برداشته شد.');
    await Promise.all([poll(), refreshCatalog()]);
  }));
  trackSelect.addEventListener('change', selectTrack);
  trackForm.addEventListener('submit', act(trackForm.querySelector('button'), async () => {
    if (!trackSelect.value) return;
    await api('/api/admin/catalog/' + encodeURIComponent(trackSelect.value), { method: 'PATCH', data: { genre: trackForm.elements.genre.value } });
    notice('ژانر آهنگ ثبت شد.');
    await Promise.all([refresh(role), refreshCatalog()]);
  }));
  const pair = get('dj-pair'), revoke = get('dj-revoke');
  pair.addEventListener('click', act(pair, async () => {
    clearToken();
    const { token } = await api('/api/admin/dj/pair', { method: 'POST', data: {} });
    if (role !== 'admin') return;
    secret.value = token;
    secretField.hidden = copy.hidden = false;
    notice('کد اتصال ساخته شد.');
  }));
  copy.addEventListener('click', act(copy, async () => {
    const value = secret.value;
    if (!value) return;
    await navigator.clipboard.writeText(value);
    clearToken();
    notice('کد اتصال کپی شد.');
  }));
  revoke.addEventListener('click', act(revoke, async () => {
    await api('/api/admin/dj/pair', { method: 'DELETE' });
    clearToken();
    notice('اتصال میز پخش قطع شد.');
    await poll();
  }));
  setInterval(() => { if (enabled && !document.hidden) void poll(); }, 20_000);
  return { refresh };
}
