import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assessAutoFixEligibility,
  riskyRepairPaths
} from '../lib/repair-executor.mjs';

function fixture() {
  return {
    project: {
      key: 'demo',
      localPath: '/tmp/demo',
      repo: 'star8592/demo',
      riskFlags: [],
      autonomy: {
        level: 'MANAGED',
        autoQualify: true,
        safeCommands: ['npm test', 'npm run check']
      }
    },
    packet: {
      signature: 'abc123',
      failure: { failedCommand: 'npm test' }
    },
    plan: {
      signature: 'abc123',
      mode: 'PLAN_ONLY'
    }
  };
}

test('managed clean policy fixture is eligible for isolated auto-fix', () => {
  const result = assessAutoFixEligibility(fixture());
  assert.equal(result.eligible, true);
  assert.deepEqual(result.reasons, []);
});

test('failed command outside safe qualification allowlist blocks auto-fix', () => {
  const value = fixture();
  value.packet.failure.failedCommand = 'npm run deploy';
  const result = assessAutoFixEligibility(value);
  assert.equal(result.eligible, false);
  assert.match(result.reasons.join(' '), /allowlist/);
});

test('phase-one path guard blocks deployment secrets CI and dependency manifests', () => {
  const blocked = riskyRepairPaths([
    'src/app.js',
    'test/app.test.js',
    '.github/workflows/release.yml',
    '.env',
    'package.json',
    'deploy/prod.sh'
  ]);
  assert.deepEqual(blocked, [
    '.github/workflows/release.yml',
    '.env',
    'package.json',
    'deploy/prod.sh'
  ]);
});
