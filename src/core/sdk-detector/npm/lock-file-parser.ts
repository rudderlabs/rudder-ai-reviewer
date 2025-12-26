/**
 * Parse lock files to get exact installed SDK versions
 * Wrapper around shared LockFileParser for SDK-specific usage
 */

import type { FileSystem } from '@custom-types/file.type';
import { LockFileParser as SharedLockFileParser } from '@core/shared/npm/lock-file-parser';
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
  getVersion(repoPath: string): string | null {
    return this.parser.getVersion(repoPath, this.config.packageName);
  }
}
