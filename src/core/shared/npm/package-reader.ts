import { cleanSemverPrefix } from '@core/shared/npm/version-utils';
import type { FileSystem } from '@custom-types/file.type';
import { logger } from '@core/logging/logger';

export type PackageVersionMap = Map<string, string>;

export class PackageReader {
  constructor(private readonly fs: FileSystem) {}

  /**
   * Get versions of packages from package.json
   * Searches in both dependencies and devDependencies
   *
   * @param repoPath - Path to the repository
   * @param packageNames - Package name(s) to look up
   * @returns Map of package names to their versions (only includes found packages)
   */
  getVersions(repoPath: string, packageNames: string[]): PackageVersionMap {
    const packagePath = this.fs.join(repoPath, 'package.json');

    if (!this.fs.exists(packagePath)) {
      return new Map();
    }

    try {
      const content = this.fs.read(packagePath);
      const packageJson = JSON.parse(content);

      const allDeps: Record<string, string> = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      const versions = new Map<string, string>();
      const packageNameSet = new Set(packageNames);

      for (const [pkgName, rawVersion] of Object.entries(allDeps)) {
        if (packageNameSet.has(pkgName)) {
          versions.set(pkgName, cleanSemverPrefix(rawVersion));
        }
      }

      return versions;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to read package.json: ${errorMessage}`);
      return new Map();
    }
  }
}
