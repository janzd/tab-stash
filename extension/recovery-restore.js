import { restorable } from './model.js';
export async function restoreRecovery(api, windows, index) {
  let restored = 0;
  let failed = 0;
  if (index !== undefined) {
    const tab = windows.flatMap(w => w.tabs)[index];
    if (!tab || !restorable(tab.url)) throw Error('This saved tab cannot be opened.');
    await api.tabs.create({ url: tab.url, pinned: tab.pinned === true });
    return { restored: 1, failed: 0 };
  }
  for (const group of windows) {
    let windowId;
    for (const tab of group.tabs) {
      try {
        if (!restorable(tab.url)) throw Error('Unsupported address');
        if (windowId === undefined) {
          const win = await api.windows.create({ url: tab.url, focused: true });
          windowId = win.id;
          restored++;
          if (tab.pinned) await api.tabs.update(win.tabs[0].id, { pinned: true });
        } else {
          await api.tabs.create({ windowId, url: tab.url, pinned: tab.pinned === true, active: false });
          restored++;
        }
      } catch { failed++; }
    }
  }
  return { restored, failed };
}
