#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.resolve(here, '..');
const auditDir = path.join(baseDir, 'state');
const auditFile = path.join(auditDir, 'git-audit.jsonl');

function git(args, cwd = baseDir) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { code: r.status ?? 1, stdout: r.stdout?.trim() ?? '', stderr: r.stderr?.trim() ?? '' };
}

function audit(action, result) {
  fs.mkdirSync(auditDir, { recursive: true });
  fs.appendFileSync(auditFile, JSON.stringify({
    time: new Date().toISOString(),
    action,
    result
  }) + '\n');
}

const [action, ...args] = process.argv.slice(2);

if (action === 'status') {
  const branch = git(['branch', '--show-current']);
  const diff = git(['status', '--short']);
  console.log(JSON.stringify({
    branch: branch.stdout,
    dirty: Boolean(diff.stdout),
    changes: diff.stdout ? diff.stdout.split('\n') : []
  }, null, 2));
  process.exit(0);
}

if (action === 'branch') {
  const name = args[0];
  if (!name || !/^(feat|fix|repair|devcontrol)\/.+/.test(name)) {
    console.error('Only feat/* fix/* repair/* devcontrol/* branches are allowed');
    process.exit(2);
  }
  const r = git(['checkout', '-b', name]);
  audit('branch', r.code === 0 ? 'success' : r.stderr);
  console.log(r.stdout || r.stderr);
  process.exit(r.code);
}

if (action === 'commit') {
  const message = args.join(' ') || 'chore: devcontrol change';
  const r = git(['commit', '-am', message]);
  audit('commit', r.code === 0 ? 'success' : r.stderr);
  console.log(r.stdout || r.stderr);
  process.exit(r.code);
}

if (action === 'push') {
  const branch = git(['branch', '--show-current']).stdout;
  if (!/^(feat|fix|repair|devcontrol)\/.+/.test(branch)) {
    console.error('Protected branch push blocked');
    process.exit(2);
  }
  const r = git(['push', '-u', 'origin', branch]);
  audit('push', r.code === 0 ? 'success' : r.stderr);
  console.log(r.stdout || r.stderr);
  process.exit(r.code);
}

console.error('Usage: devctl git <status|branch|commit|push>');
process.exit(2);
