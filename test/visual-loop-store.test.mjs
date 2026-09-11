import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  visualLoopStorePaths,
  recordVisualLoopRound,
  loadVisualLoopHistory,
  historyForStall,
} from '../lib/visual-loop/store.mjs';

test('recordVisualLoopRound persists full round and compact bounded history', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'visual-loop-store-'));
  const round = {
    roundId: '123-1',
    commitSha: 'abc123',
    score: 8.1,
    loopState: 'iterate_visuals',
    qualified: false,
    performanceState: 'inconclusive_external_load',
    regression: { state: 'improved', delta: 0.4 },
    stall: { stalled: false, reasons: [] },
    blockers: [{
      key: 'architecture_close:materials:flat-roof',
      role: 'architecture_close',
      dimension: 'materials',
      severity: 'major',
      code: 'flat-roof',
      observation: 'flat',
      action: 'fix',
    }],
  };
  const manifest = { schema_version: 2, round_id: '123-1' };
  const verdict = { schemaVersion: 1, views: {}, blockers: [], summary: 'stored' };

  const result = await recordVisualLoopRound({ rootDir, projectKey: 'daolife', round, manifest, verdict });
  assert.equal(result.latest.roundId, '123-1');
  assert.equal(result.history.rounds.length, 1);

  const loaded = await loadVisualLoopHistory(rootDir, 'daolife');
  assert.equal(loaded.rounds[0].score, 8.1);
  assert.deepEqual(historyForStall(loaded), [{
    score: 8.1,
    blockers: ['architecture_close:materials:flat-roof'],
  }]);

  const decision = JSON.parse(await readFile(path.join(result.paths.rounds, '123-1', 'decision.json'), 'utf8'));
  assert.equal(decision.loopState, 'iterate_visuals');
});

test('recording the same round replaces history entry instead of duplicating it', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'visual-loop-store-dedupe-'));
  const base = {
    rootDir,
    projectKey: 'daolife',
    manifest: { schema_version: 2, round_id: '123-1' },
    verdict: { schemaVersion: 1 },
  };
  await recordVisualLoopRound({ ...base, round: { roundId: '123-1', score: 7, blockers: [] } });
  await recordVisualLoopRound({ ...base, round: { roundId: '123-1', score: 8, blockers: [] } });
  const history = await loadVisualLoopHistory(rootDir, 'daolife');
  assert.equal(history.rounds.length, 1);
  assert.equal(history.rounds[0].score, 8);
});

test('store path rejects traversal-like project keys', () => {
  assert.throws(() => visualLoopStorePaths('/tmp', '../evil'), /projectKey is invalid/);
});
