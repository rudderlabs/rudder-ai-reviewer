/**
 * AI Analysis Orchestrator
 * Coordinates batched analysis with chunking and result merging
 */

import * as core from '@actions/core';
import { promises as fs } from 'fs';
import { AnthropicClient, createAnthropicClient } from './client';
import { buildSystemPrompt, buildUserPrompt } from './prompt-builder';
import { createChunks } from './chunker';
import { AIAnalysisResult, AnthropicConfig, FileContent, TruncatedFileInfo } from './types';

export interface AIOrchestratorInput {
  changedFilePaths: string[];
  unchangedFilePaths: string[];
  config: AnthropicConfig;
}

export interface AIOrchestrationResult {
  status: 'success' | 'failed';
  results: AIAnalysisResult[];
  totalChunks: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  truncatedFiles: TruncatedFileInfo[];
  error?: string;
}

/**
 * Orchestrate AI analysis with chunking
 */
export async function orchestrateAIAnalysis(input: AIOrchestratorInput): Promise<AIOrchestrationResult> {
  core.info('=== Starting AI Analysis Orchestration ===');

  try {
    // Step 1: Create Anthropic client
    const client = createAnthropicClient(input.config);

    // Test connection
    core.info('Testing Anthropic API connection...');
    const connected = await client.testConnection();

    if (!connected) {
      return {
        status: 'failed',
        results: [],
        totalChunks: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        truncatedFiles: [],
        error: 'Failed to connect to Anthropic API',
      };
    }

    core.info('✓ Anthropic API connection successful');

    // Step 2: Read file contents
    core.info('Reading file contents...');
    const changedFiles = await readFiles(input.changedFilePaths, true);
    const unchangedFiles = await readFiles(input.unchangedFilePaths, false);

    core.info(`Loaded ${changedFiles.length} changed files and ${unchangedFiles.length} unchanged files`);

    if (changedFiles.length === 0) {
      core.warning('No changed files to analyze');
      return {
        status: 'success',
        results: [],
        totalChunks: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        truncatedFiles: [],
      };
    }

    // Step 3: Create chunks
    core.info('Creating chunks...');
    const chunkingResult = createChunks(changedFiles, unchangedFiles, input.config.maxTokens);

    core.info(`Created ${chunkingResult.chunks.length} chunk(s) for analysis`);

    if (chunkingResult.truncatedFiles.length > 0) {
      core.warning(`${chunkingResult.truncatedFiles.length} file(s) were truncated due to size limits`);
      chunkingResult.truncatedFiles.forEach((tf) => {
        core.warning(`  - ${tf.path}: ${tf.originalTokens} → ${tf.truncatedTokens} tokens`);
      });
    }

    // Step 4: Analyze each chunk
    const results: AIAnalysisResult[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let i = 0; i < chunkingResult.chunks.length; i++) {
      const chunk = chunkingResult.chunks[i];
      core.info(`Analyzing chunk ${i + 1}/${chunkingResult.chunks.length} (${chunk.id}, ${chunk.files.length} files, ~${chunk.estimatedTokens} tokens)`);

      const systemPrompt = buildSystemPrompt();
      const changedChunkFiles = chunk.files.filter((f) => f.isChanged);
      const unchangedChunkFiles = chunk.files.filter((f) => !f.isChanged);

      const userPrompt = buildUserPrompt(changedChunkFiles, unchangedChunkFiles);

      const response = await client.analyze({
        systemPrompt,
        userPrompt,
      });

      if (response.status === 'failed') {
        core.error(`Chunk ${chunk.id} analysis failed: ${response.error}`);
        // Fail fast - don't continue with other chunks
        return {
          status: 'failed',
          results,
          totalChunks: chunkingResult.chunks.length,
          totalInputTokens,
          totalOutputTokens,
          truncatedFiles: chunkingResult.truncatedFiles,
          error: `Analysis failed on chunk ${chunk.id}: ${response.error}`,
        };
      }

      // Parse AI response
      try {
        const analysisResult = parseAIResponse(response.content!);
        results.push(analysisResult);

        if (response.usage) {
          totalInputTokens += response.usage.inputTokens;
          totalOutputTokens += response.usage.outputTokens;
        }

        core.info(
          `✓ Chunk ${chunk.id} analyzed: ${analysisResult.issues.errors.length} errors, ${analysisResult.issues.warnings.length} warnings, ${analysisResult.issues.suggestions.length} suggestions`
        );
      } catch (parseError) {
        core.error(`Failed to parse AI response for chunk ${chunk.id}: ${parseError}`);
        core.debug(`Raw response: ${response.content}`);

        // Fail fast
        return {
          status: 'failed',
          results,
          totalChunks: chunkingResult.chunks.length,
          totalInputTokens,
          totalOutputTokens,
          truncatedFiles: chunkingResult.truncatedFiles,
          error: `Failed to parse AI response for chunk ${chunk.id}`,
        };
      }
    }

    core.info('=== AI Analysis Orchestration Complete ===');
    core.info(`Total input tokens: ${totalInputTokens}`);
    core.info(`Total output tokens: ${totalOutputTokens}`);

    return {
      status: 'success',
      results,
      totalChunks: chunkingResult.chunks.length,
      totalInputTokens,
      totalOutputTokens,
      truncatedFiles: chunkingResult.truncatedFiles,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.error(`AI orchestration failed: ${errorMessage}`);

    return {
      status: 'failed',
      results: [],
      totalChunks: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      truncatedFiles: [],
      error: errorMessage,
    };
  }
}

/**
 * Read file contents from disk
 */
async function readFiles(filePaths: string[], isChanged: boolean): Promise<FileContent[]> {
  const files: FileContent[] = [];

  for (const path of filePaths) {
    try {
      const content = await fs.readFile(path, 'utf-8');
      files.push({
        path,
        content,
        isChanged,
      });
    } catch (error) {
      core.warning(`Failed to read file ${path}: ${error}`);
    }
  }

  return files;
}

/**
 * Parse AI response JSON
 */
function parseAIResponse(responseText: string): AIAnalysisResult {
  // Try to extract JSON from markdown code blocks if present
  let jsonText = responseText.trim();

  // Remove markdown code blocks if present
  const jsonBlockMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    jsonText = jsonBlockMatch[1].trim();
  } else {
    // Try without json marker
    const codeBlockMatch = jsonText.match(/```\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim();
    }
  }

  // Try to find JSON object boundaries if there's surrounding text
  if (!jsonText.startsWith('{')) {
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }
  }

  try {
    const parsed = JSON.parse(jsonText);

    // Validate structure
    if (!parsed.summary || !parsed.events || !parsed.issues) {
      throw new Error('Invalid AI response structure: missing required fields');
    }

    return parsed as AIAnalysisResult;
  } catch (error) {
    core.error(`Failed to parse AI response: ${error}`);
    core.error(`First 500 chars of response: ${responseText.substring(0, 500)}`);
    core.error(`Last 500 chars of response: ${responseText.substring(Math.max(0, responseText.length - 500))}`);
    throw new Error(`Invalid JSON response from AI: ${error}`);
  }
}

/**
 * Merge multiple AI analysis results into one
 */
export function mergeAIResults(results: AIAnalysisResult[]): AIAnalysisResult {
  if (results.length === 0) {
    return {
      summary: {
        overallAssessment: 'No analysis performed',
        filesAnalyzed: 0,
        totalIssues: 0,
        recommendations: [],
      },
      events: [],
      issues: {
        errors: [],
        warnings: [],
        suggestions: [],
      },
      destinationImpacts: [],
      unchangedFileIssues: [],
    };
  }

  if (results.length === 1) {
    return results[0];
  }

  // Merge multiple results
  const merged: AIAnalysisResult = {
    summary: {
      overallAssessment: results.map((r) => r.summary.overallAssessment).join(' '),
      filesAnalyzed: results.reduce((sum, r) => sum + r.summary.filesAnalyzed, 0),
      totalIssues: results.reduce((sum, r) => sum + r.summary.totalIssues, 0),
      recommendations: results.flatMap((r) => r.summary.recommendations),
    },
    events: results.flatMap((r) => r.events),
    issues: {
      errors: results.flatMap((r) => r.issues.errors),
      warnings: results.flatMap((r) => r.issues.warnings),
      suggestions: results.flatMap((r) => r.issues.suggestions),
    },
    destinationImpacts: results.flatMap((r) => r.destinationImpacts),
    unchangedFileIssues: results.flatMap((r) => r.unchangedFileIssues),
  };

  // Deduplicate events by name and file
  const uniqueEvents = new Map<string, typeof merged.events[0]>();
  for (const event of merged.events) {
    const key = `${event.name}:${event.file}`;
    if (!uniqueEvents.has(key)) {
      uniqueEvents.set(key, event);
    }
  }
  merged.events = Array.from(uniqueEvents.values());

  return merged;
}
