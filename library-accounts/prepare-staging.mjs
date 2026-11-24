import assert from 'node:assert/strict';
import {cp, mkdir, readFile, writeFile, readdir} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..', 'v2');
const [layoutArgument, outputArgument] = process.argv.slice(2);
assert.ok(layoutArgument && outputArgument, 'Usage: node prepare-staging.mjs <radio-reference-layout> <new-candidate-directory>');
const layout = resolve(layoutArgument);
const output = resolve(outputArgument);
await mkdir(output, {recursive:false});
const backend = join(output, 'backend');
const sourceBackend = join(layout, 'backend');
const stagingAssets = join(backend, '.wrangler', 'staging-frontend');
await mkdir(join(output, 'v2'), {recursive:true});
await mkdir(backend);
await cp(join(layout, 'v2', 'radio-api-origin.js'), join(output, 'v2', 'radio-api-origin.js'));
for (const entry of await readdir(sourceBackend, {withFileTypes:true})) {
  if (entry.isFile() && /^(?!\.)(?!wrangler).*?\.(?:js|json|sql)$/.test(entry.name)) {
    await cp(join(sourceBackend,entry.name), join(backend,entry.name));
  }
}
await cp(join(sourceBackend,'migrations'), join(backend,'migrations'), {recursive:true});
await cp(join(here,'0021_library_accounts.sql'), join(backend,'migrations','0021_library_accounts.sql'));
for (const file of ['google-auth.js','library-accounts.js']) await cp(join(here,file), join(backend,file));
await cp(join(sourceBackend, '.wrangler', 'staging-frontend'), stagingAssets, {recursive:true});

function replaceOnce(value, needle, replacement) {
  assert.equal(value.split(needle).length,2,'Unrecognized staging source: ' + needle);
  return value.replace(needle,replacement);
}

const workerPath = join(backend,'platform-worker.js');
let worker = await readFile(workerPath,'utf8');
worker = "import {isLibraryAccounts, libraryAccounts} from './library-accounts.js';\n" + worker;
const before = ' if(isPublicLibrary(p))';
worker = replaceOnce(worker,before,
  " if(isLibraryAccounts(p))return await libraryAccounts({req,env,clubSession:()=>session(req,env.DB,env),readBody,j,h});\n" + before);
await writeFile(workerPath,worker);

const assets = join(stagingAssets,'v2');
const archiveTarget = join(assets,'music-library');
await cp(join(site,'music-library'), archiveTarget, {recursive:true});
await cp(join(here,'ui'), archiveTarget, {recursive:true});
for (const asset of ['radio-navigation.css','radio-navigation.svg']) await cp(join(site,asset),join(assets,asset));
await cp(join(site,'gallery','player-tar.jpg'),join(assets,'gallery','player-tar.jpg'));
const archiveIndex = join(archiveTarget,'index.html');
let html = await readFile(archiveIndex,'utf8');
html = replaceOnce(html,'<a class="library-artists" id="library-artists" href="./?view=artists">خواننده‌ها</a>',
  '<div class="account-links"><a class="library-artists" id="library-artists" href="./?view=artists">خواننده‌ها</a><a class="library-artists" href="./account.html">حساب من</a></div>');
html = replaceOnce(html,'<p id="player-status" role="status" hidden></p>',
  '<a class="button" id="save-track" href="./account.html" hidden>ذخیره در پلی‌لیست</a><p id="player-status" role="status" hidden></p>');
assert.equal(html.split('href="../#home"').length,3);
html = html.replaceAll('href="../#home"','href="https://radio.ibboabdoli.com/v2/"');
html = replaceOnce(html,'href="../#archive"', 'href="https://radio.ibboabdoli.com/v2/#archive"');
await writeFile(archiveIndex,html);
const cssPath = join(archiveTarget,'club-archive.css');
await writeFile(cssPath,(await readFile(cssPath,'utf8')) + '\n.account-links { display: flex; align-items: center; gap: .9rem; }\n#save-track { margin-block-start: .5rem; }\n');
const jsPath = join(archiveTarget,'club-archive.js');
let js = await readFile(jsPath,'utf8');
js = replaceOnce(js,"const libraryApi='https://api-radio.ibboabdoli.com';","const libraryApi='';");
js = replaceOnce(js,"  get('mini-title').textContent=get('now-title').textContent=track.title;",
  "  get('mini-title').textContent=get('now-title').textContent=track.title;\n  const save=get('save-track');\n  save.href='./account.html?'+new URLSearchParams({song:track.id});\n  save.hidden=false;");
await writeFile(jsPath,js);

await cp(join(sourceBackend,'wrangler.staging.toml'), join(backend,'wrangler.staging.toml'));
const config = join(backend,'wrangler.staging.toml');
const originalConfig = await readFile(config,'utf8');
const archiveBinding = '[[r2_buckets]]\nbinding = "MUSIC_ARCHIVE"\nbucket_name = "ava-radio-staging-music"\n\n';
assert.match(originalConfig,/^name = "ava-radio-staging"$/m);
assert.match(originalConfig,/^database_name = "ava-radio-staging"$/m);
assert.doesNotMatch(originalConfig,/^\[\[r2_buckets\]\]/m,'Review existing archive binding before preparing a candidate.');
await writeFile(config, replaceOnce(originalConfig,'[vars]',archiveBinding + '[vars]\nLIBRARY_ACCOUNTS_ENABLED = "true"'));
console.log('Staging candidate prepared in ' + output);
