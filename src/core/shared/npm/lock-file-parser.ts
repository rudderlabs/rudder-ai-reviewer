/**
 * Generic lock file parser for extracting exact package versions
 * Supports npm, yarn, and pnpm lock files
 */

import type { FileSystem } from '@custom-types/file.type';

export interface LockFileConfig {
  lockFiles: {
    npm: string;
    yarn: string;
    pnpm: string;
  };
}

export class LockFileParser {
  constructor(
    private readonly fs: FileSystem,
    private readonly config: LockFileConfig
  ) {}

  /**
   * Get exact version for a specific package from any available lock file
   * Tries package-lock.json, yarn.lock, and pnpm-lock.yaml in order
   */
  getVersion(repoPath: string, packageName: string): string | null {
    return (
      this.parseNPMLock(repoPath, packageName) ||
      this.parseYarnLock(repoPath, packageName) ||
      this.parsePNPMLock(repoPath, packageName)
    );
  }

  private parseNPMLock(repoPath: string, packageName: string): string | null {
    const lockPath = this.fs.join(repoPath, this.config.lockFiles.npm);
    if (!this.fs.exists(lockPath)) return null;

    try {
      const content = this.fs.read(lockPath);
      const packageLock = JSON.parse(content);
      return packageLock.packages?.[`node_modules/${packageName}`]?.version || null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to parse ${this.config.lockFiles.npm}: ${errorMessage}`);
      return null;
    }
  }

  private parseYarnLock(repoPath: string, packageName: string): string | null {
    const lockPath = this.fs.join(repoPath, this.config.lockFiles.yarn);
    if (!this.fs.exists(lockPath)) return null;

    try {
      const content = this.fs.read(lockPath);
      const pattern = new RegExp(`${packageName.replace(/\//g, '\\/')}@.*:\\s+version\\s+"([^"]+)"`);
      const match = content.match(pattern);
      return match?.[1] || null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to parse ${this.config.lockFiles.yarn}: ${errorMessage}`);
      return null;
    }
  }

  private parsePNPMLock(repoPath: string, packageName: string): string | null {
    const lockPath = this.fs.join(repoPath, this.config.lockFiles.pnpm);
    if (!this.fs.exists(lockPath)) return null;

    try {
      const content = this.fs.read(lockPath);
      const pattern = new RegExp(`${packageName.replace(/\//g, '\\/')}:\\s+(\\d+\\.\\d+\\.\\d+)`);
      const match = content.match(pattern);
      return match?.[1] || null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to parse ${this.config.lockFiles.pnpm}: ${errorMessage}`);
      return null;
    }
  }
}
