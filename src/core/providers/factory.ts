import { getOctokit } from '@actions/github';
import { GitHubClient } from '@clients/github.client';
import { GitLabClient } from '@clients/gitlab.client';
import { extractGitHubPRContext } from '@core/shared/github';
import { extractGitLabMergeRequestContext } from '@core/shared/gitlab';
import type { ChangeRequestContext, SCMProvider } from './types';

export interface ProviderRuntime {
  provider: SCMProvider;
  context: ChangeRequestContext;
}

function isGitLabMergeRequestEnvironment(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.CI_MERGE_REQUEST_IID && env.CI_PROJECT_PATH);
}

function parseProjectPath(projectPath: string): { owner: string; repo: string } {
  const segments = projectPath.split('/').filter(Boolean);
  if (segments.length < 2) {
    throw new Error(
      `Invalid GitLab project path "${projectPath}". Expected "<namespace>/<project>"`
    );
  }

  return {
    owner: segments.slice(0, -1).join('/'),
    repo: segments[segments.length - 1],
  };
}

function createGitLabProviderRuntime(): ProviderRuntime {
  const gitlabContext = extractGitLabMergeRequestContext();
  const gitlabToken = process.env.INPUT_GITLAB_TOKEN || '';

  if (!gitlabToken) {
    throw new Error('GitLab token is required (INPUT_GITLAB_TOKEN)');
  }

  const gitlabBaseUrl = process.env.INPUT_GITLAB_BASE_URL || 'https://gitlab.com';

  const provider = GitLabClient.create({
    host: gitlabBaseUrl,
    token: gitlabToken,
  });
  const { owner, repo } = parseProjectPath(gitlabContext.projectPath);
  return { provider, context: { provider: 'gitlab', owner, repo, number: gitlabContext.mergeRequestIid } };
}

function createGitHubProviderRuntime(): ProviderRuntime {
  const githubContext = extractGitHubPRContext();
  const githubToken = process.env.INPUT_GITHUB_TOKEN || '';
  if (!githubToken) {
    throw new Error('INPUT_GITHUB_TOKEN is required');
  }

  const provider = new GitHubClient(getOctokit(githubToken));
  return { provider, context: { provider: 'github', owner: githubContext.owner, repo: githubContext.repo, number: githubContext.prNumber } };
}

export function createProviderRuntime(): ProviderRuntime {
  if (isGitLabMergeRequestEnvironment(process.env)) {
    return createGitLabProviderRuntime();
  }
  return createGitHubProviderRuntime();
}
