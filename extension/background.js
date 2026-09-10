import { getDecks, putDeck } from './db.js';
import { restorable } from './model.js';
import { captureTab } from './capture.js';

let running = false;
let cancelled = false;
let progress = null;

async function publish(state) {
  progress = state;
  await chrome.storage.session.set({ capture: state });
  await chrome.action.setBadgeText({ text: state?.running ? `${state.done}/${state.total}` : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#245b49' });
}

chrome.action.onClicked.addListener(async tab => {
  const url = chrome.runtime.getURL(`library.html?source=${tab.windowId}`);
  const existing = (await chrome.tabs.query({ windowId: tab.windowId })).find(t => t.url?.startsWith(chrome.runtime.getURL('library.html')));
  if (existing) await chrome.tabs.update(existing.id, { active: true, url });
  else await chrome.tabs.create({ url, windowId: tab.windowId });
});

async function capture(message, sender) {
  let deck;
  let originalActive = [];
  let focusedWindow;
  try {
    if (!await chrome.permissions.contains({ origins: ['<all_urls>'] })) throw new Error('Allow screenshot access to save a visual deck.');
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
    focusedWindow = windows.find(w => w.focused)?.id;
    const source = windows.filter(w => !w.incognito && (message.scope === 'all' || w.id === (sender.tab?.windowId ?? message.windowId)));
    if (!source.length) throw new Error('The source window is no longer open. Open TabStash from the window you want to save.');
    originalActive = source.flatMap(w => (w.tabs || []).filter(t => t.active));
    const tabs = source.flatMap((w, windowIndex) => (w.tabs || [])
      .filter(t => !t.incognito && restorable(t.url) && !t.url?.startsWith(chrome.runtime.getURL('')))
      .map(t => ({ ...t, windowIndex, windowState: w.state })));
    if (!tabs.length) throw new Error('No tabs to save in this window. Open a few pages first.');
    deck = {
      id: crypto.randomUUID(), name: String(message.name || '').trim().slice(0, 120) || `Session · ${new Date().toLocaleDateString()}`,
      createdAt: Date.now(), status: 'capturing',
      tabs: tabs.map(t => ({ id: String(t.id), title: t.title || t.url, url: t.url, pinned: !!t.pinned, windowIndex: t.windowIndex, screenshot: null, captureNote: 'Not captured yet' }))
    };
    await putDeck(deck); // Persist links before visiting any tabs; checkpoint each preview.
    await publish({ running: true, deckId: deck.id, done: 0, total: tabs.length, title: 'Getting ready…' });
    for (let i = 0; i < tabs.length; i++) {
      if (cancelled) break;
      await publish({ ...progress, title: tabs[i].title || tabs[i].url });
      Object.assign(deck.tabs[i], await captureTab(chrome, tabs[i], tabs[i].windowState));
      await putDeck(deck);
      await publish({ ...progress, done: i + 1 });
    }
    deck.status = cancelled ? 'cancelled' : 'complete';
    for (const tab of deck.tabs) if (tab.captureNote === 'Not captured yet') tab.captureNote = 'Capture stopped — link saved';
    await putDeck(deck);
    await publish({ ...progress, running: false, cancelled, previews: deck.tabs.filter(t => t.screenshot).length });
  } catch (error) {
    if (deck) { deck.status = 'interrupted'; await putDeck(deck).catch(() => {}); }
    await publish({ running: false, error: error.message || 'Could not save the deck.' }).catch(() => {});
  } finally {
    for (const tab of originalActive) await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
    if (focusedWindow) await chrome.windows.update(focusedWindow, { focused: true }).catch(() => {});
    running = false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('library.html'))) return;
  if (message.type === 'capture:start') {
    if (running) { respond({ error: 'A capture is already in progress.' }); return; }
    running = true;
    cancelled = false;
    progress = { running: true, done: 0, total: 0, title: 'Getting ready…' };
    respond({ ok: true });
    void capture(message, sender);
  } else if (message.type === 'capture:cancel') {
    cancelled = true;
    respond({ ok: true });
  } else if (message.type === 'capture:status') {
    (async () => {
      if (!running) {
        const saved = await chrome.storage.session.get('capture');
        progress = saved.capture || null;
        const decks = await getDecks();
        for (const deck of decks.filter(d => d.status === 'capturing')) {
          deck.status = 'interrupted';
          await putDeck(deck);
        }
        if (progress?.running) await publish({ ...progress, running: false, error: 'Capture was interrupted. Your saved links and completed previews are safe.' });
      }
      respond({ capture: progress });
    })().catch(error => respond({ error: error.message }));
    return true;
  }
});
