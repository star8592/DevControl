export class PipelineRunner {
  constructor({ qualificationEngine, artifactCollector, reportGenerator } = {}) {
    this.qualificationEngine = qualificationEngine;
    this.artifactCollector = artifactCollector;
    this.reportGenerator = reportGenerator;
  }

  async run(projectProfile) {
    const qualification = await this.qualificationEngine.run(projectProfile);
    const artifacts = await this.artifactCollector.collect({
      projectProfile,
      qualification,
    });

    const report = await this.reportGenerator.generate({
      projectProfile,
      qualification,
      artifacts,
    });

    return {
      project: projectProfile.name,
      qualification,
      artifacts,
      report,
    };
  }
}
