#!/usr/bin/env node

import { adoptRepository } from '../lib/github-adopt-controller.mjs';

const url = process.argv[2];

if (!url) {
  console.error('Usage: node scripts/adopt-project.mjs <github-url>');
  process.exit(2);
}

const result = await adoptRepository(url);
console.log(JSON.stringify(result, null, 2));
