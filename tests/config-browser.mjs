import {createRequire} from 'node:module';
import {mkdtemp, cp, writeFile, readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const temp = await mkdtemp(path.resolve('tests/config-fixture-'));
const extension = path.join(temp,'extension');
await cp(path.resolve('extension'),extension,{recursive:true,filter:source=>path.basename(source)!=='exceptions.json'});
const configFile = path.join(extension,'exceptions.json');
const context = await chromium.launchPersistentContext(path.join(temp,'profile'), {
  channel:process.env.BROWSER_CHANNEL || 'chromium',headless:true,
  args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]
});
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/settings.html`);
  await page.waitForFunction(()=>!document.querySelector('#domain').disabled);
  const send = msg => page.evaluate(msg=>chrome.runtime.sendMessage(msg),msg);
  assert.deepEqual((await send({type:'getState'})).state.domains,[]);
  await writeFile(configFile,JSON.stringify({domains:['blocked.example'],presets:['seed.example','blocked.example']}));
  let result = await send({type:'getState'});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.deepEqual(result.state.domains.map(d=>d.host),['seed.example']);
  assert.equal((await send({type:'addDomain',domain:'blocked.example'})).ignored,true);
  await send({type:'removeDomain',host:'seed.example'});
  await send({type:'addDomain',domain:'custom.example'});
  await send({type:'setEnabled',enabled:true});
  await writeFile(configFile,JSON.stringify({domains:['blocked.example','custom.example'],presets:['seed.example','new.example','blocked.example']}));
  result = await send({type:'getState'});
  assert.deepEqual(result.state.domains.map(d=>d.host),['new.example']);
  assert.equal(result.state.enabled,true);
  const registered = await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts());
  assert.ok(registered.every(script=>script.matches.length===1 && script.matches[0]==='*://new.example/*'));
  await writeFile(configFile,'{broken');
  assert.equal((await send({type:'addDomain',domain:'blocked.example'})).ok,false);
  console.log('PASS: missing JSON, live file creation/change, presets merge, manual deletion retained, exclusions override presets and saved domains, malformed JSON rejects additions.');
} finally {await context.close();}
