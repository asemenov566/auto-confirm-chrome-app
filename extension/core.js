export function normalizeDomain(value) {
  const label = String(value ?? '').trim().toLowerCase().normalize('NFC').replace(/\.$/, '');
  if (!label || /[\s/:?#@*\\%]/u.test(label)) throw new Error('Введите только домен, например example.com, без https:// и пути.');
  let host;
  try { host = new URL(`https://${label}`).hostname; } catch { throw new Error('Некорректный домен.'); }
  if (host.length > 253 || !host.includes('.') || host.split('.').some(part => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part)) || /^[\d.]+$/.test(host)) {
    throw new Error('Введите корректное доменное имя.');
  }
  return {host, label};
}

export const DEFAULT_STATE = {
  enabled: false,
  domains: [],
  appliedPresets: []
};

export function parseConfig(data) {
  if (!data || !Array.isArray(data.domains) || !Array.isArray(data.presets ?? [])) {
    throw new Error('В exceptions.json ожидаются массивы domains и presets.');
  }
  const parse = values => values.map(value => {
    if (typeof value !== 'string') throw new Error('Домены в exceptions.json должны быть строками.');
    return normalizeDomain(value);
  });
  return {excluded: new Set(parse(data.domains).map(domain => domain.host)), presets: parse(data.presets ?? [])};
}

export function applyPresets(state, config) {
  const result = structuredClone(state ?? DEFAULT_STATE);
  const seen = new Set(result.appliedPresets ?? []);
  result.domains = result.domains.filter(domain => !config.excluded.has(domain.host));
  const hosts = new Set(result.domains.map(domain => domain.host));
  for (const domain of config.presets) {
    if (config.excluded.has(domain.host)) continue;
    if (!seen.has(domain.host) && !hosts.has(domain.host)) {
      result.domains.push(domain);
      hosts.add(domain.host);
    }
    seen.add(domain.host);
  }
  result.appliedPresets = [...seen];
  return result;
}

export function registrations(state) {
  if (!state.enabled || !state.domains.length) return [];
  const matches = state.domains.map(({host}) => `*://${host}/*`);
  return [
    {id: 'confirm-main', matches, js: ['main.js', 'on.js'], world: 'MAIN', runAt: 'document_start', allFrames: true, persistAcrossSessions: true},
    {id: 'confirm-bridge', matches, js: ['bridge.js'], world: 'ISOLATED', runAt: 'document_start', allFrames: true, persistAcrossSessions: true}
  ];
}
