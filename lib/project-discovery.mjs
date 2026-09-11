import { access, readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DEFAULT_SKIP = new Set([
  '.git',
  '.venv',
  'venv',
  'node_modules',
  'target',
  'dist',
  'build',
  '.next',
  '.cache',
  '.creator-os',
  '__pycache__'
]);

const MARKERS = [
  'Cargo.toml',
  'pyproject.toml',
  'package.json',
  'project.godot',
  'CMakeLists.txt',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts'
];

function exists(filePath) {
  return access(filePath).then(() => true).catch(() => false);
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';
}

function parseGithubRemote(remote) {
  if (!remote) return null;
  const value = remote.trim().replace(/\.git$/, '');
  let match = value.match(/^git@github\.com:([^/]+)\/(.+)$/i);
  if (match) return `${match[1]}/${match[2]}`;
  match = value.match(/^https?:\/\/github\.com\/([^/]+)\/(.+)$/i);
  if (match) return `${match[1]}/${match[2]}`;
  match = value.match(/^ssh:\/\/git@github\.com\/([^/]+)\/(.+)$/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return result.status === 0 ? result.stdout.trim() : '';
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function markerSet(root) {
  const found = new Set();
  await Promise.all(MARKERS.map(async marker => {
    if (await exists(path.join(root, marker))) found.add(marker);
  }));
  return found;
}

function addProposal(proposals, command, reason, confidence, risk = 'safe') {
  proposals.push({ command, reason, confidence, risk });
}

async function inferProject(root) {
  const markers = await markerSet(root);
  const stacks = [];
  const evidence = [];
  const proposals = [];
  const riskFlags = [];

  if (markers.has('Cargo.toml')) {
    stacks.push('rust');
    evidence.push('Cargo.toml');
    addProposal(proposals, 'cargo check --workspace', 'Rust workspace/package detected', 0.96);
    addProposal(proposals, 'cargo test --workspace', 'Rust tests are conventionally safe', 0.90);
  }

  if (markers.has('pyproject.toml')) {
    stacks.push('python');
    evidence.push('pyproject.toml');
    const pyproject = await readFile(path.join(root, 'pyproject.toml'), 'utf8').catch(() => '');
    if (/\[tool\.pytest/i.test(pyproject) || await exists(path.join(root, 'tests'))) {
      addProposal(proposals, 'python -m pytest -q', 'pytest configuration/tests detected', 0.93);
    }
    if (/\[tool\.ruff/i.test(pyproject) || /ruff/i.test(pyproject)) {
      addProposal(proposals, 'python -m ruff check .', 'ruff configuration detected', 0.91);
    }
  }

  if (markers.has('package.json')) {
    stacks.push('node');
    evidence.push('package.json');
    const pkg = await readJson(path.join(root, 'package.json'));
    const scripts = pkg?.scripts || {};
    if (typeof scripts.check === 'string') {
      addProposal(proposals, 'npm run check', 'package.json check script detected', 0.95);
    }
    if (typeof scripts.test === 'string' && !/no test specified/i.test(scripts.test)) {
      addProposal(proposals, 'npm test', 'package.json test script detected', 0.90);
    }
    for (const dangerous of ['deploy', 'publish', 'release']) {
      if (typeof scripts[dangerous] === 'string') {
        riskFlags.push(`package script "${dangerous}" exists; never auto-run from discovery`);
      }
    }
  }

  if (markers.has('project.godot')) {
    stacks.push('godot');
    evidence.push('project.godot');
    addProposal(
      proposals,
      'godot --headless --path . --quit',
      'Godot project detected; parse/start smoke only',
      0.80
    );
  }

  if (markers.has('CMakeLists.txt')) {
    stacks.push('cmake');
    evidence.push('CMakeLists.txt');
  }
  if (markers.has('go.mod')) {
    stacks.push('go');
    evidence.push('go.mod');
    addProposal(proposals, 'go test ./...', 'Go module detected', 0.92);
  }
  if (markers.has('pom.xml') || markers.has('build.gradle') || markers.has('build.gradle.kts')) {
    stacks.push('jvm');
    evidence.push(...['pom.xml', 'build.gradle', 'build.gradle.kts'].filter(x => markers.has(x)));
  }

  if (await exists(path.join(root, 'scripts', 'auto_dev.sh'))) {
    evidence.push('scripts/auto_dev.sh');
    riskFlags.push('project-local auto_dev detected; candidate for migration into DevControl');
  }
  if (await exists(path.join(root, '.github', 'workflows'))) {
    evidence.push('.github/workflows');
  }

  const remote = git(root, ['remote', 'get-url', 'origin']);
  const repo = parseGithubRemote(remote);
  const branch = git(root, ['branch', '--show-current']) || null;
  const sha = git(root, ['rev-parse', 'HEAD']) || null;
  const dirty = Boolean(git(root, ['status', '--porcelain=v1']));
  const name = path.basename(root);
  const confidenceParts = [
    repo ? 0.35 : 0,
    markers.size ? 0.25 : 0,
    proposals.length ? 0.20 : 0,
    evidence.includes('.github/workflows') ? 0.10 : 0,
    evidence.includes('scripts/auto_dev.sh') ? 0.10 : 0
  ];
  const confidence = Math.min(1, confidenceParts.reduce((a, b) => a + b, 0));

  return {
    key: slugify(name),
    name,
    localPath: root,
    repo,
    branch,
    sha,
    dirty,
    stacks: [...new Set(stacks)],
    evidence: [...new Set(evidence)],
    confidence: Number(confidence.toFixed(2)),
    proposedQualify: proposals.sort((a, b) => b.confidence - a.confidence),
    riskFlags
  };
}

async function findGitProjects(root, maxDepth, skip = DEFAULT_SKIP) {
  const found = [];
  const seenReal = new Set();

  async function walk(current, depth) {
    let currentStat;
    try {
      currentStat = await stat(current);
    } catch {
      return;
    }
    if (!currentStat.isDirectory()) return;

    let real = current;
    try {
      real = await import('node:fs/promises').then(fs => fs.realpath(current));
    } catch {}
    if (seenReal.has(real)) return;
    seenReal.add(real);

    if (await exists(path.join(current, '.git'))) {
      found.push(current);
      return;
    }
    if (depth >= maxDepth) return;

    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(entries
      .filter(entry => entry.isDirectory() && !skip.has(entry.name) && !entry.name.startsWith('.'))
      .map(entry => walk(path.join(current, entry.name), depth + 1)));
  }

  await walk(path.resolve(root), 0);
  return found;
}

function matchRegistration(project, configuredProjects = []) {
  const normalized = value => path.resolve(String(value || ''));
  const exactRepo = project.repo
    ? configuredProjects.find(item => item.repo?.toLowerCase() === project.repo.toLowerCase())
    : null;
  const exactPath = configuredProjects.find(
    item => item.localPath && normalized(item.localPath) === normalized(project.localPath)
  );
  const match = exactRepo || exactPath || null;
  if (!match) return { state: 'NEW', configuredKey: null, conflicts: [] };

  const conflicts = [];
  if (project.repo && match.repo && project.repo.toLowerCase() !== match.repo.toLowerCase()) {
    conflicts.push(`repo mismatch: discovered=${project.repo} configured=${match.repo}`);
  }
  if (match.localPath && normalized(match.localPath) !== normalized(project.localPath)) {
    conflicts.push(`path mismatch: discovered=${project.localPath} configured=${match.localPath}`);
  }
  return {
    state: conflicts.length ? 'CONFLICT' : 'REGISTERED',
    configuredKey: match.key,
    conflicts
  };
}

export async function discoverProjects({ roots, maxDepth = 3, configuredProjects = [] }) {
  const candidates = new Set();
  for (const root of roots) {
    for (const project of await findGitProjects(root, maxDepth)) candidates.add(project);
  }

  const projects = [];
  for (const root of [...candidates].sort()) {
    const project = await inferProject(root);
    const registration = matchRegistration(project, configuredProjects);
    projects.push({ ...project, registration });
  }

  return {
    generatedAt: new Date().toISOString(),
    roots: roots.map(root => path.resolve(root)),
    maxDepth,
    counts: {
      total: projects.length,
      registered: projects.filter(x => x.registration.state === 'REGISTERED').length,
      new: projects.filter(x => x.registration.state === 'NEW').length,
      conflicts: projects.filter(x => x.registration.state === 'CONFLICT').length
    },
    projects
  };
}

export async function writeDiscoveryReport(baseDir, report, outputFile = 'state/discovery.json') {
  const target = path.isAbsolute(outputFile) ? outputFile : path.resolve(baseDir, outputFile);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return target;
}

export { findGitProjects, inferProject, parseGithubRemote, matchRegistration };
