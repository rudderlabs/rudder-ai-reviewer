jest.mock('@actions/github', () => ({
  getOctokit: jest.fn().mockReturnValue({ rest: {}, paginate: jest.fn() }),
}));

jest.mock('@core/shared/github', () => ({
  extractGitHubPRContext: jest.fn().mockReturnValue({
    owner: 'owner',
    repo: 'repo',
    prNumber: 42,
  }),
  NotPullRequestContextError: class MockNotPullRequestContextError extends Error {
    constructor() {
      super('Not running in pull request context');
      this.name = 'NotPullRequestContextError';
    }
  },
}));

import { getOctokit } from '@actions/github';
import { extractGitHubPRContext, NotPullRequestContextError } from '@core/shared/github';
import { createProviderRuntime } from '../factory';

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

  it('propagates non-PR context errors as NotPullRequestContextError', () => {
    (extractGitHubPRContext as jest.Mock).mockImplementationOnce(() => {
      throw new NotPullRequestContextError();
    });

    expect(() => createProviderRuntime()).toThrow(NotPullRequestContextError);
  });
});
