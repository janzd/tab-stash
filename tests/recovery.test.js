import test from 'node:test';
import assert from 'node:assert/strict';
import { RECOVERY_KEY, RECOVERY_BOOT, RECOVERY_STATUS, RECOVERY_ALARM, HISTORY_BYTES, recoveryPreferences, sessionMetadata, canonicalSession, retainedHistory } from '../extension/recovery-model.js';
import { recoveryController } from '../extension/recovery-service.js';
import { restoreRecovery } from '../extension/recovery-restore.js';

const windows = () => [{ id: 10, type: 'normal', tabs: [
  { id: 1, index: 0, title: 'First', url: 'https://example.com/one', pinned: true, discarded: true },
  { id: 2, index: 1, title: 'Settings', url: 'chrome://settings', pinned: false },
  { id: 3, index: 2, title: 'TabStash', url: 'chrome-extension://ours/library.html' }
] }];
function setup() {
  let time = 1000000;
  let id = 0;
  const state = { local: { [RECOVERY_KEY]: { enabled: true, interval: 5, retention: 50 } }, session: {}, windows: windows(), records: [], alarm: null, creates: 0, writes: 0, busy: false };
  const api = {
    runtime: { getURL: () => 'chrome-extension://ours/' },
    storage: {
      local: { get: async key => ({ [key]: state.local[key] }), set: async value => Object.assign(state.local, value) },
      session: { get: async key => ({ [key]: state.session[key] }), set: async value => Object.assign(state.session, value) }
    },
    alarms: { get: async () => state.alarm, clear: async () => { state.alarm = null; }, create: async (name, value) => { state.alarm = { name, ...value }; state.creates++; } },
    windows: { getAll: async () => structuredClone(state.windows) }
  };
  const controller = recoveryController(api, {
    now: () => time, uuid: () => `id-${++id}`, fingerprint: async value => canonicalSession(value), isBusy: () => state.busy,
    history: async () => state.records,
    commit: async (record, limit, anchor, valid) => {
      assert.ok(valid());
      const added = state.records[0]?.fingerprint !== record.fingerprint;
      if (added) { state.records.unshift(record); state.writes++; }
      state.records = retainedHistory(state.records, limit, anchor).sort((a, b) => b.createdAt - a.createdAt);
      return { added, latest: state.records[0] };
    },
    remove: async id => { state.records = id === null ? [] : state.records.filter(item => item.id !== id); }
  });
  return { state, api, controller, advance: ms => { time += ms; } };
}

test('recovery defaults are opt-in with bounded interval and retention choices', () => {
  assert.deepEqual(recoveryPreferences(), { enabled: false, interval: 5, retention: 50 });
  assert.deepEqual(recoveryPreferences({ enabled: 'true', interval: -1, retention: Infinity }), recoveryPreferences());
});

test('metadata includes sleeping/restricted links and pins while excluding own, unsafe, private, and popup tabs', () => {
  const source = windows();
  source[0].tabs.push({ index: 3, url: 'javascript:alert(1)' }, { index: 4, url: 'https://private', incognito: true });
  source.push({ type: 'normal', incognito: true, tabs: [{ url: 'https://private' }] }, { type: 'popup', tabs: [{ url: 'https://popup' }] });
  const result = sessionMetadata(source, 'chrome-extension://ours/');
  assert.equal(result.length, 1); assert.equal(result[0].tabs.length, 2);
  assert.deepEqual(result[0].tabs[0], { title: 'First', url: 'https://example.com/one', pinned: true });
  assert.ok(result[0].tabs.every(tab => !('screenshot' in tab) && !('id' in tab)));
});

test('deduplication ignores browser IDs/window enumeration but detects URL, title, order, pins and grouping', () => {
  const source = windows(); source.push({ type: 'normal', tabs: [{ index: 0, url: 'https://two', title: 'Two' }] });
  const original = canonicalSession(sessionMetadata(source, 'chrome-extension://ours/'));
  assert.equal(canonicalSession(sessionMetadata([...source].reverse(), 'chrome-extension://ours/')), original);
  for (const update of [s => s[0].tabs[0].url += '/new', s => s[0].tabs[0].title += '!', s => s[0].tabs[0].pinned = false,
    s => { s[0].tabs[0].index = 2; s[0].tabs[1].index = 0; }, s => s[1].tabs.push(s[0].tabs.shift())]) {
    const copy = structuredClone(source); update(copy);
    assert.notEqual(canonicalSession(sessionMetadata(copy, 'chrome-extension://ours/')), original);
  }
});

test('scheduling preserves an existing alarm and disables without deleting history', async () => {
  const p = setup(); await p.controller.configure();
  assert.equal(p.state.alarm.name, RECOVERY_ALARM); assert.equal(p.state.alarm.delayInMinutes, 5);
  await p.controller.configure(); assert.equal(p.state.creates, 1);
  p.state.local[RECOVERY_KEY].interval = 15; await p.controller.configure(); assert.equal(p.state.creates, 2);
  p.state.records = [{ id: 'keep' }]; p.state.local[RECOVERY_KEY].enabled = false;
  await p.controller.configure(); await p.controller.tick();
  assert.equal(p.state.alarm, null); assert.deepEqual(p.state.records, [{ id: 'keep' }]);
});

test('startup defers partial/empty sessions and protects the latest previous-run save', async () => {
  const p = setup(); p.state.records = [{ id: 'prior', createdAt: 1, bytes: 100, fingerprint: 'old' }];
  await p.controller.configure(); await p.controller.tick(); assert.equal(p.state.writes, 0);
  assert.equal(p.state.session[RECOVERY_BOOT].protectedId, 'prior');
  p.advance(65000); p.controller.activity(); await p.controller.tick(); assert.equal(p.state.writes, 0);
  p.advance(31000); p.state.windows = []; await p.controller.tick(); assert.equal(p.state.writes, 0);
  assert.equal(p.state.records[0].id, 'prior');
  p.state.windows = windows(); await p.controller.tick(); assert.equal(p.state.writes, 1);
});

test('startup settling has a ceiling so a forever-loading page cannot block recovery indefinitely', async () => {
  const p = setup(); await p.controller.configure();
  p.state.windows[0].tabs[0].status = 'loading'; p.advance(301000);
  await p.controller.tick(); assert.equal(p.state.writes, 1);
});

test('overlapping ticks serialize, deduplicate, and preserve historical closed tabs', async () => {
  const p = setup(); await p.controller.configure(); p.advance(301000);
  await Promise.all([p.controller.tick(), p.controller.tick(), p.controller.tick()]); assert.equal(p.state.writes, 1);
  p.advance(60000); p.state.windows[0].tabs.shift(); await p.controller.tick();
  assert.equal(p.state.writes, 2); assert.equal(p.state.records[1].windows[0].tabs.length, 2);
  p.state.busy = true; p.state.windows[0].tabs[0].title = 'changed'; await p.controller.tick(); assert.equal(p.state.writes, 2);
});

test('disabling during a pending metadata read prevents a new commit', async () => {
  const p = setup(); await p.controller.configure(); p.advance(301000);
  let finish; p.api.windows.getAll = () => new Promise(resolve => { finish = resolve; });
  const tick = p.controller.tick(); while (!finish) await new Promise(resolve => setImmediate(resolve));
  p.state.local[RECOVERY_KEY].enabled = false; const changed = p.controller.configure();
  finish(windows()); await Promise.all([tick, changed]); assert.equal(p.state.writes, 0);
});

test('retention obeys count and byte caps while preserving the previous-run anchor', () => {
  const records = Array.from({ length: 60 }, (_, i) => ({ id: `${i}`, createdAt: i, bytes: 100 }));
  const keep = retainedHistory(records, 10, '0');
  assert.equal(keep.length, 10); assert.ok(keep.some(item => item.id === '0')); assert.ok(keep.some(item => item.id === '59'));
  const large = records.map(item => ({ ...item, bytes: HISTORY_BYTES / 4 }));
  assert.equal(retainedHistory(large, 50, '0').length, 4);
});

test('restoration creates new windows with ordered/pinned tabs and validates unsafe links', async () => {
  const calls = []; let id = 0;
  const api = { windows: { create: async options => { calls.push(['window', options.url]); return { id: ++id, tabs: [{ id: id * 10 }] }; } },
    tabs: { update: async (id, options) => calls.push(['pin', id, options.pinned]), create: async options => calls.push(['tab', options]) } };
  const result = await restoreRecovery(api, [{ tabs: [{ url: 'https://a', pinned: true }, { url: 'https://b' }] }, { tabs: [{ url: 'https://c' }] }]);
  assert.deepEqual(result, { restored: 3, failed: 0 });
  assert.deepEqual(calls, [['window', 'https://a'], ['pin', 10, true], ['tab', { windowId: 1, url: 'https://b', pinned: false, active: false }], ['window', 'https://c']]);
  await assert.rejects(restoreRecovery(api, [{ tabs: [{ url: 'javascript:evil()' }] }], 0));
});
