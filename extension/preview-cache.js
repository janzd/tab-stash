import { thumbnail } from './capture.js';

export const PREVIEW_KEY = 'previewCache';
export const ENABLED_KEY = 'previewCacheEnabled';
export const MAX_PREVIEWS = 40;
export const MAX_BYTES = 4 * 1024 * 1024;
export const MAX_AGE = 60 * 60 * 1000;
const SETTLE_MS = 2000;
const GLOBAL_INTERVAL = 5000;
const TAB_INTERVAL = 60000;

// Conservatively count UTF-16 JSON storage, including metadata, before writing.
export function boundedPreviews(entries, now = Date.now()) {
  let bytes = 0;
  return entries.filter(entry => entry.capturedAt <= now && now - entry.capturedAt < MAX_AGE)
    .sort((a, b) => b.capturedAt - a.capturedAt).filter((entry, index) => {
      const size = JSON.stringify(entry).length * 2;
      if (index >= MAX_PREVIEWS || bytes + size > MAX_BYTES) return false;
      bytes += size;
      return true;
    });
}

export function eligiblePreview(tab) {
  return !!tab && tab.active && !tab.incognito && !tab.discarded && !tab.frozen && !tab.audible &&
    tab.status === 'complete' && !tab.pendingUrl && /^https?:\/\//i.test(tab.url || '') &&
    (tab.splitViewId == null || tab.splitViewId === -1);
}

// No method in this controller activates, focuses, navigates, scrolls, or injects into a page.
export function createPreviewCollector(api, {
  shrink = thumbnail, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
  isBusy = () => false
} = {}) {
  let generation = 0;
  let timer;
  let job = Promise.resolve();
  let suspended = false;
  let lastAttempt = -Infinity;

  function invalidate() { generation++; clearTimer(timer); timer = undefined; }
  async function current() {
    const window = await api.windows.getLastFocused();
    if (!window.focused || window.incognito || window.type !== 'normal' || ['minimized', 'fullscreen'].includes(window.state)) return null;
    const [tab] = await api.tabs.query({ active: true, windowId: window.id });
    if (!eligiblePreview(tab)) return null;
    return tab;
  }
  async function collect(token) {
    const valid = () => generation === token && !suspended && !isBusy();
    if (!valid()) return;
    const enabled = await api.storage.local.get(ENABLED_KEY);
    if (enabled[ENABLED_KEY] !== true || !valid()) return;
    if (!await api.permissions.contains({ origins: ['<all_urls>'] }) || !valid()) return;
    const tab = await current();
    if (!tab || !valid()) return;
    const stored = await api.storage.session.get(PREVIEW_KEY);
    const entries = boundedPreviews(stored[PREVIEW_KEY] || [], now());
    const previous = entries.find(entry => entry.tabId === tab.id && entry.url === tab.url);
    if (previous && now() - previous.capturedAt < TAB_INTERVAL) return;
    if (!valid() || now() - lastAttempt < GLOBAL_INTERVAL) return;
    // Recheck after asynchronous storage and permission reads.
    const before = await current();
    if (!valid() || before?.id !== tab.id || before.url !== tab.url || before.windowId !== tab.windowId) return;
    lastAttempt = now();
    const started = now();
    const data = await api.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 80 });
    const after = await current();
    if (!valid() || after?.id !== tab.id || after.url !== tab.url || after.windowId !== tab.windowId) return;
    const screenshot = await shrink(data);
    if (!valid()) return;
    const entry = { tabId: tab.id, url: tab.url, title: tab.title || tab.url, screenshot,
      capturedAt: started, durationMs: Math.max(0, now() - started) };
    await api.storage.session.set({ [PREVIEW_KEY]: boundedPreviews([entry, ...entries.filter(item => item.tabId !== tab.id)], now()) });
  }
  function schedule() {
    invalidate();
    if (suspended || isBusy()) return;
    const token = generation;
    timer = setTimer(() => {
      timer = undefined;
      // Serialize capture and cache mutations. Failures simply defer until another browsing event.
      job = job.then(async () => {
        await collect(token);
      }).catch(() => {});
    }, Math.max(SETTLE_MS, GLOBAL_INTERVAL - (now() - lastAttempt)));
  }
  async function suspend() { suspended = true; invalidate(); await job; }
  function resume() { suspended = false; schedule(); }
  function clear() {
    invalidate();
    const clearing = job.then(() => api.storage.session.remove(PREVIEW_KEY));
    job = clearing.catch(() => {});
    return clearing;
  }
  function forget(tabId) {
    invalidate();
    job = job.then(async () => {
      const stored = await api.storage.session.get(PREVIEW_KEY);
      if (!stored[PREVIEW_KEY]?.length) return;
      await api.storage.session.set({ [PREVIEW_KEY]: boundedPreviews((stored[PREVIEW_KEY] || []).filter(entry => entry.tabId !== tabId), now()) });
    }).catch(() => {});
    schedule();
  }
  return { schedule, invalidate, suspend, resume, clear, forget, drain: () => job };
}
