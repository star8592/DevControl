export function selectRunner(projectProfile, runners = []) {
  const requirements = projectProfile?.runnerRequirement || {};

  const scored = runners.map((runner) => {
    let score = 0;
    if (!requirements.gpu || runner.gpu) score += 2;
    if (!requirements.os || runner.os === requirements.os) score += 2;
    if (!requirements.tools || requirements.tools.every((tool) => runner.tools?.includes(tool))) score += 3;
    if (!requirements.arch || runner.arch === requirements.arch) score += 1;
    return { runner, score };
  });

  return scored.sort((a, b) => b.score - a.score)[0]?.runner || null;
}

export function explainRunnerSelection(projectProfile, runner) {
  return {
    project: projectProfile?.name || 'unknown',
    selectedRunner: runner?.name || null,
    reason: runner ? 'matched capability requirements' : 'no compatible runner found'
  };
}
