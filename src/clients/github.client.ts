import type { getOctokit } from '@actions/github';
import { FileStatus } from '@core/pr-changes-detector';
import type { GitHubPRContext } from '@core/shared/github';

export class GitHubClient {
  constructor(private readonly octokit: ReturnType<typeof getOctokit>) {}

  /**
   * Fetches all changed files from PR with automatic pagination
   *
   * @param context - GitHub PR context (owner, repo, prNumber)
   */
  async getChangedFiles(context: GitHubPRContext): Promise<
    Array<{
      filename: string;
      status: FileStatus;
      additions: number;
      deletions: number;
      patch?: string;
    }>
  > {
    const { owner, repo, prNumber } = context;

    // Use octokit.paginate for automatic pagination
    // This handles PRs with >100 files by fetching all pages
    const files = await this.octokit.paginate(this.octokit.rest.pulls.listFiles, {
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });

    return files;
  }

  /**
   * Fetches PR metadata (title, refs, SHAs)
   *
   * @param context - GitHub PR context (owner, repo, prNumber)
   */
  async getPRMetadata(context: GitHubPRContext): Promise<{
    number: number;
    title: string;
    head_sha: string;
    base_sha: string;
    head_ref: string;
    base_ref: string;
  }> {
    const { owner, repo, prNumber } = context;

    const { data: pr } = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    return {
      number: pr.number,
      title: pr.title,
      head_sha: pr.head.sha,
      base_sha: pr.base.sha,
      head_ref: pr.head.ref,
      base_ref: pr.base.ref,
    };
  }

  /**
   * Finds existing PR review comment by magic marker
   *
   * @param context - GitHub PR context (owner, repo, prNumber)
   * @returns Comment ID if found, null otherwise
   */
  async findComment(context: GitHubPRContext, marker: string): Promise<number | null> {
    const { owner, repo, prNumber } = context;

    try {
      const comments = await this.octokit.paginate(this.octokit.rest.issues.listComments, {
        owner,
        repo,
        issue_number: prNumber,
        per_page: 100,
      });

      const existingComment = comments.find(c => c.body?.includes(marker));
      return existingComment?.id ?? null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to find review comment: ${message}`);
    }
  }

  /**
   * Creates a new PR review comment
   *
   * @param context - GitHub PR context (owner, repo, prNumber)
   * @param body - Markdown comment body (should include magic marker)
   * @returns Comment ID
   */
  async createComment(context: GitHubPRContext, body: string): Promise<number> {
    const { owner, repo, prNumber } = context;

    try {
      const { data } = await this.octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body,
      });

      return data.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to create review comment: ${message}`);
    }
  }

  /**
   * Updates an existing PR review comment
   *
   * @param context - GitHub PR context (owner, repo, prNumber)
   * @param commentId - ID of comment to update
   * @param body - New markdown body (should include magic marker)
   */
  async updateComment(context: GitHubPRContext, commentId: number, body: string): Promise<void> {
    const { owner, repo } = context;

    try {
      await this.octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: commentId,
        body,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to update review comment: ${message}`);
    }
  }
}
