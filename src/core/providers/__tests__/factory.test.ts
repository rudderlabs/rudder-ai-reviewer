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

import { getOctokit } from '@actions/github';
import { extractGitHubPRContext } from '@core/shared/github';
import { createProviderRuntime, NotPullRequestContextError } from '../factory';

describe('createProviderRuntime', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.INPUT_GITHUB_TOKEN = 'token';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('defaults to github provider', () => {
    const runtime = createProviderRuntime();
    expect(runtime.provider.id).toBe('github');
    expect(runtime.context).toEqual({
      provider: 'github',
      owner: 'owner',
      repo: 'repo',
      number: 42,
    });
    expect(getOctokit).toHaveBeenCalledWith('token');
  });

  it('throws when INPUT_GITHUB_TOKEN is missing', () => {
    process.env.INPUT_GITHUB_TOKEN = '';
    expect(() => createProviderRuntime()).toThrow('INPUT_GITHUB_TOKEN is required');
  });

  it('maps non-PR context errors to NotPullRequestContextError', () => {
    (extractGitHubPRContext as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Not running in pull request context');
    });

    expect(() => createProviderRuntime()).toThrow(NotPullRequestContextError);
  });
});
