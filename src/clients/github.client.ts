import type { getOctokit } from '@actions/github';
import { FileStatus } from '@core/pr-changes-detector';
import type { GitHubPRContext } from '@core/shared/github';

export class GitHubClient {
  constructor(private readonly octokit: ReturnType<typeof getOctokit>) {}

  /**
   * Fetches repository metadata (visibility, languages, primary language)
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   */
  async getRepositoryMetadata(
    owner: string,
    repo: string
  ): Promise<{
    visibility: 'public' | 'private' | 'internal';
    primary_language?: string;
    languages: Record<string, number>;
  }> {
    // Fetch repository details
    const { data: repoData } = await this.octokit.rest.repos.get({
      owner,
      repo,
    });

    // Fetch languages used in the repository
    const { data: languagesData } = await this.octokit.rest.repos.listLanguages({
      owner,
      repo,
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
}
