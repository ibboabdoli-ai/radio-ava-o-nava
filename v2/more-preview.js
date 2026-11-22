async function loadMenu() {
  try {
    const response = await fetch('shows.json');
    if (!response.ok) throw new Error('menu');
    const data = await response.json();
    renderRadioMenu(data);
  } catch {
    id('next').textContent = id('contestStatus').textContent = 'اطلاعات بارگذاری نشد.';
  }
}
loadMenu();

const stream = id('stream');
const sheet = id('player');
const playButtons = document.querySelectorAll('[data-play]');
document.querySelector('.open-player').onclick = () => sheet.showModal();
sheet.addEventListener('click', event => {
  if (event.target === sheet && event.clientY < sheet.getBoundingClientRect().top) sheet.close();
});
function showState(message) {
  document.querySelectorAll('[data-status]').forEach(s => { s.textContent = message; });
  playButtons.forEach(b => {
    const label = stream.paused ? 'شنیدن رادیو' : 'مکث';
    b.setAttribute('aria-label', label);
    b.textContent = b.classList.contains('listen') ? label : (stream.paused ? '▶' : 'Ⅱ');
  });
}
playButtons.forEach(b => b.onclick = async () => {
  if (!stream.paused) { stream.pause(); return; }
  if (stream.error) stream.load();
  try { await stream.play(); }
  catch (error) { if (error.name !== 'AbortError') showState('پخش در دسترس نیست'); }
});
stream.onwaiting = () => showState('در حال اتصال…');
stream.onplaying = () => showState('در حال پخش');
stream.onpause = () => showState('متوقف');
stream.onerror = () => showState('پخش در دسترس نیست');
