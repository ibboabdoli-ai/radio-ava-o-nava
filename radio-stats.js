/* Radio Ava o Nava — public stats only. No Icecast admin credentials. */
(() => {
  'use strict';
  const URL = 'https://live.ibboabdoli.com/radio-stats.xsl';
  const POLL_MS = 10000;
  const STALE_MS = 30000;
  const liveEl = document.getElementById('liveStatus');
  const listenersEl = document.getElementById('listeners');
  const elapsedEl = document.getElementById('elapsed');
  if (!liveEl || !listenersEl || !elapsedEl) return;

  let last = null;
  let lastSuccess = 0;
  let pending = false;
  const fa = value => Number(value).toLocaleString('fa-IR');
  const clock = seconds => {
    const n = Math.max(0, Math.floor(seconds));
    return [Math.floor(n / 3600), Math.floor((n % 3600) / 60), n % 60]
      .map(v => String(v).padStart(2, '0')).join(':');
  };
  const unknown = () => {
    liveEl.textContent = 'وضعیت رادیو: نامشخص';
    listenersEl.textContent = 'شنوندگان آنلاین: نامشخص';
    elapsedEl.textContent = 'زمان پخش زنده: --:--:--';
  };
  function render() {
    if (!last || Date.now() - lastSuccess > STALE_MS) return unknown();
    if (!last.live) {
      liveEl.textContent = 'وضعیت رادیو: OFFLINE';
      listenersEl.textContent = 'شنوندگان آنلاین: ۰';
      elapsedEl.textContent = 'زمان پخش زنده: 00:00:00';
      return;
    }
    liveEl.textContent = 'وضعیت رادیو: LIVE';
    listenersEl.textContent = 'شنوندگان آنلاین: ' + fa(last.listeners);
    elapsedEl.textContent = 'زمان پخش زنده: ' +
      (last.startedAt === null ? '--:--:--' : clock((Date.now() - last.startedAt) / 1000));
  }
  async function poll() {
    if (pending) return;
    pending = true;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 7000);
    try {
      const response = await fetch(URL + '?t=' + Date.now(), {
        cache: 'no-store', mode: 'cors', signal: abort.signal
      });
      if (!response.ok) throw new Error('Stats HTTP ' + response.status);
      const data = await response.json();
      if (!data || typeof data.live !== 'boolean') throw new Error('Invalid stats');
      const count = Number(data.listeners);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid listeners');
      let start = null;
      if (data.live && typeof data.startedAt === 'string') {
        const iso = data.startedAt.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
        const parsed = Date.parse(iso);
        if (Number.isFinite(parsed) && parsed <= Date.now() + 15000 && parsed > 0) start = parsed;
      }
      last = { live: data.live, listeners: count, startedAt: start };
      lastSuccess = Date.now();
    } catch (error) {
      // A blocked route, CORS error or outage is unknown, NEVER an invented OFFLINE.
    } finally {
      clearTimeout(timeout);
      pending = false;
      render();
    }
  }
  unknown();
  poll();
  setInterval(poll, POLL_MS);
  setInterval(render, 1000);
  window.addEventListener('online', poll);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
})();
