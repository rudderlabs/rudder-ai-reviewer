import { LockFileParser, PackageReader } from '@core/shared/npm';
import { NodeFileSystem } from '@utils/file-system';
import { DEFAULT_FRAMEWORK_CONFIG } from './config';
import { FrameworkDetector } from './framework-detector';
import type { FrameworkDetectionResult } from './types';

/**
 * Detect all frameworks in a repository
 * Currently supports frontend frameworks: React, Next.js, Vue, Nuxt, Angular
 *
 * Returns frameworks in config order
 *
 * @param repoPath - Absolute path to the repository root
 * @returns Array of detected frameworks with versions, empty array if none detected
 *
 */
export async function detectFrameworks(repoPath: string): Promise<FrameworkDetectionResult[]> {
  const fs = new NodeFileSystem();
  const config = DEFAULT_FRAMEWORK_CONFIG;

  const packageReader = new PackageReader(fs);
  const lockFileParser = new LockFileParser(fs);

  const detector = new FrameworkDetector(packageReader, lockFileParser);

  return detector.detect(repoPath, config.frameworks);
}

export type { FrameworkCategory, FrameworkDetectionResult } from './types';
