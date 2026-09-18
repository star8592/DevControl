import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function cloneRepository(url, destination) {
  const { stdout } = await exec('git', ['clone', '--depth', '1', url, destination]);
  return { url, destination, output: stdout.trim() };
}
