import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp, mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { paletteSettings } from './palettes-browser.mjs';
import { themePreferences, themeAppearance } from './themes-browser.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : '@playwright/test');
const root = fileURLToPath(new URL('../', import.meta.url));
const results = path.join(root, 'test-results');
await mkdir(results, { recursive: true });
const temp = await mkdtemp(path.join(tmpdir(), 'tabstash-e2e-'));
const extension = path.join(temp, 'extension');
await cp(path.join(root, 'extension'), extension, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
manifest.host_permissions = manifest.optional_host_permissions;
delete manifest.optional_host_permissions;
await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));

const pages = [
  { title: 'Kyoto, at your own pace', subtitle: 'A field guide to slower days', color: '#dce8cf', ink: '#294b35', kicker: 'THE WEEKEND JOURNAL', shape: '50% 50% 0 0' },
  { title: 'A space to make things', subtitle: 'Objects for everyday rituals', color: '#f0dbc8', ink: '#6f4a34', kicker: 'FORM & FUNCTION', shape: '40% 40% 40% 40%' },
  { title: 'Collect a little wonder', subtitle: 'Notes from the road less taken', color: '#d9e4ef', ink: '#345171', kicker: 'SOMEWHERE ELSE', shape: '50%' }
];
const server = createServer((req, res) => {
  const index = Number(req.url?.slice(1)) || 0;
  const p = pages[index % pages.length];
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!doctype html><title>${p.title}</title><style>*{box-sizing:border-box}body{margin:0;background:${p.color};color:${p.ink};font-family:Arial}nav{padding:28px 5%;display:flex;justify-content:space-between;border-bottom:1px solid #0002;font-size:12px;letter-spacing:2px}main{padding:8% 8%;display:flex;align-items:center;gap:8%}section{width:58%}small{letter-spacing:3px;font-size:10px}h1{font:64px Georgia;line-height:1.1;letter-spacing:-2px;margin:26px 0}p{font:16px Georgia}button{margin-top:22px;padding:14px 22px;color:${p.color};background:${p.ink};border:0;border-radius:4px}aside{width:34%;height:330px;border-radius:${p.shape};background:linear-gradient(140deg,#ffffff99,${p.ink});position:relative}aside:after{content:'';position:absolute;inset:25%;border:1px solid #ffffff88;border-radius:50%}footer{padding:20px 5%;font-size:10px;letter-spacing:2px;border-top:1px solid #0002}</style><nav><b>${p.kicker}</b><span>PLACES &nbsp; NOTES &nbsp; ABOUT</span></nav><main><section><small>FIND YOUR NEXT CHAPTER</small><h1>${p.title}</h1><p>${p.subtitle}</p><button>Explore the collection ↗</button></section><aside></aside></main><footer>GOOD THINGS TAKE A LITTLE EXPLORING.</footer>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let context;
async function until(fn, label, timeout = 25000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await fn()) return; await new Promise(r => setTimeout(r, 150)); }
  throw new Error(`Timed out: ${label}`);
}

const launchOptions = {
    channel: 'chromium', executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, headless: false, viewport: { width: 1440, height: 1000 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-first-run', '--no-default-browser-check']
};
try {
  context = await chromium.launchPersistentContext(path.join(temp, 'profile'), launchOptions);
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const pageErrors = [];
  const initial = context.pages();
  for (let index = 0; index < 3; index++) {
    const page = await context.newPage();
    await page.goto(`${origin}/${index}`);
  }
  for (const page of initial) await page.close();
  const library = await context.newPage();
  library.on('pageerror', error => pageErrors.push(error.message));
  await library.goto(`chrome-extension://${id}/library.html`);
  await library.locator('#empty-stash').waitFor();
  await themePreferences({ context, library, results });
  await library.screenshot({ path: path.join(results, '01-empty.png'), fullPage: true });
  const dbDecks = () => library.evaluate(async () => (await import('./db.js')).getDecks());
  const captureStatus = () => library.evaluate(async () => (await chrome.storage.session.get('capture')).capture);
  await library.getByRole('button', { name: 'Stash open tabs', exact: true }).click();
  await library.locator('#deck-name').fill('A weekend worth saving');
  await library.locator('#save-submit').click();
  await until(async () => { const s = await captureStatus(); return s?.running === false; }, 'capture complete');
  const first = (await dbDecks())[0];
  assert.equal(first.tabs.length, 3);
  assert.equal(first.status, 'complete');
  assert.equal(first.tabs.filter(t => t.screenshot).length, 3, JSON.stringify(first.tabs.map(t => t.captureNote)));
  assert.equal(new Set(first.tabs.map(t => t.screenshot)).size, 3, 'Each page has its own screenshot');
  const imageInfo = await library.evaluate(async tabs => Promise.all(tabs.map(async tab => {
    const img = new Image(); img.src = tab.screenshot; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 400;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
    return { width: img.naturalWidth, pixel: [...ctx.getImageData(1, 1, 1, 1).data] };
  })), first.tabs);
  for (const image of imageInfo) assert.ok(image.width <= 640);
  for (const [index, hex] of ['dce8cf', 'f0dbc8', 'd9e4ef'].entries()) {
    const target = hex.match(/../g).map(v => parseInt(v, 16));
    assert.ok(target.every((v, i) => Math.abs(v - imageInfo[index].pixel[i]) < 12), `Screenshot belongs to page ${index}: ${JSON.stringify(imageInfo[index])}`);
  }
  console.log('PASS: real capture, thumbnail size, page identity, all links saved');
  await library.bringToFront();
  await library.locator('.deck-card').first().click();
  await library.locator('#detail-title').waitFor();
  await library.screenshot({ path: path.join(results, '02-deck.png'), fullPage: true });
  assert.equal(await library.locator('.tab-card').count(), 3);
  await library.reload();
  await library.locator('.tab-card').first().waitFor();
  assert.equal(await library.locator('.tab-card').count(), 3);
  console.log('PASS: IndexedDB persistence across reload');
  await themeAppearance({ library, results });
  await paletteSettings({ context, library, results });

  await library.locator('#rename-deck').click();
  await library.locator('#rename-input').fill('Slow weekends');
  await library.locator('#edit-form button[type=submit]').click();
  await until(async () => (await dbDecks())[0].name === 'Slow weekends', 'rename');
  await library.locator('#back').click();
  await library.locator('#search').fill('quiet mountain nowhere');
  await library.locator('#no-results').waitFor();
  assert.equal(await library.locator('.deck-card').count(), 0);
  await library.locator('#search').fill('kyoto');
  await library.locator('.deck-card').waitFor();
  await library.locator('.deck-card').click();
  await library.locator('#detail-title').waitFor();
  const searchedDeckHash = new URL(library.url()).hash;
  assert.equal(await library.locator('#search').inputValue(), '');
  assert.equal(await library.locator('#search').getAttribute('aria-label'), 'Search tabs in this deck');
  await library.locator('#search').fill('MAKE /1');
  assert.equal(new URL(library.url()).hash, searchedDeckHash);
  assert.equal(await library.locator('#detail-view').isVisible(), true);
  assert.equal(await library.locator('.tab-card').count(), 1);
  assert.equal(await library.locator('.tab-card h3').textContent(), pages[1].title);
  assert.equal(await library.locator('#tab-search-summary').textContent(), '1 of 3 tabs match your search');
  await library.screenshot({ path: path.join(results, '05-deck-search.png'), fullPage: true });
  await library.locator('#search').fill('kyoto wonder');
  assert.equal(await library.locator('.tab-card').count(), 0);
  assert.equal(await library.locator('#tab-no-results').isVisible(), true);
  await library.locator('#clear-tab-empty-search').click();
  assert.equal(await library.locator('.tab-card').count(), 3);
  assert.equal(await library.locator('#search').inputValue(), '');
  assert.equal(await library.locator('#search').evaluate(el => el === document.activeElement), true);
  await library.locator('#search').fill('/2');
  assert.equal(await library.locator('.tab-card').count(), 1);
  const filteredExportEvent = library.waitForEvent('download');
  await library.locator('#export-deck').click();
  const filteredExport = await filteredExportEvent;
  const filteredPath = path.join(temp, 'filtered-deck.json');
  await filteredExport.saveAs(filteredPath);
  assert.equal(JSON.parse(await readFile(filteredPath, 'utf8')).decks[0].tabs.length, 3);
  await library.locator('#back').click();
  await library.locator('#library-view').waitFor();
  assert.equal(await library.locator('#search').inputValue(), 'kyoto');
  assert.equal(await library.locator('#search').getAttribute('aria-label'), 'Search decks and tabs');
  await library.locator('.deck-card').click();
  await library.locator('#detail-view').waitFor();
  assert.equal(await library.locator('#search').inputValue(), '/2');
  assert.equal(await library.locator('.tab-card').count(), 1);
  await library.goBack();
  await library.locator('#library-view').waitFor();
  assert.equal(await library.locator('#search').inputValue(), 'kyoto');
  await library.goForward();
  await library.locator('#detail-view').waitFor();
  assert.equal(await library.locator('#search').inputValue(), '/2');
  await library.locator('#clear-tab-search').click();
  assert.equal(await library.locator('.tab-card').count(), 3);
  await library.locator('#back').click();
  await library.locator('#library-view').waitFor();
  await library.locator('#search').fill('');
  console.log('PASS: scoped title/URL search, match count, no results, clearing, navigation, and full-deck export while filtered');

  const downloadEvent = library.waitForEvent('download');
  await library.locator('#export-all').click();
  const download = await downloadEvent;
  const backupPath = path.join(temp, 'backup.json');
  await download.saveAs(backupPath);
  const exported = JSON.parse(await readFile(backupPath, 'utf8'));
  assert.equal(exported.decks[0].tabs.filter(t => t.screenshot).length, 3);
  await library.locator('#import-file').setInputFiles(backupPath);
  await until(async () => (await dbDecks()).length === 2, 'import');
  const imported = await dbDecks();
  assert.notEqual(imported[0].id, imported[1].id);
  await library.locator('#import-file').setInputFiles({ name: 'unsafe.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...exported, decks: [{ ...exported.decks[0], tabs: [{ ...exported.decks[0].tabs[0], url: 'javascript:alert(1)' }] }] })) });
  await until(async () => (await library.locator('#toast').textContent()).includes('unsupported'), 'unsafe import error');
  assert.equal((await dbDecks()).length, 2);
  console.log('PASS: screenshot backup round trip, unique import IDs, unsafe import rejection');

  await library.locator('.deck-card').nth(0).click();
  await library.locator('#detail-view').waitFor();
  await library.locator('#search').fill('kyoto');
  await library.locator('#back').click();
  await library.locator('#library-view').waitFor();
  await library.locator('.deck-card').nth(1).click();
  await library.locator('#detail-view').waitFor();
  assert.equal(await library.locator('#search').inputValue(), '');
  await library.locator('#search').fill('space');
  await library.locator('#back').click();
  await library.locator('#library-view').waitFor();
  await library.locator('.deck-card').nth(0).click();
  await library.locator('#detail-view').waitFor();
  assert.equal(await library.locator('#search').inputValue(), 'kyoto');
  assert.equal(await library.locator('.tab-card').count(), 1);
  await library.locator('#back').click();
  await library.locator('#library-view').waitFor();
  assert.equal(await library.locator('#search').inputValue(), '');
  console.log('PASS: separate queries for each deck and the library');

  // Additional decks exist only in this isolated test profile, never in the shipped extension.
  await library.evaluate(async base => {
    const { addDecks } = await import('./db.js');
    const names = ['Objects with a story', 'The next little adventure', 'A fresh perspective', 'Things to come back to'];
    await addDecks(names.map((name, i) => ({ ...base, id: crypto.randomUUID(), name, createdAt: Date.now() - (i + 1) * 86400000, tabs: [...base.tabs.slice(i % 3), ...base.tabs.slice(0, i % 3)] })));
  }, first);
  await library.reload();
  await library.locator('.deck-card').first().waitFor();
  await library.screenshot({ path: path.join(results, '03-library.png'), fullPage: true });
  await library.setViewportSize({ width: 620, height: 900 });
  await library.screenshot({ path: path.join(results, '04-mobile.png'), fullPage: true });
  assert.ok(await library.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
  await library.setViewportSize({ width: 1440, height: 1000 });

  await library.locator('.deck-card').first().click();
  await library.locator('#detail-view').waitFor();
  await library.locator('#search').fill('KYOTO');
  assert.equal(await library.locator('.tab-card').count(), 1);
  const beforeRestore = await library.evaluate(() => chrome.tabs.query({}));
  await library.locator('#restore-deck').click();
  await until(async () => (await library.evaluate(() => chrome.tabs.query({}))).length === beforeRestore.length + 3, 'restore');
  const newTabs = (await library.evaluate(() => chrome.tabs.query({}))).filter(t => !beforeRestore.some(b => b.id === t.id));
  assert.equal(new Set(newTabs.map(t => t.windowId)).size, 1);
  assert.deepEqual(newTabs.map(t => t.url || t.pendingUrl), first.tabs.map(t => t.url));
  await library.evaluate(ids => chrome.tabs.remove(ids), newTabs.map(t => t.id));
  console.log('PASS: filtered deck restores every saved tab into a new window with ordered URLs');

  await library.bringToFront();
  await library.locator('#delete-deck').click();
  await library.locator('#delete-form button[type=submit]').click();
  await until(async () => (await dbDecks()).length === 5, 'delete');
  assert.equal((await library.evaluate(() => chrome.tabs.query({}))).length, beforeRestore.length);
  console.log('PASS: delete deck without closing tabs');

  // Stop immediately after the metadata checkpoint: all links must survive.
  await library.locator('#new-deck').click();
  await library.locator('#deck-name').fill('Cancelled but safe');
  await library.locator('#save-submit').click();
  await until(async () => (await captureStatus())?.running === true, 'capture starts');
  await library.evaluate(() => chrome.runtime.sendMessage({ type: 'capture:cancel' }));
  await until(async () => (await captureStatus())?.running === false, 'cancel complete');
  const cancelled = (await dbDecks()).find(d => d.name === 'Cancelled but safe');
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.tabs.length, 3);
  console.log('PASS: cancellation retains every link');

  await library.evaluate(async () => {
    const db = await import('./db.js');
    const list = await db.getDecks();
    await db.putDeck({ ...list[0], status: 'capturing' });
    await chrome.storage.session.set({ capture: { running: true, deckId: list[0].id, done: 1, total: 3 } });
  });
  await library.reload();
  await until(async () => (await dbDecks()).every(d => d.status !== 'capturing'), 'interrupted recovery');
  assert.equal((await captureStatus()).running, false);
  console.log('PASS: interrupted capture recovery');

  await library.bringToFront();
  await library.locator('#all-decks').click();
  const extra = await library.evaluate(async origin => {
    const win = await chrome.windows.create({ url: `${origin}/1`, focused: false });
    await chrome.tabs.update(win.tabs[0].id, { pinned: true });
    await chrome.tabs.create({ windowId: win.id, url: 'chrome://settings', active: false });
    return win.id;
  }, origin);
  await library.bringToFront();
  await library.locator('#new-deck').click();
  await library.locator('#deck-name').fill('Across two windows');
  await library.locator('#capture-scope').selectOption('all');
  await library.locator('#save-submit').click();
  await until(async () => (await captureStatus())?.running === true, 'all window capture starts');
  const duplicate = await library.evaluate(() => chrome.runtime.sendMessage({ type: 'capture:start', name: 'Must not start', scope: 'all' }));
  assert.match(duplicate.error, /already/);
  await until(async () => (await captureStatus())?.running === false, 'all window capture finishes');
  const multi = (await dbDecks()).find(d => d.name === 'Across two windows');
  assert.equal(multi.tabs.length, 5);
  assert.equal(new Set(multi.tabs.map(t => t.windowIndex)).size, 2);
  assert.equal(multi.tabs.filter(t => t.screenshot).length, 4);
  assert.equal(multi.tabs.filter(t => t.pinned).length, 1);
  assert.match(multi.tabs.find(t => t.url.startsWith('chrome://settings')).captureNote, /Browser/);
  await library.bringToFront();
  await library.evaluate(id => { location.hash = id; }, multi.id);
  await library.locator('#detail-title').waitFor();
  const beforeMulti = await library.evaluate(() => chrome.tabs.query({}));
  await library.locator('#restore-deck').click();
  await until(async () => (await library.evaluate(() => chrome.tabs.query({}))).length === beforeMulti.length + 5, 'multi window restore');
  const multiRestored = (await library.evaluate(() => chrome.tabs.query({}))).filter(t => !beforeMulti.some(b => b.id === t.id));
  assert.equal(new Set(multiRestored.map(t => t.windowId)).size, 2);
  assert.equal(multiRestored.filter(t => t.pinned).length, 1);
  await library.evaluate(async ({ ids, extra }) => { await chrome.tabs.remove(ids); await chrome.windows.remove(extra); }, { ids: multiRestored.map(t => t.id), extra });
  console.log('PASS: multi-window capture/restore, pinned tabs, restricted-page fallback, concurrent capture rejection');
  assert.deepEqual(pageErrors, [], 'No uncaught UI errors');
  await library.locator('label[for=theme-dark]').click();
  await library.waitForFunction(() => !document.querySelector('#theme-control').disabled);
  await context.close();
  context = await chromium.launchPersistentContext(path.join(temp, 'profile'), launchOptions);
  const restarted = await context.newPage();
  await restarted.emulateMedia({ colorScheme: 'light' });
  await restarted.goto(`chrome-extension://${id}/library.html`);
  await restarted.locator('#theme-control').waitFor();
  assert.equal(await restarted.getAttribute('html', 'data-theme'), 'dark');
  assert.equal(await restarted.locator('#theme-control input:checked').inputValue(), 'dark');
  assert.equal(await restarted.getAttribute('html', 'data-palette'), 'amber');
  console.log('PASS: theme and palette preferences persist across a full browser restart');
  console.log('All browser integration checks passed.');
} finally {
  await context?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(temp, { recursive: true, force: true });
}
