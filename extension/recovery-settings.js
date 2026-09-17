import { RECOVERY_KEY, RECOVERY_STATUS, recoveryPreferences } from './recovery-model.js';
const form = document.querySelector('#recovery-settings');
const enabled = document.querySelector('#recovery-enabled');
const interval = document.querySelector('#recovery-interval');
const retention = document.querySelector('#recovery-retention');
const status = document.querySelector('#recovery-setting-status');
const error = document.querySelector('#recovery-setting-error');
let revision = 0;
async function refresh() {
  const token = ++revision;
  const result = await chrome.storage.local.get([RECOVERY_KEY, RECOVERY_STATUS]);
  if (revision !== token) return;
  const prefs = recoveryPreferences(result[RECOVERY_KEY]);
  enabled.checked = prefs.enabled;
  interval.value = String(prefs.interval);
  retention.value = String(prefs.retention);
  status.textContent = result[RECOVERY_STATUS]?.message || 'Automatic saving is off. Enable it to start a recovery history.';
}
form.addEventListener('change', async () => {
  const value = recoveryPreferences({ enabled: enabled.checked, interval: Number(interval.value), retention: Number(retention.value) });
  const focused = document.activeElement;
  error.hidden = true;
  form.disabled = true;
  try { await chrome.storage.local.set({ [RECOVERY_KEY]: value }); }
  catch { error.textContent = 'Could not save recovery settings. Please try again.'; error.hidden = false; }
  finally { form.disabled = false; await refresh().catch(showError); if (form.contains(focused)) focused.focus(); }
});
function showError() { error.textContent = 'Could not load recovery settings. Please reload this page.'; error.hidden = false; }
if (globalThis.chrome?.storage) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[RECOVERY_KEY] || changes[RECOVERY_STATUS])) void refresh().catch(showError);
  });
  void refresh().catch(showError);
} else form.disabled = true;
