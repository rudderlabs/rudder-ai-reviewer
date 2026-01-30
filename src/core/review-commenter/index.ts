import * as core from '@actions/core';
import { getOctokit } from '@actions/github';
import { GitHubClient } from '@clients/github.client';
import type { GitHubPRContext } from '@core/shared/github/pr-context';
import { GitHubPRMetadata } from '@custom-types/github.types';
import type { ReviewIssue, ReviewResponse } from '@custom-types/review.types';
import { COMMENT_SUMMARY_MARKER } from '@utils/constants';
import {
  formatInlineComments,
  formatReviewComment as formatSummaryComment,
  type GitHubContext,
} from './comment-formatter';
import { CommentSplitter } from './comment-splitter';

/**
 * Posts AI reviewer comments on a PR
 *
 * @param githubToken - GitHub authentication token
 * @param prContext - GitHub PR context (owner, repo, prNumber)
 * @param reviewResponse - Review response from pr-reviewer service
 */
export async function postAIReviewerComments(
  githubToken: string,
  prContext: GitHubPRContext,
  reviewResponse: ReviewResponse
): Promise<void> {
  try {
    if (reviewResponse.summary.verdict === 'no_comment') {
      core.info('No comment needed for this PR');
      return;
    }

    const octokit = getOctokit(githubToken);
    const githubClient = new GitHubClient(octokit);
    const metadata = await githubClient.getPRMetadata(prContext);
    const commentSplitter = new CommentSplitter(githubClient);

    const githubContext: GitHubContext = {
      owner: prContext.owner,
      repo: prContext.repo,
      commitSha: metadata.head_sha,
    };

    const { inlineIssues, summaryIssues } = await commentSplitter.getInlineAndSummaryIssues(
      prContext,
      reviewResponse.issues
    );

    await postSummaryComment(githubClient, prContext, reviewResponse, summaryIssues, githubContext);
    await postInlineComments(githubClient, prContext, inlineIssues, metadata);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to post AI reviewer comments: ${message}`);
  }
}

async function postSummaryComment(
  githubClient: GitHubClient,
  prContext: GitHubPRContext,
  reviewResponse: ReviewResponse,
  summaryIssues: ReviewIssue[],
  githubContext: GitHubContext
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
    githubContext
  );
  try {
    const commentId = await githubClient.findComment(prContext, COMMENT_SUMMARY_MARKER);
    if (commentId) {
      await githubClient.updateComment(prContext, commentId, summaryCommentBody);
    } else {
      await githubClient.createComment(prContext, summaryCommentBody);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to post summary comment: ${message}`);
  }
}

async function postInlineComments(
  githubClient: GitHubClient,
  prContext: GitHubPRContext,
  inlineIssues: ReviewIssue[],
  metadata: GitHubPRMetadata
): Promise<void> {
  if (inlineIssues.length > 0) {
    try {
      const inlineComments = formatInlineComments(inlineIssues);
      await githubClient.createReview(prContext, inlineComments, 'COMMENT', metadata.head_sha);
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
