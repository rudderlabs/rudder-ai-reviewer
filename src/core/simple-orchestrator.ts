/**
 * Simplified Orchestrator
 * Coordinates core components with proper error handling
 */

import * as core from '@actions/core';
import { ActionConfig, AnalysisResult } from '../types/common';
import { JavaScriptAnalyzer } from '../analyzers/javascript/javascript-analyzer';
import { getPRContext, getChangedFiles, postOrUpdateComment, setOutputs } from '../integrations/github';
import { generatePRComment } from '../reporters/comment-generator';

/**
 * Simplified orchestration - focuses on core functionality that works
 */
export async function runSimplifiedAnalysis(config: ActionConfig): Promise<void> {
  core.info('🚀 Starting RudderStack PR analysis (simplified mode)...');

  try {
    // Step 1: Get PR context
    const prContext = getPRContext();
    if (!prContext) {
      throw new Error('Not running in a PR context');
    }

    core.info(`Analyzing PR #${prContext.prNumber} in ${prContext.owner}/${prContext.repo}`);

    // Step 2: Get changed files
    const changedFiles = await getChangedFiles(prContext, config.githubToken);
    core.info(`Found ${changedFiles.length} changed files`);

    // Step 3: Initialize analyzer
    const analyzer = new JavaScriptAnalyzer();
    const repoPath = config.rootDirectory || process.cwd();

    // Step 4: Detect SDK
    const sdkUsage = await analyzer.detectSDK(changedFiles, repoPath);

    if (!sdkUsage.detected) {
      core.info('No RudderStack SDK detected');
      const comment = generatePRComment(
        {
          status: 'success',
          issues: [],
          changes: {
            eventsAdded: [],
            eventsModified: [],
            eventsRemoved: [],
            propertyChanges: [],
          },
          filesAnalyzed: changedFiles.map((f) => ({
            path: f,
            analyzed: true,
            sdkDetected: false,
          })),
        },
        { verbosity: config.outputVerbosity, includePropertyDetails: false }
      );

      await postOrUpdateComment(prContext, config.githubToken, comment);
      setOutputs({ status: 'success', errorCount: 0, warningCount: 0, suggestionCount: 0 });
      return;
    }

    core.info(`SDK detected: ${sdkUsage.type} v${sdkUsage.version || 'unknown'}`);

    // Step 5: Validate API usage
    core.info('Validating SDK API usage...');
    const issues = await analyzer.validateAPI(changedFiles, repoPath);

    // Step 6: Get files with SDK usage
    const filesWithSDK = await analyzer.getFilesWithSDK(repoPath);
    core.info(`Found ${issues.length} issues`);
    core.info(`Files with SDK usage (${filesWithSDK.length}): ${JSON.stringify(filesWithSDK)}`);
    core.info(`Changed files (${changedFiles.length}): ${JSON.stringify(changedFiles.slice(0, 5))}...`);

    const filesWithSDKSet = new Set(filesWithSDK);

    core.info(`=== PATH MATCHING DEBUG ===`);
    core.info(`SDK files Set contains: ${[...filesWithSDKSet].join(', ')}`);

    // Check a few files explicitly
    if (changedFiles.length > 0) {
      const firstFile = changedFiles[0];
      core.info(`Testing first changed file: "${firstFile}"`);
      core.info(`Set has it: ${filesWithSDKSet.has(firstFile)}`);
      core.info(`Set size: ${filesWithSDKSet.size}`);
    }

    const result: AnalysisResult = {
      status: issues.some((i) => i.severity === 'error') ? 'partial' : 'success',
      issues,
      changes: {
        eventsAdded: [],
        eventsModified: [],
        eventsRemoved: [],
        propertyChanges: [],
      },
      filesAnalyzed: changedFiles.map((f) => ({
        path: f,
        analyzed: true,
        sdkDetected: filesWithSDKSet.has(f),
      })),
    };

    // Final debug: show what we're sending to comment generator
    const sdkCount = result.filesAnalyzed.filter(f => f.sdkDetected).length;
    core.info(`Result has ${result.filesAnalyzed.length} files analyzed, ${sdkCount} with SDK`);

    // Step 7: Generate and post report
    core.info('Generating report...');
    const comment = generatePRComment(result, {
      verbosity: config.outputVerbosity,
      includePropertyDetails: false,
    });

    await postOrUpdateComment(prContext, config.githubToken, comment);

    // Step 8: Set outputs
    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;
    const suggestionCount = issues.filter((i) => i.severity === 'suggestion').length;

    setOutputs({
      status: result.status,
      errorCount,
      warningCount,
      suggestionCount,
    });

    core.info(
      `✅ Analysis complete: ${errorCount} errors, ${warningCount} warnings, ${suggestionCount} suggestions`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.error(`Analysis failed: ${message}`);
    throw error;
  }
}
