import assert from 'node:assert/strict';
import path from 'node:path';

export async function recoveryBrowser({ context, library, origin, results }) {
  const until = async (fn, label) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw Error(`Timed out: ${label}`);
  };
  const errors = [];
  const settings = await context.newPage(); settings.on('pageerror', error => errors.push(error.message));
  await settings.goto(new URL('settings.html', library.url()).href);
  await settings.locator('#recovery-enabled').waitFor();
  assert.equal(await settings.locator('#recovery-enabled').isChecked(), false);
  const history = () => library.evaluate(async () => (await import('./recovery-db.js')).recoveryHistory());
  const decks = await library.evaluate(async () => JSON.stringify(await (await import('./db.js')).getDecks()));
  await library.evaluate(() => chrome.storage.local.set({ previewCacheEnabled: false }));
  assert.equal((await history()).length, 0);
  await settings.locator('#recovery-enabled').check();
  await until(() => library.evaluate(async () => !!await chrome.alarms.get('tabstash-recovery')), 'alarm created');
  assert.equal(await library.evaluate(async () => (await chrome.alarms.get('tabstash-recovery')).periodInMinutes), 5);
  await settings.locator('#recovery-retention').selectOption('10');
  await settings.waitForFunction(() => !document.querySelector('#recovery-settings').disabled);
  // Trigger the real alarm sooner in this unpacked test extension; product intervals stay unchanged.
  const tick = async () => {
    const previous = await library.evaluate(async () => (await chrome.storage.local.get('recoveryStatus')).recoveryStatus?.checkedAt || 0);
    await library.evaluate(() => chrome.alarms.create('tabstash-recovery', { when: Date.now() + 150, periodInMinutes: 5 }));
    await until(() => library.evaluate(async previous => (await chrome.storage.local.get('recoveryStatus')).recoveryStatus?.checkedAt > previous, previous), 'scheduled recovery check');
  };
  await tick(); assert.equal((await history()).length, 0, 'Startup grace prevents an immediate partial snapshot');
  await library.evaluate(async () => {
    const { recoveryBoot } = await chrome.storage.session.get('recoveryBoot');
    await chrome.storage.session.set({ recoveryBoot: { ...recoveryBoot, settled: true, startedAt: Date.now() - 301000 } });
  });
  const extra = await library.evaluate(async origin => {
    const window = await chrome.windows.create({ url: [`${origin}/0?recovery`, `${origin}/1?recovery`], focused: false });
    await chrome.tabs.update(window.tabs[0].id, { pinned: true });
    await chrome.tabs.create({ windowId: window.id, url: 'chrome://settings', active: false });
    return window.id;
  }, origin);
  const before = await library.evaluate(async () => ({ windows: (await chrome.windows.getAll()).map(w => ({ id: w.id, focused: w.focused })), active: (await chrome.tabs.query({ active: true })).map(t => t.id) }));
  await tick();
  const first = (await history())[0];
  assert.ok(first); assert.equal(first.windows.length, 2);
  assert.ok(first.windows.flatMap(w => w.tabs).some(t => t.pinned && t.url === `${origin}/0?recovery`));
  assert.ok(first.windows.flatMap(w => w.tabs).some(t => t.url.startsWith('chrome://settings')));
  assert.ok(first.windows.flatMap(w => w.tabs).every(t => !('screenshot' in t) && !t.url.startsWith('chrome-extension:')));
  assert.deepEqual(await library.evaluate(async () => ({ windows: (await chrome.windows.getAll()).map(w => ({ id: w.id, focused: w.focused })), active: (await chrome.tabs.query({ active: true })).map(t => t.id) })), before, 'Saving does not activate tabs or focus windows');
  await tick(); assert.equal((await history()).length, 1, 'Identical sessions are deduplicated');
  await library.evaluate(async origin => { const tab = (await chrome.tabs.query({})).find(t => t.url === `${origin}/0?recovery`); await chrome.tabs.remove(tab.id); }, origin);
  await tick(); assert.equal((await history()).length, 2);
  assert.ok((await history()).find(item => item.id === first.id).windows.flatMap(w => w.tabs).some(t => t.url === `${origin}/0?recovery`), 'Closing a live tab preserves historical metadata');

  const recovery = await context.newPage(); recovery.on('pageerror', error => errors.push(error.message));
  await recovery.goto(new URL('recovery.html', library.url()).href);
  await recovery.locator('.recovery-save').last().click();
  const originalTabs = await library.evaluate(() => chrome.tabs.query({}));
  const opening = context.waitForEvent('page');
  await recovery.locator(`a.recovery-tab[href="${origin}/0?recovery"]`).click();
  const opened = await opening; await opened.waitForURL(`${origin}/0?recovery`);
  const individual = (await library.evaluate(() => chrome.tabs.query({}))).filter(t => !originalTabs.some(old => old.id === t.id));
  assert.equal(individual.length, 1); assert.equal(individual[0].pinned, true);
  await opened.close(); await recovery.bringToFront();
  const beforeRestore = await library.evaluate(() => chrome.tabs.query({}));
  await recovery.locator('#restore-recovery').click();
  await recovery.waitForFunction(() => !document.querySelector('#restore-recovery').disabled);
  const afterRestore = await library.evaluate(() => chrome.tabs.query({}));
  for (const tab of beforeRestore) assert.ok(afterRestore.some(item => item.id === tab.id), 'Existing tabs stay open');
  const created = afterRestore.filter(t => !beforeRestore.some(old => old.id === t.id));
  assert.equal(created.length, first.windows.reduce((sum, w) => sum + w.tabs.length, 0));
  const restoredGroups = [...new Set(created.map(t => t.windowId))].map(windowId => created.filter(t => t.windowId === windowId).sort((a, b) => a.index - b.index).map(t => ({ url: t.url || t.pendingUrl, pinned: t.pinned })));
  const expectedGroups = first.windows.map(w => w.tabs.map(t => ({ url: t.url, pinned: t.pinned })));
  assert.deepEqual(restoredGroups.map(JSON.stringify).sort(), expectedGroups.map(JSON.stringify).sort());
  await library.evaluate(ids => chrome.tabs.remove(ids), created.map(t => t.id));
  await recovery.bringToFront();
  await recovery.screenshot({ animations: 'disabled', path: path.join(results, 'recovery-light.png'), fullPage: true });
  await recovery.locator('label[for=theme-dark]').click();
  await recovery.screenshot({ animations: 'disabled', path: path.join(results, 'recovery-dark.png'), fullPage: true });
  await recovery.setViewportSize({ width: 620, height: 900 });
  assert.ok(await recovery.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await recovery.screenshot({ animations: 'disabled', path: path.join(results, 'recovery-narrow.png'), fullPage: true });

  const beforeAbort = JSON.stringify(await history());
  assert.equal(await library.evaluate(async () => {
    const db = await import('./recovery-db.js'); const [latest] = await db.recoveryHistory();
    try { await db.commitRecovery({ ...latest, id: 'abort-check', fingerprint: 'changed' }, 10, null, () => false); return false; }
    catch { return true; }
  }), true);
  assert.equal(JSON.stringify(await history()), beforeAbort, 'Aborted writes leave existing history intact');

  // Exercise production retention transactions with synthetic metadata, preserving the previous-run anchor.
  await library.evaluate(async id => {
    const db = await import('./recovery-db.js'); const latest = (await db.recoveryHistory())[0];
    for (let i = 0; i < 12; i++) await db.commitRecovery({ ...latest, id: `retention-${i}`, createdAt: Date.now() + i, fingerprint: `changed-${i}` }, 10, id);
  }, first.id);
  assert.equal((await history()).length, 10); assert.ok((await history()).some(item => item.id === first.id));
  assert.equal(await library.evaluate(async () => JSON.stringify(await (await import('./db.js')).getDecks())), decks, 'Recovery retention never changes manual decks');
  await recovery.reload(); await recovery.locator('.recovery-save').first().click();
  await recovery.locator('#delete-recovery').click(); await recovery.locator('#confirm-recovery-delete').click();
  await until(async () => (await history()).length === 9, 'delete individual save');
  await settings.bringToFront(); await settings.locator('#recovery-enabled').uncheck();
  await until(() => library.evaluate(async () => !await chrome.alarms.get('tabstash-recovery')), 'alarm removed');
  assert.equal((await history()).length, 9, 'Disabling preserves history');
  await recovery.bringToFront(); await recovery.locator('#clear-recovery').click(); await recovery.locator('#confirm-recovery-delete').click();
  await until(async () => !(await history()).length, 'clear history');
  await settings.bringToFront(); await settings.locator('#recovery-enabled').check();
  await until(() => library.evaluate(async () => !!await chrome.alarms.get('tabstash-recovery')), 'alarm resumed');
  await tick(); assert.equal((await history()).length, 1);
  await library.evaluate(async extra => { await chrome.windows.remove(extra); await chrome.storage.local.set({ previewCacheEnabled: true }); }, extra);
  await recovery.close(); await settings.close(); await library.bringToFront();
  assert.deepEqual(errors, []);
  console.log('PASS: real recovery alarms, startup grace, metadata-only saves, deduplication, historical closed tabs, restore, atomic abort, protected retention, deletion, settings, and responsive UI');
}
