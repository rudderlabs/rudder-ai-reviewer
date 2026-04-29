import { context } from '@actions/github';

export interface GitHubPRContext {
  owner: string;
  repo: string;
  prNumber: number;
}

export class NotPullRequestContextError extends Error {
  constructor() {
    super('Not running in pull request context');
    this.name = 'NotPullRequestContextError';
  }
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
