import { buildRepairPrReport } from './pr-report-builder.mjs';

export function buildCreatePullRequestPayload({ project, repair, validation }) {
  const report = buildRepairPrReport({ project, repair, validation });
  return {
    title: report.title,
    body: report.body,
    draft: true,
    labels: report.labels || []
  };
}

export function canCreateRepairPullRequest({ repair, validation }) {
  return Boolean(
    repair?.branch &&
    repair?.repairSha &&
    validation?.status === 'PASS'
  );
}
