import { getDecks, getDeck, putDeck, deleteDeck, addDecks } from './db.js';
import { hostname, searchDecks, searchTabs, validateBackup, backup, MAX_IMPORT_BYTES, restorable } from './model.js';

const $ = selector => document.querySelector(selector);
let decks = [];
let selectedId = null;
let libraryQuery = '';
const deckQueries = new Map();
let busy = false;
let toastTimer;
let lastResult;
const hasChrome = !!globalThis.chrome?.runtime?.id;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function date(timestamp, full = false) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', ...(full ? { hour: 'numeric', minute: '2-digit' } : {}) }).format(timestamp);
}
function toast(message, error = false) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.toggle('error', error);
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, error ? 9000 : 5500);
}
function safely(action) {
  return async event => {
    try { await action(event); }
    catch (error) { toast(error.message || 'Something went wrong. Please try again.', true); }
  };
}
function requireChrome() {
  if (!hasChrome) throw new Error('Load the extension in Chrome to capture and restore your tabs.');
}
function screenshot(tab, className) {
  if (tab.screenshot) {
    const img = element('img', className);
    img.src = tab.screenshot;
    img.alt = `Screenshot of ${tab.title}`;
    img.loading = 'lazy';
    img.decoding = 'async';
    return img;
  }
  return element('div', 'mini-fallback', hostname(tab.url).slice(0, 1).toUpperCase());
}

function deckCard(deck) {
  const button = element('button', 'deck-card');
  button.type = 'button';
  button.setAttribute('aria-label', `Open ${deck.name}, ${deck.tabs.length} tabs`);
  const cover = element('div', 'deck-cover');
  const previews = [...deck.tabs.filter(t => t.screenshot), ...deck.tabs.filter(t => !t.screenshot)].slice(0, 3).reverse();
  for (const tab of previews) {
    const mini = element('div', 'mini-tab');
    const bar = element('div', 'mini-bar');
    bar.append(element('i'), element('i'), element('i'), element('span', '', hostname(tab.url)));
    mini.append(bar, screenshot(tab));
    cover.append(mini);
  }
  cover.append(element('span', 'cover-count', `${deck.tabs.length} ${deck.tabs.length === 1 ? 'tab' : 'tabs'}`));
  const meta = element('div', 'deck-date');
  meta.append(element('span', '', date(deck.createdAt)), element('span', '', '·'), element('span', '', `${deck.tabs.filter(t => t.screenshot).length} previews`));
  if (deck.status !== 'complete') meta.append(element('span', 'partial', `· ${deck.status}`));
  button.append(cover, element('h3', '', deck.name), meta);
  button.addEventListener('click', () => { location.hash = deck.id; });
  return button;
}

function render() {
  $('#deck-count').textContent = decks.length;
  $('#export-all').disabled = busy || !decks.length;
  const deck = decks.find(d => d.id === selectedId);
  $('#library-view').hidden = !!deck;
  $('#detail-view').hidden = !deck;
  $('#crumb').textContent = deck?.name || 'All decks';
  const query = deck ? deckQueries.get(deck.id) || '' : libraryQuery;
  if ($('#search').value !== query) $('#search').value = query;
  $('#search').placeholder = deck ? 'Find a tab in this deck…' : 'Find a deck, title, or URL…';
  $('#search').setAttribute('aria-label', deck ? 'Search tabs in this deck' : 'Search decks and tabs');
  if (deck) { renderDetail(deck); return; }
  const visible = searchDecks(decks, libraryQuery);
  const sort = $('#sort').value;
  visible.sort(sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : sort === 'oldest' ? (a, b) => a.createdAt - b.createdAt : (a, b) => b.createdAt - a.createdAt);
  $('#deck-total').textContent = visible.length;
  $('#deck-grid').replaceChildren(...visible.map(deckCard));
  $('#empty').hidden = decks.length > 0;
  $('#no-results').hidden = !decks.length || !!visible.length;
  const tabs = decks.reduce((sum, d) => sum + d.tabs.length, 0);
  $('#library-stats').textContent = decks.length ? `${decks.length} ${decks.length === 1 ? 'deck' : 'decks'} · ${tabs} tabs tucked away · Stored locally` : 'A little space for everything you’re exploring.';
}

function renderDetail(deck) {
  $('#detail-title').textContent = deck.name;
  $('#detail-date').textContent = `STASHED ${date(deck.createdAt, true).toUpperCase()}`;
  const previews = deck.tabs.filter(t => t.screenshot).length;
  $('#detail-meta').textContent = `${deck.tabs.length} tabs · ${previews} screenshots · ${new Set(deck.tabs.map(t => t.windowIndex)).size} ${new Set(deck.tabs.map(t => t.windowIndex)).size === 1 ? 'window' : 'windows'}${deck.status !== 'complete' ? ` · ${deck.status}` : ''}`;
  const query = deckQueries.get(deck.id) || '';
  const visibleTabs = searchTabs(deck.tabs, query);
  const searching = !!query.trim();
  $('#tab-search-summary').textContent = searching
    ? `${visibleTabs.length} of ${deck.tabs.length} tabs match your search`
    : 'One moment, all your tabs.';
  $('#clear-tab-search').hidden = !searching;
  $('#tab-no-results').hidden = !searching || !!visibleTabs.length;
  $('#tab-grid').replaceChildren(...visibleTabs.map(tab => {
    const card = element('a', 'tab-card');
    card.href = restorable(tab.url) ? tab.url : '#';
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.title = tab.url;
    card.setAttribute('aria-label', `Open tab: ${tab.title}`);
    card.addEventListener('click', safely(async event => {
      event.preventDefault();
      requireChrome();
      if (!restorable(tab.url)) throw new Error('This address cannot be reopened.');
      await chrome.tabs.create({ url: tab.url, pinned: tab.pinned });
    }));
    const visual = element('div', 'tab-image');
    if (tab.screenshot) visual.append(screenshot(tab));
    else {
      const fallback = element('div', 'tab-fallback');
      fallback.append(element('strong', '', hostname(tab.url).slice(0, 1).toUpperCase()), element('span', '', tab.captureNote || 'Preview unavailable — link saved'));
      visual.append(fallback);
    }
    visual.append(element('span', 'tab-open', '↗'));
    const body = element('div', 'tab-body');
    const domain = element('div', 'tab-domain');
    domain.append(element('span', 'domain-icon', hostname(tab.url).slice(0, 1).toUpperCase()), element('span', 'host', hostname(tab.url)));
    if (tab.pinned) domain.append(element('span', 'pin', 'PINNED'));
    body.append(element('h3', '', tab.title), domain);
    card.append(visual, body);
    return card;
  }));
  for (const id of ['rename-deck', 'delete-deck', 'restore-deck', 'export-deck']) $(`#${id}`).disabled = busy;
}

async function refresh() { decks = await getDecks(); render(); }
function selected() {
  const deck = decks.find(d => d.id === selectedId);
  if (!deck) throw new Error('This deck is no longer available.');
  return deck;
}
function openSave() {
  if (busy) return;
  $('#deck-name').value = '';
  $('#save-dialog').showModal();
  $('#deck-name').focus();
}
function showProgress(state) {
  busy = !!state?.running;
  $('#capture-progress').hidden = !busy;
  $('#new-deck').disabled = busy;
  $('#empty-stash').disabled = busy;
  $('#import').disabled = busy;
  $('#export-all').disabled = busy || !decks.length;
  if (busy) {
    $('#progress-title').textContent = `Stashing your tabs · ${state.done} of ${state.total || '…'}`;
    $('#progress-detail').textContent = state.title || 'Getting ready…';
    $('#progress-bar').max = state.total || 1;
    $('#progress-bar').value = state.done || 0;
  } else if (state && JSON.stringify(state) !== lastResult) {
    if (state.error) toast(state.error, true);
    else if (state.deckId) toast(state.cancelled ? 'Capture stopped. All links and completed screenshots are saved.' : `Deck saved. ${state.total} tabs, ${state.previews} screenshots.`);
  }
  lastResult = JSON.stringify(state);
  render();
}

$('#save-form').addEventListener('submit', safely(async event => {
  event.preventDefault();
  requireChrome();
  $('#save-submit').disabled = true;
  try {
    // Must be called directly in the user gesture, before any unrelated await.
    const allowed = await chrome.permissions.request({ origins: ['<all_urls>'] });
    if (!allowed) throw new Error('Screenshot access was not enabled. You can try again whenever you’re ready.');
    const current = await chrome.tabs.getCurrent();
    const result = await chrome.runtime.sendMessage({ type: 'capture:start', name: $('#deck-name').value, scope: $('#capture-scope').value, windowId: current.windowId });
    if (result.error) throw new Error(result.error);
    $('#save-dialog').close();
    showProgress({ running: true, done: 0, total: 0 });
  } finally { $('#save-submit').disabled = false; }
}));
$('#cancel-capture').addEventListener('click', safely(async () => {
  await chrome.runtime.sendMessage({ type: 'capture:cancel' });
  $('#progress-detail').textContent = 'Stopping after the current tab…';
}));
for (const id of ['new-deck', 'empty-stash']) $(`#${id}`).addEventListener('click', openSave);
for (const button of document.querySelectorAll('.close-dialog')) button.addEventListener('click', () => button.closest('dialog').close());
function setSearch(query) {
  const deck = decks.find(d => d.id === selectedId);
  if (deck) deckQueries.set(deck.id, query);
  else libraryQuery = query;
  render();
}
$('#search').addEventListener('input', () => { setSearch($('#search').value); });
$('#sort').addEventListener('change', render);
for (const id of ['clear-search', 'clear-tab-search', 'clear-tab-empty-search']) {
  $(`#${id}`).addEventListener('click', () => { setSearch(''); $('#search').focus(); });
}
for (const id of ['all-decks', 'back']) $(`#${id}`).addEventListener('click', () => { location.hash = ''; });
window.addEventListener('hashchange', () => { selectedId = location.hash.slice(1) || null; render(); });
document.addEventListener('keydown', event => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !document.querySelector('dialog[open]')) { event.preventDefault(); $('#search').focus(); }
});

$('#rename-deck').addEventListener('click', safely(() => { $('#rename-input').value = selected().name; $('#edit-dialog').showModal(); $('#rename-input').select(); }));
$('#edit-form').addEventListener('submit', safely(async event => {
  event.preventDefault();
  if (busy) throw new Error('Wait for the current capture to finish.');
  const name = $('#rename-input').value.trim();
  if (!name) throw new Error('Give your deck a name.');
  const deck = await getDeck(selected().id);
  if (!deck) throw new Error('This deck was deleted in another tab.');
  await putDeck({ ...deck, name });
  $('#edit-dialog').close();
  await refresh();
  toast('Deck renamed.');
}));
$('#delete-deck').addEventListener('click', safely(() => { $('#delete-description').textContent = `“${selected().name}” has ${selected().tabs.length} saved tabs.`; $('#delete-dialog').showModal(); }));
$('#delete-form').addEventListener('submit', safely(async event => {
  event.preventDefault();
  if (busy) throw new Error('Wait for the current capture to finish.');
  await deleteDeck(selected().id);
  deckQueries.delete(selectedId);
  $('#delete-dialog').close();
  selectedId = null;
  location.hash = '';
  await refresh();
  toast('Deck deleted.');
}));

$('#restore-deck').addEventListener('click', safely(async () => {
  requireChrome();
  const deck = selected();
  $('#restore-deck').disabled = true;
  let restored = 0;
  let failed = 0;
  try {
    const groups = Map.groupBy ? Map.groupBy(deck.tabs, t => t.windowIndex) : deck.tabs.reduce((map, tab) => map.set(tab.windowIndex, [...(map.get(tab.windowIndex) || []), tab]), new Map());
    for (const tabs of groups.values()) {
      let windowId;
      for (const tab of tabs) {
        try {
          if (!restorable(tab.url)) throw new Error('Unsupported URL');
          if (windowId === undefined) {
            const win = await chrome.windows.create({ url: tab.url, focused: true });
            windowId = win.id;
            if (tab.pinned && win.tabs?.[0]) await chrome.tabs.update(win.tabs[0].id, { pinned: true });
          } else await chrome.tabs.create({ windowId, url: tab.url, pinned: tab.pinned, active: false });
          restored++;
        } catch { failed++; }
      }
    }
    toast(`${restored} ${restored === 1 ? 'tab' : 'tabs'} restored${failed ? `; ${failed} could not be opened` : ''}. Your deck is still saved.`, !!failed);
  } finally { $('#restore-deck').disabled = false; }
}));

function download(list, filename) {
  const data = JSON.stringify(backup(list));
  const blob = new Blob([data], { type: 'application/json' });
  if (blob.size > MAX_IMPORT_BYTES) throw new Error('This backup exceeds 100 MB. Export individual decks instead.');
  const url = URL.createObjectURL(blob);
  const anchor = element('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
$('#export-all').addEventListener('click', safely(() => { download(decks, `TabStash-${new Date().toISOString().slice(0, 10)}.json`); }));
$('#export-deck').addEventListener('click', safely(() => { const deck = selected(); download([deck], `TabStash-${deck.name.replace(/[^a-z0-9 _-]/gi, '').trim() || 'deck'}.json`); }));
$('#import').addEventListener('click', () => { $('#import-file').click(); });
$('#import-file').addEventListener('change', safely(async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (busy) throw new Error('Wait for the current capture to finish.');
  if (file.size > MAX_IMPORT_BYTES) throw new Error('Choose a backup smaller than 100 MB.');
  let parsed;
  try { parsed = JSON.parse(await file.text()); } catch { throw new Error('This file is not valid JSON. Choose a TabStash backup.'); }
  const imported = validateBackup(parsed).map(deck => ({ ...deck, id: crypto.randomUUID() }));
  await addDecks(imported); // One atomic transaction; imports never overwrite an existing deck.
  await refresh();
  toast(`${imported.length} ${imported.length === 1 ? 'deck' : 'decks'} imported.`);
}));

if (hasChrome) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'session' || !changes.capture) return;
    const state = changes.capture.newValue;
    showProgress(state);
    if (!state?.running || state.done === 0) refresh().catch(error => toast(error.message, true));
  });
  window.addEventListener('focus', () => { if (!busy) refresh().catch(error => toast(error.message, true)); });
}

await safely(async () => {
  if (hasChrome) {
    const result = await chrome.runtime.sendMessage({ type: 'capture:status' });
    if (result.error) throw new Error(result.error);
    showProgress(result.capture);
  }
  selectedId = location.hash.slice(1) || null;
  await refresh();
})();
