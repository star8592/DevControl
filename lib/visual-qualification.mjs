import { mkdir, readFile, readdir, stat, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

import { redactLog } from './project-executor.mjs';

const SECRET_ENV = /KEY|TOKEN|SECRET|PASSWORD|PASSWD|COOKIE|AUTHORIZATION|CREDENTIAL/i;
const GODOT_ADAPTER = 'godot-vulkan-frame-capture';

function exists(filePath) {
  return access(filePath).then(() => true).catch(() => false);
}

function inside(parent, child) {
  const root = path.resolve(parent);
  const target = path.resolve(child);
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function scrubbedEnv(extra = {}) {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !SECRET_ENV.test(name))
    ),
    ...extra
  };
}

function boundedInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function displayCommand(executable, args) {
  return [executable, ...args].map(value => {
    const text = String(value);
    return /\s/.test(text) ? JSON.stringify(text) : text;
  }).join(' ');
}

function godotConfig(project) {
  const raw = project?.visualQualification || project?.registration?.visualQualification || null;
  if (!raw?.enabled) return null;
  if ((raw.adapter || GODOT_ADAPTER) !== GODOT_ADAPTER) return null;
  return {
    adapter: GODOT_ADAPTER,
    godotBinary: String(raw.godotBinary || process.env.DEVCONTROL_GODOT_BIN || 'godot'),
    projectPath: String(raw.projectPath || '.'),
    renderer: String(raw.renderer || 'forward_plus'),
    gpuIndex: boundedInt(raw.gpuIndex, 0, 0, 15),
    frames: boundedInt(raw.frames, 90, 1, 1800),
    fps: boundedInt(raw.fps, 30, 1, 240),
    minFrames: boundedInt(raw.minFrames, 1, 1, 1800),
    minWidth: boundedInt(raw.minWidth, 1920, 1, 16384),
    minHeight: boundedInt(raw.minHeight, 1080, 1, 16384),
    minBytes: boundedInt(raw.minBytes, 4096, 1, 1024 * 1024 * 1024),
    headless: raw.headless !== false,
    requireVulkan: raw.requireVulkan !== false,
    gpuPattern: raw.gpuPattern ? String(raw.gpuPattern) : null
  };
}

export function visualQualificationConfig(project) {
  return godotConfig(project);
}

export function visualQualificationEnabled(project) {
  return Boolean(visualQualificationConfig(project));
}

function pngDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) return null;
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

async function screenshotEvidence(outputDir) {
  let names = [];
  try {
    names = await readdir(outputDir);
  } catch {
    return [];
  }
  const images = [];
  for (const name of names.sort()) {
    if (!name.toLowerCase().endsWith('.png')) continue;
    const filePath = path.resolve(outputDir, name);
    if (!inside(outputDir, filePath)) continue;
    let info;
    try {
      const [buffer, fileStat] = await Promise.all([readFile(filePath), stat(filePath)]);
      const dims = pngDimensions(buffer);
      if (!dims) continue;
      info = {
        file: name,
        path: filePath,
        bytes: fileStat.size,
        width: dims.width,
        height: dims.height
      };
    } catch {
      continue;
    }
    images.push(info);
  }
  return images;
}

function spawnCapture({ cwd, executable, args, timeoutMs, env }) {
  return new Promise(resolve => {
    const startedAt = new Date();
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let spawnError = null;
    const child = spawn(executable, args, {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.on('error', error => { spawnError = error; });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2000).unref?.();
    }, timeoutMs);
    timer.unref?.();
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
        exitCode: Number.isInteger(code) ? code : null,
        signal: signal || null,
        timedOut,
        error: spawnError ? String(spawnError.message || spawnError) : null,
        stdout: redactLog(stdout, env),
        stderr: redactLog(stderr, env),
        passed: code === 0 && !timedOut && !spawnError
      });
    });
  });
}

export async function probeVisualQualification(project) {
  const isGodot = (project?.stacks || []).includes('godot');
  const config = visualQualificationConfig(project);
  if (!isGodot) {
    return { state: 'NOT_APPLICABLE', adapter: null, enabled: false };
  }
  const executable = config?.godotBinary || process.env.DEVCONTROL_GODOT_BIN || 'godot';
  const version = spawnSync(executable, ['--version'], {
    cwd: project.localPath,
    encoding: 'utf8',
    timeout: 10000,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const available = version.status === 0;
  return {
    state: !available ? 'GODOT_UNAVAILABLE' : (config ? 'READY' : 'NEEDS_OPT_IN'),
    adapter: config?.adapter || GODOT_ADAPTER,
    enabled: Boolean(config),
    godotBinary: executable,
    godotVersion: available ? String(version.stdout || version.stderr || '').trim() : null,
    reason: available ? null : String(version.stderr || version.stdout || 'Godot executable unavailable').trim()
  };
}

export async function executeVisualQualification({
  project,
  stateDir,
  runId,
  timeoutMs = 5 * 60 * 1000
}) {
  const config = visualQualificationConfig(project);
  if (!config) {
    return {
      schemaVersion: 1,
      status: 'SKIPPED',
      adapter: null,
      reason: 'visual qualification is not explicitly enabled for this project'
    };
  }
  if (!(project.stacks || []).includes('godot')) {
    return {
      schemaVersion: 1,
      status: 'FAIL',
      adapter: config.adapter,
      reason: 'Godot visual adapter requires a discovered godot stack',
      failureReasons: ['project is not currently detected as a Godot project']
    };
  }

  const projectRoot = path.resolve(project.localPath);
  const godotRoot = path.resolve(projectRoot, config.projectPath);
  if (!inside(projectRoot, godotRoot)) {
    return {
      schemaVersion: 1,
      status: 'FAIL',
      adapter: config.adapter,
      reason: 'configured Godot projectPath escapes the project checkout',
      failureReasons: ['projectPath must stay inside project.localPath']
    };
  }
  if (!await exists(path.join(godotRoot, 'project.godot'))) {
    return {
      schemaVersion: 1,
      status: 'FAIL',
      adapter: config.adapter,
      reason: 'project.godot not found at configured visual projectPath',
      failureReasons: [`missing ${path.join(godotRoot, 'project.godot')}`]
    };
  }

  const projectKey = String(project.key || path.basename(project.localPath));
  const outputDir = path.resolve(stateDir, 'visual', projectKey, runId);
  await mkdir(outputDir, { recursive: true });
  const movieBase = path.resolve(outputDir, 'capture.png');
  const godotLog = path.resolve(outputDir, 'godot.log');
  const args = [
    '--path', godotRoot,
    '--rendering-method', config.renderer,
    '--gpu-index', String(config.gpuIndex),
    '--write-movie', movieBase,
    '--fixed-fps', String(config.fps),
    '--quit-after', String(config.frames),
    '--verbose',
    '--log-file', godotLog
  ];
  if (config.headless) args.unshift('--headless');

  const env = scrubbedEnv({
    DEVCONTROL_VISUAL_QUALIFICATION: '1',
    DEVCONTROL_VISUAL_OUTPUT_DIR: outputDir,
    DEVCONTROL_PROJECT_SHA: String(project.sha || '')
  });
  const execution = await spawnCapture({
    cwd: godotRoot,
    executable: config.godotBinary,
    args,
    timeoutMs,
    env
  });

  const combinedLog = `${execution.stdout}\n${execution.stderr}\n${await readFile(godotLog, 'utf8').catch(() => '')}`;
  const screenshots = await screenshotEvidence(outputDir);
  const validResolution = screenshots.filter(
    item => item.width >= config.minWidth && item.height >= config.minHeight && item.bytes >= config.minBytes
  );
  const vulkanEvidence = /\bVulkan\b/i.test(combinedLog);
  let gpuMatched = true;
  let gpuPatternError = null;
  if (config.gpuPattern) {
    try {
      gpuMatched = new RegExp(config.gpuPattern, 'i').test(combinedLog);
    } catch (error) {
      gpuMatched = false;
      gpuPatternError = String(error.message || error);
    }
  }

  const gates = {
    process: execution.passed,
    screenshots: screenshots.length >= config.minFrames,
    resolution: validResolution.length >= config.minFrames,
    vulkan: !config.requireVulkan || vulkanEvidence,
    gpu: gpuMatched
  };
  const failureReasons = [];
  if (!gates.process) failureReasons.push('Godot capture process did not exit successfully');
  if (!gates.screenshots) failureReasons.push(`captured ${screenshots.length} PNG frames; require at least ${config.minFrames}`);
  if (!gates.resolution) failureReasons.push(`not enough PNG frames meet ${config.minWidth}x${config.minHeight} and ${config.minBytes} byte gates`);
  if (!gates.vulkan) failureReasons.push('Godot output did not contain Vulkan renderer evidence');
  if (!gates.gpu) failureReasons.push(`Godot output did not match required GPU pattern: ${config.gpuPattern}`);
  if (gpuPatternError) failureReasons.push(`invalid gpuPattern: ${gpuPatternError}`);

  const result = {
    schemaVersion: 1,
    adapter: config.adapter,
    status: Object.values(gates).every(Boolean) ? 'PASS' : 'FAIL',
    command: displayCommand(config.godotBinary, args),
    projectPath: godotRoot,
    outputDir,
    requested: {
      renderer: config.renderer,
      gpuIndex: config.gpuIndex,
      frames: config.frames,
      fps: config.fps,
      headless: config.headless,
      minFrames: config.minFrames,
      minWidth: config.minWidth,
      minHeight: config.minHeight,
      minBytes: config.minBytes,
      requireVulkan: config.requireVulkan,
      gpuPattern: config.gpuPattern
    },
    execution: {
      startedAt: execution.startedAt,
      finishedAt: execution.finishedAt,
      durationMs: execution.durationMs,
      exitCode: execution.exitCode,
      signal: execution.signal,
      timedOut: execution.timedOut,
      error: execution.error
    },
    gates,
    evidence: {
      logFile: godotLog,
      vulkanEvidence,
      gpuMatched,
      screenshots
    },
    failureReasons
  };
  await writeFile(path.resolve(outputDir, 'visual-result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await writeFile(
    path.resolve(outputDir, 'capture.log'),
    `$ ${result.command}\n\n--- stdout ---\n${execution.stdout}\n\n--- stderr ---\n${execution.stderr}\n`,
    'utf8'
  );
  return result;
}

export { GODOT_ADAPTER };
