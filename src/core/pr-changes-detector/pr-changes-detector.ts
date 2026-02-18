import * as core from '@actions/core';
import { GitHubClient } from '@clients/github.client';
import type { GitHubPRContext } from '@core/shared/github/pr-context';
import { isAbsolute, relative } from 'path';
import { shouldIncludeFile } from './file-filter';
import { countPatchHunks } from './patch-parser';
import type { DiffFile, FileChange, FileStatus, PRChangesResult } from './types';

export class PRChangesDetector {
  constructor(private readonly githubClient: GitHubClient) {}

  /**
   * Main entry point - fetches and processes all PR changes
   */
  async detect(prContext: GitHubPRContext, rootDirectory = '.'): Promise<PRChangesResult> {
    try {
      core.info('Fetching PR metadata...');
      const prMetadata = await this.githubClient.getPRMetadata(prContext);

      core.info('Fetching changed files...');
      const changedFiles = await this.githubClient.getChangedFiles(prContext);

      core.info(`Filtering files for root directory: ${rootDirectory}`);
      const filteredByPath = this.filterFilesByPath(changedFiles, rootDirectory);

      core.info('Filtering source files...');
      const filteredFiles = filteredByPath.filter(file => shouldIncludeFile(file.filename));
      core.info(
        `Processing ${filteredFiles.length} source files (${filteredByPath.length - filteredFiles.length} non-source files filtered out)`
      );

      const diffContext = this.processDiffFiles(filteredFiles);

      const result: PRChangesResult = {
        pull_request: {
          ...prMetadata,
          files_changed_count: filteredFiles.length,
          lines_added: this.sumAdditions(filteredFiles),
          lines_deleted: this.sumDeletions(filteredFiles),
          lines_changed: this.sumChanges(filteredFiles),
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
   * Filters files to only include those within the specified root directory
   */
  private filterFilesByPath(files: FileChange[], rootDirectory: string): FileChange[] {
    if (rootDirectory === '.') {
      return files;
    }

    return files.filter(file => {
      const rel = relative(rootDirectory, file.filename);
      // File is within rootDirectory if:
      // 1. Relative path exists (not empty)
      // 2. Doesn't start with '..' (not a parent directory)
      // 3. Is not absolute (not outside the tree)
      return rel && !rel.startsWith('..') && !isAbsolute(rel);
    }) as FileChange[];
  }

  /**
   * Transforms GitHub API file objects into DiffFile format
   */
  private processDiffFiles(files: FileChange[]): DiffFile[] {
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
