(() => {
  const menu = document.getElementById('radio-user-menu');
  if (!menu) return;

  const origin = 'https://bashgah.ibboabdoli.com';
  const endpoint = origin + '/api/radio-nav-profile';
  const photo = document.getElementById('radio-user-photo');
  const panelPhoto = document.getElementById('radio-panel-photo');
  const name = document.getElementById('radio-user-name');
  const subtitle = document.getElementById('radio-user-subtitle');
  const links = document.getElementById('radio-user-links');
  const login = document.getElementById('radio-user-login');
  const logout = document.getElementById('radio-user-logout');
  const error = document.getElementById('radio-user-error');
  const avatars = [photo, panelPhoto];
  let refreshStarted = 0;
  let refreshSequence = 0;
  let avatarVersion = 0;
  let avatarKey;

  function fallback(displayName, authenticated) {
    for (const image of avatars) {
      image.hidden = true;
      image.removeAttribute('src');
      const holder = image.parentElement;
      const icon = holder.querySelector('.radio-user-default');
      const initial = holder.querySelector('.radio-user-initial');
      initial.textContent = authenticated ? [...displayName][0] || '؟' : '';
      initial.hidden = !authenticated;
      icon.toggleAttribute('hidden', authenticated);
    }
  }

  function showPhoto(url, displayName) {
    const key = JSON.stringify([url, displayName]);
    if (key === avatarKey) return;
    avatarKey = key;
    const version = ++avatarVersion;
    fallback(displayName, true);
    if (!url) return;
    let source;
    try {
      source = new URL(url);
      if (source.protocol !== 'https:' || source.username || source.password ||
          !['bashgah.ibboabdoli.com', 'd14u0p1qkech25.cloudfront.net'].includes(source.hostname)) return;
    } catch { return; }
    const image = new Image();
    image.referrerPolicy = 'no-referrer';
    image.onerror = () => {
      if (version === avatarVersion) avatarKey = undefined;
    };
    image.onload = () => {
      if (version !== avatarVersion) return;
      for (const target of avatars) {
        target.src = source.href;
        target.hidden = false;
        target.parentElement.querySelector('.radio-user-default').setAttribute('hidden', '');
        target.parentElement.querySelector('.radio-user-initial').hidden = true;
      }
    };
    image.src = source.href;
  }

  function render(account) {
    const authenticated = account?.authenticated === true;
    const displayName = authenticated && typeof account.name === 'string' && account.name.trim()
      ? account.name.trim() : 'حساب من';
    menu.dataset.authenticated = String(authenticated);
    name.textContent = displayName;
    subtitle.textContent = authenticated ? 'باشگاه شنوندگان' : 'برای دیدن حساب خود وارد شو';
    links.hidden = !authenticated;
    login.hidden = authenticated;
    error.hidden = true;
    if (authenticated) showPhoto(account.avatarUrl, displayName);
    else {
      avatarVersion++;
      avatarKey = undefined;
      fallback('', false);
    }
  }

  async function refresh(force = false) {
    const now = Date.now();
    if (!force && now - refreshStarted < 2000) return;
    refreshStarted = now;
    const sequence = ++refreshSequence;
    try {
      const response = await fetch(endpoint, { credentials: 'include', cache: 'no-store' });
      if (!response.ok) throw new Error('account_unavailable');
      const account = await response.json();
      if (sequence === refreshSequence) render(account);
    } catch {
      if (!menu.dataset.authenticated) {
        subtitle.textContent = 'وضعیت حساب در دسترس نیست';
        login.hidden = false;
      }
    }
  }

  logout.addEventListener('click', async () => {
    logout.disabled = true;
    error.hidden = true;
    try {
      const response = await fetch(origin + '/api/radio-nav-logout', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (!response.ok && response.status !== 401) throw new Error('logout_failed');
      refreshSequence++;
      render({ authenticated: false });
      menu.open = false;
    } catch {
      error.textContent = 'خروج انجام نشد. دوباره امتحان کن.';
      error.hidden = false;
    } finally { logout.disabled = false; }
  });
  menu.addEventListener('toggle', () => { if (menu.open) void refresh(true); });
  menu.addEventListener('click', event => { if (event.target.closest('a[href]')) menu.open = false; });
  document.addEventListener('pointerdown', event => { if (menu.open && !menu.contains(event.target)) menu.open = false; });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); } });
  addEventListener('pageshow', () => void refresh(true));
  addEventListener('focus', () => void refresh());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  void refresh(true);
})();
