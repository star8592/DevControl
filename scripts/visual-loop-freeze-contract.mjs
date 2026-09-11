#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { freezeVisualContract } from '../lib/visual-loop/freeze.mjs';

async function json(filePath) {
  return JSON.parse(await readFile(path.resolve(filePath), 'utf8'));
}

function usage() {
  console.error('Usage: node scripts/visual-loop-freeze-contract.mjs DRAFT.json TARGET_SET.json [OUTPUT.json] [TARGET_ROOT]');
}

async function main() {
  const [, , draftArg, targetSetArg, outputArg, targetRootArg] = process.argv;
  if (!draftArg || !targetSetArg) {
    usage();
    process.exitCode = 2;
    return;
  }

  const draftPath = path.resolve(draftArg);
  const targetSetPath = path.resolve(targetSetArg);
  const outputPath = path.resolve(outputArg || path.join(path.dirname(draftPath), 'contract.frozen.json'));
  const targetRoot = path.resolve(targetRootArg || path.dirname(draftPath));
  if (outputPath === draftPath) {
    throw new Error('VisualLoop freeze error: refusing to overwrite the draft contract in place');
  }

  const [draft, targetSet] = await Promise.all([json(draftPath), json(targetSetPath)]);
  const result = await freezeVisualContract({ draft, targetSet, targetRoot });
  const output = {
    ...result.contract,
    approval: {
      approvedBy: result.approvedBy,
      fingerprint: result.fingerprint,
    },
  };
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    contractId: result.contract.contractId,
    state: result.contract.state,
    frozenAt: result.contract.frozenAt,
    approvedBy: result.approvedBy,
    fingerprint: result.fingerprint,
    roles: result.contract.requiredRoles,
    output: outputPath,
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
