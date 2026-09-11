export const AutonomyLevel = Object.freeze({
  BLOCKED: 'BLOCKED',
  OBSERVE: 'OBSERVE',
  SHADOW: 'SHADOW',
  QUALIFY: 'QUALIFY',
  MANAGED: 'MANAGED'
});

const HIGH_RISK_WORDS = /\b(deploy|publish|release|steam|production|live|trade|trading|money|wallet|secret)\b/i;

function commandRisk(command) {
  return HIGH_RISK_WORDS.test(command) ? 'high' : 'low';
}

function isDevControlSelf(project) {
  return (
    String(project?.name || '').toLowerCase() === 'devcontrol' ||
    /\/devcontrol$/i.test(String(project?.repo || ''))
  );
}

export function planProjectAutonomy(project) {
  const registration = project.registration || { state: 'NEW', conflicts: [] };
  const reasons = [];

  if (registration.state === 'CONFLICT') {
    return {
      level: AutonomyLevel.BLOCKED,
      autoRegister: false,
      autoQualify: false,
      reasons: ['registry conflict must be resolved', ...(registration.conflicts || [])],
      safeCommands: []
    };
  }

  const safeCommands = (project.proposedQualify || [])
    .filter(item => item.risk === 'safe' && commandRisk(item.command) === 'low')
    .filter(item => Number(item.confidence || 0) >= 0.85)
    .map(item => item.command);

  if (isDevControlSelf(project)) {
    return {
      level: AutonomyLevel.OBSERVE,
      autoRegister: true,
      autoQualify: false,
      reasons: [
        'DevControl is the control plane and may not automatically sync or qualify itself',
        'upgrade DevControl explicitly, then run npm run check before reinstalling services'
      ],
      safeCommands
    };
  }

  if (registration.state === 'REGISTERED') {
    return {
      level: AutonomyLevel.MANAGED,
      autoRegister: false,
      autoQualify: safeCommands.length > 0,
      reasons: ['project is already registered'],
      safeCommands
    };
  }

  if (!project.repo) reasons.push('no GitHub remote matched');
  if (project.dirty) reasons.push('working tree is dirty');
  if (Number(project.confidence || 0) < 0.70) reasons.push('discovery confidence below 0.70');
  if ((project.riskFlags || []).length) reasons.push(...project.riskFlags);

  if (!project.repo || Number(project.confidence || 0) < 0.70) {
    return {
      level: AutonomyLevel.OBSERVE,
      autoRegister: true,
      autoQualify: false,
      reasons,
      safeCommands
    };
  }

  if (project.dirty || (project.riskFlags || []).length || safeCommands.length === 0) {
    return {
      level: AutonomyLevel.SHADOW,
      autoRegister: true,
      autoQualify: false,
      reasons: reasons.length ? reasons : ['collect evidence before qualification'],
      safeCommands
    };
  }

  if (Number(project.confidence || 0) >= 0.90) {
    return {
      level: AutonomyLevel.QUALIFY,
      autoRegister: true,
      autoQualify: true,
      reasons: ['high-confidence project with safe inferred qualification commands'],
      safeCommands
    };
  }

  return {
    level: AutonomyLevel.SHADOW,
    autoRegister: true,
    autoQualify: false,
    reasons: ['project discovered; shadow observation required before automatic qualification'],
    safeCommands
  };
}

export function attachAutonomyPlans(report) {
  return {
    ...report,
    projects: report.projects.map(project => ({
      ...project,
      autonomy: planProjectAutonomy(project)
    }))
  };
}
