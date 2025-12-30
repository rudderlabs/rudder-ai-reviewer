import type { LockFileParser } from '@core/shared/npm';
import type { PackageReader } from './npm/package-reader';
import type { FrameworkDetectionResult } from './types';

export class FrameworkDetector {
  constructor(
    private readonly packageReader: PackageReader,
    private readonly lockFileParser: LockFileParser
  ) {}

  async detect(repoPath: string): Promise<FrameworkDetectionResult[]> {
    const matches = this.packageReader.readAll(repoPath);

    if (matches.length === 0) {
      return [];
    }

    // Get all package names to check in lock file
    const packageNames = matches.map(m => m.framework.packageName);
    const versions = await this.lockFileParser.getVersions(repoPath, packageNames);

    const results: FrameworkDetectionResult[] = [];

    for (const match of matches) {
      const exactVersion = versions.get(match.framework.packageName);

      results.push({
        name: match.framework.name,
        version: exactVersion || match.version,
        category: match.framework.category,
      });
    }

    return results;
  }
}
