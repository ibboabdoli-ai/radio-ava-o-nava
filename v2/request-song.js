(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { apiBase: '', features: {}, busy: false };
  const fallback = 'این بخش پس از راه‌اندازی سرویس فعال می‌شود.';
  const setText = (id, value) => { const node = $(id); if (node) node.textContent = value; };
  const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

  function validApi(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return '';
      if (url.pathname !== '/' && url.pathname !== '') return '';
      return url.origin;
    } catch { return ''; }
  }

  async function fetchJson(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(state.apiBase + path, { cache: 'no-store', credentials: 'omit', ...options, signal: controller.signal });
      let data;
      try { data = await response.json(); } catch { data = null; }
      return { response, data };
    } finally { clearTimeout(timeout); }
  }

  function messageForError(status) {
    if (status === 429) return 'درخواست‌ها زیاد شده‌اند. لطفاً یک دقیقه بعد تلاش کن.';
    if (status === 400) return 'نام آهنگ، خواننده و نام نمایشی را بررسی کن.';
    return 'ثبت درخواست انجام نشد. لطفاً دوباره تلاش کن.';
  }

  function appendItem(parent, index, title, subtitle, score) {
    const li = document.createElement('li');
    const number = document.createElement('span');
    number.className = 'club-item-num';
    number.textContent = String(index + 1).padStart(2, '0');
    const text = document.createElement('span');
    text.className = 'club-item-text';
    const strong = document.createElement('strong');
    strong.textContent = title;
    text.append(strong);
    if (subtitle) {
      const small = document.createElement('small');
      small.textContent = subtitle;
      text.append(small);
    }
    li.append(number, text);
    if (score !== undefined) {
      const points = document.createElement('span');
      points.className = 'club-item-points';
      points.textContent = String(score) + ' امتیاز';
      li.append(points);
    }
    parent.append(li);
  }

  async function loadQueue() {
    if (!state.features.queue) return;
    const button = $('refreshQueue');
    button.disabled = true;
    try {
      const { response, data } = await fetchJson('/api/queue');
      if (!response.ok || !Array.isArray(data?.queue)) throw Error('queue_failed');
      const queue = data.queue.filter(x => x && typeof x.title === 'string' && typeof x.artist === 'string').slice(0, 50);
      $('queueList').replaceChildren();
      for (const [index, item] of queue.entries()) appendItem($('queueList'), index, item.title.slice(0, 120), item.artist.slice(0, 120));
      setText('queueCount', String(queue.length));
      $('queueCount').setAttribute('aria-label', String(queue.length) + ' آهنگ');
      setText('queueCountHint', 'در صف تأییدشده');
      setText('queueStatus', queue.length ? '' : 'فعلاً آهنگی در صف تأییدشده نیست.');
      $('queueStatus').hidden = queue.length > 0;
    } catch {
      setText('queueCount', '—');
      setText('queueCountHint', 'در دسترس نیست');
      $('queueList').replaceChildren();
      $('queueStatus').hidden = false;
      setText('queueStatus', 'دریافت صف ممکن نشد. دوباره تلاش کن.');
    } finally { button.disabled = false; }
  }

  async function loadLeaderboard() {
    if (!state.features.leaderboard) return;
    try {
      const { response, data } = await fetchJson('/api/public/leaderboard');
      if (!response.ok || !Array.isArray(data?.leaders)) throw Error('leaderboard_failed');
      const entries = data.leaders.filter(x => x && typeof x.displayName === 'string' && integer(x.points) !== null).slice(0, 30);
      $('leaderboardList').replaceChildren();
      for (const [index, item] of entries.entries()) appendItem($('leaderboardList'), index, item.displayName.slice(0, 80), '', item.points);
      $('leaderboardStatus').hidden = entries.length > 0;
      setText('leaderboardStatus', entries.length ? '' : 'هنوز کاربری برای نمایش عمومی رتبه‌بندی ثبت‌نام نکرده است.');
    } catch {
      $('leaderboardList').replaceChildren();
      $('leaderboardStatus').hidden = false;
      setText('leaderboardStatus', 'رتبه‌بندی در حال حاضر در دسترس نیست.');
    }
  }

  async function initialize() {
    try {
      const response = await fetch('./request-config.json', { cache: 'no-store' });
      if (!response.ok) throw Error('config_failed');
      const config = await response.json();
      state.apiBase = validApi(config?.apiBase);
      state.features = {
        requests: Boolean(state.apiBase && config?.features?.requests === true),
        queue: Boolean(state.apiBase && config?.features?.queue === true),
        leaderboard: Boolean(state.apiBase && config?.features?.leaderboard === true)
      };
      if (state.features.requests) {
        $('requestSubmit').disabled = false;
        setText('requestFeedback', 'درخواست‌ها ابتدا توسط مدیر بررسی می‌شوند.');
        setText('requestAvailability', 'آماده دریافت درخواست');
      }
      if (state.features.queue) void loadQueue();
      if (state.features.leaderboard) void loadLeaderboard();
      const available = Object.values(state.features).some(Boolean);
      setText('clubStatusText', available ? 'بخش‌های فعال باشگاه آماده استفاده هستند. امتیازدهی کلاب‌هاوس هنوز به تأیید فنی نیاز دارد.' : 'سیستم درخواست و امتیازدهی در حال راه‌اندازی است؛ فعلاً از تلگرام استفاده کن.');
    } catch {
      setText('clubStatusText', 'ارتباط با تنظیمات سرویس برقرار نشد؛ درخواست مستقیم فعلاً غیرفعال است.');
      setText('requestFeedback', fallback);
    }
  }

  $('refreshQueue').addEventListener('click', () => { void loadQueue(); });
  $('requestForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!state.features.requests || state.busy) return;
    const title = $('songTitle').value.trim();
    const artist = $('songArtist').value.trim();
    const requestedBy = $('requester').value.trim();
    if (!title || !artist || !requestedBy || title.length > 120 || artist.length > 120 || requestedBy.length > 60) {
      setText('requestFeedback', 'هر سه قسمت را کامل و درست وارد کن.');
      return;
    }
    state.busy = true;
    $('requestSubmit').disabled = true;
    setText('requestFeedback', 'در حال ثبت درخواست…');
    try {
      const { response } = await fetchJson('/api/requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, artist, requestedBy })
      });
      if (response.status !== 201) {
        setText('requestFeedback', messageForError(response.status));
        return;
      }
      setText('requestFeedback', 'درخواست ثبت شد و منتظر تأیید مدیر است.');
      $('requestForm').reset();
    } catch {
      setText('requestFeedback', 'اتصال برقرار نشد. بعداً دوباره تلاش کن.');
    } finally {
      state.busy = false;
      $('requestSubmit').disabled = !state.features.requests;
    }
  });
  void initialize();
})();
