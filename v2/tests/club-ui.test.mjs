import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
test('club page has every referenced control, Persian RTL and responsive styling', () => {
  const html = read('radio-club.html'), js = read('radio-club.js'), competitionJs=read('competition-ui.js'), css = read('radio-club.css');
  assert.match(html, /<html lang="fa" dir="rtl">/);
  assert.match(html, /name="viewport"/);
  assert.match(css, /@media\(max-width:520px\)/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const source of [js,competitionJs])for (const [, id] of source.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.includes(id), id);
  assert.match(js, /textContent/);
  assert.doesNotMatch(js, /innerHTML/);
  assert.doesNotMatch(competitionJs, /innerHTML/);
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../radio-club.js', import.meta.url))]);
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../competition-ui.js', import.meta.url))]);
});
test('site club API remains disabled until a staging URL is explicitly configured', () => {
  assert.equal(JSON.parse(read('request-config.json')).apiBase, '');
  assert.equal(JSON.parse(read('request-config.json')).clubEnabled, false);
  assert.match(read('request-song.html'), /radio-club\.html/);
});
