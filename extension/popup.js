const toggle = document.querySelector('#enabled');
const settings = document.querySelector('#settings');
const settingsTab = document.querySelector('#settings-tab');
const status = document.querySelector('#status');
let state = null;
let busy = false;
let updates = 0;

function render() {
  toggle.checked = state?.enabled === true;
  toggle.disabled = busy || !state;
  settings.disabled = busy;
  settingsTab.disabled = busy;
  toggle.title = toggle.checked ? 'Автоподтверждение включено' : 'Автоподтверждение выключено';
}

function showError(error) {
  const message = error?.message || 'Не удалось сохранить настройку';
  status.textContent = message;
  toggle.title = message;
  settings.title = message;
  settingsTab.title = message;
  document.body.classList.add('has-error');
}

function clearError() {
  document.body.classList.remove('has-error');
  status.textContent = '';
  settings.title = 'Настройки доменов';
  settingsTab.title = 'Открыть настройки во вкладке';
}

async function send(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error || 'Расширение не отвечает');
  return result;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.state?.newValue) {
    updates++;
    state = changes.state.newValue;
    render();
  }
});

toggle.addEventListener('change', async () => {
  const enabled = toggle.checked;
  busy = true;
  clearError();
  toggle.disabled = true;
  settings.disabled = true;
  settingsTab.disabled = true;
  let error;
  try {
    state = (await send({ type: 'setEnabled', enabled })).state;
  } catch (failure) {
    error = failure;
  } finally {
    busy = false;
    render();
    if (error) showError(error);
  }
});

async function openSettings(type) {
  if (busy) return;
  busy = true;
  clearError();
  render();
  try {
    await send({ type });
    window.close();
  } catch (error) {
    busy = false;
    render();
    showError(error);
  }
}

settings.addEventListener('click', () => openSettings('openSettings'));
settingsTab.addEventListener('click', () => openSettings('openSettingsTab'));

try {
  const version = updates;
  const result = await send({ type: 'getState' });
  if (version === updates) state = result.state;
  render();
} catch (error) {
  render();
  showError(error);
}
