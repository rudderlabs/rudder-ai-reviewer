import type { ChangeRequestContext, SCMProvider } from '@core/providers';
import { PRChangesDetector } from './pr-changes-detector';
import type { PRChangesResult } from './types';

/**
 * Detect PR changes in a GitHub Actions workflow
 *
 * @param githubToken - GitHub token for API authentication
 * @param prContext - GitHub PR context (owner, repo, prNumber)
 * @param rootDirectory - Optional root directory to filter changed files (default: '.')
 */
export async function detectPRChanges(
  provider: SCMProvider,
  prContext: ChangeRequestContext,
  rootDirectory = '.'
): Promise<PRChangesResult> {
  const detector = new PRChangesDetector(provider);

  return detector.detect(prContext, rootDirectory);
}

export type { DiffFile, FileStatus, PRChangesResult } from './types';
export { shouldIncludeFile, SOURCE_FILE_PATTERNS, EXCLUDED_PATH_PATTERNS } from './file-filter';
