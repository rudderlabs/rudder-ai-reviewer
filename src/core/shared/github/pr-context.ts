import { context } from '@actions/github';

export interface GitHubPRContext {
  owner: string;
  repo: string;
  prNumber: number;
}

/**
 * Extracts PR context from GitHub Actions environment
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
