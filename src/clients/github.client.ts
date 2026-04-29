import * as core from '@actions/core';
import type { getOctokit } from '@actions/github';
import type {
  ChangeRequestContext,
  ProviderCommentReference,
  ProviderInlineComment,
  ProviderPRMetadata,
  ProviderRepositoryMetadata,
  SCMProvider,
} from '@core/providers';
import type { GitHubPRContext } from '@core/shared/github';
import { GitHubPRMetadata } from '@custom-types/github.types';
import type { InlineComment } from '@custom-types/review.types';

export class GitHubClient implements SCMProvider {
  readonly id = 'github' as const;

  constructor(private readonly octokit: ReturnType<typeof getOctokit>) {}

  private toGitHubPRContext(context: ChangeRequestContext | GitHubPRContext): GitHubPRContext {
    if ('prNumber' in context) {
      return context;
    }
    return {
      owner: context.owner,
      repo: context.repo,
      prNumber: context.number,
    };
  }

  /**
   * Fetches repository metadata (visibility, languages, primary language)
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   */
  async getRepositoryMetadata(ctx: ChangeRequestContext): Promise<ProviderRepositoryMetadata>;
  async getRepositoryMetadata(
    owner: string,
    repo: string
  ): Promise<ProviderRepositoryMetadata>;
  async getRepositoryMetadata(
    ownerOrContext: string | ChangeRequestContext,
    repo?: string
  ): Promise<ProviderRepositoryMetadata> {
    const owner = typeof ownerOrContext === 'string' ? ownerOrContext : ownerOrContext.owner;
    const resolvedRepo = typeof ownerOrContext === 'string' ? repo : ownerOrContext.repo;
    if (!resolvedRepo) {
      throw new Error('Repository name is required');
    }
    const { data: repoData } = await this.octokit.rest.repos.get({ owner, repo: resolvedRepo });
    const { data: languagesData } = await this.octokit.rest.repos.listLanguages({
      owner,
      repo: resolvedRepo,
    });
    return {
      visibility: repoData.visibility as 'public' | 'private' | 'internal',
      primary_language: repoData.language || undefined,
      languages: languagesData,
    };
  }

  /**
   * Fetches all changed files from PR with automatic pagination
   *
   * @param context - GitHub PR context (owner, repo, prNumber)
   */
  async getChangedFiles(context: ChangeRequestContext): Promise<
    Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
    }>
  >;
  async getChangedFiles(context: GitHubPRContext): Promise<
    Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
    }>
  >;
  async getChangedFiles(context: ChangeRequestContext | GitHubPRContext): Promise<
    Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
    }>
  > {
    const { owner, repo, prNumber } = this.toGitHubPRContext(context);

    // Use octokit.paginate for automatic pagination
    // This handles PRs with >100 files by fetching all pages
    const files = await this.octokit.paginate(this.octokit.rest.pulls.listFiles, {
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });

    core.debug(`Fetched ${files.length} changed files from PR #${prNumber}`);

    return files;
  }

  /**
   * Fetches PR metadata (title, refs, SHAs)
   *
   * @param context - GitHub PR context (owner, repo, prNumber)
   */
  async getPRMetadata(context: GitHubPRContext): Promise<GitHubPRMetadata> {
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

  async getChangeRequestMetadata(context: ChangeRequestContext): Promise<ProviderPRMetadata> {
    return this.getPRMetadata(this.toGitHubPRContext(context));
  }

  async findReviewComments(context: GitHubPRContext, marker: string) {
    const { owner, repo, prNumber } = context;
    const comments = await this.octokit.paginate(this.octokit.rest.pulls.listReviewComments, {
      owner,
      repo,
      pull_number: prNumber,
    });
    const existingComments = comments.filter(c => c.body?.includes(marker));
    core.debug(
      `Existing review comments ${existingComments.length ? `found (IDs: ${existingComments.map(c => c.id).join(', ')})` : 'not found'}`
    );
    return existingComments;
  }

  async findInlineComments(
    context: ChangeRequestContext,
    marker: string
  ): Promise<ProviderCommentReference[]> {
    const comments = await this.findReviewComments(this.toGitHubPRContext(context), marker);
    return comments.map(comment => ({
      id: comment.id,
      body: comment.body ?? '',
    }));
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
      const commentId = existingComment?.id ?? null;
      core.debug(`Existing review comment ${commentId ? `found (ID: ${commentId})` : 'not found'}`);
      return commentId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to find review comment: ${message}`);
    }
  }

  async findSummaryComment(context: ChangeRequestContext, marker: string): Promise<number | null> {
    return this.findComment(this.toGitHubPRContext(context), marker);
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
    core.debug(`Creating comment for PR #${prNumber} with body: ${body}`);

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

  async createSummaryComment(context: ChangeRequestContext, body: string): Promise<number> {
    return this.createComment(this.toGitHubPRContext(context), body);
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
    core.debug(`Updating comment ${commentId} with body: ${body}`);

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

  async updateSummaryComment(
    context: ChangeRequestContext,
    commentId: number,
    body: string
  ): Promise<void> {
    return this.updateComment(this.toGitHubPRContext(context), commentId, body);
  }

  /**
   * Creates a PR review with inline comments
   *
   * @param context - GitHub PR context (owner, repo, prNumber)
   * @param comments - Array of inline comments formatted for GitHub API
   * @param event - Review event type (COMMENT, APPROVE, REQUEST_CHANGES)
   * @param commitId - Commit SHA to attach the review to
   * @param body - Optional review body/summary
   * @returns Review ID
   */
  async createReview(
    context: GitHubPRContext,
    comments: InlineComment[],
    event: 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES' = 'COMMENT',
    commitId?: string,
    body?: string
  ): Promise<number> {
    const { owner, repo, prNumber } = context;
    core.debug(`Creating review for PR #${prNumber} with ${comments.length} inline comments`);

    try {
      const { data } = await this.octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        event,
        body,
        comments,
        commit_id: commitId,
      });

      core.debug(`Review created with ID: ${data.id}`);
      return data.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to create review: ${message}`);
    }
  }

  async createInlineReview(
    context: ChangeRequestContext,
    comments: ProviderInlineComment[],
    commitId?: string
  ): Promise<number> {
    return this.createReview(
      this.toGitHubPRContext(context),
      comments as InlineComment[],
      'COMMENT',
      commitId
    );
  }

  /**
   * Gets a map of changed files with their line ranges
   *
   * @param context - GitHub PR context (owner, repo, prNumber)
   * @returns Map of file path to line range and status
   */
  async getChangedFilesMap(
    context: ChangeRequestContext
  ): Promise<Map<string, { start: number; end: number; status: string }>>;
  async getChangedFilesMap(
    context: GitHubPRContext
  ): Promise<Map<string, { start: number; end: number; status: string }>>;
  async getChangedFilesMap(
    context: ChangeRequestContext | GitHubPRContext
  ): Promise<Map<string, { start: number; end: number; status: string }>> {
    const files = await this.getChangedFiles(this.toGitHubPRContext(context));
    const fileMap = new Map<string, { start: number; end: number; status: string }>();

    files.forEach(file => {
      // For added/modified files, we need to parse the patch to get line ranges
      if (file.patch && file.status !== 'removed') {
        const lineRanges = this.parsePatchLineRanges(file.patch);
        if (lineRanges) {
          fileMap.set(file.filename, {
            start: lineRanges.start,
            end: lineRanges.end,
            status: file.status,
          });
        } else {
          core.warning(`Skipping file '${file.filename}' due to patch parsing failure`);
        }
      } else {
        // For files without patch or removed files, set a default range
        fileMap.set(file.filename, {
          start: 1,
          end: file.status === 'removed' ? 0 : Number.MAX_SAFE_INTEGER,
          status: file.status,
        });
      }
    });

    return fileMap;
  }

  buildLineUrl(
    context: ChangeRequestContext,
    commitSha: string,
    file: string,
    line: number,
    _column?: number
  ): string {
    return `https://github.com/${context.owner}/${context.repo}/blob/${commitSha}/${file}#L${line}`;
  }

  /**
   * Parses patch content to extract line ranges
   *
   * @param patch - Git patch/diff content
   * @returns Line range or null if cannot parse
   */
  private parsePatchLineRanges(patch: string): { start: number; end: number } | null {
    // Parse unified diff format: @@ -old_start,old_count +new_start,new_count @@
    const lines = patch.split('\n');
    let minLine = Number.MAX_SAFE_INTEGER;
    let maxLine = 0;

    for (const line of lines) {
      const match = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/);
      if (match) {
        const start = parseInt(match[1], 10);
        const count = match[2] ? parseInt(match[2], 10) : 1;
        const end = count === 0 ? start : start + count - 1;

        minLine = Math.min(minLine, start);
        maxLine = Math.max(maxLine, end);
      }
    }

    if (minLine === Number.MAX_SAFE_INTEGER || maxLine === 0) {
      core.warning(
        `Failed to parse patch line ranges. Patch format may be invalid or contain no valid hunks. Patch preview: ${patch.substring(0, 200)}`
      );
      return null;
    }

    return { start: minLine, end: maxLine };
  }
}
