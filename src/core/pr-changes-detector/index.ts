import { getOctokit } from '@actions/github';
import { GitHubClient } from '@clients/github.client';
import type { GitHubPRContext } from '@core/shared/github/pr-context';
import { PRChangesDetector } from './pr-changes-detector';
import type { PRChangesResult } from './types';

/**
 * Detect PR changes in a GitHub Actions workflow
 *
 * @param githubToken - GitHub token for API authentication
 * @param prContext - GitHub PR context (owner, repo, prNumber)
 */
export async function detectPRChanges(
  githubToken: string,
  prContext: GitHubPRContext
): Promise<PRChangesResult> {
  const octokit = getOctokit(githubToken);
  const githubClient = new GitHubClient(octokit);
  const detector = new PRChangesDetector(githubClient);

  return detector.detect(prContext);
}

export type { DiffFile, FileStatus, PRChangesResult } from './types';
