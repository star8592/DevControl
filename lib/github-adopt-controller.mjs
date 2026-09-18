export function normalizeGitHubUrl(url) {
  if (!url) throw new Error('repository url required');
  return url.replace(/\.git$/, '').replace(/\/$/, '');
}

export function createAdoptPlan(repoUrl) {
  const repository = normalizeGitHubUrl(repoUrl);
  return {
    repository,
    stages: [
      'clone',
      'detect',
      'profile',
      'registry',
      'workflow',
      'qualification'
    ]
  };
}

export function isSupportedGitHubUrl(url) {
  return /^https:\/\/github\.com\/[^/]+\/[^/]+/.test(normalizeGitHubUrl(url));
}
