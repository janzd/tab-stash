import assert from 'node:assert/strict';
import path from 'node:path';

export async function paletteSettings({ context, library, results }) {
  const saved = await library.evaluate(async () => JSON.stringify(await (await import('./db.js')).getDecks()));
  const deckURL = library.url();
  const settingsURL = new URL('settings.html', library.url()).href;
  const errors = [];
  assert.deepEqual(await library.evaluate(() => chrome.runtime.getManifest().options_ui), { page: 'settings.html', open_in_tab: true });
  assert.equal(await library.getAttribute('html', 'data-palette'), 'blue');
  const tabCount = context.pages().length;
  await library.getByRole('button', { name: 'Settings', exact: true }).click();
  await library.waitForURL(settingsURL);
  await library.locator('.palette-card').last().waitFor();
  assert.equal(context.pages().length, tabCount, 'The gear opens Settings in the current tab');
  await library.goBack();
  await library.waitForURL(deckURL);
  await library.locator('#detail-view').waitFor();
  // Deliberately open a second page to exercise synchronization across existing tabs.
  const settings = await context.newPage();
  await settings.goto(settingsURL);
  settings.on('pageerror', error => errors.push(error.message));
  await settings.waitForURL(settingsURL);
  await settings.locator('.palette-card').last().waitFor();
  assert.equal(await settings.locator('#palette-control input:checked').inputValue(), 'blue');
  assert.equal(await settings.locator('.palette-preview').count(), 8);
  assert.equal(library.url(), deckURL, 'Opening Settings preserves the current deck');

  const choose = async (page, group, value) => {
    await page.locator(`label[for=${group}-${value}]`).click();
    await page.waitForFunction(group => !document.querySelector(`#${group}-control`).disabled, group);
  };
  for (const palette of ['blue', 'sage', 'violet', 'amber']) {
    await choose(settings, 'palette', palette);
    await library.waitForFunction(palette => document.documentElement.dataset.palette === palette, palette);
    for (const mode of ['light', 'dark']) {
      await choose(library, 'theme', mode);
      await settings.waitForFunction(mode => document.documentElement.dataset.theme === mode, mode);
      assert.equal(await settings.getAttribute('html', 'data-palette'), palette, 'Mode changes preserve the palette');
      const contrast = await settings.evaluate(() => {
        const css = getComputedStyle(document.documentElement);
        const luminance = token => css.getPropertyValue(token).trim().slice(1).match(/../g).slice(0, 3)
          .map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
        return [['ink', 'paper'], ['muted', 'paper'], ['muted', 'surface'], ['muted', 'soft'], ['on-accent', 'accent'], ['accent-text', 'accent-soft'], ['on-toast', 'toast-bg'], ['on-danger', 'danger-bg'], ['on-toast-error', 'toast-error-bg']]
          .map(([fg, bg]) => ({ pair: `${fg}/${bg}`, ratio: (Math.max(luminance(`--${fg}`), luminance(`--${bg}`)) + .05) / (Math.min(luminance(`--${fg}`), luminance(`--${bg}`)) + .05) }));
      });
      for (const item of contrast) assert.ok(item.ratio >= 4.5, `${palette}/${mode} ${item.pair}: ${item.ratio}`);
      assert.ok(await settings.evaluate(({ palette, mode }) => {
        const root = getComputedStyle(document.documentElement);
        const preview = getComputedStyle(document.querySelector(`.palette-preview[data-palette=${palette}][data-theme=${mode}]`));
        return ['--accent', '--paper', '--ink'].every(token => root.getPropertyValue(token) === preview.getPropertyValue(token));
      }, { palette, mode }), 'Previews use the actual palette colors');
      await settings.locator('#theme-control').evaluate(control => Promise.allSettled(control.getAnimations({ subtree: true }).map(animation => animation.finished)));
      await settings.screenshot({ path: path.join(results, `settings-${palette}-${mode}.png`), fullPage: true });
    }
  }
  // The native radio group supports arrow keys and retains focus after saving.
  await settings.locator('#palette-amber').focus();
  await settings.keyboard.press('ArrowLeft');
  await settings.waitForFunction(() => !document.querySelector('#palette-control').disabled);
  assert.equal(await settings.locator('#palette-violet').isChecked(), true);
  assert.equal(await settings.locator('#palette-violet').evaluate(input => input === document.activeElement), true);
  await library.waitForFunction(() => document.documentElement.dataset.palette === 'violet');
  await settings.reload();
  await settings.waitForFunction(() => document.querySelector('#palette-violet')?.checked);
  await choose(settings, 'theme', 'system');
  await settings.emulateMedia({ colorScheme: 'light' });
  await settings.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await settings.emulateMedia({ colorScheme: 'dark' });
  await settings.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  assert.equal(await settings.getAttribute('html', 'data-palette'), 'violet');

  await settings.setViewportSize({ width: 390, height: 844 });
  assert.ok(await settings.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Settings fits a narrow window');
  await choose(settings, 'palette', 'sage');
  await settings.locator('#theme-control').evaluate(control => Promise.allSettled(control.getAnimations({ subtree: true }).map(animation => animation.finished)));
  await settings.screenshot({ path: path.join(results, 'settings-narrow.png'), fullPage: true });
  await library.waitForFunction(() => document.documentElement.dataset.palette === 'sage');

  await settings.evaluate(async () => {
    await chrome.storage.local.set({ palettePreference: 'invalid' });
    localStorage.setItem('tabstash.palettePreference', 'amber');
  });
  await settings.reload();
  await settings.waitForFunction(() => document.documentElement.dataset.palette === 'blue');
  await library.waitForFunction(() => document.documentElement.dataset.palette === 'blue');
  assert.equal(await settings.getAttribute('html', 'data-theme-preference'), 'system');
  await choose(settings, 'palette', 'amber');
  await settings.evaluate(() => chrome.storage.local.remove('palettePreference'));
  await settings.waitForFunction(() => document.documentElement.dataset.palette === 'blue');
  await choose(settings, 'palette', 'amber');
  await choose(settings, 'theme', 'light');
  await library.waitForFunction(() => document.documentElement.dataset.palette === 'amber' && document.documentElement.dataset.theme === 'light');
  assert.equal(await library.evaluate(async () => JSON.stringify(await (await import('./db.js')).getDecks())), saved, 'Palette changes preserve decks and screenshot bytes');
  await settings.close();

  // The library overview exposes the same entry point and registered Options route.
  await library.locator('#back').click();
  await library.locator('#open-settings').click();
  await library.waitForURL(settingsURL);
  await library.locator('#palette-amber').waitFor();
  assert.equal(context.pages().length, tabCount, 'The overview gear also uses the current tab');
  await library.locator('.topbar a').click();
  await library.waitForURL(new URL('library.html', settingsURL).href);
  await library.locator('#library-view').waitFor();
  await library.locator('.deck-card').first().click();
  await library.locator('#detail-view').waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: registered Options, same-tab gear and Back navigation, 4 paired palettes, contrast, keyboard, live sync, defaults, persistence, narrow Settings, and unchanged decks');
}
