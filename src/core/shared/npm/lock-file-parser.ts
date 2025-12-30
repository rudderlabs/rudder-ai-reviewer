import type { FileSystem } from '@custom-types/file.type';
import type { DepGraph } from '@snyk/dep-graph';
import {
  parseNpmLockV2Project,
  parsePnpmProject,
  parseYarnLockV1Project,
} from 'snyk-nodejs-lockfile-parser';

export interface LockFileNames {
  npm: string;
  yarn: string;
  pnpm: string;
}

export type PackageVersionMap = Map<string, string>;

const DEFAULT_LOCK_FILES: LockFileNames = {
  npm: 'package-lock.json',
  yarn: 'yarn.lock',
  pnpm: 'pnpm-lock.yaml',
};

export class LockFileParser {
  private readonly lockFiles: LockFileNames;

  constructor(
    private readonly fs: FileSystem,
    lockFiles: Partial<LockFileNames> = {}
  ) {
    this.lockFiles = { ...DEFAULT_LOCK_FILES, ...lockFiles };
  }

  /**
   * Get exact versions of packages from any available lock file
   * Tries package-lock.json, yarn.lock, and pnpm-lock.yaml in order
   *
   * @param repoPath - Path to the repository
   * @param packageNames - Package name(s) to look up
   * @returns Map of package names to their versions (only includes found packages)
   */
  async getVersions(repoPath: string, packageNames: string[]): Promise<PackageVersionMap> {
    const npmVersions = await this.parseNPMLock(repoPath, packageNames);
    if (npmVersions.size > 0) return npmVersions;

    const yarnVersions = await this.parseYarnLock(repoPath, packageNames);
    if (yarnVersions.size > 0) return yarnVersions;

    return this.parsePNPMLock(repoPath, packageNames);
  }

  private async parseNPMLock(repoPath: string, packageNames: string[]): Promise<PackageVersionMap> {
    const lockPath = this.fs.join(repoPath, this.lockFiles.npm);
    const pkgJsonPath = this.fs.join(repoPath, 'package.json');

    if (!this.fs.exists(lockPath) || !this.fs.exists(pkgJsonPath)) {
      return new Map();
    }

    try {
      const pkgJsonContent = this.fs.read(pkgJsonPath);
      const lockContent = this.fs.read(lockPath);

      const depGraph = await parseNpmLockV2Project(pkgJsonContent, lockContent, {
        includeDevDeps: false,
        includeOptionalDeps: true,
        strictOutOfSync: false,
        pruneCycles: false,
      });

      return this.extractVersionsFromDepGraph(depGraph, packageNames);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to parse ${this.lockFiles.npm}: ${errorMessage}`);
      return new Map();
    }
  }

  private async parseYarnLock(
    repoPath: string,
    packageNames: string[]
  ): Promise<PackageVersionMap> {
    const lockPath = this.fs.join(repoPath, this.lockFiles.yarn);
    const pkgJsonPath = this.fs.join(repoPath, 'package.json');

    if (!this.fs.exists(lockPath) || !this.fs.exists(pkgJsonPath)) {
      return new Map();
    }

    try {
      const pkgJsonContent = this.fs.read(pkgJsonPath);
      const lockContent = this.fs.read(lockPath);

      const depGraph = await parseYarnLockV1Project(pkgJsonContent, lockContent, {
        includeDevDeps: false,
        includeOptionalDeps: true,
        includePeerDeps: false,
        strictOutOfSync: false,
        pruneLevel: 'none',
      });

      return this.extractVersionsFromDepGraph(depGraph, packageNames);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to parse ${this.lockFiles.yarn}: ${errorMessage}`);
      return new Map();
    }
  }

  private async parsePNPMLock(
    repoPath: string,
    packageNames: string[]
  ): Promise<PackageVersionMap> {
    const lockPath = this.fs.join(repoPath, this.lockFiles.pnpm);
    const pkgJsonPath = this.fs.join(repoPath, 'package.json');

    if (!this.fs.exists(lockPath) || !this.fs.exists(pkgJsonPath)) {
      return new Map();
    }

    try {
      const pkgJsonContent = this.fs.read(pkgJsonPath);
      const lockContent = this.fs.read(lockPath);

      const depGraph = await parsePnpmProject(pkgJsonContent, lockContent, {
        includeDevDeps: false,
        includeOptionalDeps: true,
        strictOutOfSync: false,
        pruneWithinTopLevelDeps: false,
      });

      return this.extractVersionsFromDepGraph(depGraph, packageNames);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to parse ${this.lockFiles.pnpm}: ${errorMessage}`);
      return new Map();
    }
  }

  private extractVersionsFromDepGraph(
    depGraph: DepGraph,
    packageNames: string[]
  ): PackageVersionMap {
    const versions = new Map<string, string>();
    const packages = depGraph.getDepPkgs();
    const packageNameSet = new Set(packageNames);

    for (const pkg of packages) {
      if (packageNameSet.has(pkg.name) && pkg.version) {
        versions.set(pkg.name, pkg.version);
      }
    }

    return versions;
  }
}
