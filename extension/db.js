let connection;
function open() {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('tabstash', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('decks', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection = null; reject(request.error); };
  });
  return connection;
}

async function transaction(mode, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('decks', mode);
    const result = action(tx.objectStore('decks'));
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Storage operation was interrupted.'));
  });
}

export const getDeck = id => transaction('readonly', store => store.get(id));
export const getDecks = async () => (await transaction('readonly', store => store.getAll())).sort((a, b) => b.createdAt - a.createdAt);
export const putDeck = deck => transaction('readwrite', store => store.put(deck));
export const deleteDeck = id => transaction('readwrite', store => store.delete(id));
export const addDecks = decks => transaction('readwrite', store => { for (const deck of decks) store.add(deck); });
