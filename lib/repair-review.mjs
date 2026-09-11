const PASS_CONCLUSIONS = new Set(['success', 'neutral', 'skipped']);
const FAIL_CONCLUSIONS = new Set([
  'failure',
  'timed_out',
  'cancelled',
  'action_required',
  'startup_failure',
  'stale'
]);
const PENDING_STATES = new Set(['queued', 'in_progress', 'pending', 'requested', 'waiting']);

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function checkName(check, index) {
  return String(check?.name || check?.context || `check-${index + 1}`);
}

function normalizeChecks(checkRuns = [], statuses = []) {
  const output = [];
  for (const [index, check] of (checkRuns || []).entries()) {
    const status = normalize(check.status);
    const conclusion = normalize(check.conclusion);
    output.push({
      source: 'check-run',
      name: checkName(check, index),
      status,
      conclusion: conclusion || null,
      url: check.html_url || check.details_url || null
    });
  }
  for (const [index, status] of (statuses || []).entries()) {
    const state = normalize(status.state);
    output.push({
      source: 'status',
      name: checkName(status, index),
      status: state === 'pending' ? 'pending' : 'completed',
      conclusion: state || null,
      url: status.target_url || null
    });
  }
  return output;
}

function summarizeChecks(checks) {
  const failed = checks.filter(check => FAIL_CONCLUSIONS.has(normalize(check.conclusion)));
  const pending = checks.filter(check => {
    const status = normalize(check.status);
    const conclusion = normalize(check.conclusion);
    return PENDING_STATES.has(status) || PENDING_STATES.has(conclusion) || !conclusion;
  });
  const passed = checks.filter(check => PASS_CONCLUSIONS.has(normalize(check.conclusion)));
  return {
    total: checks.length,
    passed: passed.length,
    pending: pending.length,
    failed: failed.length,
    checks
  };
}

export function classifyRepairReview({ candidate, pullRequest, checkRuns = [], statuses = [] }) {
  const reasons = [];
  const expectedSha = String(candidate?.repairSha || '').trim();
  const expectedBranch = String(candidate?.branch || '').trim();
  if (!candidate?.pr?.number) reasons.push('repair candidate has no recorded pull request');
  if (!pullRequest) reasons.push('pull request could not be loaded');
  if (reasons.length) {
    return { state: 'BLOCKED', reasons, checks: summarizeChecks([]) };
  }

  const headSha = String(pullRequest.head?.sha || '').trim();
  const headRef = String(pullRequest.head?.ref || '').trim();
  const checks = summarizeChecks(normalizeChecks(checkRuns, statuses));

  if (pullRequest.merged === true || pullRequest.merged_at) {
    return {
      state: 'MERGED',
      reasons: [],
      headSha,
      headRef,
      checks,
      mergedAt: pullRequest.merged_at || null,
      mergeCommitSha: pullRequest.merge_commit_sha || null
    };
  }
  if (normalize(pullRequest.state) === 'closed') {
    return { state: 'CLOSED', reasons: ['pull request is closed without merge'], headSha, headRef, checks };
  }
  if (headSha !== expectedSha) {
    return {
      state: 'STALE',
      reasons: ['pull request head SHA no longer matches the validated repair SHA'],
      headSha,
      headRef,
      checks
    };
  }
  if (headRef !== expectedBranch) {
    return {
      state: 'STALE',
      reasons: ['pull request head branch no longer matches the recorded repair branch'],
      headSha,
      headRef,
      checks
    };
  }

  const mergeableState = normalize(pullRequest.mergeable_state);
  if (['behind', 'dirty'].includes(mergeableState)) {
    return {
      state: 'STALE',
      reasons: [
        mergeableState === 'dirty'
          ? 'pull request has merge conflicts'
          : 'pull request branch is behind the current base branch'
      ],
      headSha,
      headRef,
      checks,
      mergeableState
    };
  }
  if (checks.failed > 0) {
    return {
      state: 'CI_FAILED',
      reasons: [`${checks.failed} GitHub check/status result(s) failed`],
      headSha,
      headRef,
      checks,
      mergeableState
    };
  }
  if (checks.total === 0 || checks.pending > 0) {
    return {
      state: 'AWAITING_CI',
      reasons: [
        checks.total === 0
          ? 'no GitHub CI/check result is available yet'
          : `${checks.pending} GitHub check/status result(s) are still pending`
      ],
      headSha,
      headRef,
      checks,
      mergeableState
    };
  }
  if (checks.passed !== checks.total) {
    return {
      state: 'AWAITING_CI',
      reasons: ['not every GitHub check/status has a recognized passing conclusion'],
      headSha,
      headRef,
      checks,
      mergeableState
    };
  }
  return {
    state: 'REVIEWABLE',
    reasons: [],
    headSha,
    headRef,
    checks,
    mergeableState,
    draft: Boolean(pullRequest.draft)
  };
}

export function repairReviewSummary(review) {
  return {
    state: review.state,
    reasons: review.reasons || [],
    headSha: review.headSha || null,
    headRef: review.headRef || null,
    mergeableState: review.mergeableState || null,
    checks: {
      total: review.checks?.total || 0,
      passed: review.checks?.passed || 0,
      pending: review.checks?.pending || 0,
      failed: review.checks?.failed || 0
    },
    mergedAt: review.mergedAt || null,
    mergeCommitSha: review.mergeCommitSha || null,
    draft: review.draft ?? null
  };
}
