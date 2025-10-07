/**
 * GitHub PR diff parsing utilities
 */

import * as core from '@actions/core';
import * as github from '@actions/github';

export interface FileChange {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  changedLines: Set<number>; // Line numbers that were added or modified
}

export interface PRDiffInfo {
  changedFiles: Map<string, FileChange>;
}

/**
 * Gets changed files and line numbers from a PR
 */
export async function getPRDiff(
  owner: string,
  repo: string,
  pullNumber: number,
  token: string
): Promise<PRDiffInfo> {
  const octokit = github.getOctokit(token);

  try {
    // Get list of files changed in PR
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
    });

    const changedFiles = new Map<string, FileChange>();

    for (const file of files) {
      const changedLines = parseChangedLines(file.patch || '');

      changedFiles.set(file.filename, {
        filename: file.filename,
        status: file.status as FileChange['status'],
        changedLines,
      });

      core.debug(`File ${file.filename}: ${changedLines.size} changed lines`);
    }

    core.info(`Parsed diff for ${changedFiles.size} changed file(s)`);

    return { changedFiles };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.warning(`Failed to get PR diff: ${errorMessage}`);

    // Return empty result on error
    return { changedFiles: new Map() };
  }
}

/**
 * Parses a GitHub diff patch to extract changed line numbers
 * Returns line numbers in the NEW file (after changes)
 */
function parseChangedLines(patch: string): Set<number> {
  const changedLines = new Set<number>();

  if (!patch) {
    return changedLines;
  }

  const lines = patch.split('\n');
  let currentLine = 0;

  for (const line of lines) {
    // Diff hunk header: @@ -old_start,old_count +new_start,new_count @@
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentLine = parseInt(hunkMatch[1], 10);
      continue;
    }

    // Added line
    if (line.startsWith('+') && !line.startsWith('+++')) {
      changedLines.add(currentLine);
      currentLine++;
      continue;
    }

    // Modified line (context or removed lines don't increment new line number)
    if (line.startsWith('-') && !line.startsWith('---')) {
      // Removed line - doesn't exist in new file, don't increment
      continue;
    }

    // Context line (unchanged)
    if (line.startsWith(' ')) {
      currentLine++;
      continue;
    }
  }

  return changedLines;
}

/**
 * Checks if a line is in the changed lines of a file
 */
export function isLineChanged(
  diffInfo: PRDiffInfo,
  filePath: string,
  lineNumber: number
): boolean {
  const fileChange = diffInfo.changedFiles.get(filePath);
  if (!fileChange) {
    return false;
  }

  // If file was added, all lines are "changed"
  if (fileChange.status === 'added') {
    return true;
  }

  // Otherwise check if specific line was changed
  return fileChange.changedLines.has(lineNumber);
}

/**
 * Checks if a file was changed in the PR
 */
export function isFileChanged(diffInfo: PRDiffInfo, filePath: string): boolean {
  return diffInfo.changedFiles.has(filePath);
}
