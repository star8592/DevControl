// DevControl MCP tool bindings
// Finalization phase: keep MCP surface thin and route into Core services.

export function createToolBindings(core = {}) {
  return {
    adopt_project: async (args) => {
      if (!core.adoptProject) throw new Error('adoptProject core handler unavailable');
      return core.adoptProject(args);
    },

    qualify_project: async (args) => {
      if (!core.qualifyProject) throw new Error('qualifyProject core handler unavailable');
      return core.qualifyProject(args);
    },

    get_project_status: async (args) => {
      if (!core.getProjectStatus) throw new Error('getProjectStatus core handler unavailable');
      return core.getProjectStatus(args);
    },

    get_report: async (args) => {
      if (!core.getReport) throw new Error('getReport core handler unavailable');
      return core.getReport(args);
    },

    analyze_failure: async (args) => {
      if (!core.analyzeFailure) throw new Error('analyzeFailure core handler unavailable');
      return core.analyzeFailure(args);
    },

    repair_project: async (args) => {
      if (!core.repairProject) throw new Error('repairProject core handler unavailable');
      return core.repairProject(args);
    },

    create_pull_request: async (args) => {
      if (!core.createPullRequest) throw new Error('createPullRequest core handler unavailable');
      return core.createPullRequest(args);
    },
  };
}

export default createToolBindings;
