/**
 * AI-Based Analysis Orchestrator
 * Main orchestration for AI-powered PR analysis
 */

import * as core from '@actions/core';
import { ActionConfig } from '../types/common';
import { orchestrateAIAnalysis, mergeAIResults } from '../integrations/anthropic/orchestrator';
import { createRudderStackClient } from '../integrations/rudderstack-api';
import {
  getPRContext,
  getChangedFiles,
  postOrUpdateGlobalSummary,
  postPRReview,
  setOutputs,
} from '../integrations/github';
import { retrieveAnalysisArtifact } from '../integrations/github/artifact-manager';
import { AIAnalysisResult } from '../integrations/anthropic/types';

/**
 * Main AI-based orchestration function
 */
export async function orchestrateAIBasedAnalysis(config: ActionConfig): Promise<void> {
  core.info('🚀 Starting AI-based RudderStack PR analysis...');

  try {
    // Step 1: Get PR context
    const prContext = getPRContext();
    if (!prContext) {
      core.setFailed('Not running in a PR context');
      return;
    }

    core.info(`Analyzing PR #${prContext.prNumber} in ${prContext.owner}/${prContext.repo}`);

    // Step 2: Determine files to analyze
    let jsFiles: string[];

    if (config.rootDirectory) {
      // When root_directory is specified, analyze ALL JS/TS files in that directory
      core.info(`root_directory specified: ${config.rootDirectory}`);
      core.info('Analyzing ALL files in root_directory instead of just PR changes');

      const allFiles = await scanDirectoryForAnalysis(config.rootDirectory);
      jsFiles = allFiles;
      core.info(`Found ${jsFiles.length} files to analyze in ${config.rootDirectory}`);
    } else {
      // Normal PR mode - analyze only changed files
      const changedFiles = await getChangedFiles(prContext, config.githubToken);
      prContext.changedFiles = changedFiles;

      core.info(`Found ${changedFiles.length} changed files in PR`);

      if (changedFiles.length === 0) {
        core.info('No changed files to analyze');
        setOutputs({ status: 'success', errorCount: 0, warningCount: 0, suggestionCount: 0 });
        return;
      }

      // Filter JavaScript/TypeScript files
      jsFiles = changedFiles.filter(isJavaScriptFile);
      core.info(`Found ${jsFiles.length} JavaScript/TypeScript files`);
    }

    if (jsFiles.length === 0) {
      core.info('No JavaScript/TypeScript files to analyze');
      setOutputs({ status: 'success', errorCount: 0, warningCount: 0, suggestionCount: 0 });
      return;
    }

    // Step 4: Fetch RudderStack workspace data (tracking plan, destinations)
    core.info('Fetching RudderStack workspace data...');

    let trackingPlan;
    let workspaceConfig;

    try {
      const rudderStackClient = createRudderStackClient({
        serviceAccessToken: config.serviceAccessToken,
        sourceId: config.sourceId,
      });

      // Test connection
      const connected = await rudderStackClient.testConnection();

      if (connected) {
        core.info('✓ Connected to RudderStack API');

        // Fetch tracking plan
        trackingPlan = await rudderStackClient.getTrackingPlan();
        if (trackingPlan) {
          core.info(`✓ Tracking plan retrieved with ${trackingPlan.events.length} events`);
        } else {
          core.info('No tracking plan found');
        }

        // Fetch workspace config
        workspaceConfig = await rudderStackClient.getWorkspaceConfig();
        if (workspaceConfig) {
          core.info(`✓ Workspace config retrieved with ${workspaceConfig.destinations.length} destinations`);
        } else {
          core.info('No workspace config found');
        }
      } else {
        core.warning('Could not connect to RudderStack API - continuing without workspace data');
      }
    } catch (error) {
      core.warning(`Failed to fetch RudderStack data: ${error}`);
      // Continue without workspace data
    }

    // Step 5: Prepare file paths for AI analysis
    let changedFilePaths: string[];

    if (config.rootDirectory) {
      // Files are already absolute paths from root_directory
      changedFilePaths = jsFiles;
    } else {
      // Convert relative paths to absolute for normal PR mode
      changedFilePaths = jsFiles.map((file) => `${process.cwd()}/${file}`);
    }

    const unchangedFilePaths: string[] = []; // Could add related files here in future

    core.info(`Analyzing ${changedFilePaths.length} files`);

    // Step 6: Run AI analysis
    core.info('Running AI analysis...');

    const aiResult = await orchestrateAIAnalysis({
      changedFilePaths,
      unchangedFilePaths,
      trackingPlan: trackingPlan || undefined,
      workspaceConfig: workspaceConfig || undefined,
      config: {
        apiKey: config.anthropicApiKey,
        model: config.aiModel,
        maxTokens: config.maxTokensPerRequest,
      },
    });

    if (aiResult.status === 'failed') {
      core.error(`AI analysis failed: ${aiResult.error}`);
      core.setFailed(`AI analysis failed: ${aiResult.error}`);
      setOutputs({ status: 'failed', errorCount: 0, warningCount: 0, suggestionCount: 0 });
      return;
    }

    core.info(`✅ AI analysis complete: ${aiResult.totalChunks} chunk(s) analyzed`);
    core.info(`Token usage: ${aiResult.totalInputTokens} input, ${aiResult.totalOutputTokens} output`);

    // Step 7: Merge AI results
    const mergedResult = mergeAIResults(aiResult.results);

    core.info(`Merged results: ${mergedResult.events.length} events, ${mergedResult.issues.errors.length} errors, ${mergedResult.issues.warnings.length} warnings, ${mergedResult.issues.suggestions.length} suggestions`);

    // Step 8: Retrieve previous analysis (for incremental delta)
    // TODO: Implement incremental analysis
    let previousResult: AIAnalysisResult | null = null;

    // Incremental analysis not yet implemented - always null for now
    // When implemented:
    // 1. Retrieve artifact: await retrieveAnalysisArtifact(prContext.prNumber)
    // 2. Parse AIAnalysisResult from artifact
    // 3. Use for delta calculation in three-comment strategy

    // Step 9: Post three-comment strategy
    core.info('Posting analysis results...');

    // 9a. Global summary comment (cumulative)
    await postOrUpdateGlobalSummary(prContext, config.githubToken, mergedResult, previousResult ? [previousResult] : []);

    // 9b. PR review with incremental delta + inline annotations
    await postPRReview(prContext, config.githubToken, mergedResult, previousResult, config.annotationMode);

    // Step 10: Store analysis artifact for future incremental analysis
    // TODO: Implement artifact storage
    // When implemented:
    // await storeAnalysisArtifact(prContext.prNumber, prContext.headSha, mergedResult);

    // Step 11: Set outputs
    const errorCount = mergedResult.issues.errors.length;
    const warningCount = mergedResult.issues.warnings.length;
    const suggestionCount = mergedResult.issues.suggestions.length;

    setOutputs({
      status: errorCount > 0 ? 'partial' : 'success',
      errorCount,
      warningCount,
      suggestionCount,
    });

    core.info(`✅ Analysis complete: ${errorCount} errors, ${warningCount} warnings, ${suggestionCount} suggestions`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.error(`AI orchestration failed: ${message}`);
    if (error instanceof Error && error.stack) {
      core.debug(`Stack trace: ${error.stack}`);
    }
    core.setFailed(message);
    setOutputs({ status: 'failed', errorCount: 0, warningCount: 0, suggestionCount: 0 });
    throw error;
  }
}

/**
 * Check if file is a JavaScript/TypeScript file
 */
function isJavaScriptFile(file: string): boolean {
  const ext = file.split('.').pop()?.toLowerCase();
  return ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'].includes(ext || '');
}

/**
 * Check if file should be analyzed (JS/TS/HTML)
 */
function isAnalyzableFile(file: string): boolean {
  const ext = file.split('.').pop()?.toLowerCase();
  return ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'html', 'htm'].includes(ext || '');
}

/**
 * Recursively scan directory for analyzable files (JS/TS/HTML)
 */
async function scanDirectoryForAnalysis(dir: string): Promise<string[]> {
  const fs = await import('fs');
  const path = await import('path');
  const files: string[] = [];

  async function scan(currentDir: string): Promise<void> {
    try {
      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        // Skip node_modules, dist, build directories
        if (entry.isDirectory()) {
          if (!['node_modules', 'dist', 'build', '.git'].includes(entry.name)) {
            await scan(fullPath);
          }
        } else if (entry.isFile() && isAnalyzableFile(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      core.warning(`Failed to scan directory ${currentDir}: ${error}`);
    }
  }

  await scan(dir);
  return files;
}
