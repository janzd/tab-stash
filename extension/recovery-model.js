import { restorable } from './model.js';
export const RECOVERY_KEY = 'recoveryPreferences';
export const RECOVERY_STATUS = 'recoveryStatus';
export const RECOVERY_BOOT = 'recoveryBoot';
export const RECOVERY_ALARM = 'tabstash-recovery';
export const HISTORY_BYTES = 20 * 1024 * 1024;
export function recoveryPreferences(value = {}) {
  return { enabled: value?.enabled === true,
    interval: [1, 5, 15, 30, 60].includes(value?.interval) ? value.interval : 5,
    retention: [10, 25, 50, 100].includes(value?.retention) ? value.retention : 50 };
}
export function sessionMetadata(windows, ownURL) {
  return windows.filter(w => w.type === 'normal' && !w.incognito).map(w => ({
    tabs: (w.tabs || []).filter(t => !t.incognito && restorable(t.pendingUrl || t.url) && !(t.pendingUrl || t.url).startsWith(ownURL))
      .sort((a, b) => a.index - b.index).map(t => ({ url: t.pendingUrl || t.url, title: t.title || t.pendingUrl || t.url, pinned: t.pinned === true }))
  })).filter(w => w.tabs.length);
}
export function canonicalSession(windows) {
  // Window IDs/order can change across restarts; order within each window matters.
  return JSON.stringify(windows.map(w => JSON.stringify(w.tabs)).sort());
}
export async function sessionFingerprint(windows) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalSession(windows)));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function retainedHistory(records, limit, protectedId) {
  const sorted = [...records].sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  const anchor = sorted.find(record => record.id === protectedId);
  const keep = anchor ? [anchor] : [];
  let bytes = anchor ? anchor.bytes : 0;
  for (const record of sorted) {
    if (record.id === anchor?.id) continue;
    if (keep.length < limit && bytes + record.bytes <= HISTORY_BYTES) { keep.push(record); bytes += record.bytes; }
  }
  return keep;
}
