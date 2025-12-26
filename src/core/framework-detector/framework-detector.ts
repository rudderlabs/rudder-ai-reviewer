/**
 * Framework detector - main implementation for detecting frontend/backend frameworks
 */

import type { LockFileParser } from '@core/shared/npm/lock-file-parser';
import type { PackageReader } from './npm/package-reader';
import type { FrameworkDetectionResult } from './types';

export class FrameworkDetector {
  constructor(
    private readonly packageReader: PackageReader,
    private readonly lockFileParser: LockFileParser
  ) {}

  async detect(repoPath: string): Promise<FrameworkDetectionResult | null> {
    const matches = this.packageReader.readAll(repoPath);

    if (matches.length === 0) {
      return null;
    }

    const primaryMatch = matches[0];

    const exactVersion = this.lockFileParser.getVersion(repoPath, primaryMatch.framework.packageName);

    return {
      name: primaryMatch.framework.name,
      version: exactVersion || primaryMatch.version,
      category: primaryMatch.framework.category,
    };
  }
}
