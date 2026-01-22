import type { GitHubPRContext } from '@core/shared/github/pr-context';
import type { ReviewResponse } from '@custom-types/review.types';
import { COMMENT_SUMMARY_MARKER } from '@utils/constants';
import { postReviewComment } from '../index';

jest.mock('@actions/github');
jest.mock('@clients/github.client');
jest.mock('../comment-formatter');

import { getOctokit } from '@actions/github';
import { GitHubClient } from '@clients/github.client';
import { formatInlineComments, formatReviewComment } from '../comment-formatter';

describe('review-commenter', () => {
  const mockContext: GitHubPRContext = {
    owner: 'test-owner',
    repo: 'test-repo',
    prNumber: 123,
  };

  const mockReview: ReviewResponse = {
    reviewId: 'rev_test',
    sdk: {
      name: 'rudderstack-javascript-sdk',
      version: '3.0.0',
      installationType: 'npm',
    },
    summary: {
      overallAssessment: 'Review completed.',
      filesAnalyzed: 5,
      totalIssues: 2,
      verdict: 'comment',
    },
    events: [],
    issues: [
      {
        id: 'RS_JS_001',
        severity: 'warning',
        category: 'best_practice',
        message: 'Test issue',
        file: 'test.ts',
        line: 10,
        impact: 'Minor impact',
        relatedEvents: [],
      },
    ],
    stats: {
      errors: 0,
      warnings: 1,
      suggestions: 1,
      eventsAdded: 0,
      eventsModified: 0,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (formatInlineComments as jest.Mock).mockImplementation(issues =>
      issues.map((issue: any) => ({
        path: issue.file,
        line: issue.line,
        body: `Mock inline comment for ${issue.id}`,
        issueId: issue.id,
      }))
    );
  });

  describe('postReviewComment', () => {
    it('should create new comment when none exists', async () => {
      const mockOctokit = {};
      const mockGitHubClient = {
        getPRMetadata: jest.fn().mockResolvedValue({
          number: 123,
          title: 'Test PR',
          head_sha: 'abc123def456',
          base_sha: 'base456',
          head_ref: 'feature',
          base_ref: 'main',
        }),
        getChangedFilesMap: jest.fn().mockResolvedValue(new Map()),
        findComment: jest.fn().mockResolvedValue(null),
        createComment: jest.fn().mockResolvedValue(123),
        createReview: jest.fn().mockResolvedValue(undefined),
      };
      const formattedComment = `${COMMENT_SUMMARY_MARKER}\n## Review\nContent`;

      (getOctokit as jest.Mock).mockReturnValue(mockOctokit);
      (GitHubClient as jest.Mock).mockImplementation(() => mockGitHubClient);
      (formatReviewComment as jest.Mock).mockReturnValue(formattedComment);

      await postReviewComment('test-token', mockContext, mockReview);

      expect(getOctokit).toHaveBeenCalledWith('test-token');
      expect(GitHubClient).toHaveBeenCalledWith(mockOctokit);
      expect(mockGitHubClient.getPRMetadata).toHaveBeenCalledWith(mockContext);
      expect(mockGitHubClient.getChangedFilesMap).toHaveBeenCalledWith(mockContext);
      expect(mockGitHubClient.findComment).toHaveBeenCalledWith(
        mockContext,
        COMMENT_SUMMARY_MARKER
      );
      expect(mockGitHubClient.createComment).toHaveBeenCalledWith(mockContext, formattedComment);
    });

    it('should update existing comment when one exists', async () => {
      const mockOctokit = {};
      const existingCommentId = 456;
      const mockGitHubClient = {
        getPRMetadata: jest.fn().mockResolvedValue({
          number: 123,
          title: 'Test PR',
          head_sha: 'abc123def456',
          base_sha: 'base456',
          head_ref: 'feature',
          base_ref: 'main',
        }),
        getChangedFilesMap: jest.fn().mockResolvedValue(new Map()),
        findComment: jest.fn().mockResolvedValue(existingCommentId),
        updateComment: jest.fn().mockResolvedValue(undefined),
        createReview: jest.fn().mockResolvedValue(undefined),
      };
      const formattedComment = `${COMMENT_SUMMARY_MARKER}\n## Review\nUpdated`;

      (getOctokit as jest.Mock).mockReturnValue(mockOctokit);
      (GitHubClient as jest.Mock).mockImplementation(() => mockGitHubClient);
      (formatReviewComment as jest.Mock).mockReturnValue(formattedComment);

      await postReviewComment('test-token', mockContext, mockReview);

      expect(getOctokit).toHaveBeenCalledWith('test-token');
      expect(GitHubClient).toHaveBeenCalledWith(mockOctokit);
      expect(mockGitHubClient.getPRMetadata).toHaveBeenCalledWith(mockContext);
      expect(mockGitHubClient.getChangedFilesMap).toHaveBeenCalledWith(mockContext);
      expect(mockGitHubClient.findComment).toHaveBeenCalledWith(
        mockContext,
        COMMENT_SUMMARY_MARKER
      );
      expect(mockGitHubClient.updateComment).toHaveBeenCalledWith(
        mockContext,
        existingCommentId,
        formattedComment
      );
    });

    it('should propagate formatting errors', async () => {
      const mockOctokit = {};
      const mockGitHubClient = {
        getPRMetadata: jest.fn().mockResolvedValue({
          number: 123,
          title: 'Test PR',
          head_sha: 'abc123def456',
          base_sha: 'base456',
          head_ref: 'feature',
          base_ref: 'main',
        }),
        getChangedFilesMap: jest.fn().mockResolvedValue(new Map()),
        findComment: jest.fn(),
        createComment: jest.fn(),
        createReview: jest.fn().mockResolvedValue(undefined),
      };

      (getOctokit as jest.Mock).mockReturnValue(mockOctokit);
      (GitHubClient as jest.Mock).mockImplementation(() => mockGitHubClient);
      (formatReviewComment as jest.Mock).mockImplementation(() => {
        throw new Error('Formatting failed');
      });

      await expect(postReviewComment('test-token', mockContext, mockReview)).rejects.toThrow(
        'Failed to post review comment: Formatting failed'
      );
    });

    it('should propagate findComment errors', async () => {
      const mockOctokit = {};
      const mockGitHubClient = {
        getPRMetadata: jest.fn().mockResolvedValue({
          number: 123,
          title: 'Test PR',
          head_sha: 'abc123def456',
          base_sha: 'base456',
          head_ref: 'feature',
          base_ref: 'main',
        }),
        getChangedFilesMap: jest.fn().mockResolvedValue(new Map()),
        findComment: jest.fn().mockRejectedValue(new Error('API error')),
        createReview: jest.fn().mockResolvedValue(undefined),
      };
      const formattedComment = `${COMMENT_SUMMARY_MARKER}\n## Review\nContent`;

      (getOctokit as jest.Mock).mockReturnValue(mockOctokit);
      (GitHubClient as jest.Mock).mockImplementation(() => mockGitHubClient);
      (formatReviewComment as jest.Mock).mockReturnValue(formattedComment);

      await expect(postReviewComment('test-token', mockContext, mockReview)).rejects.toThrow(
        'Failed to post review comment: API error'
      );
    });

    it('should propagate createComment errors', async () => {
      const mockOctokit = {};
      const mockGitHubClient = {
        getPRMetadata: jest.fn().mockResolvedValue({
          number: 123,
          title: 'Test PR',
          head_sha: 'abc123def456',
          base_sha: 'base456',
          head_ref: 'feature',
          base_ref: 'main',
        }),
        getChangedFilesMap: jest.fn().mockResolvedValue(new Map()),
        findComment: jest.fn().mockResolvedValue(null),
        createComment: jest.fn().mockRejectedValue(new Error('Rate limit exceeded')),
        createReview: jest.fn().mockResolvedValue(undefined),
      };
      const formattedComment = `${COMMENT_SUMMARY_MARKER}\n## Review\nContent`;

      (getOctokit as jest.Mock).mockReturnValue(mockOctokit);
      (GitHubClient as jest.Mock).mockImplementation(() => mockGitHubClient);
      (formatReviewComment as jest.Mock).mockReturnValue(formattedComment);

      await expect(postReviewComment('test-token', mockContext, mockReview)).rejects.toThrow(
        'Failed to post review comment: Rate limit exceeded'
      );
    });

    it('should propagate updateComment errors', async () => {
      const mockOctokit = {};
      const existingCommentId = 456;
      const mockGitHubClient = {
        getPRMetadata: jest.fn().mockResolvedValue({
          number: 123,
          title: 'Test PR',
          head_sha: 'abc123def456',
          base_sha: 'base456',
          head_ref: 'feature',
          base_ref: 'main',
        }),
        getChangedFilesMap: jest.fn().mockResolvedValue(new Map()),
        findComment: jest.fn().mockResolvedValue(existingCommentId),
        updateComment: jest.fn().mockRejectedValue(new Error('Comment not found')),
        createReview: jest.fn().mockResolvedValue(undefined),
      };
      const formattedComment = `${COMMENT_SUMMARY_MARKER}\n## Review\nContent`;

      (getOctokit as jest.Mock).mockReturnValue(mockOctokit);
      (GitHubClient as jest.Mock).mockImplementation(() => mockGitHubClient);
      (formatReviewComment as jest.Mock).mockReturnValue(formattedComment);

      await expect(postReviewComment('test-token', mockContext, mockReview)).rejects.toThrow(
        'Failed to post review comment: Comment not found'
      );
    });

    it('should propagate getPRMetadata errors', async () => {
      const mockOctokit = {};
      const mockGitHubClient = {
        getPRMetadata: jest.fn().mockRejectedValue(new Error('Failed to fetch PR')),
        getChangedFilesMap: jest.fn(),
        createReview: jest.fn().mockResolvedValue(undefined),
      };

      (getOctokit as jest.Mock).mockReturnValue(mockOctokit);
      (GitHubClient as jest.Mock).mockImplementation(() => mockGitHubClient);

      await expect(postReviewComment('test-token', mockContext, mockReview)).rejects.toThrow(
        'Failed to post review comment: Failed to fetch PR'
      );
    });
  });
});
