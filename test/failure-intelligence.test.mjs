import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildFailurePacket,
  classifyFailure
} from '../lib/failure-intelligence.mjs';

test('failure classifier recognizes common build/test failures', () => {
  const categories = classifyFailure(
    'error: could not compile crate\nFAILED tests/test_api.py::test_health'
  );
  assert.equal(categories.includes('build_failure'), true);
  assert.equal(categories.includes('test_failure'), true);
});

test('failure packet captures redacted log excerpt and reproduction command', async () => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 'devcontrol-ai-'));
  const runDir = path.join(stateDir, 'executions', 'demo', 'run1');
  await mkdir(runDir, { recursive: true });
  await writeFile(
    path.join(runDir, '01-python.log'),
    '$ python -m pytest -q\nTOKEN=***REDACTED***\nFAILED test_demo\n',
    'utf8'
  );
  const result = {
    runId: 'run1',
    runDir,
    status: 'FAIL',
    failedCommand: 'python -m pytest -q',
    project: {
      key: 'demo',
      repo: 'star8592/demo',
      sha: 'abc123',
      localPath: '/tmp/demo'
    },
    steps: [
      {
        command: 'python -m pytest -q',
        passed: false,
        exitCode: 1,
        timedOut: false,
        logFile: '01-python.log'
      }
    ]
  };
  const { packet, filePath } = await buildFailurePacket({
    stateDir,
    result,
    playbook: null
  });
  assert.equal(packet.failure.categories.includes('test_failure'), true);
  assert.equal(packet.reproduce.command, 'python -m pytest -q');
  assert.equal(packet.failure.logExcerpt.includes('***REDACTED***'), true);
  assert.equal(JSON.parse(await readFile(filePath, 'utf8')).signature, packet.signature);
});
