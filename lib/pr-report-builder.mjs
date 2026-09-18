export function buildPrReport({ project, repair, validation, failure, plan }) {
  return {
    title: `fix: DevControl repair ${failure?.signature?.slice?.(0, 12) || 'candidate'}`,
    body: [
      '## DevControl Automated Repair Candidate',
      '',
      `Project: ${project?.key || '-'}`,
      `Repository: ${project?.repo || '-'}`,
      '',
      '### Failure',
      failure?.summary || '-',
      '',
      '### Repair Plan',
      plan?.summary || '-',
      '',
      '### Validation',
      validation?.status || '-',
      '',
      '### Changed Branch',
      repair?.branch || '-'
    ].join('\n'),
    labels: ['devcontrol', 'automated-repair']
  };
}
