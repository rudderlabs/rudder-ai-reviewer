import { LockFileParser } from '@core/shared/npm';
import { NodeFileSystem } from '@utils/file-system';
import { DEFAULT_FRAMEWORK_CONFIG } from './config';
import { FrameworkDetector } from './framework-detector';
import { PackageReader } from './npm/package-reader';
import type { FrameworkDetectionResult } from './types';

/**
 * Detect all frameworks in a repository
 * Currently supports frontend frameworks: React, Next.js, Vue, Nuxt, Angular
 *
 * Priority order:
 * - Meta-frameworks (Next.js, Nuxt) take precedence over base frameworks (React, Vue)
 * - Returns frameworks sorted by priority (highest first)
 *
 * @param repoPath - Absolute path to the repository root
 * @returns Array of detected frameworks with versions, empty array if none detected
 *
 */
export async function detectFrameworks(repoPath: string): Promise<FrameworkDetectionResult[]> {
  const fs = new NodeFileSystem();
  const config = DEFAULT_FRAMEWORK_CONFIG;

  const packageReader = new PackageReader(fs, config.frameworks);
  const lockFileParser = new LockFileParser(fs);

  const detector = new FrameworkDetector(packageReader, lockFileParser);

  return detector.detect(repoPath);
}

export type { FrameworkCategory, FrameworkDetectionResult } from './types';
