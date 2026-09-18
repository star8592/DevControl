export function generateQualificationReport(result = {}) {
  const status = result.status ?? 'UNKNOWN';
  const project = result.project ?? 'unknown';
  const lines = [
    '# DevControl Qualification Report',
    '',
    `Project: ${project}`,
    `Status: ${status}`,
    '',
    '## Execution',
    JSON.stringify(result.execution ?? {}, null, 2),
    '',
    '## Artifacts',
    JSON.stringify(result.artifacts ?? [], null, 2),
    '',
    '## Recommendation',
    result.recommendation ?? 'No recommendation generated.'
  ];

  return lines.join('\n');
}

export function generateQualificationJson(result = {}) {
  return {
    generatedAt: new Date().toISOString(),
    ...result
  };
}
