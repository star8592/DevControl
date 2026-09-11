import {
  executeProjectQualification,
  persistQualificationResult
} from './project-executor.mjs';
import {
  executeVisualQualification,
  visualQualificationEnabled
} from './visual-qualification.mjs';

export async function executeQualificationPipeline({
  project,
  commands,
  stateDir,
  timeoutMs = 15 * 60 * 1000,
  visualTimeoutMs = 5 * 60 * 1000
}) {
  const base = await executeProjectQualification({
    project,
    commands,
    stateDir,
    timeoutMs,
    persist: false
  });

  let result = base;
  if (base.status === 'PASS' && visualQualificationEnabled(project)) {
    const visual = await executeVisualQualification({
      project,
      stateDir,
      runId: base.runId,
      timeoutMs: visualTimeoutMs
    });
    result = {
      ...base,
      finishedAt: new Date().toISOString(),
      visualQualification: visual
    };
    if (visual.status !== 'PASS') {
      result.status = 'FAIL';
      result.failedCommand = `visual:${visual.adapter || 'qualification'}`;
      result.failurePhase = 'VISUAL';
    }
  }

  await persistQualificationResult({ result, stateDir });
  return result;
}
