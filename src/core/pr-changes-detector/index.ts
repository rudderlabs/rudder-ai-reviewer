import { getOctokit } from '@actions/github';
import type { GitHubPRContext } from '@core/shared/github/pr-context';
import { GitHubClient } from '@clients/github.client';
import { PRChangesDetector } from './pr-changes-detector';
import type { PRChangesResult } from './types';

/**
 * Detect PR changes in a GitHub Actions workflow
 * Fetches changed files, parses patches, and structures diff data
 *
 * @param githubToken - GitHub token for API authentication
 * @param prContext - GitHub PR context (owner, repo, prNumber)
 * @returns Complete PR changes result with metadata and diff context
 *
 * @example
 * ```typescript
 * import { extractGitHubPRContext } from '@core/shared/github/pr-context';
 *
 * const token = core.getInput('github-token', { required: true });
 * const prContext = extractGitHubPRContext();
 * const result = await detectPRChanges(token, prContext);
 * // Result: { pull_request: {...}, diff_context: [...] }
 * ```
 */
export async function detectPRChanges(
  githubToken: string,
  prContext: GitHubPRContext
): Promise<PRChangesResult> {
  const octokit = getOctokit(githubToken);
  const githubClient = new GitHubClient(octokit);
  const detector = new PRChangesDetector(githubClient, prContext);

  return detector.detect();
}

export type { PRChangesResult, DiffFile, FileStatus } from './types';
