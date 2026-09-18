import { detectProject } from './universal-detector.mjs';

/**
 * Universal project adoption pipeline.
 * Converts a discovered repository into a DevControl managed profile.
 */
export async function adoptProject(projectPath, options = {}) {
  const profile = await detectProject(projectPath);

  return {
    managed: true,
    source: projectPath,
    profile,
    adoptedAt: new Date().toISOString(),
    options,
  };
}
