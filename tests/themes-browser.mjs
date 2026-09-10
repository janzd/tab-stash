import assert from 'node:assert/strict';
import path from 'node:path';

export async function themePreferences({ context, library, results }) {
  const theme = () => library.getAttribute('html', 'data-theme');
  const choose = async value => {
    await library.locator(`label[for=theme-${value}]`).click();
    await library.waitForFunction(value => document.querySelector('#theme-control').disabled === false && document.documentElement.dataset.themePreference === value, value);
  };
  assert.equal(await library.locator('#theme-control input:checked').inputValue(), 'system');
  assert.equal(await library.locator('.topbar #theme-control').count(), 0);
  assert.equal(await library.locator('#theme-control label svg').count(), 3);
  assert.equal(await library.locator('#theme-control').evaluate(control => control.closest('.sidebar') !== null && control.nextElementSibling.classList.contains('local-note')), true);
  const controlBox = await library.locator('#theme-control').boundingBox();
  const noteBox = await library.locator('.local-note').boundingBox();
  assert.ok(controlBox.y + controlBox.height <= noteBox.y, 'Slider sits just above the local-storage note');
  await library.locator('#theme-system').focus();
  await library.keyboard.press('ArrowLeft');
  await library.waitForFunction(() => !document.querySelector('#theme-control').disabled);
  assert.equal(await library.locator('#theme-dark').isChecked(), true);
  assert.equal(await library.locator('#theme-dark').evaluate(input => input === document.activeElement), true);
  await library.keyboard.press('ArrowLeft');
  await library.waitForFunction(() => !document.querySelector('#theme-control').disabled);
  assert.equal(await library.locator('#theme-light').isChecked(), true);
  await library.keyboard.press('ArrowRight');
  await library.waitForFunction(() => !document.querySelector('#theme-control').disabled);
  assert.equal(await library.locator('#theme-dark').isChecked(), true);
  await choose('system');
  await library.emulateMedia({ colorScheme: 'dark' });
  await library.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await library.screenshot({ path: path.join(results, 'theme-empty-dark.png'), fullPage: true });
  await library.emulateMedia({ colorScheme: 'light' });
  await library.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await choose('dark');
  assert.equal(await theme(), 'dark');
  await library.reload();
  await library.locator('#theme-control').waitFor();
  assert.equal(await theme(), 'dark');
  assert.equal(await library.locator('#theme-control input:checked').inputValue(), 'dark');

  const other = await context.newPage();
  await other.emulateMedia({ colorScheme: 'light' });
  await other.goto(library.url());
  assert.equal(await other.getAttribute('html', 'data-theme'), 'dark');
  await choose('light');
  await other.waitForFunction(() => document.documentElement.dataset.themePreference === 'light');
  assert.equal(await other.locator('#theme-control input:checked').inputValue(), 'light');
  await library.emulateMedia({ colorScheme: 'dark' });
  assert.equal(await theme(), 'light');
  await choose('system');
  await other.waitForFunction(() => document.documentElement.dataset.themePreference === 'system');
  assert.equal(await theme(), 'dark');
  assert.equal(await other.getAttribute('html', 'data-theme'), 'light');

  // Chrome storage is authoritative even if the early-paint cache is missing/stale.
  await library.evaluate(async () => {
    await chrome.storage.local.set({ themePreference: 'dark' });
    localStorage.setItem('tabstash.themePreference', 'light');
  });
  await library.reload();
  await library.waitForFunction(() => document.documentElement.dataset.themePreference === 'dark');
  assert.equal(await theme(), 'dark');
  await library.evaluate(() => chrome.storage.local.remove('themePreference'));
  await library.waitForFunction(() => document.documentElement.dataset.themePreference === 'system');
  assert.equal(await library.locator('#theme-control input:checked').inputValue(), 'system');
  await other.close();
  await library.emulateMedia({ colorScheme: 'light' });
  await choose('system');
  await library.bringToFront();
  console.log('PASS: System defaults, live OS changes, explicit overrides, reload persistence, cross-page sync, and authoritative storage');
}

export async function themeAppearance({ library, results }) {
  const saved = await library.evaluate(async () => JSON.stringify(await (await import('./db.js')).getDecks()));
  const pictures = await library.locator('.tab-image img').evaluateAll(images => images.map(img => img.src));
  const backdrops = [];
  for (const theme of ['light', 'dark']) {
    await library.locator(`label[for=theme-${theme}]`).click();
    await library.waitForFunction(theme => document.documentElement.dataset.theme === theme && !document.querySelector('#theme-control').disabled, theme);
    assert.equal(await library.evaluate(() => getComputedStyle(document.documentElement).colorScheme), theme);
    const controlsMatch = await library.evaluate(() => {
      const probe = document.createElement('span');
      document.body.append(probe);
      try {
        return [['.nav-item.active', '--accent-soft'], ['#restore-deck', '--green'], ['#rename-deck', '--surface']].every(([selector, token]) => {
          probe.style.backgroundColor = `var(${token})`;
          return getComputedStyle(document.querySelector(selector)).backgroundColor === getComputedStyle(probe).backgroundColor;
        });
      } finally { probe.remove(); }
    });
    assert.ok(controlsMatch, 'Control backgrounds must switch immediately with text, without a light/dark color fade');
    assert.deepEqual(await library.locator('.tab-image img').evaluateAll(images => images.map(img => img.src)), pictures);
    assert.ok(await library.locator('.tab-image img').evaluateAll(images => images.every(img => getComputedStyle(img).filter === 'none')));
    backdrops.push(await library.evaluate(() => getComputedStyle(document.documentElement).backgroundColor));
    await library.locator('#theme-control').evaluate(control => Promise.allSettled(control.getAnimations({ subtree: true }).map(animation => animation.finished)));
    assert.ok(await library.locator('#theme-control').evaluate((control, theme) => {
      const indicator = getComputedStyle(control, '::before');
      const x = new DOMMatrixReadOnly(indicator.transform).m41;
      return Math.abs(x - ['light', 'dark', 'system'].indexOf(theme) * parseFloat(indicator.width)) < 1;
    }, theme), 'Selection indicator reaches the chosen icon');
    await library.screenshot({ path: path.join(results, `theme-deck-${theme}.png`), fullPage: true });
    // Check the actual palette's small-text contrast, not just its color names.
    const contrast = await library.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      const rgb = token => css.getPropertyValue(token).trim().slice(1).match(/../g).slice(0, 3).map(v => parseInt(v, 16) / 255);
      const luminance = token => rgb(token).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      return [
        ['--ink', '--paper'], ['--muted', '--paper'], ['--muted', '--surface'],
        ['--on-accent', '--green'], ['--accent-text', '--accent-soft'],
        ['--on-toast', '--toast-bg'], ['--on-danger', '--danger-bg'],
        ['--on-toast-error', '--toast-error-bg']
      ].map(([fg, bg]) => ({ pair: `${fg}/${bg}`, ratio: (Math.max(luminance(fg), luminance(bg)) + 0.05) / (Math.min(luminance(fg), luminance(bg)) + 0.05) }));
    });
    for (const item of contrast) assert.ok(item.ratio >= 4.5, `${theme} ${item.pair} contrast: ${item.ratio}`);

    await library.locator('#rename-deck').click();
    await library.screenshot({ path: path.join(results, `theme-dialog-${theme}.png`), fullPage: true });
    await library.locator('#edit-dialog .close-dialog').first().click();
    await library.locator('#search').fill('nothing-matches-this-query');
    assert.equal(await library.locator('#tab-no-results').isVisible(), true);
    await library.screenshot({ path: path.join(results, `theme-no-results-${theme}.png`), fullPage: true });
    await library.locator('#clear-tab-empty-search').click();
    await library.setViewportSize({ width: 620, height: 900 });
    assert.ok(await library.locator('#theme-control').isVisible());
    const narrowControl = await library.locator('#theme-control').boundingBox();
    assert.ok(narrowControl.x < 70 && narrowControl.y + narrowControl.height <= 900, 'Slider remains within the narrow sidebar');
    const firstIcon = await library.locator('label[for=theme-light]').boundingBox();
    const lastIcon = await library.locator('label[for=theme-system]').boundingBox();
    assert.ok(firstIcon.y < lastIcon.y, 'Narrow sidebar stacks the three options vertically');
    await library.locator('label[for=theme-system]').click();
    await library.waitForFunction(() => !document.querySelector('#theme-control').disabled);
    assert.equal(await library.locator('#theme-system').isChecked(), true);
    await library.locator(`label[for=theme-${theme}]`).click();
    await library.waitForFunction(() => !document.querySelector('#theme-control').disabled);
    await library.locator('#theme-control').evaluate(control => Promise.allSettled(control.getAnimations({ subtree: true }).map(animation => animation.finished)));
    assert.ok(await library.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await library.screenshot({ path: path.join(results, `theme-narrow-${theme}.png`), fullPage: true });
    await library.setViewportSize({ width: 1440, height: 1000 });
  }
  assert.notEqual(backdrops[0], backdrops[1]);
  assert.equal(await library.evaluate(async () => JSON.stringify(await (await import('./db.js')).getDecks())), saved);
  await library.locator('#back').click();
  await library.locator('#library-view').waitFor();
  await library.screenshot({ path: path.join(results, 'theme-library-dark.png'), fullPage: true });
  await library.locator('.deck-card').first().click();
  await library.locator('#detail-view').waitFor();
  await library.locator('label[for=theme-light]').click();
  await library.waitForFunction(() => document.documentElement.dataset.theme === 'light' && !document.querySelector('#theme-control').disabled);
  console.log('PASS: both palettes, native controls, contrast, dialogs, scoped-search empty states, narrow layouts, and unchanged screenshot/deck data');
}
