// Run before stylesheets: caches avoid a flash while Chrome storage is read.
// chrome.storage.local is authoritative; these caches never contain deck data.
(() => {
  const catalog = globalThis.TabStashPalettes;
  const mode = { key: 'themePreference', control: '#theme-control', values: ['light', 'dark', 'system'], fallback: 'system', label: 'theme' };
  const palette = { key: 'palettePreference', control: '#palette-control', values: catalog.presets.map(item => item.id), fallback: catalog.defaultId, label: 'color palette' };
  const settings = [mode, palette];
  const system = matchMedia('(prefers-color-scheme: dark)');
  const storage = globalThis.chrome?.storage;
  for (const setting of settings) {
    setting.cache = `tabstash.${setting.key}`;
    setting.revision = 0;
    setting.error = '';
    setting.normalize = value => setting.values.includes(value) ? value : setting.fallback;
    setting.value = setting.fallback;
    try { setting.value = setting.normalize(localStorage.getItem(setting.cache)); } catch { /* Cache is optional. */ }
  }

  function render() {
    const theme = mode.value === 'system' ? (system.matches ? 'dark' : 'light') : mode.value;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = mode.value;
    document.documentElement.dataset.palette = palette.value;
    document.documentElement.style.colorScheme = theme;
    for (const setting of settings) {
      for (const input of document.querySelectorAll(`${setting.control} input`)) input.checked = input.value === setting.value;
    }
    const error = document.querySelector('#theme-error');
    const message = settings.map(setting => setting.error).filter(Boolean).join(' ');
    if (error) { error.textContent = message; error.hidden = !message; }
  }

  function apply(setting, value) {
    setting.value = setting.normalize(value);
    try { localStorage.setItem(setting.cache, setting.value); } catch { /* Chrome storage still persists the choice. */ }
    render();
  }

  render();
  system.addEventListener('change', render);
  if (storage) {
    storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      for (const setting of settings) {
        if (!changes[setting.key]) continue;
        setting.revision++;
        setting.error = '';
        apply(setting, changes[setting.key].newValue);
      }
    });
    const revisions = settings.map(setting => setting.revision);
    storage.local.get(settings.map(setting => setting.key)).then(result => {
      // Guard each preference independently against late reads.
      settings.forEach((setting, index) => {
        if (setting.revision === revisions[index]) apply(setting, result[setting.key]);
      });
    }).catch(() => {
      settings.forEach((setting, index) => {
        if (setting.revision === revisions[index]) setting.error = `Your saved ${setting.label} could not be loaded. You can choose it again.`;
      });
      render();
    });
  } else {
    addEventListener('storage', event => {
      for (const setting of settings) {
        if (event.key === setting.cache || event.key === null) { setting.revision++; apply(setting, event.newValue); }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    render();
    for (const setting of settings) {
      document.querySelector(setting.control)?.addEventListener('change', async event => {
        const control = event.currentTarget;
        const restoreFocus = event.target === document.activeElement;
        const previous = setting.value;
        const choice = setting.normalize(event.target.value);
        const revision = ++setting.revision;
        setting.error = '';
        apply(setting, choice);
        control.disabled = true;
        try {
          if (storage) await storage.local.set({ [setting.key]: choice });
          else localStorage.setItem(setting.cache, choice);
        } catch {
          if (setting.revision === revision) {
            apply(setting, previous);
            setting.error = `Your ${setting.label} preference could not be saved. Please try again.`;
            render();
          }
        } finally {
          control.disabled = false;
          if (restoreFocus && document.activeElement === document.body) {
            document.querySelector(`${setting.control} input:checked`)?.focus({ preventScroll: true });
          }
        }
      });
    }
  }, { once: true });
})();
