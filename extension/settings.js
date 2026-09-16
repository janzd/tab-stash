const catalog = globalThis.TabStashPalettes;
const control = document.querySelector('#palette-control');
for (const palette of catalog.presets) {
  const choice = document.createElement('div');
  choice.className = 'palette-choice';
  // The catalog is packaged, trusted metadata, never user or imported content.
  choice.innerHTML = `
    <input class="sr-only" type="radio" name="palette" id="palette-${palette.id}" value="${palette.id}" aria-label="${palette.name}" aria-describedby="${palette.id}-description">
    <label class="palette-card" for="palette-${palette.id}">
      <span class="palette-previews" aria-hidden="true">${['light', 'dark'].map(mode => `
        <span class="palette-preview" data-palette="${palette.id}" data-theme="${mode}">
          <span class="preview-sidebar"><i class="preview-logo"></i><i class="preview-nav"></i><i class="preview-nav short"></i></span>
          <span class="preview-page"><span class="preview-mode">${mode === 'light' ? 'Light' : 'Dark'}</span><i class="preview-title"></i><i class="preview-copy"></i><span class="preview-cards"><i></i><i></i><i></i></span><i class="preview-button"></i></span>
        </span>`).join('')}</span>
      <span class="palette-card-heading"><span class="palette-name">${palette.name}</span>${palette.id === catalog.defaultId ? '<span class="palette-default">Default</span>' : ''}<span class="palette-check" aria-hidden="true">✓</span></span>
      <span class="palette-description" id="${palette.id}-description">${palette.description}</span>
    </label>`;
  control.append(choice);
}

// The experiment is separate from saved decks and remains off until explicitly enabled.
const { PREVIEW_KEY, ENABLED_KEY, STATUS_KEY, boundedPreviews } = await import('./preview-cache.js');
const toggle = document.querySelector('#collect-previews');
const cacheError = document.querySelector('#preview-error');
const clearPreviews = document.querySelector('#clear-previews');
let previewRevision = 0;
function showCacheError(message = '') { cacheError.textContent = message; cacheError.hidden = !message; }
async function refreshPreviews() {
  const revision = ++previewRevision;
  if (!globalThis.chrome?.runtime?.id) {
    toggle.disabled = clearPreviews.disabled = true;
    return;
  }
  const [local, session] = await Promise.all([
    chrome.storage.local.get(ENABLED_KEY), chrome.storage.session.get([PREVIEW_KEY, STATUS_KEY])
  ]);
  if (revision !== previewRevision) return;
  toggle.checked = local[ENABLED_KEY] === true;
  const entries = boundedPreviews(session[PREVIEW_KEY] || []);
  const grid = document.querySelector('#preview-cache-grid');
  grid.replaceChildren();
  document.querySelector('#preview-cache-status').textContent = `${toggle.checked ? 'Collecting' : 'Paused'} · ${entries.length} cached preview${entries.length === 1 ? '' : 's'}`;
  document.querySelector('#preview-cache-empty').hidden = entries.length > 0;
  const status = session[STATUS_KEY];
  const diagnostic = document.querySelector('#preview-cache-diagnostic');
  diagnostic.textContent = !toggle.checked ? 'Collection is paused.'
    : status ? `Last check at ${new Date(status.at).toLocaleTimeString()}: ${status.message}`
    : 'Waiting for a web page. Keep a loaded website active for a few seconds, then return here.';

  for (const entry of entries.slice(0, 12)) {
    const card = document.createElement('figure');
    const img = document.createElement('img');
    img.src = entry.screenshot;
    img.alt = `Cached preview of ${entry.title}`;
    img.loading = 'lazy';
    const caption = document.createElement('figcaption');
    const title = document.createElement('strong');
    title.textContent = entry.title;
    title.title = entry.url;
    const time = document.createElement('span');
    time.textContent = `Captured ${new Date(entry.capturedAt).toLocaleTimeString()} · ${entry.durationMs} ms`;
    caption.append(title, time);
    card.append(img, caption);
    grid.append(card);
  }
}
toggle.addEventListener('change', async () => {
  const enabled = toggle.checked;
  toggle.disabled = true;
  showCacheError();
  try {
    // Request synchronously from this explicit gesture, never from the background worker.
    if (enabled && !await chrome.permissions.request({ origins: ['<all_urls>'] })) {
      throw new Error('Website access is needed to collect previews. Collection remains paused.');
    }
    await chrome.storage.local.set({ [ENABLED_KEY]: enabled });
  } catch (error) { showCacheError(error.message || 'Could not save this setting. Please try again.'); }
  finally {
    toggle.disabled = false;
    await refreshPreviews().catch(() => showCacheError('Could not load the preview cache. Please try again.'));
  }
});
clearPreviews.addEventListener('click', async () => {
  clearPreviews.disabled = true;
  showCacheError();
  try {
    const result = await chrome.runtime.sendMessage({ type: 'previews:clear' });
    if (!result?.ok) throw new Error(result?.error || 'Could not clear previews. Please try again.');
    await refreshPreviews();
  } catch (error) { showCacheError(error.message); }
  finally { clearPreviews.disabled = false; }
});
globalThis.chrome?.storage?.onChanged.addListener((changes, area) => {
  if ((area === 'local' && changes[ENABLED_KEY]) || (area === 'session' && (changes[PREVIEW_KEY] || changes[STATUS_KEY]))) {
    void refreshPreviews().catch(() => showCacheError('Could not load the preview cache. Please try again.'));
  }
});
await refreshPreviews().catch(() => showCacheError('Could not load the preview cache. Please try again.'));
