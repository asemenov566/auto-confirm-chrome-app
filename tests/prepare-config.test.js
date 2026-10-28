import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, unlink, rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareConfig} from '../scripts/prepare-config.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'auto-confirm-config-'));
  const directory = join(root, 'extension');
  const file = join(directory, 'exceptions.json');
  t.after(async () => {
    await unlink(file).catch(error => {if (error.code !== 'ENOENT') throw error;});
    await rmdir(directory).catch(error => {if (error.code !== 'ENOENT') throw error;});
    await rmdir(root);
  });
  return {file, directory};
}

test('Подготовка создаёт отсутствующий JSON с пустыми списками', async t => {
  const {file} = await fixture(t);
  assert.equal(await prepareConfig(file), true);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), {domains: [], presets: []});
});

test('Существующий файл сохраняется байт в байт', async t => {
  const {file, directory} = await fixture(t);
  await mkdir(directory);
  const original = Buffer.from('{"domains":["blocked.example"],"presets":["пример.example"]}\r\n');
  await writeFile(file, original);
  assert.equal(await prepareConfig(file), false);
  assert.deepEqual(await readFile(file), original);
});

test('Повторная и одновременная подготовка не перезаписывают файл', async t => {
  const {file} = await fixture(t);
  const results = await Promise.all([prepareConfig(file), prepareConfig(file)]);
  assert.deepEqual(results.sort(), [false, true]);
  const original = await readFile(file);
  assert.equal(await prepareConfig(file), false);
  assert.deepEqual(await readFile(file), original);
});
