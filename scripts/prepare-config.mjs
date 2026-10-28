import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export async function prepareConfig(file = fileURLToPath(new URL('../extension/exceptions.json', import.meta.url))) {
  await mkdir(dirname(file), {recursive: true});
  try {
    await writeFile(file, `${JSON.stringify({domains: [], presets: []}, null, 2)}\n`, {encoding: 'utf8', flag: 'wx'});
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const created = await prepareConfig();
    console.log(created ? 'Создан extension/exceptions.json с пустыми списками.' : 'extension/exceptions.json уже существует и сохранён без изменений.');
  } catch (error) {
    console.error(`Не удалось подготовить конфигурацию: ${error.message}`);
    process.exitCode = 1;
  }
}
