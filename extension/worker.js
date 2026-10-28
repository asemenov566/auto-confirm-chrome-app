import {normalizeDomain, registrations, parseConfig, applyPresets} from './core.js';

async function getConfig() {
  let response;
  try {
    response = await fetch(chrome.runtime.getURL('exceptions.json'), {cache: 'no-store'});
  } catch {
    return parseConfig({domains: [], presets: []});
  }
  if (response.status === 404) return parseConfig({domains: [], presets: []});
  if (!response.ok) throw new Error('Не удалось прочитать exceptions.json.');
  return parseConfig(await response.json());
}

async function getState() {
  const config = await getConfig();
  const {state} = await chrome.storage.local.get('state');
  const next = applyPresets(state, config);
  if (JSON.stringify(next) !== JSON.stringify(state)) {
    await chrome.storage.local.set({state: next});
    await reconcile(next);
    await refreshTabs();
  }
  return {state: next, config};
}

async function reconcile(state) {
  const desired = registrations(state);
  const existing = await chrome.scripting.getRegisteredContentScripts();
  const ids = new Set(existing.map(item => item.id));
  const remove = existing.filter(item => !desired.some(want => want.id === item.id)).map(item => item.id);
  if (remove.length) await chrome.scripting.unregisterContentScripts({ids: remove});
  const update = desired.filter(item => ids.has(item.id));
  const add = desired.filter(item => !ids.has(item.id));
  if (update.length) await chrome.scripting.updateContentScripts(update);
  if (add.length) await chrome.scripting.registerContentScripts(add);
}

async function refreshTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.filter(tab => tab.id && /^https?:/.test(tab.url || '')).map(async tab => {
    const target = {tabId: tab.id, allFrames: true};
    await chrome.scripting.executeScript({target, world: 'MAIN', files: ['main.js']});
    await chrome.scripting.executeScript({target, world: 'ISOLATED', files: ['bridge.js']});
  }));
}

async function openSettings() {
  const url = chrome.runtime.getURL('settings.html');
  const tabs = await chrome.tabs.query({url});
  for (const tab of tabs) {
    const window = await chrome.windows.get(tab.windowId).catch(() => null);
    if (window?.type === 'popup') {
      await chrome.windows.update(tab.windowId, {focused: true});
      await chrome.tabs.update(tab.id, {active: true});
      return;
    }
  }
  await chrome.windows.create({url, type: 'popup', width: 620, height: 620});
}

let queue = Promise.resolve();
function enqueue(task) {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}

async function handle(message) {
  const {state, config} = await getState();
  if (message.type === 'getState') return {ok: true, state};
  if (message.type === 'openSettings') { await openSettings(); return {ok: true, state}; }
  if (message.type === 'openSettingsTab') {
    const tabs = await chrome.tabs.query({windowType: 'normal', active: true});
    await chrome.tabs.create({url: chrome.runtime.getURL('settings.html'), ...(tabs.length ? {windowId: tabs[0].windowId} : {})});
    return {ok: true, state};
  }
  const previous = structuredClone(state);
  if (message.type === 'setEnabled') {
    if (typeof message.enabled !== 'boolean') throw new Error('Некорректное состояние переключателя.');
    state.enabled = message.enabled;
  } else if (message.type === 'addDomain') {
    const domain = normalizeDomain(message.domain);
    if (config.excluded.has(domain.host)) return {ok: true, state, ignored: true};
    if (state.domains.some(item => item.host === domain.host)) throw new Error('Этот домен уже добавлен.');
    state.domains.push(domain);
  } else if (message.type === 'removeDomain') {
    state.domains = state.domains.filter(item => item.host !== message.host);
  } else throw new Error('Неизвестная команда.');
  try {
    await chrome.storage.local.set({state});
    await reconcile(state);
    await refreshTabs();
  } catch (error) {
    await chrome.storage.local.set({state: previous});
    await reconcile(previous);
    throw error;
  }
  return {ok: true, state};
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
  enqueue(() => handle(message)).then(respond, error => respond({ok: false, error: error.message}));
  return true;
});

const initialize = () => enqueue(async () => {
  const {state} = await getState();
  await reconcile(state);
}).catch(console.error);
chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);
initialize();
