/**
 * Chunking Logic for Token Limit Handling
 * Implements hybrid fallback strategy: smart grouping → changed/unchanged split → file-based
 */

import * as core from '@actions/core';
import { CodeChunk, FileContent } from './types';
import { TrackingPlan, WorkspaceConfig } from '../../types/common';
import { estimateTokens, buildSystemPrompt, buildUserPrompt } from './prompt-builder';

/**
 * Create chunks from files based on token limits
 * @param changedFiles Files that were changed in the PR
 * @param unchangedFiles Files that provide context but weren't changed
 * @param maxTokensPerRequest Maximum tokens allowed per request
 * @param trackingPlan Optional tracking plan data
 * @param workspaceConfig Optional workspace config data
 * @returns Array of code chunks ready for AI analysis
 */
export function createChunks(
  changedFiles: FileContent[],
  unchangedFiles: FileContent[],
  maxTokensPerRequest: number,
  trackingPlan?: TrackingPlan,
  workspaceConfig?: WorkspaceConfig
): CodeChunk[] {
  core.info('=== Starting Chunking Process ===');

  // Estimate tokens for context (system prompt + RS data)
  const systemPrompt = buildSystemPrompt();
  const systemPromptTokens = estimateTokens(systemPrompt);

  let contextTokens = systemPromptTokens;

  if (trackingPlan) {
    contextTokens += estimateTokens(JSON.stringify(trackingPlan));
  }
  if (workspaceConfig) {
    contextTokens += estimateTokens(JSON.stringify(workspaceConfig));
  }

  core.info(`Context tokens (system prompt + RS data): ~${contextTokens}`);
  core.info(`Available tokens for code: ~${maxTokensPerRequest - contextTokens}`);

  const availableTokens = maxTokensPerRequest - contextTokens;

  if (availableTokens < 10000) {
    core.warning('Very limited tokens available for code. Consider increasing max_tokens_per_request.');
  }

  // Calculate tokens for each file
  const changedFilesWithTokens = changedFiles.map((file) => ({
    ...file,
    tokens: estimateTokens(file.content),
  }));

  const unchangedFilesWithTokens = unchangedFiles.map((file) => ({
    ...file,
    tokens: estimateTokens(file.content),
  }));

  const totalChangedTokens = changedFilesWithTokens.reduce((sum, f) => sum + f.tokens, 0);
  const totalUnchangedTokens = unchangedFilesWithTokens.reduce((sum, f) => sum + f.tokens, 0);
  const totalCodeTokens = totalChangedTokens + totalUnchangedTokens;

  core.info(`Changed files: ${changedFiles.length} (~${totalChangedTokens} tokens)`);
  core.info(`Unchanged files: ${unchangedFiles.length} (~${totalUnchangedTokens} tokens)`);
  core.info(`Total code tokens: ~${totalCodeTokens}`);

  // Strategy 1: Try to fit everything in one chunk
  if (totalCodeTokens <= availableTokens) {
    core.info('✓ All files fit in single chunk');
    return [
      {
        id: 'chunk-1',
        files: [...changedFiles, ...unchangedFiles],
        isChangedFiles: true,
        estimatedTokens: contextTokens + totalCodeTokens,
      },
    ];
  }

  core.info('⚠ Files exceed token limit, applying chunking strategy...');

  // Strategy 2: Try smart grouping (group related files - e.g., same directory)
  core.info('Attempting Strategy 1: Smart grouping by directory...');
  const smartChunks = createSmartGroupChunks(
    changedFilesWithTokens,
    unchangedFilesWithTokens,
    availableTokens,
    contextTokens
  );

  if (smartChunks.length > 0) {
    core.info(`✓ Smart grouping successful: ${smartChunks.length} chunk(s)`);
    return smartChunks;
  }

  // Strategy 3: Fallback to changed vs unchanged split
  core.info('Attempting Strategy 2: Changed vs unchanged split...');
  const splitChunks = createChangedUnchangedSplitChunks(
    changedFilesWithTokens,
    unchangedFilesWithTokens,
    availableTokens,
    contextTokens
  );

  if (splitChunks.length > 0) {
    core.info(`✓ Changed/unchanged split successful: ${splitChunks.length} chunk(s)`);
    return splitChunks;
  }

  // Strategy 4: Ultimate fallback to file-based chunks
  core.info('Attempting Strategy 3: File-based chunking...');
  const fileChunks = createFileBasedChunks(changedFilesWithTokens, unchangedFilesWithTokens, availableTokens, contextTokens);

  core.info(`✓ File-based chunking complete: ${fileChunks.length} chunk(s)`);
  return fileChunks;
}

/**
 * Strategy 1: Smart grouping - group files by directory/feature
 */
function createSmartGroupChunks(
  changedFiles: Array<FileContent & { tokens: number }>,
  unchangedFiles: Array<FileContent & { tokens: number }>,
  availableTokens: number,
  contextTokens: number
): CodeChunk[] {
  // Group files by directory
  const groups = new Map<string, Array<FileContent & { tokens: number }>>();

  for (const file of changedFiles) {
    const dir = file.path.split('/').slice(0, -1).join('/') || 'root';
    if (!groups.has(dir)) {
      groups.set(dir, []);
    }
    groups.get(dir)!.push(file);
  }

  // Try to create chunks from groups
  const chunks: CodeChunk[] = [];
  let currentChunk: Array<FileContent & { tokens: number }> = [];
  let currentTokens = 0;
  let chunkIndex = 1;

  for (const [dir, files] of groups) {
    const groupTokens = files.reduce((sum, f) => sum + f.tokens, 0);

    // If group fits in current chunk, add it
    if (currentTokens + groupTokens <= availableTokens) {
      currentChunk.push(...files);
      currentTokens += groupTokens;
    } else {
      // Save current chunk if not empty
      if (currentChunk.length > 0) {
        chunks.push({
          id: `chunk-${chunkIndex++}`,
          files: currentChunk.map(({ tokens, ...file }) => file),
          isChangedFiles: true,
          estimatedTokens: contextTokens + currentTokens,
        });
      }

      // Start new chunk with this group
      if (groupTokens <= availableTokens) {
        currentChunk = [...files];
        currentTokens = groupTokens;
      } else {
        // Group itself is too large, can't use smart grouping
        return [];
      }
    }
  }

  // Add remaining chunk
  if (currentChunk.length > 0) {
    chunks.push({
      id: `chunk-${chunkIndex}`,
      files: currentChunk.map(({ tokens, ...file }) => file),
      isChangedFiles: true,
      estimatedTokens: contextTokens + currentTokens,
    });
  }

  // Add unchanged files to last chunk if there's space
  if (chunks.length > 0 && unchangedFiles.length > 0) {
    const lastChunk = chunks[chunks.length - 1];
    const unchangedTokens = unchangedFiles.reduce((sum, f) => sum + f.tokens, 0);

    if (lastChunk.estimatedTokens + unchangedTokens <= availableTokens + contextTokens) {
      lastChunk.files.push(...unchangedFiles.map(({ tokens, ...file }) => file));
      lastChunk.estimatedTokens += unchangedTokens;
    }
  }

  return chunks;
}

/**
 * Strategy 2: Split changed and unchanged files
 */
function createChangedUnchangedSplitChunks(
  changedFiles: Array<FileContent & { tokens: number }>,
  unchangedFiles: Array<FileContent & { tokens: number }>,
  availableTokens: number,
  contextTokens: number
): CodeChunk[] {
  const chunks: CodeChunk[] = [];

  const changedTokens = changedFiles.reduce((sum, f) => sum + f.tokens, 0);
  const unchangedTokens = unchangedFiles.reduce((sum, f) => sum + f.tokens, 0);

  // If changed files fit in one chunk
  if (changedTokens <= availableTokens) {
    chunks.push({
      id: 'chunk-changed',
      files: changedFiles.map(({ tokens, ...file }) => file),
      isChangedFiles: true,
      estimatedTokens: contextTokens + changedTokens,
    });

    // Try to add unchanged files
    if (unchangedTokens <= availableTokens) {
      chunks.push({
        id: 'chunk-unchanged',
        files: unchangedFiles.map(({ tokens, ...file }) => file),
        isChangedFiles: false,
        estimatedTokens: contextTokens + unchangedTokens,
      });
    }

    return chunks;
  }

  // Changed files don't fit, need to split them
  return [];
}

/**
 * Strategy 3: File-based chunking (ultimate fallback)
 */
function createFileBasedChunks(
  changedFiles: Array<FileContent & { tokens: number }>,
  unchangedFiles: Array<FileContent & { tokens: number }>,
  availableTokens: number,
  contextTokens: number
): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  let currentChunk: FileContent[] = [];
  let currentTokens = 0;
  let chunkIndex = 1;

  // Add changed files
  for (const file of changedFiles) {
    if (file.tokens > availableTokens) {
      core.warning(`File ${file.path} is too large (${file.tokens} tokens) and will be truncated`);
      // Truncate file content to fit
      const truncatedContent = file.content.substring(0, Math.floor(availableTokens * 4 * 0.9)); // Leave 10% buffer
      chunks.push({
        id: `chunk-${chunkIndex++}`,
        files: [{ path: file.path, content: truncatedContent, isChanged: file.isChanged }],
        isChangedFiles: true,
        estimatedTokens: contextTokens + estimateTokens(truncatedContent),
      });
      continue;
    }

    if (currentTokens + file.tokens > availableTokens) {
      // Save current chunk
      if (currentChunk.length > 0) {
        chunks.push({
          id: `chunk-${chunkIndex++}`,
          files: currentChunk,
          isChangedFiles: true,
          estimatedTokens: contextTokens + currentTokens,
        });
      }

      // Start new chunk
      currentChunk = [{ path: file.path, content: file.content, isChanged: file.isChanged }];
      currentTokens = file.tokens;
    } else {
      currentChunk.push({ path: file.path, content: file.content, isChanged: file.isChanged });
      currentTokens += file.tokens;
    }
  }

  // Save last chunk
  if (currentChunk.length > 0) {
    chunks.push({
      id: `chunk-${chunkIndex++}`,
      files: currentChunk,
      isChangedFiles: true,
      estimatedTokens: contextTokens + currentTokens,
    });
  }

  // Try to fit unchanged files
  currentChunk = [];
  currentTokens = 0;

  for (const file of unchangedFiles) {
    if (currentTokens + file.tokens > availableTokens) {
      if (currentChunk.length > 0) {
        chunks.push({
          id: `chunk-${chunkIndex++}`,
          files: currentChunk,
          isChangedFiles: false,
          estimatedTokens: contextTokens + currentTokens,
        });
      }
      currentChunk = [{ path: file.path, content: file.content, isChanged: file.isChanged }];
      currentTokens = file.tokens;
    } else {
      currentChunk.push({ path: file.path, content: file.content, isChanged: file.isChanged });
      currentTokens += file.tokens;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push({
      id: `chunk-${chunkIndex}`,
      files: currentChunk,
      isChangedFiles: false,
      estimatedTokens: contextTokens + currentTokens,
    });
  }

  return chunks;
}
