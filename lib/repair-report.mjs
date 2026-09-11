export function repairPlanIssueComment(plan) {
  const steps = (plan.steps || []).map((step, index) => `${index + 1}. ${step}`);
  const acceptance = (plan.acceptance || []).map(item => `- [ ] ${item}`);
  const analysis = plan.aiAnalysis
    ? [
        '',
        '### Read-only AI analysis',
        '',
        plan.aiAnalysis.slice(0, 12000)
      ]
    : [];
  const plannerError = plan.plannerError
    ? [
        '',
        '### Planner fallback',
        '',
        `External planner error: \`${String(plan.plannerError).slice(0, 1000)}\``
      ]
    : [];

  return [
    '## DevControl Repair Plan',
    '',
    `Mode: **${plan.mode || 'PLAN_ONLY'}**`,
    `Provider: \`${plan.provider || 'heuristic'}\``,
    `Confidence: **${Math.round(Number(plan.confidence || 0) * 100)}%**`,
    `Failure signature: \`${plan.signature || '-'}\``,
    '',
    '### Summary',
    '',
    plan.summary || 'No summary available.',
    '',
    '### Proposed repair sequence',
    '',
    ...steps,
    '',
    '### Acceptance gates',
    '',
    ...acceptance,
    ...analysis,
    ...plannerError,
    '',
    '> PLAN_ONLY: this plan does not modify files, commit, push, merge, deploy, publish, release, or change production state.'
  ].join('\n');
}
