import { NodeFileSystem } from '@utils/file-system';
import { CDNScanner } from './cdn/file-scanner';
import { DEFAULT_JS_CONFIG } from './config';
import { JavaScriptSDKDetector } from './javascript-detector';
import { LockFileParser } from './npm/lock-file-parser';
import { PackageReader } from './npm/package-reader';
import type { SDKDetectionResult } from './types';

/**
 * Detect RudderStack SDK installation in a repository
 * Currently supports JavaScript only
 *
 * @param repoPath - Absolute path to the repository root
 * @returns Detection result with installation type, versions, and locations
 */
export async function detectSDK(repoPath: string): Promise<SDKDetectionResult> {
  const fs = new NodeFileSystem();
  const config = DEFAULT_JS_CONFIG;

  const packageReader = new PackageReader(fs, config.npm);
  const lockFileParser = new LockFileParser(fs, config.npm);
  const cdnScanner = new CDNScanner(fs, config.cdn);

  const detector = new JavaScriptSDKDetector(packageReader, lockFileParser, cdnScanner, config);

  return detector.detect(repoPath);
}
