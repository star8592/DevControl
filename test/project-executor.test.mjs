import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { parseSafeCommand, redactLog } from '../lib/project-executor.mjs';
import {
  chooseQualificationCommands,
  learnFromQualification
} from '../lib/project-learner.mjs';

test('safe command parser rejects shell metacharacters', () => {
  assert.throws(() => parseSafeCommand('pytest; rm -rf /'), /metacharacters/);
  assert.throws(() => parseSafeCommand('npm test && echo ok'), /metacharacters/);
});

test('safe command parser preserves simple argv', () => {
  assert.deepEqual(parseSafeCommand('python -m pytest -q'), {
    executable: 'python',
    args: ['-m', 'pytest', '-q'],
    display: 'python -m pytest -q'
  });
});

test('redactLog hides environment secrets and assignments', () => {
  const output = redactLog(
    'TOKEN=abc123 hello abc123 harmless=x',
    { MY_TOKEN: 'abc123' }
  );
  assert.equal(output.includes('abc123'), false);
  assert.equal(output.includes('harmless=x'), true);
});

test('learner reorders safe commands by observed reliability', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'devcontrol-learn-'));
  const project = {
    key: 'demo',
    localPath: root,
    autonomy: {
      safeCommands: ['slow-check', 'fast-check']
    }
  };

  await learnFromQualification({
    stateDir: root,
    project,
    result: {
      runId: 'run-1',
      status: 'FAIL',
      finishedAt: new Date().toISOString(),
      steps: [
        {
          command: 'slow-check',
          passed: false,
          timedOut: false,
          durationMs: 900,
          exitCode: 1
        }
      ]
    }
  });

  await learnFromQualification({
    stateDir: root,
    project,
    result: {
      runId: 'run-2',
      status: 'PASS',
      finishedAt: new Date().toISOString(),
      steps: [
        {
          command: 'fast-check',
          passed: true,
          timedOut: false,
          durationMs: 100,
          exitCode: 0
        },
        {
          command: 'slow-check',
          passed: true,
          timedOut: false,
          durationMs: 800,
          exitCode: 0
        }
      ]
    }
  });

  const raw = JSON.parse(await readFile(path.join(root, 'playbooks.json'), 'utf8'));
  const playbook = raw.projects.demo;
  assert.equal(playbook.observations, 2);
  assert.equal(playbook.commands['fast-check'].passRate, 1);
  assert.equal(
    chooseQualificationCommands(project, playbook)[0],
    'fast-check'
  );
});
