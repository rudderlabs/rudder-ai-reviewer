import * as core from '@actions/core';
import { GitHubClient } from '@clients/github.client';
import type { GitHubPRContext } from '@core/shared/github/pr-context';
import { countPatchHunks } from './patch-parser';
import type { DiffFile, FileStatus, PRChangesResult } from './types';

export class PRChangesDetector {
  constructor(private readonly githubClient: GitHubClient) {}

  /**
   * Main entry point - fetches and processes all PR changes
   */
  async detect(prContext: GitHubPRContext): Promise<PRChangesResult> {
    try {
      core.info('Fetching PR metadata...');
      const prMetadata = await this.githubClient.getPRMetadata(prContext);

      core.info('Fetching changed files...');
      const changedFiles = await this.githubClient.getChangedFiles(prContext);

      core.info(`Processing ${changedFiles.length} changed files...`);
      const diffContext = this.processDiffFiles(changedFiles);

      const result: PRChangesResult = {
        pull_request: {
          ...prMetadata,
          files_changed_count: changedFiles.length,
          lines_added: this.sumAdditions(changedFiles),
          lines_deleted: this.sumDeletions(changedFiles),
          lines_changed: this.sumChanges(changedFiles),
        },
        diff_context: diffContext,
      };

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      core.error(`Failed to detect PR changes: ${message}`);
      throw error;
    }
  }

  /**
   * Transforms GitHub API file objects into DiffFile format
   */
  private processDiffFiles(
    files: Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
    }>
  ): DiffFile[] {
    return files.map(file => ({
      file_path: file.filename,
      patch: file.patch || '',
      hunks: file.patch ? countPatchHunks(file.patch) : 0,
      additions: file.additions,
      deletions: file.deletions,
      status: file.status as FileStatus,
    }));
  }

  private sumAdditions(files: Array<{ additions: number }>): number {
    return files.reduce((sum, file) => sum + file.additions, 0);
  }

  private sumDeletions(files: Array<{ deletions: number }>): number {
    return files.reduce((sum, file) => sum + file.deletions, 0);
  }

  private sumChanges(files: Array<{ additions: number; deletions: number }>): number {
    return files.reduce((sum, file) => sum + file.additions + file.deletions, 0);
  }
}
