import { recoveryHistory } from './recovery-db.js';
import { RECOVERY_STATUS } from './recovery-model.js';
import { restorable, hostname } from './model.js';
const $ = selector => document.querySelector(selector);
const date = value => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
let saves = [];
let selectedId;
let revision = 0;
let deleteId;
let restoring = false;
function node(tag, className, text) {
  const el = document.createElement(tag); el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function message(text, error = false) { $('#recovery-message').textContent = text; $('#recovery-message').classList.toggle('danger', error); }
async function request(value) {
  const result = await chrome.runtime.sendMessage(value);
  if (!result?.ok) throw Error(result?.error || 'The operation could not be completed.');
  return result;
}
function render() {
  $('#recovery-empty').hidden = saves.length > 0;
  $('#recovery-layout').hidden = !saves.length;
  $('#clear-recovery').disabled = !saves.length || restoring;
  $('#recovery-list').replaceChildren(...saves.map(save => {
    const count = save.windows.reduce((sum, w) => sum + w.tabs.length, 0);
    const button = node('button', `recovery-save${save.id === selectedId ? ' active' : ''}`);
    button.setAttribute('aria-pressed', String(save.id === selectedId));
    button.append(node('strong', '', date(save.createdAt)), node('span', '', `${count} tabs · ${save.windows.length} windows`));
    button.addEventListener('click', () => { selectedId = save.id; render(); });
    return button;
  }));
  const save = saves.find(item => item.id === selectedId);
  if (!save) return;
  $('#recovery-title').textContent = date(save.createdAt);
  $('#restore-recovery').disabled = $('#delete-recovery').disabled = restoring;
  const groups = [];
  let index = 0;
  for (const [windowIndex, window] of save.windows.entries()) {
    const group = node('section', 'recovery-window');
    group.append(node('h3', '', `Window ${windowIndex + 1} · ${window.tabs.length} tabs`));
    const list = node('ul', 'recovery-tabs');
    for (const tab of window.tabs) {
      const tabIndex = index++;
      const item = node('li', '');
      const link = node('a', 'recovery-tab');
      link.href = restorable(tab.url) ? tab.url : '#'; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.title = tab.url;
      link.append(node('strong', '', `${tab.pinned ? '📌 ' : ''}${tab.title}`), node('span', '', tab.url));
      link.setAttribute('aria-label', `Restore tab: ${tab.title}`);
      link.addEventListener('click', event => { event.preventDefault(); void restore(save.id, tabIndex); });
      item.append(link, node('span', 'recovery-host', hostname(tab.url)));
      list.append(item);
    }
    group.append(list); groups.push(group);
  }
  $('#recovery-windows').replaceChildren(...groups);
}
async function refresh() {
  const token = ++revision;
  const list = await recoveryHistory();
  if (token !== revision) return;
  saves = list;
  if (!saves.some(save => save.id === selectedId)) selectedId = saves[0]?.id;
  render();
}
async function restore(id, index) {
  if (restoring) return;
  restoring = true; render(); message('Opening saved tabs…');
  try {
    const result = await request({ type: 'recovery:restore', id, ...(index === undefined ? {} : { index }) });
    message(`${result.restored} tab${result.restored === 1 ? '' : 's'} restored${result.failed ? `; ${result.failed} could not be fully restored` : ''}. Your saved session is kept.`, result.failed > 0);
  } catch (error) { message(error.message, true); }
  finally { restoring = false; render(); }
}
$('#restore-recovery').addEventListener('click', () => { if (selectedId) void restore(selectedId); });
function confirmDelete(id) {
  deleteId = id;
  $('#recovery-delete-copy').textContent = id === null ? 'Delete all recovery history? Your manual decks and open tabs will stay as they are.' : 'Delete this recovery save? Your open tabs and manual decks will stay as they are.';
  $('#recovery-delete-dialog').showModal();
}
$('#delete-recovery').addEventListener('click', () => confirmDelete(selectedId));
$('#clear-recovery').addEventListener('click', () => confirmDelete(null));
$('#cancel-recovery-delete').addEventListener('click', () => $('#recovery-delete-dialog').close());
$('#confirm-recovery-delete').addEventListener('click', async event => {
  event.target.disabled = true;
  try { await request({ type: 'recovery:delete', id: deleteId }); $('#recovery-delete-dialog').close(); await refresh(); message('Recovery history updated.'); }
  catch (error) { $('#recovery-delete-dialog').close(); message(error.message, true); }
  finally { event.target.disabled = false; }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[RECOVERY_STATUS]) void refresh().catch(error => message(error.message, true));
});
await refresh().catch(error => message(error.message, true));
