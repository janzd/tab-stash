import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewCollector, boundedPreviews, PREVIEW_KEY, MAX_BYTES, MAX_PREVIEWS, MAX_AGE } from '../extension/preview-cache.js';

function setup(options = {}) {
  let time = 1_000_000;
  let timer;
  const state = {
    tab: { id: 1, windowId: 10, active: true, url: 'https://example.com/a', title: 'Page A', status: 'complete' },
    window: { id: 10, focused: true, type: 'normal', state: 'normal' },
    enabled: true, permission: true, busy: false, cache: [], calls: [], ...options
  };
  const api = {
    windows: { getLastFocused: async () => ({ ...state.window }) },
    tabs: {
      query: async () => [{ ...state.tab }],
      captureVisibleTab: async windowId => { state.calls.push(windowId); return options.capture ? options.capture() : 'image'; }
    },
    permissions: { contains: async () => state.permission },
    storage: {
      local: { get: async () => ({ previewCacheEnabled: state.enabled }) },
      session: {
        get: async () => ({ [PREVIEW_KEY]: state.cache }),
        set: async value => { state.cache = value[PREVIEW_KEY]; },
        remove: async () => { state.cache = []; }
      }
    }
  };
  const collector = createPreviewCollector(api, {
    now: () => time, isBusy: () => state.busy,
    shrink: options.shrink || (async () => 'data:image/jpeg;base64,YQ=='),
    setTimer: (fn, delay) => { timer = { fn, delay }; return timer; },
    clearTimer: () => { timer = null; }
  });
  return { state, collector, advance: ms => { time += ms; },
    fire: () => { const pending = timer; timer = null; if (pending) { time += pending.delay; pending.fn(); } return collector.drain(); },
    run: async () => { collector.schedule(); const pending = timer; timer = null; if (pending) { time += pending.delay; pending.fn(); } await collector.drain(); }
  };
}

test('passive capture uses only the current tab and caches its original URL, time, and thumbnail', async () => {
  const p = setup();
  await p.run();
  assert.deepEqual(p.state.calls, [10]);
  assert.equal(p.state.cache[0].url, 'https://example.com/a');
  assert.equal(p.state.cache[0].capturedAt, 1_002_000);
  assert.equal(p.state.cache[0].durationMs, 0);
  assert.match(p.state.cache[0].screenshot, /^data:image\/jpeg/);
});

test('opt-out, absent permission, manual capture, and ineligible tabs never capture', async () => {
  for (const change of [
    p => p.state.enabled = false, p => p.state.permission = false, p => p.state.busy = true,
    ...[{ active: false }, { discarded: true }, { frozen: true }, { audible: true }, { status: 'loading' },
      { pendingUrl: 'https://example.com/b' }, { incognito: true }, { url: 'chrome://settings' }, { url: 'file:///a' }, { splitViewId: 3 }]
      .map(value => p => Object.assign(p.state.tab, value)),
    ...[{ focused: false }, { incognito: true }, { state: 'minimized' }, { state: 'fullscreen' }, { type: 'popup' }]
      .map(value => p => Object.assign(p.state.window, value))
  ]) {
    const p = setup(); change(p); await p.run();
    assert.equal(p.state.calls.length, 0);
    assert.equal(p.state.cache.length, 0);
  }
});

test('rapid activation events debounce to one capture, with global and per-tab limits', async () => {
  const p = setup();
  p.collector.schedule(); p.collector.schedule(); p.collector.schedule();
  await p.fire();
  await p.run();
  assert.equal(p.state.calls.length, 1, 'The same URL is not refreshed inside one minute');
  p.advance(60000);
  await p.run();
  assert.equal(p.state.calls.length, 2);
  assert.equal(p.state.cache.length, 1, 'One cache entry per tab');
});

test('navigation, focus loss, and switch-away-and-back events invalidate in-flight captures', async () => {
  for (const mutate of [p => p.state.tab.url = 'https://example.com/b', p => p.state.window.focused = false, p => p.collector.schedule()]) {
    let p;
    p = setup({ capture: async () => { mutate(p); return 'image'; } });
    await p.run();
    assert.equal(p.state.calls.length, 1);
    assert.equal(p.state.cache.length, 0);
  }
});

test('invalidation during compression prevents the preview from being saved', async () => {
  let p;
  p = setup({ shrink: async () => { p.collector.invalidate(); return 'image'; } });
  await p.run();
  assert.equal(p.state.cache.length, 0);
});

test('clearing waits for an in-flight capture so it cannot repopulate the cache', async () => {
  let finish;
  const p = setup({ capture: () => new Promise(resolve => { finish = resolve; }) });
  const collecting = p.run();
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  const clearing = p.collector.clear();
  finish('image');
  await Promise.all([collecting, clearing]);
  assert.equal(p.state.cache.length, 0);
});

test('manual captures suspend collection and closed tabs are removed', async () => {
  const p = setup();
  await p.run();
  await p.collector.suspend();
  p.advance(60000);
  await p.run();
  assert.equal(p.state.calls.length, 1);
  p.collector.resume();
  await p.fire();
  assert.equal(p.state.calls.length, 2);
  p.collector.forget(1);
  await p.collector.drain();
  assert.deepEqual(p.state.cache, []);
});

test('capture failures leave no preview and can recover on a later event', async () => {
  let fail = true;
  const p = setup({ capture: async () => { if (fail) throw Error('Unavailable'); return 'image'; } });
  await p.run();
  assert.equal(p.state.cache.length, 0);
  fail = false;
  await p.run();
  assert.equal(p.state.cache.length, 1);
});

test('cache eviction bounds count, estimated bytes, and age while keeping newest entries', () => {
  const now = 1_000_000;
  const entries = Array.from({ length: 60 }, (_, i) => ({ tabId: i, capturedAt: now - i, screenshot: 'a'.repeat(100) }));
  assert.equal(boundedPreviews(entries, now).length, MAX_PREVIEWS);
  const large = entries.map(entry => ({ ...entry, screenshot: 'a'.repeat(100000) }));
  const result = boundedPreviews(large, now);
  assert.ok(result.reduce((sum, item) => sum + JSON.stringify(item).length * 2, 0) <= MAX_BYTES);
  assert.equal(result[0].tabId, 0);
  assert.deepEqual(boundedPreviews([{ capturedAt: now - MAX_AGE }, { capturedAt: now + 1 }], now), []);
});

test('different tabs still respect the global capture interval', async () => {
  const p = setup();
  await p.run();
  const first = p.state.cache[0].capturedAt;
  p.state.tab = { ...p.state.tab, id: 2, url: 'https://example.com/b' };
  await p.run();
  assert.ok(p.state.cache[0].capturedAt - first >= 5000);
  assert.equal(p.state.cache.length, 2);
});
