import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBackup, backup, searchDecks, searchTabs, captureReason, restorable } from '../extension/model.js';

const deck = () => ({ id: 'a', name: 'Weekend research', createdAt: 1700000000000, status: 'complete', tabs: [{ title: 'A quiet hotel', url: 'https://example.com/kyoto', windowIndex: 1, pinned: true, screenshot: 'data:image/jpeg;base64,YWJj', captureNote: null }] });
test('backup round trip preserves screenshots, window layout, pins, and URLs', () => {
  const original = deck();
  const result = validateBackup(JSON.parse(JSON.stringify(backup([original]))))[0];
  assert.equal(result.tabs[0].screenshot, original.tabs[0].screenshot);
  assert.equal(result.tabs[0].url, original.tabs[0].url);
  assert.equal(result.tabs[0].windowIndex, 1);
  assert.equal(result.tabs[0].pinned, true);
});
test('search combines words across deck name, titles, and URLs without case sensitivity', () => {
  assert.equal(searchDecks([deck()], 'WEEKEND kyoto quiet').length, 1);
  assert.equal(searchDecks([deck()], 'mountain').length, 0);
});
test('tab search matches case-insensitive title and URL terms on the same tab', () => {
  const tabs = [
    { title: 'A quiet hotel', url: 'https://example.com/kyoto' },
    { title: 'A mountain walk', url: 'https://example.com/osaka' }
  ];
  assert.deepEqual(searchTabs(tabs, '  QUIET\tKyOtO  '), [tabs[0]]);
  assert.deepEqual(searchTabs(tabs, '/osaka'), [tabs[1]]);
  assert.deepEqual(searchTabs(tabs, 'quiet mountain'), []);
  assert.deepEqual(searchTabs(tabs, 'missing'), []);
});
test('empty tab search returns every tab in original order without changing the saved collection', () => {
  const tabs = Object.freeze([Object.freeze(deck().tabs[0]), Object.freeze({ title: 'Other tab', url: 'https://other.example' })]);
  assert.deepEqual(searchTabs(tabs, ' \n '), tabs);
  assert.deepEqual(searchTabs(tabs, 'kyoto'), [tabs[0]]);
  assert.equal(tabs.length, 2);
  assert.deepEqual(searchTabs([], 'kyoto'), []);
});
test('rejects executable URLs and SVG screenshot payloads', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'chrome-extension://other/page.html']) {
    const value = deck(); value.tabs[0].url = url;
    assert.throws(() => validateBackup(backup([value])), /unsupported/);
    assert.equal(restorable(url), false);
  }
  const value = deck(); value.tabs[0].screenshot = 'data:image/svg+xml;base64,YWJj';
  assert.throws(() => validateBackup(backup([value])), /screenshot/);
});
test('rejects duplicate IDs, invalid versions, oversized names and invalid dates', () => {
  assert.throws(() => validateBackup(backup([deck(), deck()])), /duplicate/);
  assert.throws(() => validateBackup({ ...backup([]), version: 2 }), /version 1/);
  for (const createdAt of [NaN, Infinity, -1, 8640000000000001]) assert.throws(() => validateBackup(backup([{ ...deck(), createdAt }])), /date/);
  assert.throws(() => validateBackup(backup([{ ...deck(), name: 'a'.repeat(121) }])), /name/);
});
test('an unfinished imported session is marked interrupted', () => {
  assert.equal(validateBackup(backup([{ ...deck(), status: 'capturing' }]))[0].status, 'interrupted');
});
test('sleeping, minimized, and restricted pages retain links without waking the tab', () => {
  assert.match(captureReason({ discarded: true, url: 'https://example.com' }), /Sleeping/);
  assert.match(captureReason({ url: 'https://example.com' }, 'minimized'), /Minimized/);
  assert.match(captureReason({ url: 'chrome://settings' }), /Browser/);
  assert.equal(captureReason({ url: 'https://example.com' }, 'normal'), null);
});
