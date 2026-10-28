import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, copyFile, writeFile, readFile, rm, unlink, symlink, rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const script = fileURLToPath(new URL('../scripts/package.ps1', import.meta.url));
const runtimeFiles = [
  'bridge.js', 'core.js', 'main.js', 'on.js', 'popup.html', 'popup.js',
  'settings.html', 'settings.js', 'ui.css', 'worker.js', 'exceptions.example.json',
  'icons/logo.svg', 'icons/icon16.png', 'icons/icon32.png', 'icons/icon48.png', 'icons/icon128.png'
];

test('ZIP содержит только разрешённые файлы, проверяется и безопасно заменяется', {skip: process.platform !== 'win32'}, async t => {
  const tempRoot = resolve(tmpdir());
  const root = await mkdtemp(join(tempRoot, 'auto-confirm-package-'));
  t.after(async () => {
    const inside = relative(tempRoot, resolve(root));
    assert.ok(inside && !inside.startsWith(`..${sep}`) && inside !== '..' && !inside.includes(sep));
    await rm(root, {recursive: true, force: true});
  });
  const fixture = join(root, 'project');
  const put = async (name, value = `fixture: ${name}`) => {
    const file = join(fixture, name);
    await mkdir(dirname(file), {recursive: true});
    await writeFile(file, value);
  };
  await mkdir(join(fixture, 'scripts'), {recursive: true});
  await copyFile(script, join(fixture, 'scripts/package.ps1'));
  for (const name of runtimeFiles) await put(`extension/${name}`);
  await put('extension/manifest.json', JSON.stringify({version: '1.2.3'}));
  await put('README.md', '# Test fixture');
  await put('extension/exceptions.json', 'PRIVATE_FIXTURE_MUST_NOT_BE_PACKAGED');
  await put('tests/screenshot.png', 'PRIVATE_FIXTURE_MUST_NOT_BE_PACKAGED');
  await put('.git/config', 'PRIVATE_FIXTURE_MUST_NOT_BE_PACKAGED');
  await put('node_modules/private.txt', 'PRIVATE_FIXTURE_MUST_NOT_BE_PACKAGED');
  const run = () => spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(fixture, 'scripts/package.ps1')], {encoding: 'utf8'});
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  const archive = join(fixture, 'dist/auto-confirm-chrome-app-v1.2.3.zip');
  const quote = value => `'${value.replaceAll("'", "''")}'`;
  const inspect = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip = [System.IO.Compression.ZipFile]::OpenRead(${quote(archive)}); try { ConvertTo-Json -Compress -InputObject @($zip.Entries.FullName) } finally { $zip.Dispose() }`], {encoding: 'utf8'});
  assert.equal(inspect.status, 0, inspect.stderr);
  assert.deepEqual(JSON.parse(inspect.stdout).sort(), [...runtimeFiles.map(name => `extension/${name}`), 'extension/manifest.json'].sort());
  await put('extension/core.js', '// Changed fixture');
  const replacement = run();
  assert.equal(replacement.status, 0, replacement.stderr);
  const goodArchive = await readFile(archive);
  await unlink(join(fixture, 'extension/main.js'));
  const missing = run();
  assert.notEqual(missing.status, 0);
  assert.deepEqual(await readFile(archive), goodArchive);
  await put('extension/main.js');
  const other = join(root, 'external-icons');
  await mkdir(other);
  await rename(join(fixture, 'extension/icons'), join(fixture, 'original-icons'));
  await symlink(other, join(fixture, 'extension/icons'), 'junction');
  const linked = run();
  assert.notEqual(linked.status, 0);
  assert.deepEqual(await readFile(archive), goodArchive);
});
