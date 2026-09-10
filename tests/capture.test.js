import test from 'node:test';
import assert from 'node:assert/strict';
import { captureTab } from '../extension/capture.js';

function fixture() {
  const calls = [];
  const tab = { id: 4, windowId: 2, url: 'https://example.com', active: true, status: 'complete' };
  const api = {
    windows: { update: async (...args) => calls.push(['window', ...args]) },
    tabs: {
      update: async (...args) => calls.push(['tab', ...args]),
      get: async () => ({ ...tab }),
      captureVisibleTab: async () => { calls.push(['capture']); return 'raw'; }
    }
  };
  const options = { wait: async ms => calls.push(['wait', ms]), thumbnail: async data => `small:${data}` };
  return { calls, tab, api, options };
}
test('activates the intended tab and throttles capture before compressing the screenshot', async () => {
  const { api, tab, calls, options } = fixture();
  assert.deepEqual(await captureTab(api, tab, 'normal', options), { screenshot: 'small:raw', captureNote: null });
  assert.deepEqual(calls.map(c => c[0]), ['window', 'tab', 'wait', 'capture']);
  assert.ok(calls[2][1] >= 500);
});
test('does not activate or capture a sleeping tab', async () => {
  const { api, tab, calls, options } = fixture();
  const result = await captureTab(api, { ...tab, discarded: true }, 'normal', options);
  assert.equal(result.screenshot, null);
  assert.equal(calls.length, 0);
});
test('does not attach a screenshot when the user switches tabs', async () => {
  const { api, tab, options, calls } = fixture();
  api.tabs.get = async () => ({ ...tab, active: false });
  const result = await captureTab(api, tab, 'normal', options);
  assert.equal(result.screenshot, null);
  assert.match(result.captureNote, /changed/);
  assert.ok(!calls.some(c => c[0] === 'capture'));
});
test('discards screenshot if a page navigates during capture', async () => {
  const { api, tab, options } = fixture();
  let count = 0;
  api.tabs.get = async () => ({ ...tab, url: ++count >= 3 ? 'https://other.example' : tab.url });
  assert.equal((await captureTab(api, tab, 'normal', options)).screenshot, null);
});
test('capture errors leave a usable saved link', async () => {
  const { api, tab, options } = fixture();
  api.tabs.captureVisibleTab = async () => { throw new Error('Permission denied'); };
  const result = await captureTab(api, tab, 'normal', options);
  assert.equal(result.screenshot, null);
  assert.match(result.captureNote, /link saved/);
});
test('does not attach another window’s screenshot if a tab is moved', async () => {
  const { api, tab, options } = fixture();
  api.tabs.get = async () => ({ ...tab, windowId: 99 });
  const result = await captureTab(api, tab, 'normal', options);
  assert.equal(result.screenshot, null);
  assert.match(result.captureNote, /changed/);
});
test('loading tabs time out without blocking the entire deck', async () => {
  const { api, tab, options, calls } = fixture();
  api.tabs.get = async () => ({ ...tab, status: 'loading' });
  const result = await captureTab(api, tab, 'normal', options);
  assert.match(result.captureNote, /still loading/);
  assert.equal(calls.filter(c => c[0] === 'wait').length, 32);
});
