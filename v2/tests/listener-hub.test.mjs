import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const get = filename => readFileSync(join(root, filename), 'utf8');
const html = get('request-song.html');
const script = get('request-song.js');
const config = JSON.parse(get('request-config.json'));
const main = get('index.html');
const sw = get('sw.js');

test('listener club assets and navigation exist', () => {
  assert.match(main, /href="\.\/request-song\.html"/);
  assert.match(html, /lang="fa" dir="rtl"/);
  assert.match(html, /request-song\.css\?v=1/);
  assert.match(html, /request-song\.js\?v=1/);
  assert.ok(get('request-song.css').includes('@media(max-width:760px)'));
  new vm.Script(script, { filename: 'request-song.js' });
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('new features default to off and runtime config is not cached', () => {
  assert.equal(config.apiBase, '');
  assert.deepEqual(config.features, { requests: false, queue: false, leaderboard: false });
  assert.match(sw, /endsWith\('\/request-config\.json'\)\)return/);
  assert.doesNotMatch(script, /innerHTML\s*=/);
  assert.doesNotMatch(script, /localStorage|sessionStorage/);
});

function createDocument() {
  const nodes = new Map();
  function node(tag = '') {
    return {
      tag, textContent: '', disabled: false, hidden: false, value: '', children: [], listeners: {},
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = [...items]; },
      addEventListener(event, handler) { this.listeners[event] = handler; },
      setAttribute(name, value) { this[name] = value; },
      reset() { this.resetCalled = true; }
    };
  }
  return {
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, node());
      return nodes.get(id);
    },
    createElement: node,
    nodes
  };
}

test('disabled configuration never contacts the API', async () => {
  const document = createDocument();
  const calls = [];
  const context = {
    document, URL, AbortController, setTimeout, clearTimeout,
    fetch: async (url) => {
      calls.push(url);
      assert.equal(url, './request-config.json');
      return { ok: true, json: async () => config };
    }
  };
  document.getElementById('requestSubmit').disabled = true;
  vm.runInNewContext(script, context);
  await new Promise(setImmediate);
  assert.deepEqual(calls, ['./request-config.json']);
  assert.equal(document.getElementById('requestSubmit').disabled, true);
  assert.match(document.getElementById('clubStatusText').textContent, /راه‌اندازی/);
});

test('approved queue displays plain text only when explicitly enabled', async () => {
  const document = createDocument();
  const calls = [];
  const context = {
    document, URL, AbortController, setTimeout, clearTimeout,
    fetch: async (url) => {
      calls.push(url);
      if (url === './request-config.json') return {
        ok: true, json: async () => ({ apiBase: 'https://example.org', features: { requests: false, queue: true, leaderboard: false } })
      };
      assert.equal(url, 'https://example.org/api/queue');
      return { ok: true, status: 200, json: async () => ({
        queue: [{ title: '<img src=x onerror=alert(1)>', artist: 'Example Artist' }]
      }) };
    }
  };
  document.getElementById('requestSubmit').disabled = true;
  vm.runInNewContext(script, context);
  await new Promise(setImmediate);
  assert.deepEqual(calls, ['./request-config.json', 'https://example.org/api/queue']);
  assert.equal(document.getElementById('queueCount').textContent, '1');
  const li = document.getElementById('queueList').children[0];
  assert.equal(li.children[1].children[0].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(document.getElementById('requestSubmit').disabled, true);
});
