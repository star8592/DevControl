/**
 * Generate CI workflow intent from a project profile.
 * The generated workflow can later be emitted into .github/workflows.
 */
export function generateWorkflow(profile) {
  const steps = [];

  if (profile?.installCommand) {
    steps.push({ name: 'install', run: profile.installCommand });
  }

  if (profile?.testCommand) {
    steps.push({ name: 'test', run: profile.testCommand });
  }

  if (profile?.buildCommand) {
    steps.push({ name: 'build', run: profile.buildCommand });
  }

  return {
    name: 'DevControl Qualification',
    steps,
  };
}
