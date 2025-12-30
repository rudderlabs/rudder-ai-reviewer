import type { FileSystem } from '@custom-types/file.type';
import type { DepGraph } from '@snyk/dep-graph';
import {
  parseNpmLockV2Project,
  parsePnpmProject,
  parseYarnLockV1Project,
} from 'snyk-nodejs-lockfile-parser';
import type { NPMConfig } from '../config';

export class LockFileParser {
  private readonly parser: SharedLockFileParser;

  constructor(fs: FileSystem, private readonly config: NPMConfig) {
    this.parser = new SharedLockFileParser(fs, config);
  }

  /**
   * Get exact version from any available lock file
   * Tries package-lock.json, yarn.lock, and pnpm-lock.yaml in order
   */
  async getVersion(repoPath: string): Promise<string | null> {
    const npmVersion = await this.parseNPMLock(repoPath);
    if (npmVersion) return npmVersion;

    const yarnVersion = await this.parseYarnLock(repoPath);
    if (yarnVersion) return yarnVersion;

    return this.parsePNPMLock(repoPath);
  }

  private async parseNPMLock(repoPath: string): Promise<string | null> {
    const lockPath = this.fs.join(repoPath, this.config.lockFiles.npm);
    const pkgJsonPath = this.fs.join(repoPath, 'package.json');

    if (!this.fs.exists(lockPath) || !this.fs.exists(pkgJsonPath)) return null;

    try {
      const pkgJsonContent = this.fs.read(pkgJsonPath);
      const lockContent = this.fs.read(lockPath);

      const depGraph = await parseNpmLockV2Project(pkgJsonContent, lockContent, {
        includeDevDeps: false,
        includeOptionalDeps: true,
        strictOutOfSync: false,
        pruneCycles: false,
      });

      return this.extractVersionFromDepGraph(depGraph);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to parse ${this.config.lockFiles.npm}: ${errorMessage}`);
      return null;
    }
  }

  private async parseYarnLock(repoPath: string): Promise<string | null> {
    const lockPath = this.fs.join(repoPath, this.config.lockFiles.yarn);
    const pkgJsonPath = this.fs.join(repoPath, 'package.json');

    if (!this.fs.exists(lockPath) || !this.fs.exists(pkgJsonPath)) return null;

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

      return this.extractVersionFromDepGraph(depGraph);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to parse ${this.config.lockFiles.yarn}: ${errorMessage}`);
      return null;
    }
  }

  private async parsePNPMLock(repoPath: string): Promise<string | null> {
    const lockPath = this.fs.join(repoPath, this.config.lockFiles.pnpm);
    const pkgJsonPath = this.fs.join(repoPath, 'package.json');

    if (!this.fs.exists(lockPath) || !this.fs.exists(pkgJsonPath)) return null;

    try {
      const pkgJsonContent = this.fs.read(pkgJsonPath);
      const lockContent = this.fs.read(lockPath);

      const depGraph = await parsePnpmProject(pkgJsonContent, lockContent, {
        includeDevDeps: false,
        includeOptionalDeps: true,
        strictOutOfSync: false,
        pruneWithinTopLevelDeps: false,
      });

      return this.extractVersionFromDepGraph(depGraph);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to parse ${this.config.lockFiles.pnpm}: ${errorMessage}`);
      return null;
    }
  }

  private extractVersionFromDepGraph(depGraph: DepGraph): string | null {
    const packages = depGraph.getDepPkgs();
    const targetPkg = packages.find(pkg => pkg.name === this.config.packageName);
    return targetPkg?.version || null;
  }
}
