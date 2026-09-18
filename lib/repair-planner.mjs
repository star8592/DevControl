export function createRepairPlan(failureAnalysis = {}) {
  const category = failureAnalysis.category || 'unknown';
  const suggestions = failureAnalysis.suggestion ? [failureAnalysis.suggestion] : [];

  return {
    category,
    priority: category === 'unknown' ? 'normal' : 'high',
    affectedAreas: failureAnalysis.signals || [],
    strategy: suggestions,
    validationSteps: [
      'apply change in isolated branch',
      'rerun qualification pipeline',
      'compare previous failure evidence'
    ],
    requiresHumanReview: true
  };
}
