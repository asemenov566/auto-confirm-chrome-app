const form = document.querySelector('#add-form');
const input = document.querySelector('#domain');
const add = document.querySelector('#add');
const rows = document.querySelector('#domains');
const empty = document.querySelector('#empty');
const status = document.querySelector('#status');
let state = null;
let busy = false;
let updates = 0;

function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle('error', error);
}

function render() {
  input.disabled = add.disabled = busy || !state;
  rows.replaceChildren();
  for (const domain of state?.domains || []) {
    const row = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = domain.label;
    name.title = domain.host;
    const action = document.createElement('td');
    action.className = 'row-action';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = 'Удалить';
    remove.setAttribute('aria-label', `Удалить ${domain.label}`);
    remove.disabled = busy;
    remove.addEventListener('click', () => mutate({ type: 'removeDomain', host: domain.host }, 'Домен удалён.'));
    action.append(remove);
    row.append(name, action);
    rows.append(row);
  }
  empty.hidden = !state || state.domains.length !== 0;
}

async function send(payload) {
  const result = await chrome.runtime.sendMessage(payload);
  if (!result?.ok) throw new Error(result?.error || 'Расширение не отвечает');
  return result;
}

async function mutate(payload, success) {
  if (busy) return;
  busy = true;
  input.removeAttribute('aria-invalid');
  message('Сохранение…');
  render();
  try {
    const result = await send(payload);
    state = result.state;
    if (payload.type === 'addDomain') input.value = '';
    message(result.ignored ? '' : success);
  } catch (error) {
    message(error.message || 'Не удалось сохранить настройки.', true);
    if (payload.type === 'addDomain') input.setAttribute('aria-invalid', 'true');
  } finally {
    busy = false;
    render();
    input.focus();
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  void mutate({ type: 'addDomain', domain: input.value }, 'Домен добавлен.');
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.state?.newValue) {
    updates++;
    state = changes.state.newValue;
    render();
  }
});

try {
  const version = updates;
  const result = await send({ type: 'getState' });
  if (version === updates) state = result.state;
  render();
  message('Изменения сохраняются автоматически.');
} catch (error) {
  message(error.message || 'Не удалось загрузить настройки.', true);
}
