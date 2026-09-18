import assert from 'node:assert/strict';
import path from 'node:path';

export async function previewCacheExperiment({ context, library, origin, results }) {
  const base = new URL('settings.html', library.url()).href;
  const settings = await context.newPage();
  const errors = [];
  settings.on('pageerror', error => errors.push(error.message));
  await settings.goto(base);
  await settings.locator('#collect-previews').waitFor();
  assert.equal(await settings.locator('#collect-previews').isChecked(), false, 'Experiment starts off');
  const waitForPreview = async url => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const entries = await cache();
      if (entries.some(entry => entry.url === url)) return;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error(`No passive preview for ${url}; cached URLs: ${JSON.stringify((await cache()).map(entry => entry.url))}`);
  };
  const cache = () => library.evaluate(async () => (await chrome.storage.session.get('previewCache')).previewCache || []);
  const decks = await library.evaluate(async () => JSON.stringify(await (await import('./db.js')).getDecks()));
  const first = await context.newPage();
  await first.goto(`${origin}/0?preview=first`);
  await first.bringToFront();
  await first.waitForTimeout(2500);
  assert.equal((await cache()).length, 0, 'Normal browsing does not capture before opting in');

  await settings.bringToFront();
  await settings.locator('#collect-previews').check();
  await settings.waitForFunction(() => !document.querySelector('#collect-previews').disabled);
  assert.equal(await settings.locator('#collect-previews').isChecked(), true);
  // Regression: ordinary macOS full-screen browsing must remain eligible.
  const windowId = await library.evaluate(async url => (await chrome.tabs.query({})).find(tab => tab.url === url).windowId, first.url());
  await library.evaluate(id => chrome.windows.update(id, { state: 'fullscreen' }), windowId);
  await first.waitForTimeout(1500);
  await first.evaluate(() => {
    document.body.style.minHeight = '2000px';
    const input = document.createElement('input');
    input.id = 'typing';
    input.style.cssText = 'position:fixed;top:10px;left:20px;z-index:9';
    document.body.append(input);
    window.scrollTo(0, 100);
    input.focus({ preventScroll: true });
    window.visibilityEvents = [];
    document.addEventListener('visibilitychange', () => window.visibilityEvents.push(document.visibilityState));
  });
  await first.bringToFront();
  await first.locator('#typing').pressSequentially('Still typing');
  const before = await first.evaluate(() => ({ scroll: scrollY, value: document.querySelector('#typing').value, active: document.activeElement.id, events: window.visibilityEvents.length }));
  await waitForPreview(first.url());
  const after = await first.evaluate(() => ({ scroll: scrollY, value: document.querySelector('#typing').value, active: document.activeElement.id, events: window.visibilityEvents.length }));
  assert.deepEqual(after, before, 'Passive capture preserves focus, typed input, scroll position, and visibility');
  assert.equal(await first.evaluate(() => document.hasFocus()), true);
  assert.equal(await library.evaluate(async id => (await chrome.windows.get(id)).state, windowId), 'fullscreen', 'Collecting must not leave full screen');
  const firstEntry = (await cache()).find(entry => entry.url === first.url());
  assert.equal(firstEntry.title, 'Kyoto, at your own pace');
  assert.ok(firstEntry.durationMs >= 0 && firstEntry.capturedAt > 0);
  const pixel = await library.evaluate(async data => {
    const image = new Image(); image.src = data; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    return { width: image.width, rgb: Array.from(context.getImageData(1, image.height - 2, 1, 1).data).slice(0, 3) };
  }, firstEntry.screenshot);
  assert.ok(pixel.width <= 640);
  assert.ok(pixel.rgb.every((channel, index) => Math.abs(channel - [220, 232, 207][index]) <= 8), `Correct page pixels: ${pixel.rgb}`);

  await library.evaluate(id => chrome.windows.update(id, { state: 'normal' }), windowId);
  await first.waitForTimeout(1500);
  const second = await context.newPage();
  await second.goto(`${origin}/1?preview=second`);
  await second.bringToFront();
  // A fleeting visit should not replace the active page's preview.
  await first.bringToFront();
  await first.waitForTimeout(2200);
  assert.equal((await cache()).some(entry => entry.url === second.url()), false);
  await second.bringToFront();
  await waitForPreview(second.url());
  const secondEntry = (await cache()).find(entry => entry.url === second.url());
  assert.equal(secondEntry.title, 'A space to make things');
  const secondPixel = await library.evaluate(async data => {
    const image = new Image(); image.src = data; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(1, image.height - 2, 1, 1).data).slice(0, 3);
  }, secondEntry.screenshot);
  assert.ok(secondPixel.every((channel, index) => Math.abs(channel - [240, 219, 200][index]) <= 8), `Second page pixels: ${secondPixel}`);
  await settings.bringToFront();
  await settings.locator('#preview-cache-grid figure').first().waitFor();
  assert.match(await settings.locator('#preview-cache-diagnostic').textContent(), /preview/);
  const previewLink = settings.getByRole('link', { name: `Open tab: ${secondEntry.title}`, exact: true });
  assert.equal(await previewLink.getAttribute('href'), secondEntry.url);
  const settingsURL = settings.url();
  const opened = context.waitForEvent('page');
  await previewLink.locator('img').click();
  const reopened = await opened;
  await reopened.waitForURL(secondEntry.url);
  assert.equal(settings.url(), settingsURL, 'Opening a cached page keeps Settings available');
  await reopened.close();
  await settings.bringToFront();
  await previewLink.focus();
  const keyboardOpened = context.waitForEvent('page');
  await settings.keyboard.press('Enter');
  const keyboardPage = await keyboardOpened;
  await keyboardPage.waitForURL(secondEntry.url);
  await keyboardPage.close();
  await settings.bringToFront();
  await settings.locator('.preview-experiment').screenshot({ path: path.join(results, 'preview-cache-experiment.png') });
  await settings.setViewportSize({ width: 390, height: 844 });
  assert.ok(await settings.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await settings.locator('.preview-experiment').screenshot({ path: path.join(results, 'preview-cache-narrow.png') });
  await settings.locator('#collect-previews').uncheck();
  await settings.waitForFunction(() => !document.querySelector('#collect-previews').disabled);
  const paused = JSON.stringify(await cache());
  await first.goto(`${origin}/2?preview=paused`);
  await first.bringToFront();
  await first.waitForTimeout(5500);
  assert.equal(JSON.stringify(await cache()), paused, 'Opting out stops collection');
  await settings.bringToFront();
  await settings.locator('#clear-previews').click();
  await settings.waitForFunction(() => document.querySelector('#preview-cache-status').textContent.includes('0 cached'));
  assert.deepEqual(await cache(), []);
  assert.equal(await library.evaluate(async () => JSON.stringify(await (await import('./db.js')).getDecks())), decks, 'The experiment never writes saved decks');
  await settings.locator('#collect-previews').check();
  await settings.waitForFunction(() => !document.querySelector('#collect-previews').disabled);
  assert.deepEqual(errors, []);
  console.log(`PASS: opt-in passive previews, screenshot identity, full-screen capture with focus/input/scroll preservation, debouncing, pause/clear, unchanged decks; observed first capture + resize ${firstEntry.durationMs} ms`);
  await first.close();
  await second.close();
  await settings.close();
  await library.bringToFront();
}
