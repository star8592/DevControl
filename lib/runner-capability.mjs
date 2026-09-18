export function detectRunnerCapability(env = process.env) {
  return {
    os: env.RUNNER_OS || process.platform,
    arch: env.RUNNER_ARCH || process.arch,
    cpu: true,
    gpu: Boolean(env.DEVCONTROL_GPU || env.CUDA_VISIBLE_DEVICES),
    tools: {
      git: true,
      node: true,
      python: true
    }
  };
}

export function matchesRequirement(capability, requirement = {}) {
  if (requirement.gpu && !capability.gpu) return false;
  if (requirement.os && requirement.os !== capability.os) return false;
  return true;
}
