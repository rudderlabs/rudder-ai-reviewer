import type { ChangeRequestContext, SCMProvider } from '@core/providers';
import type { ReviewResponse } from '@custom-types/review.types';
import { COMMENT_SUMMARY_MARKER } from '@utils/constants';
import { postAIReviewerComments } from '../index';
import { formatInlineComments, formatReviewComment } from '../comment-formatter';
import { CommentSplitter } from '../comment-splitter';

jest.mock('../comment-formatter');
jest.mock('../comment-splitter');

describe('review-commenter', () => {
  const mockContext: ChangeRequestContext = {
    provider: 'github',
    owner: 'test-owner',
    repo: 'test-repo',
    number: 123,
  };

  const mockReview: ReviewResponse = {
    reviewId: 'rev_test',
    sdk: { name: 'rudderstack-javascript-sdk', version: '3.0.0', installationType: 'npm' },
    summary: {
      overallAssessment: 'Review completed.',
      filesAnalyzed: 5,
      totalIssues: 1,
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
    stats: { errors: 0, warnings: 1, suggestions: 0, eventsAdded: 0, eventsModified: 0 },
  };

  const baseProvider = (id: 'github' | 'gitlab' = 'github') =>
    ({
      id,
      getChangeRequestMetadata: jest.fn().mockResolvedValue({
        number: 123,
        title: 'Test PR',
        head_sha: 'abc123def456',
        base_sha: 'base456',
        head_ref: 'feature',
        base_ref: 'main',
      }),
      getChangedFilesMap: jest.fn(),
      getChangedFiles: jest.fn(),
      getRepositoryMetadata: jest.fn(),
      findInlineComments: jest.fn(),
      findSummaryComment: jest.fn().mockResolvedValue(null),
      createSummaryComment: jest.fn().mockResolvedValue(123),
      updateSummaryComment: jest.fn(),
      createInlineReview: jest.fn().mockResolvedValue(1),
      buildLineUrl: jest.fn().mockReturnValue('https://example.com/test'),
    }) as unknown as jest.Mocked<SCMProvider>;

  beforeEach(() => {
    jest.clearAllMocks();
    (formatInlineComments as jest.Mock).mockReturnValue([
      { path: 'test.ts', line: 10, body: 'inline', side: 'RIGHT' },
    ]);
    (formatReviewComment as jest.Mock).mockReturnValue(`${COMMENT_SUMMARY_MARKER}\nsummary`);
    (CommentSplitter as jest.Mock).mockImplementation(() => ({
      getInlineAndSummaryIssues: jest
        .fn()
        .mockResolvedValue({ inlineIssues: mockReview.issues, summaryIssues: [] }),
    }));
  });

  it('creates summary and inline comments', async () => {
    const provider = baseProvider();
    await postAIReviewerComments(provider, mockContext, mockReview);

    expect(provider.findSummaryComment).toHaveBeenCalledWith(mockContext, COMMENT_SUMMARY_MARKER);
    expect(provider.createSummaryComment).toHaveBeenCalled();
    expect(provider.createInlineReview).toHaveBeenCalledWith(
      mockContext,
      expect.any(Array),
      'abc123def456'
    );
  });

  it('updates summary comment when existing comment is found', async () => {
    const provider = baseProvider();
    provider.findSummaryComment.mockResolvedValue(456);

    await postAIReviewerComments(provider, mockContext, mockReview);

    expect(provider.updateSummaryComment).toHaveBeenCalledWith(
      mockContext,
      456,
      expect.any(String)
    );
    expect(provider.createSummaryComment).not.toHaveBeenCalled();
  });

  it('does not call provider APIs when verdict is no_comment', async () => {
    const provider = baseProvider();
    const noCommentReview: ReviewResponse = {
      ...mockReview,
      summary: { ...mockReview.summary, verdict: 'no_comment' },
    };

    await postAIReviewerComments(provider, mockContext, noCommentReview);

    expect(provider.getChangeRequestMetadata).not.toHaveBeenCalled();
    expect(provider.findSummaryComment).not.toHaveBeenCalled();
    expect(provider.createInlineReview).not.toHaveBeenCalled();
  });

  it('does not throw when inline review fails after summary succeeds', async () => {
    const provider = baseProvider();
    provider.createInlineReview.mockRejectedValue(new Error('Invalid line number'));

    await expect(
      postAIReviewerComments(provider, mockContext, mockReview)
    ).resolves.toBeUndefined();
    expect(provider.createSummaryComment).toHaveBeenCalled();
    expect(provider.createInlineReview).toHaveBeenCalled();
  });

  it('fails fast on provider/context mismatch', async () => {
    const provider = baseProvider('gitlab');

    await expect(postAIReviewerComments(provider, mockContext, mockReview)).rejects.toThrow(
      "Failed to post AI reviewer comments: Provider mismatch: provider 'gitlab' cannot handle context 'github'"
    );
    expect(provider.getChangeRequestMetadata).not.toHaveBeenCalled();
  });
});
