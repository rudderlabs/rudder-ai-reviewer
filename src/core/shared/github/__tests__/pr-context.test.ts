/**
 * Tests for GitHub PR context utilities
 */

import { extractGitHubPRContext } from '../pr-context';

// Mock @actions/github
jest.mock('@actions/github', () => ({
  context: {
    payload: {},
    repo: { owner: '', repo: '' },
  },
}));

// Import after mocking
import { context } from '@actions/github';

describe('extractGitHubPRContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should extract PR context from GitHub Actions environment', () => {
    // Arrange
    (context as any).payload = {
      pull_request: { number: 123 },
    };
    (context as any).repo = {
      owner: 'test-owner',
      repo: 'test-repo',
    };

    // Act
    const result = extractGitHubPRContext();

    // Assert
    expect(result).toEqual({
      owner: 'test-owner',
      repo: 'test-repo',
      prNumber: 123,
    });
  });

  it('should throw when not in PR context', () => {
    // Arrange
    (context as any).payload = {};
    (context as any).repo = {
      owner: 'test-owner',
      repo: 'test-repo',
    };

    // Act & Assert
    expect(() => extractGitHubPRContext()).toThrow('Not running in pull request context');
  });

  it('should throw when pull_request is null', () => {
    // Arrange
    (context as any).payload = {
      pull_request: null,
    };
    (context as any).repo = {
      owner: 'test-owner',
      repo: 'test-repo',
    };

    // Act & Assert
    expect(() => extractGitHubPRContext()).toThrow('Not running in pull request context');
  });
});
