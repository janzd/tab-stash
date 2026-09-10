import { captureReason } from './model.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function thumbnail(dataUrl) {
  const binaryInput = atob(dataUrl.split(',')[1]);
  const blob = new Blob([Uint8Array.from(binaryInput, c => c.charCodeAt(0))], { type: 'image/jpeg' });
  const bitmap = await createImageBitmap(blob);
  try {
    const width = Math.min(640, bitmap.width);
    const canvas = new OffscreenCanvas(width, Math.round(width * bitmap.height / bitmap.width));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const output = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.72 });
    const bytes = new Uint8Array(await output.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return `data:image/jpeg;base64,${btoa(binary)}`;
  } finally { bitmap.close(); }
}

// Capture is deliberately serial: Chrome permits at most two captures per second.
// Verify tab identity around capture so a switched/navigating tab never gets a wrong preview.
export async function captureTab(api, tab, state, options = {}) {
  const wait = options.wait || sleep;
  const shrink = options.thumbnail || thumbnail;
  const reason = captureReason(tab, state);
  if (reason) return { screenshot: null, captureNote: reason };
  try {
    await api.windows.update(tab.windowId, { focused: true });
    await api.tabs.update(tab.id, { active: true });
    let current;
    for (let attempt = 0; attempt < 32; attempt++) {
      current = await api.tabs.get(tab.id);
      if (current.status === 'complete') break;
      await wait(250);
    }
    if (current.status !== 'complete') throw new Error('Page still loading — link saved');
    await wait(650);
    const before = await api.tabs.get(tab.id);
    if (!before.active || before.windowId !== tab.windowId || before.url !== tab.url || before.pendingUrl) throw new Error('Tab changed during capture — link saved');
    const data = await api.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 80 });
    const after = await api.tabs.get(tab.id);
    if (!after.active || after.windowId !== tab.windowId || after.url !== tab.url || after.pendingUrl) throw new Error('Tab changed during capture — link saved');
    return { screenshot: await shrink(data), captureNote: null };
  } catch (error) {
    const detail = String(error.message || error);
    return { screenshot: null, captureNote: detail.includes('— link saved') ? detail : 'Capture unavailable — link saved' };
  }
}
