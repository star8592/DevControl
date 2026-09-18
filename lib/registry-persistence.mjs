import { readFile, writeFile } from 'node:fs/promises';

export async function loadRegistry(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return { projects: [] };
  }
}

export async function saveRegistry(path, registry) {
  await writeFile(path, JSON.stringify(registry, null, 2));
}
