/**
 * Read and parse package.json for framework dependencies
 */

import type { FileSystem } from '@custom-types/file.type';
import { cleanSemverPrefix } from '@core/shared/npm/version-utils';
import type { FrameworkInfo } from '../types';

export interface FrameworkMatch {
  framework: FrameworkInfo;
  version: string;
}

export class PackageReader {
  constructor(
    private readonly fs: FileSystem,
    private readonly frameworks: FrameworkInfo[]
  ) {}

  /**
   * Read package.json and find all matching frameworks
   * Returns all matches in config order
   */
  readAll(repoPath: string): FrameworkMatch[] {
    const packagePath = this.fs.join(repoPath, 'package.json');

    if (!this.fs.exists(packagePath)) {
      return [];
    }

    try {
      const content = this.fs.read(packagePath);
      const packageJson = JSON.parse(content);

      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      const matches: FrameworkMatch[] = [];

      for (const framework of this.frameworks) {
        const rawVersion = allDeps[framework.packageName];
        if (rawVersion) {
          matches.push({
            framework,
            version: cleanSemverPrefix(rawVersion),
          });
        }
      }

      return matches;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to read package.json: ${errorMessage}`);
      return [];
    }
  }
}
