import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const stage = 'https://ava-radio-staging.ibbo-abdoli.workers.dev';
const route = '/local/radio-dj';
const catalogPath = '/api/admin/catalog';
const genrePath = '/api/admin/dj/genre';
const pairPath = '/api/admin/dj/pair';
const evidence = { checks: [] };
let step = 'preconditions';
const pass = (message) => { evidence.checks.push(message); console.log('PASS ' + message); };
const send = (path, init) => fetch(stage + path, { redirect: 'error', signal: AbortSignal.timeout(8000), ...init });
const status = () => send('/api/dj/status').then(res => res.json());
function expectStatus(response, expected) {
  assert.equal(response.status(), expected, step + ' HTTP ' + response.status());
  return response.json();
}
async function until(check, timeout = 9000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(850);
  }
  assert.fail('Timed out during ' + step);
}

// Original generated PCM with a fade and no sampling of an existing recording.
function originalWav() {
  const rate = 16000, count = rate * 14, wav = Buffer.alloc(44 + 2 * count);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(2 * count, 40);
  for (let i = 0; i < count; i++) {
    const fade = Math.min(1, i / 800, (count - i - 1) / 800);
    const frequency = 220 * (1 + Math.floor(i / rate) % 3 / 4);
    wav.writeInt16LE(Math.round(320 * fade * Math.sin(2 * Math.PI * frequency * i / rate)), 44 + 2 * i);
  }
  return wav;
}

async function main() {
  assert.equal(process.env.RADIO_STAGING_RUN_DJ_QA, '1');
  assert.ok(process.env.RADIO_STAGING_QA_CREDENTIALS && process.env.RADIO_DJ_BUILD_DIR);
  const credentials = JSON.parse((await readFile(process.env.RADIO_STAGING_QA_CREDENTIALS, 'utf8')).replace(/^\uFEFF/, ''));
  assert.equal(credentials.length, 2);
  const health = await send('/health').then(res => res.json());
  assert.ok(health.configured && health.featuresEnabled && !health.registrationEnabled && !health.attendanceObserverEnabled);
  const initial = await status();
  assert.ok(initial.enabled && !initial.genre && !initial.playback, 'Use staging with no daily genre or active playback');
  const publicQueue = await send('/api/queue').then(res => res.json());
  assert.equal(publicQueue.queue.length, 0, 'Preserve all existing staging queue entries');
  const imported = path => import(pathToFileURL(resolve(process.env.RADIO_DJ_BUILD_DIR, path)).href);
  const { createApp } = await imported('app.js');
  const { loadLocalRadioDjCatalog } = await imported('local/radio-dj-catalog.js');
  const { createLocalRadioDjRouter } = await imported('local/radio-dj-router.js');
  const browser = await chromium.launch({
    executablePath: process.env.RADIO_TEST_CHROME,
    ignoreDefaultArgs: ['--mute-audio'],
    args: ['--disable-background-networking']
  });
  const base = await mkdtemp(join(tmpdir(), 'radio-dj-staging-qa-'));
  const file = 'original.wav', manifest = join(base, 'catalog.json');
  const accounts = new Map(), created = [], suffix = randomUUID().slice(0, 8);
  const genre = 'آزمایشی ' + suffix, title = 'آزمون پخش آوا و نوا ' + suffix;
  const key = randomUUID();
  let requestId, trackId, token, genreSet = false, server, deck;
  function api(account, path, method = 'GET', data, headers = {}) {
    return account.context.request.fetch(stage + path, { method, data, headers: { Origin: stage, ...headers }, maxRedirects: 0, timeout: 8000 });
  }
  const admin = (...args) => api(accounts.get('admin'), ...args);
  const listener = (...args) => api(accounts.get('listener'), ...args);
  const tokenCall = (path, data) => send(path, {
    method: data ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, Origin: stage, 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined
  });
  const requestState = async () => (await expectStatus(await listener('/api/me/requests'), 200)).requests.find(item => item.id === requestId)?.status;
  async function closeDeck() {
    await deck?.context.close();
    deck = null;
    if (server) await new Promise(done => server.close(done));
    server = null;
  }
  async function startDeck() {
    const library = await loadLocalRadioDjCatalog(manifest);
    server = createApp({ localRadioDj: createLocalRadioDjRouter(library, key) }).listen(0, '127.0.0.1');
    await new Promise((done, fail) => { server.once('listening', done); server.once('error', fail); });
    const target = 'http://127.0.0.1:' + server.address().port;
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', intercepted => intercepted.request().url().startsWith(target + '/') ? intercepted.continue() : intercepted.abort());
    await context.addInitScript(() => {
      window.addEventListener('DOMContentLoaded', () => {
        const audio = document.getElementById('audio');
        audio.volume = 0.2;
        audio.addEventListener('ended', () => {
          window.qaNaturalEnd = { position: audio.currentTime, duration: audio.duration, muted: audio.muted };
        });
      }, { once: true });
    });
    const page = await context.newPage();
    deck = { page, context };
    assert.equal((await page.goto(target + route + '/')).status(), 200);
    await page.locator('#key').fill(key);
    await page.locator('#website').fill(token);
    await page.locator('#start').click();
    await page.locator('#track').getByText(title, { exact: true }).waitFor({ timeout: 12_000 });
    await page.waitForFunction(() => document.querySelector('audio').currentTime > 0, null, { timeout: 10_000 });
    await until(async () => { const { playback } = await status(); return playback?.title === title && playback.state === 'playing' && playback.positionMs > 0; });
    return page;
  }

  try {
    step = 'existing QA account login and scoping';
    for (const credential of credentials) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      const page = await context.newPage();
      const login = await api({ context }, '/api/auth/login', 'POST', { username: credential.username, password: credential.password });
      const { user } = await expectStatus(login, 200);
      assert.ok(['listener', 'admin'].includes(user.role) && !accounts.has(user.role));
      accounts.set(user.role, { user, context, page });
      await context.route('**/*', intercepted => intercepted.request().url().startsWith(stage + '/') ? intercepted.continue() : intercepted.abort());
      await page.setViewportSize({ width: user.role === 'listener' ? 390 : 1440, height: 950 });
      assert.equal((await page.goto(stage + '/v2/radio-club.html#overview')).status(), 200);
    }
    const adminPage = accounts.get('admin').page, listenerPage = accounts.get('listener').page;
    assert.equal((await expectStatus(await admin('/api/admin/dj/catalog'), 200)).tracks.length, 0);
    const baseline = (await expectStatus(await listener('/api/me'), 200)).user.balance;
    assert.ok(baseline >= 1, 'The existing QA listener needs one test point');
    const before = new Set((await expectStatus(await listener('/api/me/transactions'), 200)).transactions.map(t => t.id));

    step = 'original WAV and catalog creation through the admin dashboard';
    const wav = originalWav();
    await writeFile(join(base, file), wav, { flag: 'wx' });
    evidence.wav = { durationSeconds: 14, sha256: createHash('sha256').update(wav).digest('hex') };
    const form = adminPage.locator('#catalog-form');
    await form.locator('[name=title]').fill(title);
    await form.locator('[name=artist]').fill('Radio QA');
    await form.locator('[name=localAudio]').check();
    assert.ok(await form.locator('[name=sourceUrl]').isDisabled());
    await form.locator('[name=rightsNote]').fill('Original generated WAV for staging acceptance. Rights cleared for this project.');
    await form.locator('[name=rightsConfirmed]').check();
    await form.locator('[name=playableConfirmed]').check();
    const catalogResponse = adminPage.waitForResponse(res => res.url() === stage + catalogPath && res.request().method() === 'POST');
    await form.locator('button[type=submit]').click();
    trackId = (await expectStatus(await catalogResponse, 201)).id;
    created.push(trackId);
    await writeFile(manifest, JSON.stringify({ roomId: 'local-qa', announceTracks: false, tracks: [{ id: trackId, title, file }] }), { flag: 'wx' });
    evidence.trackId = trackId;
    assert.ok((await expectStatus(await admin('/api/admin/dj/catalog'), 200)).tracks.some(track => track.id === trackId && track.title === title));
    pass('original 14-second WAV linked to the existing staging catalog by UUID');

    step = 'temporary staging-only genre and authorized requests';
    await expectStatus(await admin(catalogPath + '/' + trackId, 'PATCH', { genre }), 200);
    const other = await expectStatus(await admin(catalogPath, 'POST', {
      title: 'QA genre exclusion ' + suffix, artist: 'Radio QA', localAudio: true, genre: 'genre excluded',
      rightsNote: 'Original audio QA catalog fixture', cost: 1, rightsConfirmed: true, playableConfirmed: true
    }), 201);
    created.push(other.id);
    await expectStatus(await admin(genrePath, 'PUT', { genre }), 200);
    genreSet = true;
    assert.equal((await status()).genre, genre);
    assert.equal((await listener('/api/requests', 'POST', { catalogSongId: other.id }, { 'Idempotency-Key': randomUUID() })).status(), 409);
    assert.deepEqual((await expectStatus(await listener('/api/catalog'), 200)).songs.map(song => song.id), [trackId]);
    await listenerPage.reload();
    const song = listenerPage.locator('#catalog > div').filter({ hasText: title });
    const submitted = listenerPage.waitForResponse(res => res.url() === stage + '/api/requests' && res.request().method() === 'POST');
    await song.getByRole('button', { name: 'درخواست آهنگ' }).click();
    const submission = await submitted;
    requestId = (await expectStatus(submission, 201)).id;
    evidence.requestId = requestId;
    const header = await submission.request().headerValue('idempotency-key');
    assert.ok(header);
    const replay = await expectStatus(await listener('/api/requests', 'POST', { catalogSongId: trackId }, { 'Idempotency-Key': header }), 200);
    assert.ok(replay.duplicate && replay.id === requestId);
    assert.equal((await expectStatus(await listener('/api/me'), 200)).user.balance, baseline);
    await adminPage.reload();
    const pending = adminPage.locator('#pending > div').filter({ hasText: title });
    const approval = adminPage.waitForResponse(res => res.url() === stage + '/api/admin/requests/' + requestId && res.request().method() === 'PATCH');
    await pending.getByRole('button', { name: 'تأیید و کسر امتیاز' }).click();
    await expectStatus(await approval, 200);
    assert.equal((await admin('/api/admin/requests/' + requestId, 'PATCH', { status: 'approved' })).status(), 409);
    assert.equal((await listener('/api/admin/dj/catalog')).status(), 403);
    assert.equal((await expectStatus(await listener('/api/me'), 200)).user.balance, baseline - 1);
    pass('genre filter, listener request, idempotent replay, admin approval, one points debit');

    step = 'live staging playback and normal stop';
    token = (await expectStatus(await admin(pairPath, 'POST', {}), 201)).token;
    assert.equal((await tokenCall('/api/dj/next').then(r => r.json())).next.requestId, requestId);
    const first = await startDeck();
    assert.equal((await tokenCall('/api/dj/claim', { requestId })).status, 409);
    await first.locator('#pause').click();
    await until(async () => (await status()).playback?.state === 'paused');
    await listenerPage.reload();
    await listenerPage.locator('#dj-playback').getByText(title, { exact: false }).waitFor();
    assert.match(await listenerPage.locator('#dj-playback').innerText(), /مکث/);
    await first.locator('#resume').click();
    await until(async () => (await status()).playback?.state === 'playing');
    await first.locator('#stop').click();
    await until(async () => (await status()).playback === null);
    assert.equal(await requestState(), 'approved');
    pass('real playback, duplicate claim rejected, dashboard pause, resume, normal stop preserves the queue');
    await closeDeck();

    step = 'unannounced disconnect and lease expiry';
    await startDeck();
    await closeDeck();
    assert.equal(await requestState(), 'approved');
    const disconnectedAt = Date.now();
    await until(async () => (await status()).playback === null, 54_000);
    evidence.leaseRecoverySeconds = Math.round((Date.now() - disconnectedAt) / 1000);
    assert.equal(await requestState(), 'approved');
    pass('unannounced disconnect aged out the remote lease; request remained approved');

    step = 'reconnect, natural audio completion and ledger';
    const final = await startDeck();
    await final.waitForFunction(() => window.qaNaturalEnd != null, null, { timeout: 24_000 });
    const end = await final.evaluate(() => window.qaNaturalEnd);
    assert.ok(end.position >= 13.9 && end.duration === 14 && end.muted === false);
    evidence.naturalEnd = end;
    await until(async () => await requestState() === 'played');
    assert.equal((await status()).playback, null);
    assert.equal((await tokenCall('/api/dj/next').then(r => r.json())).next, null);
    const after = (await expectStatus(await listener('/api/me/transactions'), 200)).transactions.filter(item => !before.has(item.id));
    assert.deepEqual(after.map(({ kind, delta }) => ({ kind, delta })), [{ kind: 'request_spend', delta: -1 }]);
    const balance = (await expectStatus(await listener('/api/me'), 200)).user.balance;
    assert.equal(balance, baseline - 1);
    evidence.points = { before: baseline, after: balance, charges: 1, refunds: 0 };
    await listenerPage.reload();
    await until(async () => (await listenerPage.locator('#stat-balance').textContent()) === balance.toLocaleString('fa-IR'));
    await listenerPage.locator('#my-requests > div').filter({ hasText: title }).getByText(/پخش شده/).waitFor();
    await listenerPage.locator('#transactions').getByText(/هزینهٔ درخواست/).first().waitFor();
    pass('natural 14-second end, staging request played, queue empty, one charge, zero refunds');
  } finally {
    const failures = [];
    async function cleanup(name, task) {
      try { await task(); } catch { failures.push(name); }
    }
    await cleanup('local player', closeDeck);
    if (token) await cleanup('pairing', async () => { await expectStatus(await admin(pairPath, 'DELETE'), 200); });
    if (requestId) await cleanup('synthetic request', async () => {
      if (['pending', 'approved'].includes(await requestState())) await expectStatus(await listener('/api/me/requests/' + requestId, 'PATCH', {}), 200);
    });
    for (const id of created) await cleanup('synthetic catalog entry', async () => {
      await expectStatus(await admin(catalogPath + '/' + id, 'PATCH', { active: false }), 200);
    });
    if (genreSet) await cleanup('temporary genre', async () => { await expectStatus(await admin(genrePath, 'DELETE', { genre }), 200); });
    for (const account of accounts.values()) await cleanup('session', async () => {
      await expectStatus(await api(account, '/api/auth/logout', 'POST', {}), 200);
    });
    await browser.close();
    for (const path of [join(base, file), manifest]) await unlink(path).catch(() => {});
    await rmdir(base);
    if (failures.length) throw new Error('Fixture cleanup failed for ' + failures.join(', '));
    if (token) pass('pairing revoked; fixture songs deactivated; genre and QA sessions cleaned up');
  }
}

try {
  await main();
  if (process.env.RADIO_STAGING_QA_EVIDENCE) await writeFile(process.env.RADIO_STAGING_QA_EVIDENCE, JSON.stringify(evidence, null, 2) + '\n');
} catch (error) {
  // Browser errors can include fill arguments. Print only the stage and local source line.
  const line = String(error.stack ?? '').match(/dj-staging-qa\.mjs:\d+:\d+/)?.[0] ?? '';
  console.error('FAIL ' + step + ' ' + line + (error.code === 'ERR_ASSERTION' ? ' ' + error.message : ''));
  process.exitCode = 1;
}
