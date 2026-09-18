#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { detectProject } from '../lib/universal-detector.mjs';

const target = process.argv[2];

if (!target) {
  console.error('Usage: devctl adopt <project-path>');
  process.exit(2);
}

const profile = detectProject(path.resolve(target));

const out = path.resolve('state/adopted-projects.json');
fs.mkdirSync(path.dirname(out), { recursive: true });

let items = [];
if (fs.existsSync(out)) {
  items = JSON.parse(fs.readFileSync(out, 'utf8'));
}

items.push(profile);
fs.writeFileSync(out, JSON.stringify(items, null, 2));

console.log(JSON.stringify(profile, null, 2));
