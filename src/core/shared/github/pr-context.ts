import { context } from '@actions/github';
import { NotPullRequestContextError } from '@core/shared/errors';

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
    throw new NotPullRequestContextError();
  }

  return {
    owner: repo.owner,
    repo: repo.repo,
    prNumber: payload.pull_request.number,
  };
}
