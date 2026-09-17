import { HISTORY_BYTES, retainedHistory } from './recovery-model.js';
let connection;
function open() {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('tabstash-recovery', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('saves', { keyPath: 'id' });
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); connection = null; }; resolve(request.result); };
    request.onerror = () => { connection = null; reject(request.error); };
  });
  return connection;
}
export async function recoveryHistory() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('saves');
    const read = tx.objectStore('saves').getAll();
    tx.oncomplete = () => resolve(read.result.sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)));
    tx.onerror = tx.onabort = () => reject(tx.error || Error('Could not load recovery history.'));
  });
}
export async function commitRecovery(record, retention, protectedId, valid = () => true) {
  if (record.bytes > HISTORY_BYTES / 2) throw Error('This session is too large for recovery storage. Existing saves are safe.');
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('saves', 'readwrite');
    const store = tx.objectStore('saves');
    let result;
    const read = store.getAll();
    read.onsuccess = () => {
      if (!valid()) { tx.abort(); return; }
      const previous = read.result.sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
      const duplicate = previous[0]?.fingerprint === record.fingerprint;
      const all = duplicate ? previous : [record, ...previous];
      const keep = new Set(retainedHistory(all, retention, protectedId).map(item => item.id));
      if (!duplicate) store.add(record);
      for (const item of all) if (!keep.has(item.id)) store.delete(item.id);
      result = { added: !duplicate, latest: duplicate ? previous[0] : record };
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(tx.error || Error('Recovery save interrupted. Previous saves are safe.'));
  });
}
export async function deleteRecovery(id) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('saves', 'readwrite');
    const store = tx.objectStore('saves');
    if (id === null) store.clear(); else store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error || Error('Could not delete recovery history.'));
  });
}
