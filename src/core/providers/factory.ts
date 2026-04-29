import { getOctokit } from '@actions/github';
import { GitHubClient } from '@clients/github.client';
import { extractGitHubPRContext } from '@core/shared/github';
import type { ChangeRequestContext, SCMProvider } from './types';

export class NotPullRequestContextError extends Error {
  constructor() {
    super('Not running in pull request context');
    this.name = 'NotPullRequestContextError';
  }
}

export interface ProviderRuntime {
  provider: SCMProvider;
  context: ChangeRequestContext;
}

export function createProviderRuntime(): ProviderRuntime {
  // for now we only support github
  const githubToken = process.env.INPUT_GITHUB_TOKEN || '';
  if (!githubToken) {
    throw new Error('INPUT_GITHUB_TOKEN is required');
  }

  let githubContext;
  try {
    githubContext = extractGitHubPRContext();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'Not running in pull request context') {
      throw new NotPullRequestContextError();
    }
    throw error;
  }
  const provider = new GitHubClient(getOctokit(githubToken));

  return {
    provider,
    context: {
      provider: 'github',
      owner: githubContext.owner,
      repo: githubContext.repo,
      number: githubContext.prNumber,
    },
  };
}
