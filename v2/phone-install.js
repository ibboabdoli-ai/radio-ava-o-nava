(() => {
  const shortcut = document.getElementById('installShortcut');
  const button = document.getElementById('nativeInstall');
  const guide = document.getElementById('manualInstall');
  const status = document.getElementById('installStatus');
  const standalone = window.matchMedia('(display-mode: standalone)');
  let promptEvent;
  let installed = false;
  let prompting = false;

  function render() {
    const inApp = installed || standalone.matches || navigator.standalone === true;
    shortcut.hidden = inApp;
    button.hidden = inApp || !promptEvent || prompting;
    guide.hidden = inApp || !!promptEvent || prompting;
    if (inApp) status.textContent = 'رادیو به‌صورت اپ در دسترس است.';
  }
  function openGuide() {
    if (location.hash !== '#install') location.hash = 'install';
    else {
      document.getElementById('more').open = true;
      const row = document.getElementById('install');
      row.open = true;
      row.scrollIntoView({block: 'center'});
    }
  }
  async function install(event) {
    event.preventDefault();
    if (prompting) return;
    if (!promptEvent) { openGuide(); return; }
    const next = promptEvent;
    promptEvent = null;
    prompting = true;
    render();
    try {
      await next.prompt();
      await next.userChoice;
    } catch {
      openGuide();
    } finally {
      prompting = false;
      render();
    }
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    promptEvent = event;
    render();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    promptEvent = null;
    render();
  });
  standalone.addEventListener?.('change', render);
  shortcut.addEventListener('click', install);
  button.addEventListener('click', install);
  render();
})();
