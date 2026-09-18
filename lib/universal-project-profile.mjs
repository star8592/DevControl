export function createProjectProfile(input = {}) {
  return {
    name: input.name ?? null,
    repo: input.repo ?? null,
    language: input.language ?? 'unknown',
    framework: input.framework ?? null,
    installCommand: input.installCommand ?? null,
    testCommand: input.testCommand ?? null,
    buildCommand: input.buildCommand ?? null,
    confidence: input.confidence ?? 0
  };
}
