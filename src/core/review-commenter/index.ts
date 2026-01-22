import * as core from '@actions/core';
import { getOctokit } from '@actions/github';
import { GitHubClient } from '@clients/github.client';
import type { GitHubPRContext } from '@core/shared/github/pr-context';
import type { PostReviewOptions, ReviewResponse } from '@custom-types/review.types';
import { COMMENT_MARKER } from '@utils/constants';
import {
  buildInlineCommentsArray,
  formatReviewComment,
  type GitHubContext,
} from './comment-formatter';
import { CommentSplitter } from './comment-splitter';

/**
 * Posts or updates a PR review comment based on review service response
 *
 * @param githubToken - GitHub authentication token
 * @param prContext - GitHub PR context (owner, repo, prNumber)
 * @param reviewResponse - Review response from pr-reviewer service
 * @param options - Options for posting review comments
 */
export async function postReviewComment(
  githubToken: string,
  prContext: GitHubPRContext,
  reviewResponse: ReviewResponse,
  options?: PostReviewOptions
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
      reviewResponse.issues,
      options
    );

    // Generate and post summary comment
    const commentBody = formatReviewComment(
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

    const commentId = await githubClient.findComment(prContext, COMMENT_MARKER);
    if (commentId) {
      await githubClient.updateComment(prContext, commentId, commentBody);
    } else {
      await githubClient.createComment(prContext, commentBody);
    }

    // Build and post inline comments
    const inlineComments = buildInlineCommentsArray(inlineIssues, true);
    await githubClient.createReview(
      prContext,
      inlineComments.map(ic => ({
        path: ic.path,
        line: ic.line,
        body: ic.body,
      })),
      'COMMENT'
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to post review comment: ${message}`);
  }
}

export type * from '@custom-types/review.types';
export { formatReviewComment } from './comment-formatter';
