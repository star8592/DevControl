import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadLocalControlState } from '../lib/local-state.mjs';

test('local control state joins discovery qualification playbook lifecycle and AI queue', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'devcontrol-state-'));
  const state = path.join(root, 'state');
  await mkdir(path.join(state, 'latest'), { recursive: true });
  await mkdir(path.join(state, 'ai-queue'), { recursive: true });

  await writeFile(path.join(state, 'discovery.json'), JSON.stringify({
    generatedAt: '2026-01-01T00:00:00Z',
    projects: [{
      key: 'demo',
      name: 'Demo',
      repo: 'star8592/demo',
      localPath: '/tmp/demo',
      branch: 'main',
      sha: 'abc',
      dirty: false,
      stacks: ['node'],
      confidence: 1,
      registration: { state: 'REGISTERED', configuredKey: 'demo' },
      autonomy: { level: 'MANAGED', autoQualify: true, safeCommands: ['npm test'] }
    }]
  }));
  await writeFile(path.join(state, 'playbooks.json'), JSON.stringify({
    schemaVersion: 1,
    projects: { demo: { key: 'demo', observations: 3, runPassRate: 1 } }
  }));
  await writeFile(path.join(state, 'project-lifecycle.json'), JSON.stringify({
    schemaVersion: 1,
    projects: { demo: { key: 'demo', knownGoodSha: 'abc' } }
  }));
  await writeFile(path.join(state, 'latest', 'demo.json'), JSON.stringify({
    status: 'PASS',
    runId: 'r1',
    project: { key: 'demo', sha: 'abc' }
  }));
  await writeFile(path.join(state, 'ai-queue', 'demo-r0.json'), JSON.stringify({
    project: { key: 'demo', repo: 'star8592/demo', sha: 'old' },
    runId: 'r0',
    signature: 'sig',
    generatedAt: '2026-01-01T00:00:00Z',
    failure: { categories: ['test_failure'], failedCommand: 'npm test' }
  }));

  const result = await loadLocalControlState(root);
  assert.equal(result.counts.total, 1);
  assert.equal(result.projects.demo.latestQualification.status, 'PASS');
  assert.equal(result.projects.demo.lifecycle.knownGoodSha, 'abc');
  assert.equal(result.projects.demo.playbook.observations, 3);
  assert.equal(result.projects.demo.failurePackets, 1);
});
