export function buildReviewGate({ validation, repair, report }) {
  const checks = [
    {
      name: 'validation',
      passed: validation?.status === 'PASS'
    },
    {
      name: 'repair_candidate',
      passed: Boolean(repair?.repairSha)
    },
    {
      name: 'report_available',
      passed: Boolean(report)
    }
  ];

  return {
    passed: checks.every(item => item.passed),
    checks,
    next: checks.every(item => item.passed)
      ? 'READY_FOR_HUMAN_REVIEW'
      : 'BLOCKED'
  };
}
