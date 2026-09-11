import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateJudgeVerdict,
  normalizeBlockerKey,
  buildJudgeInstruction,
} from '../lib/visual-loop/judge.mjs';

test('validateJudgeVerdict computes deterministic score and blocker keys', () => {
  const result = validateJudgeVerdict({
    schemaVersion: 1,
    views: {
      gameplay_hero: {
        scores: { composition: 8, scale: 7, lighting: 9 },
        summary: 'Readable composition with scale mismatch around the gate.',
      },
      character_close: {
        scores: { character: 6, materials: 7, detail: 6 },
        summary: 'Character silhouette is readable but remains too generic.',
      },
    },
    blockers: [
      {
        role: 'character_close',
        dimension: 'character',
        severity: 'blocking',
        code: 'generic-silhouette',
        observation: 'The player and NPC share nearly identical robe/body construction.',
        action: 'Give each hero character a distinct authored silhouette and signature prop.',
      },
    ],
    summary: 'Promising composition but character art is below the frozen production target.',
  }, { requiredRoles: ['gameplay_hero', 'character_close'] });

  assert.equal(Number.isFinite(result.totalScore), true);
  assert.equal(result.blockingCount, 1);
  assert.equal(result.visuallyPassable, false);
  assert.equal(result.blockers[0].key, 'character_close:character:generic-silhouette');
});

test('validateJudgeVerdict rejects missing required views and invalid scores', () => {
  assert.throws(() => validateJudgeVerdict({
    schemaVersion: 1,
    views: {
      gameplay_hero: { scores: { composition: 11 }, summary: 'bad score' },
    },
    blockers: [],
    summary: 'invalid',
  }, { requiredRoles: ['gameplay_hero', 'character_close'] }), /required view is missing/);
});

test('normalizeBlockerKey is stable', () => {
  assert.equal(normalizeBlockerKey({
    role: 'Architecture Close',
    dimension: 'Materials',
    code: 'Flat / Plastic Roof',
  }), 'architecture-close:materials:flat-plastic-roof');
});

test('buildJudgeInstruction requires JSON-only actionable independent judging', () => {
  const prompt = buildJudgeInstruction({ passScore: 8.5, requiredRoles: ['gameplay_hero'] });
  assert.match(prompt, /independent VisualLoop production-art judge/);
  assert.match(prompt, /Return JSON only/);
  assert.match(prompt, /blocking\|major\|minor/);
  assert.match(prompt, /DevControl computes it deterministically/);
});
