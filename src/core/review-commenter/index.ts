import * as core from '@actions/core';
import type { ChangeRequestContext, ProviderPRMetadata, SCMProvider } from '@core/providers';
import type { ReviewIssue, ReviewResponse } from '@custom-types/review.types';
import { COMMENT_SUMMARY_MARKER } from '@utils/constants';
import {
  formatInlineComments,
  formatReviewComment as formatSummaryComment,
  type CommentFormatterContext,
} from './comment-formatter';
import { CommentSplitter } from './comment-splitter';

/**
 * Posts AI reviewer comments on a PR
 *
 * @param provider - SCM provider
 * @param prContext - Change request context (provider, owner, repo, prNumber)
 * @param reviewResponse - Review response from pr-reviewer service
 */
export async function postAIReviewerComments(
  provider: SCMProvider,
  prContext: ChangeRequestContext,
  reviewResponse: ReviewResponse
): Promise<void> {
  try {
    if (reviewResponse.summary.verdict === 'no_comment') {
      core.info('No comment needed for this PR');
      return;
    }

    if (provider.id !== prContext.provider) {
      throw new Error(
        `Provider mismatch: provider '${provider.id}' cannot handle context '${prContext.provider}'`
      );
    }

    const metadata = await provider.getChangeRequestMetadata(prContext);
    const commentSplitter = new CommentSplitter(provider);

    const formatterContext: CommentFormatterContext = {
      buildLineUrl: (file, line, column) =>
        provider.buildLineUrl(prContext, metadata.head_sha, file, line, column),
    };

    const { inlineIssues, summaryIssues } = await commentSplitter.getInlineAndSummaryIssues(
      prContext,
      reviewResponse.issues
    );

    await postSummaryComment(provider, prContext, reviewResponse, summaryIssues, formatterContext);
    await postInlineComments(provider, prContext, inlineIssues, metadata);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to post AI reviewer comments: ${message}`);
  }
}

async function postSummaryComment(
  provider: SCMProvider,
  prContext: ChangeRequestContext,
  reviewResponse: ReviewResponse,
  summaryIssues: ReviewIssue[],
  formatterContext: CommentFormatterContext
): Promise<void> {
  const summaryCommentBody = formatSummaryComment(
    {
      reviewId: reviewResponse.reviewId,
      sdk: reviewResponse.sdk,
      summary: reviewResponse.summary,
      events: reviewResponse.events,
      issues: summaryIssues,
      stats: reviewResponse.stats,
    },
    formatterContext
  );
  try {
    const commentId = await provider.findSummaryComment(prContext, COMMENT_SUMMARY_MARKER);
    if (commentId) {
      await provider.updateSummaryComment(prContext, commentId, summaryCommentBody);
    } else {
      await provider.createSummaryComment(prContext, summaryCommentBody);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to post summary comment: ${message}`);
  }
}

async function postInlineComments(
  provider: SCMProvider,
  prContext: ChangeRequestContext,
  inlineIssues: ReviewIssue[],
  metadata: ProviderPRMetadata
): Promise<void> {
  if (inlineIssues.length > 0) {
    try {
      const inlineComments = formatInlineComments(inlineIssues);
      await provider.createInlineReview(prContext, inlineComments, metadata.head_sha);
      core.info(`Successfully posted ${inlineComments.length} inline comment(s)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      core.warning(
        `Failed to post inline comments, but summary comment was successful: ${message}`
      );
    }
  } else {
    core.info('No inline comments to post');
  }
}

export type * from '@custom-types/review.types';
export { formatReviewComment } from './comment-formatter';
