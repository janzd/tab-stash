export const BACKUP_VERSION = 1;
export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

export function hostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') || new URL(url).protocol.replace(':', ''); }
  catch { return 'Unknown page'; }
}

export function restorable(url) {
  try { return ['http:', 'https:', 'file:', 'chrome:', 'about:'].includes(new URL(url).protocol); }
  catch { return false; }
}

export function captureReason(tab, windowState) {
  if (tab.discarded) return 'Sleeping tab — link saved';
  if (windowState === 'minimized') return 'Minimized window — link saved';
  if (!/^https?:\/\//i.test(tab.url || '')) return 'Browser or local page — link saved';
  return null;
}

export function searchDecks(decks, query) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return decks.filter(deck => {
    const text = [deck.name, ...deck.tabs.flatMap(tab => [tab.title, tab.url])].join(' ').toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
}

export function searchTabs(tabs, query) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return tabs.filter(tab => {
    const text = `${tab.title} ${tab.url}`.toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
}

export function validateBackup(input) {
  if (input?.app !== 'TabStash' || input.version !== BACKUP_VERSION || !Array.isArray(input.decks)) {
    throw new Error('Choose a valid TabStash backup (version 1).');
  }
  if (input.decks.length > 1000) throw new Error('This backup contains too many decks (maximum 1,000).');
  const ids = new Set();
  return input.decks.map(deck => {
    if (typeof deck.id !== 'string' || !deck.id || deck.id.length > 100 || ids.has(deck.id)) throw new Error('Invalid or duplicate deck ID.');
    ids.add(deck.id);
    if (typeof deck.name !== 'string' || !deck.name.trim() || deck.name.length > 120) throw new Error('Invalid deck name.');
    if (!Number.isFinite(deck.createdAt) || deck.createdAt < 0 || deck.createdAt > 8640000000000000) throw new Error('Invalid deck date.');
    if (!Array.isArray(deck.tabs) || deck.tabs.length > 2000) throw new Error('Invalid tab collection.');
    return {
      id: deck.id, name: deck.name.trim(), createdAt: deck.createdAt,
      status: ['complete', 'cancelled', 'interrupted'].includes(deck.status) ? deck.status : 'interrupted',
      tabs: deck.tabs.map((tab, index) => {
        if (typeof tab.url !== 'string' || tab.url.length > 20000 || !restorable(tab.url)) throw new Error('Backup includes an unsupported tab URL.');
        if (typeof tab.title !== 'string' || tab.title.length > 10000) throw new Error('Invalid tab title.');
        if (tab.screenshot != null && (typeof tab.screenshot !== 'string' || tab.screenshot.length > 2_000_000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(tab.screenshot))) throw new Error('Invalid screenshot in backup.');
        return {
          id: String(index), title: tab.title, url: tab.url, pinned: tab.pinned === true,
          windowIndex: Number.isInteger(tab.windowIndex) && tab.windowIndex >= 0 && tab.windowIndex < 2000 ? tab.windowIndex : 0,
          screenshot: tab.screenshot || null,
          captureNote: tab.screenshot ? null : typeof tab.captureNote === 'string' ? tab.captureNote.slice(0, 200) : 'Preview unavailable'
        };
      })
    };
  });
}

export function backup(decks) {
  return { app: 'TabStash', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), decks };
}
