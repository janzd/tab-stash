// Run before stylesheets: the cache avoids a flash while Chrome storage is read.
// chrome.storage.local is authoritative; this cache never contains deck data.
(() => {
  const KEY = 'themePreference';
  const CACHE = 'tabstash.themePreference';
  const normalize = value => ['light', 'dark', 'system'].includes(value) ? value : 'system';
  const system = matchMedia('(prefers-color-scheme: dark)');
  const storage = globalThis.chrome?.storage;
  let preference = 'system';
  let revision = 0;
  let errorMessage = '';
  try { preference = normalize(localStorage.getItem(CACHE)); } catch { /* Cache is optional. */ }

  function render() {
    const theme = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = theme;
    for (const input of document.querySelectorAll('#theme-control input')) input.checked = input.value === preference;
    const error = document.querySelector('#theme-error');
    if (error) { error.textContent = errorMessage; error.hidden = !errorMessage; }
  }

  function apply(value) {
    preference = normalize(value);
    try { localStorage.setItem(CACHE, preference); } catch { /* Chrome storage still persists the choice. */ }
    render();
  }

  render();
  system.addEventListener('change', render);

  if (storage) {
    storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[KEY]) return;
      revision++;
      errorMessage = '';
      apply(changes[KEY].newValue);
    });
    const initialRevision = revision;
    storage.local.get(KEY).then(result => {
      // A delayed initial read must not overwrite a more recent user choice.
      if (revision === initialRevision) apply(result[KEY]);
    }).catch(() => {
      if (revision !== initialRevision) return;
      errorMessage = 'Your saved theme could not be loaded. You can choose a theme again.';
      render();
    });
  } else {
    // Also allow the standalone HTML preview to use and synchronize themes.
    addEventListener('storage', event => {
      if (event.key === CACHE || event.key === null) { revision++; apply(event.newValue); }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    render();
    document.querySelector('#theme-control').addEventListener('change', async event => {
      const control = event.currentTarget;
      const restoreFocus = event.target === document.activeElement;
      const previous = preference;
      const choice = normalize(event.target.value);
      const changeRevision = ++revision;
      errorMessage = '';
      apply(choice);
      control.disabled = true;
      try {
        if (storage) await storage.local.set({ [KEY]: choice });
        else localStorage.setItem(CACHE, choice);
      } catch {
        if (revision === changeRevision) apply(previous);
        errorMessage = 'Your theme preference could not be saved. Please try again.';
        render();
      } finally {
        control.disabled = false;
        // Disabling the group during a save can move focus to the document body.
        if (restoreFocus && document.activeElement === document.body) {
          document.querySelector('#theme-control input:checked').focus({ preventScroll: true });
        }
      }
    });
  }, { once: true });
})();
