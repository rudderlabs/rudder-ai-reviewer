/**
 * Read and parse package.json for SDK dependencies
 */

import type { FileSystem } from '@custom-types/file.type';
import type { NPMConfig } from '../config';
import type { SDKLocation } from '../types';
import { cleanSemverPrefix } from './version-utils';

export interface PackageInfo {
  version: string;
  locations: SDKLocation[];
}

export class PackageReader {
  constructor(
    private fs: FileSystem,
    private config: NPMConfig
  ) {}

  read(repoPath: string): PackageInfo | null {
    const packagePath = this.fs.join(repoPath, 'package.json');

    if (!this.fs.exists(packagePath)) {
      return null;
    }

    try {
      const content = this.fs.read(packagePath);
      const packageJson = JSON.parse(content);

      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      const rawVersion = allDeps[this.config.packageName];
      if (!rawVersion) {
        return null;
      }

      return {
        version: cleanSemverPrefix(rawVersion),
        locations: [
          {
            file: 'package.json',
            line: 0,
            type: 'npm',
            snippet: `"${this.config.packageName}": "${rawVersion}"`,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to read package.json: ${errorMessage}`);
      return null;
    }
  }
}
