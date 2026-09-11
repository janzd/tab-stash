import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const catalog = readFileSync(new URL('../extension/palettes.js', import.meta.url), 'utf8');
const script = catalog + readFileSync(new URL('../extension/theme.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function setup({ cached, saved, dark = false, read, write, cacheBlocked = false, cachedPalette, savedPalette } = {}) {
  const root = { dataset: {}, style: {} };
  const control = { disabled: false, addEventListener: (_, fn) => { control.change = fn; } };
  const inputs = ['light', 'dark', 'system'].map(value => ({ value, checked: false }));
  const paletteControl = { disabled: false, addEventListener: (_, fn) => { paletteControl.change = fn; } };
  const paletteInputs = ['blue', 'sage', 'violet', 'amber'].map(value => ({ value, checked: false }));
  const error = {};
  const system = { matches: dark, addEventListener: (_, fn) => { system.change = fn; } };
  const values = new Map([['tabstash.themePreference', cached], ['tabstash.palettePreference', cachedPalette]]);
  const writes = [];
  const paletteWrites = [];
  let ready;
  let changed;
  runInNewContext(script, {
    document: {
      documentElement: root,
      querySelector: selector => selector === '#theme-control' ? control : selector === '#palette-control' ? paletteControl : error,
      querySelectorAll: selector => selector.startsWith('#palette-control') ? paletteInputs : inputs,
      addEventListener: (_, fn) => { ready = fn; }
    },
    matchMedia: () => system,
    localStorage: {
      getItem: key => { if (cacheBlocked) throw Error('Unavailable'); return values.get(key); },
      setItem: (key, value) => { if (cacheBlocked) throw Error('Unavailable'); values.set(key, value); }
    },
    chrome: { storage: {
      onChanged: { addListener: fn => { changed = fn; } },
      local: {
        get: read || (() => Promise.resolve({ themePreference: saved, palettePreference: savedPalette })),
        set: write || (async value => { if ('themePreference' in value) writes.push(value.themePreference); if ('palettePreference' in value) paletteWrites.push(value.palettePreference); })
      }
    } }
  });
  ready();
  return {
    root, control, error, writes, values, paletteControl, paletteWrites,
    choosePalette: value => paletteControl.change({ target: paletteInputs.find(input => input.value === value), currentTarget: paletteControl }),
    paletteChanged: value => changed({ palettePreference: { newValue: value } }, 'local'),
    selected: () => inputs.find(input => input.checked)?.value,
    choose: value => control.change({ target: inputs.find(input => input.value === value), currentTarget: control }),
    system: dark => { system.matches = dark; system.change(); },
    changed: (value, area = 'local') => changed({ themePreference: { newValue: value } }, area)
  };
}

test('System follows the device immediately and invalid stored preferences use System', async () => {
  const page = setup({ dark: true, saved: 'invalid' });
  assert.equal(page.root.dataset.theme, 'dark');
  await settle();
  assert.equal(page.selected(), 'system');
  page.system(false);
  assert.equal(page.root.dataset.theme, 'light');
});

test('cached theme applies before the asynchronous authoritative setting is read', async () => {
  const page = setup({ cached: 'dark', saved: 'light' });
  assert.equal(page.root.dataset.theme, 'dark');
  await settle();
  assert.equal(page.root.dataset.theme, 'light');
  assert.equal(page.values.get('tabstash.themePreference'), 'light');
});

test('explicit selection persists and ignores system changes', async () => {
  const page = setup();
  await settle();
  await page.choose('dark');
  page.system(false);
  assert.equal(page.root.dataset.theme, 'dark');
  assert.deepEqual(page.writes, ['dark']);
  await page.choose('light');
  page.system(true);
  assert.equal(page.root.dataset.theme, 'light');
});

test('a late initial read cannot overwrite a newer user choice', async () => {
  let resolveRead;
  const page = setup({ read: () => new Promise(resolve => { resolveRead = resolve; }) });
  await page.choose('dark');
  resolveRead({ themePreference: 'light' });
  await settle();
  assert.equal(page.selected(), 'dark');
});

test('local storage notifications update open pages; removal returns to System', async () => {
  const page = setup({ dark: true });
  await settle();
  page.changed('light', 'session');
  assert.equal(page.selected(), 'system');
  page.changed('light');
  assert.equal(page.root.dataset.theme, 'light');
  page.changed(undefined);
  assert.equal(page.root.dataset.theme, 'dark');
  assert.equal(page.selected(), 'system');
});

test('a failed save restores the previous selection and exposes a recoverable error', async () => {
  const page = setup({ saved: 'light', write: async () => { throw Error('Disk error'); } });
  await settle();
  await page.choose('dark');
  assert.equal(page.root.dataset.theme, 'light');
  assert.equal(page.selected(), 'light');
  assert.equal(page.control.disabled, false);
  assert.equal(page.error.hidden, false);
  assert.match(page.error.textContent, /could not be saved/);
});

test('theme still loads and saves when the early-paint cache is unavailable', async () => {
  const page = setup({ cacheBlocked: true, saved: 'dark' });
  await settle();
  assert.equal(page.root.dataset.theme, 'dark');
  await page.choose('light');
  assert.deepEqual(page.writes, ['light']);
});


test('missing and invalid palettes use Blue without changing the existing mode', async () => {
  for (const savedPalette of [undefined, 'missing-palette']) {
    const page = setup({ saved: 'dark', savedPalette });
    await settle();
    assert.equal(page.root.dataset.palette, 'blue');
    assert.equal(page.root.dataset.theme, 'dark');
  }
});

test('palette cache paints early and the authoritative choice replaces it', async () => {
  const page = setup({ cachedPalette: 'sage', savedPalette: 'violet' });
  assert.equal(page.root.dataset.palette, 'sage');
  await settle();
  assert.equal(page.root.dataset.palette, 'violet');
});

test('palette and mode writes are independent and synchronize separately', async () => {
  const page = setup({ saved: 'system', dark: true });
  await settle();
  await page.choosePalette('amber');
  assert.deepEqual(page.paletteWrites, ['amber']);
  assert.deepEqual(page.writes, []);
  page.system(false);
  assert.equal(page.root.dataset.palette, 'amber');
  assert.equal(page.root.dataset.theme, 'light');
  await page.choose('dark');
  assert.deepEqual(page.paletteWrites, ['amber']);
  page.paletteChanged('sage');
  assert.equal(page.root.dataset.theme, 'dark');
  assert.equal(page.root.dataset.palette, 'sage');
  page.paletteChanged(undefined);
  assert.equal(page.root.dataset.palette, 'blue');
});

test('late initial reads respect per-preference revisions', async () => {
  let resolveRead;
  const page = setup({ read: () => new Promise(resolve => { resolveRead = resolve; }) });
  await page.choosePalette('violet');
  resolveRead({ themePreference: 'dark', palettePreference: 'sage' });
  await settle();
  assert.equal(page.root.dataset.theme, 'dark');
  assert.equal(page.root.dataset.palette, 'violet');
});

test('failed palette saves restore only the palette and a newer storage event wins', async () => {
  let rejectWrite;
  const page = setup({ saved: 'dark', savedPalette: 'sage', write: () => new Promise((_, reject) => { rejectWrite = reject; }) });
  await settle();
  const first = page.choosePalette('amber');
  rejectWrite(Error('Disk error'));
  await first;
  assert.equal(page.root.dataset.palette, 'sage');
  assert.equal(page.root.dataset.theme, 'dark');
  assert.match(page.error.textContent, /color palette preference could not be saved/);
  assert.equal(page.paletteControl.disabled, false);
  const second = page.choosePalette('amber');
  page.paletteChanged('violet');
  rejectWrite(Error('Disk error'));
  await second;
  assert.equal(page.root.dataset.palette, 'violet');
  assert.equal(page.error.hidden, true);
});
