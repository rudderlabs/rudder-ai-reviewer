import type { LockFileParser, PackageReader } from '@core/shared/npm';
import type { FrameworkDetectionResult, FrameworkInfo } from './types';

export class FrameworkDetector {
  constructor(
    private readonly packageReader: PackageReader,
    private readonly lockFileParser: LockFileParser
  ) {}

  async detect(repoPath: string, frameworks: FrameworkInfo[]): Promise<FrameworkDetectionResult[]> {
    const packageNames = frameworks.map(f => f.packageName);
    const declaredVersions = this.packageReader.getVersions(repoPath, packageNames);
    const foundFrameworks = frameworks.filter(f => declaredVersions.has(f.packageName));

    if (foundFrameworks.length === 0) {
      return [];
    }

    const foundPackageNames = foundFrameworks.map(f => f.packageName);
    const exactVersions = await this.lockFileParser.getVersions(repoPath, foundPackageNames);

    const results: FrameworkDetectionResult[] = [];

    for (const framework of foundFrameworks) {
      const exactVersion = exactVersions.get(framework.packageName);
      const declaredVersion = declaredVersions.get(framework.packageName);

      results.push({
        name: framework.name,
        version: exactVersion || declaredVersion,
        category: framework.category,
      });
    }

    return results;
  }
}
