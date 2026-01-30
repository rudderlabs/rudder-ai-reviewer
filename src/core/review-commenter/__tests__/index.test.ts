import type { GitHubPRContext } from '@core/shared/github/pr-context';
import type { ReviewResponse } from '@custom-types/review.types';
import { COMMENT_SUMMARY_MARKER } from '@utils/constants';
import { postAIReviewerComments } from '../index';

jest.mock('@actions/github');
jest.mock('@clients/github.client');
jest.mock('../comment-formatter');
jest.mock('../comment-splitter');

import { getOctokit } from '@actions/github';
import { GitHubClient } from '@clients/github.client';
import { formatInlineComments, formatReviewComment } from '../comment-formatter';
import { CommentSplitter } from '../comment-splitter';

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
    (CommentSplitter as jest.Mock).mockImplementation(() => ({
      getInlineAndSummaryIssues: jest.fn().mockResolvedValue({
        inlineIssues: mockReview.issues,
        summaryIssues: [],
      }),
    }));
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
        findComment: jest.fn().mockResolvedValue(null),
        createComment: jest.fn().mockResolvedValue(123),
        createReview: jest.fn().mockResolvedValue(undefined),
      };
      const formattedComment = `${COMMENT_SUMMARY_MARKER}\n## Review\nContent`;

      (getOctokit as jest.Mock).mockReturnValue(mockOctokit);
      (GitHubClient as jest.Mock).mockImplementation(() => mockGitHubClient);
      (formatReviewComment as jest.Mock).mockReturnValue(formattedComment);

      await postAIReviewerComments('test-token', mockContext, mockReview);

      expect(getOctokit).toHaveBeenCalledWith('test-token');
      expect(GitHubClient).toHaveBeenCalledWith(mockOctokit);
      expect(mockGitHubClient.getPRMetadata).toHaveBeenCalledWith(mockContext);
      expect(mockGitHubClient.findComment).toHaveBeenCalledWith(
        mockContext,
        COMMENT_SUMMARY_MARKER
      );
      expect(mockGitHubClient.createComment).toHaveBeenCalledWith(mockContext, formattedComment);
      expect(mockGitHubClient.createReview).toHaveBeenCalledWith(
        mockContext,
        expect.any(Array),
        'COMMENT',
        'abc123def456'
      );
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
        findComment: jest.fn().mockResolvedValue(existingCommentId),
        updateComment: jest.fn().mockResolvedValue(undefined),
        createReview: jest.fn().mockResolvedValue(undefined),
      };
      const formattedComment = `${COMMENT_SUMMARY_MARKER}\n## Review\nUpdated`;

      (getOctokit as jest.Mock).mockReturnValue(mockOctokit);
      (GitHubClient as jest.Mock).mockImplementation(() => mockGitHubClient);
      (formatReviewComment as jest.Mock).mockReturnValue(formattedComment);

      await postAIReviewerComments('test-token', mockContext, mockReview);

      expect(getOctokit).toHaveBeenCalledWith('test-token');
      expect(GitHubClient).toHaveBeenCalledWith(mockOctokit);
      expect(mockGitHubClient.getPRMetadata).toHaveBeenCalledWith(mockContext);
      expect(mockGitHubClient.findComment).toHaveBeenCalledWith(
        mockContext,
        COMMENT_SUMMARY_MARKER
      );
      expect(mockGitHubClient.updateComment).toHaveBeenCalledWith(
        mockContext,
        existingCommentId,
        formattedComment
      );
      expect(mockGitHubClient.createReview).toHaveBeenCalledWith(
        mockContext,
        expect.any(Array),
        'COMMENT',
        'abc123def456'
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
        findComment: jest.fn(),
        createComment: jest.fn(),
        createReview: jest.fn().mockResolvedValue(undefined),
      };

      (getOctokit as jest.Mock).mockReturnValue(mockOctokit);
      (GitHubClient as jest.Mock).mockImplementation(() => mockGitHubClient);
      (formatReviewComment as jest.Mock).mockImplementation(() => {
        throw new Error('Formatting failed');
      });

      await expect(postAIReviewerComments('test-token', mockContext, mockReview)).rejects.toThrow(
        'Failed to post AI reviewer comments: Formatting failed'
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
        findComment: jest.fn().mockRejectedValue(new Error('API error')),
        createReview: jest.fn().mockResolvedValue(undefined),
      };
      const formattedComment = `${COMMENT_SUMMARY_MARKER}\n## Review\nContent`;

      (getOctokit as jest.Mock).mockReturnValue(mockOctokit);
      (GitHubClient as jest.Mock).mockImplementation(() => mockGitHubClient);
      (formatReviewComment as jest.Mock).mockReturnValue(formattedComment);

      await expect(postAIReviewerComments('test-token', mockContext, mockReview)).rejects.toThrow(
        'Failed to post AI reviewer comments: Failed to post summary comment: API error'
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
        findComment: jest.fn().mockResolvedValue(null),
        createComment: jest.fn().mockRejectedValue(new Error('Rate limit exceeded')),
        createReview: jest.fn().mockResolvedValue(undefined),
      };
      const formattedComment = `${COMMENT_SUMMARY_MARKER}\n## Review\nContent`;

      (getOctokit as jest.Mock).mockReturnValue(mockOctokit);
      (GitHubClient as jest.Mock).mockImplementation(() => mockGitHubClient);
      (formatReviewComment as jest.Mock).mockReturnValue(formattedComment);

      await expect(postAIReviewerComments('test-token', mockContext, mockReview)).rejects.toThrow(
        'Failed to post AI reviewer comments: Failed to post summary comment: Rate limit exceeded'
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
        findComment: jest.fn().mockResolvedValue(existingCommentId),
        updateComment: jest.fn().mockRejectedValue(new Error('Comment not found')),
        createReview: jest.fn().mockResolvedValue(undefined),
      };
      const formattedComment = `${COMMENT_SUMMARY_MARKER}\n## Review\nContent`;

      (getOctokit as jest.Mock).mockReturnValue(mockOctokit);
      (GitHubClient as jest.Mock).mockImplementation(() => mockGitHubClient);
      (formatReviewComment as jest.Mock).mockReturnValue(formattedComment);

      await expect(postAIReviewerComments('test-token', mockContext, mockReview)).rejects.toThrow(
        'Failed to post AI reviewer comments: Failed to post summary comment: Comment not found'
      );
    });

    it('should propagate getPRMetadata errors', async () => {
      const mockOctokit = {};
      const mockGitHubClient = {
        getPRMetadata: jest.fn().mockRejectedValue(new Error('Failed to fetch PR')),
        createReview: jest.fn().mockResolvedValue(undefined),
      };

      (getOctokit as jest.Mock).mockReturnValue(mockOctokit);
      (GitHubClient as jest.Mock).mockImplementation(() => mockGitHubClient);

      await expect(postAIReviewerComments('test-token', mockContext, mockReview)).rejects.toThrow(
        'Failed to post AI reviewer comments: Failed to fetch PR'
      );
    });

    it('should continue if inline review creation fails but summary comment succeeded', async () => {
      const warningSpy = jest.spyOn(require('@actions/core'), 'warning');
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
        findComment: jest.fn().mockResolvedValue(null),
        createComment: jest.fn().mockResolvedValue(123),
        createReview: jest.fn().mockRejectedValue(new Error('Invalid line number')),
      };
      const formattedComment = `${COMMENT_SUMMARY_MARKER}\n## Review\nContent`;

      (getOctokit as jest.Mock).mockReturnValue(mockOctokit);
      (GitHubClient as jest.Mock).mockImplementation(() => mockGitHubClient);
      (formatReviewComment as jest.Mock).mockReturnValue(formattedComment);

      await postAIReviewerComments('test-token', mockContext, mockReview);

      expect(mockGitHubClient.createComment).toHaveBeenCalledWith(mockContext, formattedComment);
      expect(mockGitHubClient.createReview).toHaveBeenCalledWith(
        mockContext,
        expect.any(Array),
        'COMMENT',
        'abc123def456'
      );
      expect(warningSpy).toHaveBeenCalledWith(
        'Failed to post inline comments, but summary comment was successful: Invalid line number'
      );

      warningSpy.mockRestore();
    });

    it('should skip inline comments when no inline issues exist', async () => {
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
        findComment: jest.fn().mockResolvedValue(null),
        createComment: jest.fn().mockResolvedValue(123),
        createReview: jest.fn().mockResolvedValue(undefined),
      };
      const formattedComment = `${COMMENT_SUMMARY_MARKER}\n## Review\nContent`;

      (getOctokit as jest.Mock).mockReturnValue(mockOctokit);
      (GitHubClient as jest.Mock).mockImplementation(() => mockGitHubClient);
      (formatReviewComment as jest.Mock).mockReturnValue(formattedComment);
      (CommentSplitter as jest.Mock).mockImplementation(() => ({
        getInlineAndSummaryIssues: jest.fn().mockResolvedValue({
          inlineIssues: [],
          summaryIssues: mockReview.issues,
        }),
      }));

      await postAIReviewerComments('test-token', mockContext, mockReview);

      expect(mockGitHubClient.createComment).toHaveBeenCalledWith(mockContext, formattedComment);
      expect(mockGitHubClient.createReview).not.toHaveBeenCalled();
    });
  });
});
