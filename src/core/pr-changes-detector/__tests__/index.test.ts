import type { GitHubPRContext } from '@core/shared/github/pr-context';
import { detectPRChanges } from '../index';

jest.mock('@actions/github', () => ({
  getOctokit: jest.fn(),
}));

jest.mock('@clients/github.client');
jest.mock('../pr-changes-detector');

import { getOctokit } from '@actions/github';
import { GitHubClient } from '@clients/github.client';
import { PRChangesDetector } from '../pr-changes-detector';

describe('detectPRChanges', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create detector with proper dependencies and return result', async () => {
    const prContext: GitHubPRContext = {
      owner: 'test-owner',
      repo: 'test-repo',
      prNumber: 123,
    };

    const mockResult = {
      pull_request: {
        number: 123,
        title: 'Test PR',
        head_sha: 'abc123',
        base_sha: 'def456',
        head_ref: 'feature',
        base_ref: 'main',
        files_changed_count: 1,
        lines_added: 10,
        lines_deleted: 5,
        lines_changed: 15,
      },
      diff_context: [],
    };

    const mockOctokit = { rest: {}, paginate: jest.fn() };
    (getOctokit as jest.Mock).mockReturnValue(mockOctokit);

    const mockDetector = {
      detect: jest.fn().mockResolvedValue(mockResult),
    };
    (PRChangesDetector as jest.Mock).mockImplementation(() => mockDetector);

    const result = await detectPRChanges('test-token', prContext);

    expect(getOctokit).toHaveBeenCalledWith('test-token');
    expect(GitHubClient).toHaveBeenCalledWith(mockOctokit);
    expect(PRChangesDetector).toHaveBeenCalledWith(expect.any(Object));
    expect(mockDetector.detect).toHaveBeenCalledWith(prContext, '.');
    expect(result).toEqual(mockResult);
  });
});
