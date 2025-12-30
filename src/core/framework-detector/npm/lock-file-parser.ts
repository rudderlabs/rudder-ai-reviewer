import type { NPMConfig } from '@core/framework-detector/config';
import type { FileSystem } from '@custom-types/file.type';
import type { DepGraph } from '@snyk/dep-graph';
import {
  parseNpmLockV2Project,
  parsePnpmProject,
  parseYarnLockV1Project,
} from 'snyk-nodejs-lockfile-parser';

export class LockFileParser {
  constructor(
    private readonly fs: FileSystem,
    private readonly config: NPMConfig
  ) {}

  async getVersion(repoPath: string, packageName: string): Promise<string | null> {
    const npmVersion = await this.parseNPMLock(repoPath, packageName);
    if (npmVersion) return npmVersion;

    const yarnVersion = await this.parseYarnLock(repoPath, packageName);
    if (yarnVersion) return yarnVersion;

    return this.parsePNPMLock(repoPath, packageName);
  }

  private async parseNPMLock(repoPath: string, packageName: string): Promise<string | null> {
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

      return this.extractVersionFromDepGraph(depGraph, packageName);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to parse ${this.config.lockFiles.npm}: ${errorMessage}`);
      return null;
    }
  }

  private async parseYarnLock(repoPath: string, packageName: string): Promise<string | null> {
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

      return this.extractVersionFromDepGraph(depGraph, packageName);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to parse ${this.config.lockFiles.yarn}: ${errorMessage}`);
      return null;
    }
  }

  private async parsePNPMLock(repoPath: string, packageName: string): Promise<string | null> {
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

      return this.extractVersionFromDepGraph(depGraph, packageName);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to parse ${this.config.lockFiles.pnpm}: ${errorMessage}`);
      return null;
    }
  }

  private extractVersionFromDepGraph(depGraph: DepGraph, packageName: string): string | null {
    const packages = depGraph.getDepPkgs();
    const targetPkg = packages.find(pkg => pkg.name === packageName);
    return targetPkg?.version || null;
  }
}
