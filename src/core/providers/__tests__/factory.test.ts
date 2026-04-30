jest.mock('@actions/github', () => ({
  getOctokit: jest.fn().mockReturnValue({ rest: {}, paginate: jest.fn() }),
}));

jest.mock('@core/shared/github', () => ({
  extractGitHubPRContext: jest.fn().mockReturnValue({
    owner: 'owner',
    repo: 'repo',
    prNumber: 42,
  }),
}));

jest.mock('@core/shared/gitlab', () => ({
  extractGitLabMergeRequestContext: jest.fn().mockReturnValue({
    projectPath: 'group/project',
    mergeRequestIid: 19,
  }),
}));

jest.mock('@clients/gitlab.client', () => ({
  GitLabClient: {
    create: jest.fn().mockReturnValue({ id: 'gitlab' }),
  },
}));

import { getOctokit } from '@actions/github';
import { GitLabClient } from '@clients/gitlab.client';
import { NotPullRequestContextError } from '@core/shared/errors';
import { extractGitHubPRContext } from '@core/shared/github';
import { extractGitLabMergeRequestContext } from '@core/shared/gitlab';
import { createProviderRuntime } from '../factory';

describe('createProviderRuntime', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      INPUT_GITHUB_TOKEN: 'gh-token',
    };
    delete process.env.CI_MERGE_REQUEST_IID;
    delete process.env.CI_PROJECT_PATH;
    delete process.env.CI_JOB_TOKEN;
    delete process.env.INPUT_GITLAB_TOKEN;
    delete process.env.GITLAB_TOKEN;
    delete process.env.INPUT_GITLAB_BASE_URL;
    delete process.env.CI_SERVER_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('defaults to github provider when not in GitLab MR env', () => {
    const runtime = createProviderRuntime();

    expect(runtime.provider.id).toBe('github');
    expect(runtime.context).toEqual({
      provider: 'github',
      owner: 'owner',
      repo: 'repo',
      number: 42,
    });
    expect(getOctokit).toHaveBeenCalledWith('gh-token');
  });

  it('uses GitLab provider when GitLab MR env vars are present', () => {
    process.env.CI_PROJECT_PATH = 'group/subgroup/project';
    process.env.CI_MERGE_REQUEST_IID = '23';
    process.env.INPUT_GITLAB_TOKEN = 'gl-token';
    process.env.INPUT_GITLAB_BASE_URL = 'https://gitlab.example.com';
    (extractGitLabMergeRequestContext as jest.Mock).mockReturnValueOnce({
      projectPath: 'group/subgroup/project',
      mergeRequestIid: 23,
    });

    const runtime = createProviderRuntime();

    expect(extractGitLabMergeRequestContext).toHaveBeenCalled();
    expect(GitLabClient.create).toHaveBeenCalledWith({
      host: 'https://gitlab.example.com',
      token: 'gl-token',
      jobToken: undefined,
    });
    expect(runtime.provider.id).toBe('gitlab');
    expect(runtime.context).toEqual({
      provider: 'gitlab',
      owner: 'group/subgroup',
      repo: 'project',
      number: 23,
    });
  });

  it('uses CI job token when explicit GitLab token is not provided', () => {
    process.env.CI_PROJECT_PATH = 'group/project';
    process.env.CI_MERGE_REQUEST_IID = '23';
    process.env.CI_JOB_TOKEN = 'job-token';

    createProviderRuntime();

    expect(GitLabClient.create).toHaveBeenCalledWith({
      host: 'https://gitlab.com',
      token: undefined,
      jobToken: 'job-token',
    });
  });

  it('throws when GitLab token and CI job token are missing in GitLab MR env', () => {
    process.env.CI_PROJECT_PATH = 'group/project';
    process.env.CI_MERGE_REQUEST_IID = '23';
    process.env.INPUT_GITLAB_TOKEN = '';
    process.env.GITLAB_TOKEN = '';
    process.env.CI_JOB_TOKEN = '';

    expect(() => createProviderRuntime()).toThrow(
      'GitLab token is required (INPUT_GITLAB_TOKEN, GITLAB_TOKEN, or CI_JOB_TOKEN)'
    );
  });

  it('throws when INPUT_GITHUB_TOKEN is missing outside GitLab MR env', () => {
    process.env.INPUT_GITHUB_TOKEN = '';
    expect(() => createProviderRuntime()).toThrow('INPUT_GITHUB_TOKEN is required');
  });

  it('propagates NotPullRequestContextError in github mode', () => {
    (extractGitHubPRContext as jest.Mock).mockImplementationOnce(() => {
      throw new NotPullRequestContextError();
    });

    expect(() => createProviderRuntime()).toThrow(NotPullRequestContextError);
  });
});
