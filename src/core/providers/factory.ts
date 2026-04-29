import { getOctokit } from '@actions/github';
import { GitHubClient } from '@clients/github.client';
import { extractGitHubPRContext } from '@core/shared/github';
import type { ChangeRequestContext, SCMProvider } from './types';

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

  const githubContext = extractGitHubPRContext();
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
