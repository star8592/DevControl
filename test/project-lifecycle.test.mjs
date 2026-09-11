import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  inspectProjectGit,
  recordQualificationOutcome,
  readLifecycleState,
  syncProjectFastForward
} from '../lib/project-lifecycle.mjs';

function run(cwd, command, args) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return String(result.stdout || '').trim();
}

async function makeRepos() {
  const fs = await import('node:fs/promises');
  const root = await mkdtemp(path.join(os.tmpdir(), 'devcontrol-lifecycle-'));
  const remote = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  const local = path.join(root, 'local');
  run(root, 'git', ['init', '--bare', remote]);
  run(root, 'git', ['init', '-b', 'main', seed]);
  run(seed, 'git', ['config', 'user.email', 'test@example.com']);
  run(seed, 'git', ['config', 'user.name', 'Test']);
  await fs.writeFile(path.join(seed, 'README.md'), 'one\n', 'utf8');
  run(seed, 'git', ['add', '.']);
  run(seed, 'git', ['commit', '-m', 'one']);
  run(seed, 'git', ['remote', 'add', 'origin', remote]);
  run(seed, 'git', ['push', '-u', 'origin', 'main']);
  run(root, 'git', ['clone', '--branch', 'main', remote, local]);
  run(local, 'git', ['config', 'user.email', 'test@example.com']);
  run(local, 'git', ['config', 'user.name', 'Test']);
  return { root, remote, seed, local };
}

test('safe sync fast-forwards and failed qualification rolls back only that synced SHA', async () => {
  const fs = await import('node:fs/promises');
  const repos = await makeRepos();
  const stateDir = path.join(repos.root, 'state');
  const previousSha = run(repos.local, 'git', ['rev-parse', 'HEAD']);

  await fs.writeFile(path.join(repos.seed, 'README.md'), 'two\n', 'utf8');
  run(repos.seed, 'git', ['add', '.']);
  run(repos.seed, 'git', ['commit', '-m', 'two']);
  run(repos.seed, 'git', ['push']);
  const targetSha = run(repos.seed, 'git', ['rev-parse', 'HEAD']);

  const project = {
    key: 'demo',
    localPath: repos.local,
    repo: 'star8592/demo'
  };
  const synced = await syncProjectFastForward({ project, stateDir });
  assert.equal(synced.status, 'SYNCED_PENDING_QUALIFICATION');
  assert.equal(inspectProjectGit(project).sha, targetSha);

  const action = await recordQualificationOutcome({
    project: { ...project, sha: targetSha },
    stateDir,
    result: {
      status: 'FAIL',
      runId: 'run-1',
      project: { key: 'demo', sha: targetSha },
      finishedAt: new Date().toISOString(),
      failedCommand: 'npm test'
    }
  });
  assert.equal(action.action, 'ROLLED_BACK_AND_QUARANTINED');
  assert.equal(inspectProjectGit(project).sha, previousSha);

  const state = await readLifecycleState(stateDir);
  assert.equal(state.projects.demo.quarantine.sha, targetSha);

  const retry = await syncProjectFastForward({ project, stateDir });
  assert.equal(retry.status, 'QUARANTINED');
  assert.equal(inspectProjectGit(project).sha, previousSha);
});

test('passing qualification records known-good SHA', async () => {
  const repos = await makeRepos();
  const stateDir = path.join(repos.root, 'state');
  const sha = run(repos.local, 'git', ['rev-parse', 'HEAD']);
  const project = { key: 'demo', localPath: repos.local, repo: 'star8592/demo' };

  const action = await recordQualificationOutcome({
    project,
    stateDir,
    result: {
      status: 'PASS',
      runId: 'run-pass',
      project: { key: 'demo', sha },
      finishedAt: new Date().toISOString(),
      failedCommand: null
    }
  });
  assert.equal(action.action, 'KNOWN_GOOD');
  const state = await readLifecycleState(stateDir);
  assert.equal(state.projects.demo.knownGoodSha, sha);
});
