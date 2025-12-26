/**
 * GitHub PR context utilities for GitHub Actions
 */

import { context } from '@actions/github';

/**
 * GitHub PR context information
 */
export interface GitHubPRContext {
  owner: string;
  repo: string;
  prNumber: number;
}

/**
 * Extracts PR context from GitHub Actions environment
 * Throws if not running in PR context
 *
 * @returns GitHub PR context with owner, repo, and PR number
 * @throws Error if not running in a pull request context
 *
 * @example
 * ```typescript
 * const prContext = extractGitHubPRContext();
 * // { owner: 'user', repo: 'my-repo', prNumber: 123 }
 * ```
 */
export function extractGitHubPRContext(): GitHubPRContext {
  const { payload, repo } = context;

  if (!payload.pull_request) {
    throw new Error('Not running in pull request context');
  }

  return {
    owner: repo.owner,
    repo: repo.repo,
    prNumber: payload.pull_request.number,
  };
}
