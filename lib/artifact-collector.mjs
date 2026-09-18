// DevControl Universal Artifact Collector
// Collects standardized execution outputs for qualification runs.

export function collectArtifacts(result = {}) {
  return {
    project: result.project ?? null,
    status: result.status ?? "UNKNOWN",
    logs: result.logs ?? [],
    reports: result.reports ?? [],
    screenshots: result.screenshots ?? [],
    binaries: result.binaries ?? [],
    timestamp: new Date().toISOString()
  };
}

export function mergeArtifacts(existing = {}, incoming = {}) {
  return {
    ...existing,
    ...incoming,
    logs: [...(existing.logs ?? []), ...(incoming.logs ?? [])],
    reports: [...(existing.reports ?? []), ...(incoming.reports ?? [])],
    screenshots: [...(existing.screenshots ?? []), ...(incoming.screenshots ?? [])]
  };
}
