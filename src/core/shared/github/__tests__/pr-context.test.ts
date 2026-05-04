import { extractGitHubPRContext, NotPullRequestContextError } from '../pr-context';

jest.mock('@actions/github', () => ({
  context: {
    payload: {},
    repo: { owner: '', repo: '' },
  },
}));

import { context } from '@actions/github';

describe('extractGitHubPRContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should extract PR context from GitHub Actions environment', () => {
    (context as any).payload = {
      pull_request: { number: 123 },
    };
    (context as any).repo = {
      owner: 'test-owner',
      repo: 'test-repo',
    };

    const result = extractGitHubPRContext();

    expect(result).toEqual({
      owner: 'test-owner',
      repo: 'test-repo',
      prNumber: 123,
    });
  });

  it('should throw when not in PR context', () => {
    (context as any).payload = {};
    (context as any).repo = {
      owner: 'test-owner',
      repo: 'test-repo',
    };

    expect(() => extractGitHubPRContext()).toThrow(NotPullRequestContextError);
  });

  it('should throw when pull_request is null', () => {
    (context as any).payload = {
      pull_request: null,
    };
    (context as any).repo = {
      owner: 'test-owner',
      repo: 'test-repo',
    };

    expect(() => extractGitHubPRContext()).toThrow(NotPullRequestContextError);
  });
});
