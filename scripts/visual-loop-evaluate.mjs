#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateVisualContract, assertRoundMatchesContract, contractFingerprint } from '../lib/visual-loop/contract.mjs';
import { evaluateVisualLoopRound } from '../lib/visual-loop/round.mjs';
import { loadVisualLoopHistory, historyForStall, recordVisualLoopRound } from '../lib/visual-loop/store.mjs';

async function json(filePath) {
  return JSON.parse(await readFile(path.resolve(filePath), 'utf8'));
}

function usage() {
  console.error('Usage: node scripts/visual-loop-evaluate.mjs PROJECT_KEY CONTRACT.json MANIFEST.json VERDICT.json [STORE_ROOT]');
}

async function main() {
  const [, , projectKey, contractPath, manifestPath, verdictPath, rootArg] = process.argv;
  if (!projectKey || !contractPath || !manifestPath || !verdictPath) {
    usage();
    process.exitCode = 2;
    return;
  }

  const rootDir = path.resolve(rootArg || path.dirname(fileURLToPath(import.meta.url)), '..');
  const [rawContract, manifest, verdict] = await Promise.all([
    json(contractPath),
    json(manifestPath),
    json(verdictPath),
  ]);
  const contract = validateVisualContract(rawContract);
  assertRoundMatchesContract(manifest, contract);

  const persisted = await loadVisualLoopHistory(rootDir, projectKey);
  const prior = persisted.rounds[persisted.rounds.length - 1] || null;
  const previousVerdict = prior?.roundId
    ? await json(path.join(rootDir, '.devcontrol', 'visual-loop', projectKey, 'rounds', prior.roundId, 'verdict.json')).catch(() => null)
    : null;

  const round = evaluateVisualLoopRound({
    manifest,
    verdict,
    previousVerdict,
    history: historyForStall(persisted),
    config: {
      passScore: 8.5,
      regressionEpsilon: 0.15,
      stall: {
        recentRounds: 2,
        minBestScoreImprovement: 1.0,
        repeatedBlockerRounds: 2,
      },
    },
  });

  const recorded = await recordVisualLoopRound({
    rootDir,
    projectKey,
    round,
    manifest,
    verdict,
  });

  console.log(JSON.stringify({
    project: projectKey,
    contractId: contract.contractId,
    contractFingerprint: contractFingerprint(rawContract),
    roundId: round.roundId,
    commitSha: round.commitSha,
    score: round.score,
    regression: round.regression,
    stall: round.stall,
    performanceState: round.performanceState,
    loopState: round.loopState,
    qualified: round.qualified,
    blockingCount: round.blockingCount,
    latestPath: recorded.paths.latest,
  }, null, 2));

  if (['runtime_blocked', 'evidence_blocked', 'review_required'].includes(round.loopState)) process.exitCode = 3;
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
