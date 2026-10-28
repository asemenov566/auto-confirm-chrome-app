import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {DEFAULT_STATE, normalizeDomain, registrations, parseConfig, applyPresets} from '../extension/core.js';
const config = parseConfig(JSON.parse(readFileSync(new URL('./fixtures/domains.json', import.meta.url),'utf8')));

test('Предустановки из тестовой конфигурации, выключено по умолчанию, кириллица нормализована', () => {
  assert.equal(DEFAULT_STATE.enabled, false);
  assert.equal(DEFAULT_STATE.domains.length, 0);
  assert.equal(applyPresets(null, config).domains.length, 2);
  assert.equal(normalizeDomain(' ПРИМЕР.EXAMPLE ').host, 'xn--e1afmkfd.example');
  assert.equal(normalizeDomain('тест.example').host, new URL('https://тест.example').hostname);
  assert.deepEqual(normalizeDomain('Example.com.'), {host:'example.com',label:'example.com'});
});
test('Неправильные домены отклоняются', () => {
  for (const value of ['', '*.example', 'https://example.com', 'foo.example/path', 'foo..example', '-foo.example', 'foo_.example', '127.0.0.1', 'foo.example:443', 'foo.example@evil.example', 'foo%2eru']) assert.throws(() => normalizeDomain(value), value);
});
test('Регистрации точные, ранние, сохранённые; OFF и пустой список отключают', () => {
  assert.deepEqual(registrations(DEFAULT_STATE), []);
  assert.deepEqual(registrations({enabled:true,domains:[]}), []);
  const scripts = registrations({...applyPresets(null, config),enabled:true});
  assert.equal(scripts.length, 2);
  for (const script of scripts) {
    assert.equal(script.runAt, 'document_start');
    assert.equal(script.persistAcrossSessions, true);
    assert.ok(script.matches.every(match => !match.includes('*.')));
  }
});

test('Новые предустановки добавляются без дублей и потери пользовательских данных', () => {
  const custom = normalizeDomain('custom.example');
  const existing = {enabled:true,domains:[custom],appliedPresets:[]};
  const first = applyPresets(existing, parseConfig({domains:[],presets:['seed.example','SEED.EXAMPLE.']}));
  assert.equal(first.enabled,true);
  assert.deepEqual(first.domains.map(d=>d.host),['custom.example','seed.example']);
  first.domains = [custom];
  const next = applyPresets(first, parseConfig({domains:[],presets:['seed.example','new.example']}));
  assert.deepEqual(next.domains.map(d=>d.host),['custom.example','new.example']);
  assert.deepEqual(applyPresets(next,parseConfig({domains:[],presets:['seed.example','new.example']})),next);
});

test('Исключения выше предустановок и сохранённого списка', () => {
  const blocked = normalizeDomain('blocked.example');
  const next = applyPresets({enabled:true,domains:[blocked]},parseConfig({domains:[' BLOCKED.EXAMPLE. '],presets:['blocked.example','good.example']}));
  assert.deepEqual(next.domains.map(d=>d.host),['good.example']);
  assert.ok(!next.appliedPresets.includes('blocked.example'));
});

test('Пустой конфиг и старый формат исключений поддерживаются, ошибочный отклоняется', () => {
  assert.deepEqual(applyPresets(null,parseConfig({domains:[]})),DEFAULT_STATE);
  for (const data of [null,{}, {domains:'wrong'}, {domains:[],presets:[42]}, {domains:['https://bad.example']}]) assert.throws(()=>parseConfig(data));
});
test('ON возвращает true синхронно, OFF восстанавливает native и сохранённые ссылки', () => {
  let calls = 0;
  const original = () => {calls++;return false;};
  const listeners = {};
  const context = vm.createContext({window:{confirm:original,addEventListener:(name,fn) => listeners[name]=fn}});
  const main = readFileSync(new URL('../extension/main.js', import.meta.url),'utf8');
  const on = readFileSync(new URL('../extension/on.js', import.meta.url),'utf8');
  vm.runInContext(main,context);
  assert.equal(context.window.confirm,original);
  vm.runInContext(on,context);
  const cached = context.window.confirm;
  assert.equal(cached('Удалить?'),true);
  assert.equal(calls,0);
  vm.runInContext(main,context);
  listeners['auto-confirm-app:state:v1']({detail:false});
  assert.equal(context.window.confirm,original);
  assert.equal(cached(),false);
  assert.equal(calls,1);
  vm.runInContext(on,context);
  assert.equal(context.window.confirm(),true);
});
