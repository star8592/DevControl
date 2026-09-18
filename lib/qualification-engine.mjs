export function createQualificationPlan(profile = {}) {
  const commands = profile.commands || {};
  return {
    project: profile.name || 'unknown',
    stages: [
      { name: 'install', command: commands.install || null },
      { name: 'test', command: commands.test || null },
      { name: 'build', command: commands.build || null }
    ],
    artifactPolicy: {
      collectLogs: true,
      collectReports: true,
      collectScreenshots: false
    }
  };
}

export function normalizeQualificationResult(result = {}) {
  if (result.failed) return 'FAIL';
  if (result.blocked) return 'BLOCKED';
  if (result.completed) return 'PASS';
  return 'UNKNOWN';
}
