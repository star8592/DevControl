import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

import {
  discoverProjects,
  parseGithubRemote
} from '../lib/project-discovery.mjs';

test('parseGithubRemote handles SSH and HTTPS', () => {
  assert.equal(parseGithubRemote('git@github.com:star8592/DaoLife.git'), 'star8592/DaoLife');
  assert.equal(
    parseGithubRemote('https://github.com/star8592/DevControl.git'),
    'star8592/DevControl'
  );
  assert.equal(parseGithubRemote('https://gitlab.com/a/b.git'), null);
});

test('discoverProjects detects a new Python git repository and safe checks', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'devcontrol-discovery-'));
  const repo = path.join(temp, 'ExampleProject');
  await mkdir(path.join(repo, 'tests'), { recursive: true });
  await writeFile(
    path.join(repo, 'pyproject.toml'),
    '[project]\nname="example"\n[tool.pytest.ini_options]\naddopts="-q"\n'
  );
  execFileSync('git', ['init', '-q', repo]);
  execFileSync(
    'git',
    ['-C', repo, 'remote', 'add', 'origin', 'git@github.com:star8592/Example.git']
  );

  const report = await discoverProjects({
    roots: [temp],
    maxDepth: 2,
    configuredProjects: []
  });

  assert.equal(report.counts.total, 1);
  assert.equal(report.counts.new, 1);
  assert.deepEqual(report.projects[0].stacks, ['python']);
  assert.equal(report.projects[0].repo, 'star8592/Example');
  assert.ok(
    report.projects[0].proposedQualify.some(item => item.command === 'python -m pytest -q')
  );
});

test('discoverProjects detects a nested Godot root without treating it as another git project', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'devcontrol-godot-discovery-'));
  const repo = path.join(temp, 'HybridGame');
  await mkdir(path.join(repo, 'game'), { recursive: true });
  await writeFile(path.join(repo, 'Cargo.toml'), '[package]\nname="hybrid"\nversion="0.1.0"\n');
  await writeFile(path.join(repo, 'game', 'project.godot'), '[application]\nconfig/name="Hybrid"\n');
  execFileSync('git', ['init', '-q', repo]);
  execFileSync(
    'git',
    ['-C', repo, 'remote', 'add', 'origin', 'git@github.com:star8592/HybridGame.git']
  );

  const report = await discoverProjects({
    roots: [temp],
    maxDepth: 2,
    configuredProjects: []
  });

  assert.equal(report.counts.total, 1);
  assert.equal(report.projects[0].stacks.includes('godot'), true);
  assert.equal(report.projects[0].stacks.includes('rust'), true);
  assert.deepEqual(report.projects[0].godotProjectPaths, ['game']);
  assert.ok(
    report.projects[0].proposedQualify.some(item => item.command.includes('--path game'))
  );
});
