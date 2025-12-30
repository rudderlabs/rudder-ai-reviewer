import { LockFileParser } from '@core/framework-detector/npm/lock-file-parser';
import { NodeFileSystem } from '@utils/file-system';
import { DEFAULT_FRAMEWORK_CONFIG } from './config';
import { FrameworkDetector } from './framework-detector';
import { PackageReader } from './npm/package-reader';
import type { FrameworkDetectionResult } from './types';

/**
 * Detect primary framework in a repository
 * Currently supports frontend frameworks: React, Next.js, Vue, Nuxt, Angular
 *
 * Priority order:
 * - Meta-frameworks (Next.js, Nuxt) take precedence over base frameworks (React, Vue)
 * - When multiple frameworks are found, highest priority is returned
 *
 * @param repoPath - Absolute path to the repository root
 * @returns Primary framework with version, or null if none detected
 *
 * @example
 * ```typescript
 * const result = await detectFramework('/path/to/repo');
 * // Result: { name: 'Next.js', version: '14.1.0', category: 'frontend' }
 * ```
 */
export async function detectFramework(repoPath: string): Promise<FrameworkDetectionResult | null> {
  const fs = new NodeFileSystem();
  const config = DEFAULT_FRAMEWORK_CONFIG;

  const packageReader = new PackageReader(fs, config.frameworks);
  const lockFileParser = new LockFileParser(fs, config.npm);

  const detector = new FrameworkDetector(packageReader, lockFileParser);

  return detector.detect(repoPath);
}

export type { FrameworkCategory, FrameworkDetectionResult } from './types';
