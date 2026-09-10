import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../extension/theme.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function setup({ cached, saved, dark = false, read, write, cacheBlocked = false } = {}) {
  const root = { dataset: {}, style: {} };
  const control = { disabled: false, addEventListener: (_, fn) => { control.change = fn; } };
  const inputs = ['light', 'dark', 'system'].map(value => ({ value, checked: false }));
  const error = {};
  const system = { matches: dark, addEventListener: (_, fn) => { system.change = fn; } };
  const values = new Map([['tabstash.themePreference', cached]]);
  const writes = [];
  let ready;
  let changed;
  runInNewContext(script, {
    document: {
      documentElement: root,
      querySelector: selector => selector === '#theme-control' ? control : error,
      querySelectorAll: () => inputs,
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
        get: read || (() => Promise.resolve({ themePreference: saved })),
        set: write || (async value => { writes.push(value.themePreference); })
      }
    } }
  });
  ready();
  return {
    root, control, error, writes, values,
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
