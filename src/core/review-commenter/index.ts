import { getOctokit } from '@actions/github';
import { GitHubClient } from '@clients/github.client';
import type { GitHubPRContext } from '@core/shared/github/pr-context';
import type { ReviewResponse } from '@custom-types/review.types';
import { COMMENT_MARKER } from '@utils/constants';
import { formatReviewComment, type GitHubContext } from './comment-formatter';

/**
 * Posts or updates a PR review comment based on review service response
 *
 * @param githubToken - GitHub authentication token
 * @param prContext - GitHub PR context (owner, repo, prNumber)
 * @param reviewResponse - Review response from pr-reviewer service
 */
export async function postReviewComment(
  githubToken: string,
  prContext: GitHubPRContext,
  reviewResponse: ReviewResponse
): Promise<void> {
  try {
    const octokit = getOctokit(githubToken);
    const githubClient = new GitHubClient(octokit);

    // Get PR metadata including commit SHA for generating permalinks
    const metadata = await githubClient.getPRMetadata(prContext);

    const githubContext: GitHubContext = {
      owner: prContext.owner,
      repo: prContext.repo,
      commitSha: metadata.head_sha,
    };

    const commentBody = formatReviewComment(reviewResponse, githubContext);
    const commentId = await githubClient.findComment(prContext, COMMENT_MARKER);

    if (commentId) {
      await githubClient.updateComment(prContext, commentId, commentBody);
    } else {
      await githubClient.createComment(prContext, commentBody);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to post review comment: ${message}`);
  }
}

export type * from '@custom-types/review.types';
export { formatReviewComment } from './comment-formatter';
