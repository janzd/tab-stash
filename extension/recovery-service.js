import { restoreRecovery } from './recovery-restore.js';
import { RECOVERY_KEY, RECOVERY_STATUS, RECOVERY_BOOT, RECOVERY_ALARM, recoveryPreferences, sessionMetadata, sessionFingerprint } from './recovery-model.js';
import { recoveryHistory, commitRecovery, deleteRecovery } from './recovery-db.js';

export function recoveryController(api, { history = recoveryHistory, commit = commitRecovery, remove = deleteRecovery,
  now = Date.now, fingerprint = sessionFingerprint, uuid = () => crypto.randomUUID(), isBusy = () => false } = {}) {
  let queue = Promise.resolve();
  let revision = 0;
  let lastChange = now();
  const enqueue = action => { const result = queue.then(action); queue = result.catch(() => {}); return result; };
  const preferences = async () => recoveryPreferences((await api.storage.local.get(RECOVERY_KEY))[RECOVERY_KEY]);
  async function publish(message, extra = {}) {
    await api.storage.local.set({ [RECOVERY_STATUS]: { message, checkedAt: now(), ...extra } });
  }
  async function boot(reset = false) {
    let value = (await api.storage.session.get(RECOVERY_BOOT))[RECOVERY_BOOT];
    if (!value || reset) {
      const newest = (await history())[0];
      value = { startedAt: now(), protectedId: newest?.id || null, settled: false };
      await api.storage.session.set({ [RECOVERY_BOOT]: value });
    }
    return value;
  }
  function configure(reset = false) {
    revision++;
    return enqueue(async () => {
      const prefs = await preferences();
      if (!prefs.enabled) { await api.alarms.clear(RECOVERY_ALARM); await publish('Automatic saving is off. Existing history is kept.'); return; }
      await boot(reset);
      const alarm = await api.alarms.get(RECOVERY_ALARM);
      if (reset || !alarm || alarm.periodInMinutes !== prefs.interval) {
        await api.alarms.create(RECOVERY_ALARM, { delayInMinutes: prefs.interval, periodInMinutes: prefs.interval });
      }
      await publish(`Automatic saving is on. Checking every ${prefs.interval} minute${prefs.interval === 1 ? '' : 's'}.`);
    });
  }
  function tick() {
    const token = revision;
    return enqueue(async () => {
      const valid = () => token === revision;
      const prefs = await preferences();
      if (!prefs.enabled || !valid()) return;
      const initial = await boot();
      if (isBusy()) { await publish('Waiting for the current capture or restore to finish.'); return; }
      const windows = await api.windows.getAll({ populate: true, windowTypes: ['normal'] });
      if (!valid()) return;
      if (!initial.settled) {
        const loading = windows.some(w => !w.incognito && w.tabs?.some(t => !t.discarded && (t.pendingUrl || t.status === 'loading')));
        if (now() - initial.startedAt < 60000 || (now() - initial.startedAt < 300000 && (now() - lastChange < 30000 || loading))) {
          await publish('Waiting for Chrome to finish restoring its tabs. Previous recovery saves are safe.'); return;
        }
        await api.storage.session.set({ [RECOVERY_BOOT]: { ...initial, settled: true } });
      }
      const metadata = sessionMetadata(windows, api.runtime.getURL(''));
      if (!metadata.length) { await publish('No eligible tabs to save. Previous recovery saves are kept.'); return; }
      const record = { id: uuid(), createdAt: now(), windows: metadata, fingerprint: await fingerprint(metadata) };
      record.bytes = JSON.stringify(record).length * 2 + 64;
      if (!valid() || !(await preferences()).enabled) return;
      const result = await commit(record, prefs.retention, initial.protectedId, valid);
      await publish(result.added ? 'A recovery save was created.' : 'Tabs are unchanged. The latest recovery save is still current.',
        { lastSavedAt: result.latest.createdAt, changed: uuid() });
    }).catch(async error => {
      if (token === revision) await publish(error.message || 'Recovery save failed. Previous saves are safe.').catch(() => {});
    });
  }
  function restoreSave(id, index) {
    return enqueue(async () => {
      if (isBusy()) throw Error('Wait for the current capture to finish.');
      const record = (await history()).find(item => item.id === id);
      if (!record) throw Error('This recovery save was deleted.');
      return restoreRecovery(api, record.windows, index);
    });
  }
  function deleteSave(id) {
    return enqueue(async () => { await remove(id); await publish(id === null ? 'Recovery history cleared.' : 'Recovery save deleted.', { changed: uuid() }); });
  }
  return { configure, tick, deleteSave, restoreSave, activity: () => { lastChange = now(); }, drain: () => queue };
}

export function installRecovery(api, options) {
  const controller = recoveryController(api, options);
  const safe = promise => { void promise.catch(error => console.warn('Recovery:', error.message)); };
  api.alarms.onAlarm.addListener(alarm => { if (alarm.name === RECOVERY_ALARM) safe(controller.tick()); });
  api.runtime.onStartup.addListener(() => safe(controller.configure(true)));
  api.runtime.onInstalled.addListener(() => safe(controller.configure(true)));
  api.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[RECOVERY_KEY]) safe(controller.configure()); });
  api.tabs.onCreated.addListener(controller.activity);
  api.tabs.onRemoved.addListener(controller.activity);
  api.tabs.onUpdated.addListener((id, changes) => { if ('url' in changes) controller.activity(); });
  api.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== api.runtime.id || sender.url !== api.runtime.getURL('recovery.html')) return;
    if (message.type === 'recovery:delete') {
      if (message.id !== null && typeof message.id !== 'string') { respond({ error: 'Invalid recovery save.' }); return; }
      controller.deleteSave(message.id).then(() => respond({ ok: true }), error => respond({ error: error.message }));
    } else if (message.type === 'recovery:restore') {
      if (typeof message.id !== 'string' || (message.index !== undefined && (!Number.isInteger(message.index) || message.index < 0))) {
        respond({ error: 'Invalid recovery tab.' }); return;
      }
      controller.restoreSave(message.id, message.index).then(result => respond({ ok: true, ...result }), error => respond({ error: error.message }));
    } else return;
    return true;
  });
  safe(controller.configure());
  return controller;
}
