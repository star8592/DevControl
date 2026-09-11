#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadLocalControlState } from '../lib/local-state.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.resolve(here, '..');
const state = await loadLocalControlState(baseDir);
const target = path.resolve(baseDir, 'public', 'autonomy-data.json');

await writeFile(target, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  target,
  projects: state.counts.total,
  failurePackets: state.failureQueue.count,
  repairPlans: state.repairPlans.count,
  repairAttempts: state.repairAttempts.count,
  repairCandidates: state.repairCandidates.count,
  repairReviews: state.repairReviews.count,
  reviewable: state.repairReviews.items.filter(item => item.state === 'REVIEWABLE').length
}, null, 2));
