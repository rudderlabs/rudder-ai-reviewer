/**
 * Simplified Orchestrator
 * Coordinates core components with proper error handling
 */

import * as core from '@actions/core';
import * as path from 'path';
import { ActionConfig, AnalysisResult, Issue } from '../types/common';
import { JavaScriptAnalyzer } from '../analyzers/javascript/javascript-analyzer';
import { getPRContext, getChangedFiles, postOrUpdateComment, setOutputs } from '../integrations/github';
import { generatePRComment, generateReviewComment } from '../reporters/comment-generator';
import { postInlineAnnotations, InlineAnnotation } from '../integrations/github/pr-client';

/**
 * Format issue as inline comment message
 */
function formatInlineMessage(issue: Issue): string {
  const severityIcon = issue.severity === 'error' ? '❌' : '⚠️';
  const lines: string[] = [];

  lines.push(`${severityIcon} **${issue.message}**`);

  if (issue.impact) {
    lines.push(`\n_Impact:_ ${issue.impact}`);
  }

  if (issue.fix) {
    lines.push('\n_Suggested fix:_');
    lines.push('```javascript');
    lines.push(issue.fix);
    lines.push('```');
  }

  if (issue.confidence) {
    lines.push(`\n_Confidence: ${issue.confidence}_`);
  }

  return lines.join('\n');
}

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

    // Get repo root (always the workspace root)
    const repoRoot = process.env.GITHUB_WORKSPACE || process.cwd();

    // Determine scan path: use config.rootDirectory if provided, otherwise repo root
    let scanPath: string;
    if (config.rootDirectory) {
      scanPath = path.isAbsolute(config.rootDirectory)
        ? config.rootDirectory
        : path.join(repoRoot, config.rootDirectory);
    } else {
      scanPath = repoRoot;
    }

    core.info(`Repo root: ${repoRoot}`);
    core.info(`Scan path: ${scanPath}`);

    // Step 4: Detect SDK
    const sdkUsage = await analyzer.detectSDK(changedFiles, scanPath);

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
    const issues = await analyzer.validateAPI(changedFiles, scanPath, repoRoot);

    // Step 6: Get files with SDK usage and method call count (pass repoRoot for correct relative paths)
    const filesWithSDK = await analyzer.getFilesWithSDK(scanPath, repoRoot);
    const methodCallCount = await analyzer.getMethodCallCount(scanPath, repoRoot);
    core.info(`Found ${issues.length} issues`);
    core.info(`Files with SDK usage (${filesWithSDK.length}): ${JSON.stringify(filesWithSDK)}`);
    core.info(`Total method calls: ${methodCallCount}`);

    // When root_directory is set, analyze ALL files in that directory, not just changed files
    // This is useful for testing/development with sample apps
    const filesToReport = config.rootDirectory ? filesWithSDK : changedFiles;
    core.info(`Files to report (${filesToReport.length}): Using ${config.rootDirectory ? 'all files with SDK' : 'changed files'}`);

    const filesWithSDKSet = new Set(filesWithSDK);

    const result: AnalysisResult = {
      status: issues.some((i) => i.severity === 'error') ? 'partial' : 'success',
      issues,
      changes: {
        eventsAdded: [],
        eventsModified: [],
        eventsRemoved: [],
        propertyChanges: [],
      },
      filesAnalyzed: filesToReport.map((f) => ({
        path: f,
        analyzed: true,
        sdkDetected: filesWithSDKSet.has(f),
      })),
    };

    const sdkCount = result.filesAnalyzed.filter(f => f.sdkDetected).length;
    core.info(`Result has ${result.filesAnalyzed.length} files analyzed, ${sdkCount} with SDK`);

    // Step 7: Generate and post report
    core.info('Generating report...');

    // Prepare SDK info for summary
    const sdkInfo = {
      type: sdkUsage.type,
      version: sdkUsage.version,
      methodCallsCount: methodCallCount,
      framework: undefined as string | undefined, // Can be enhanced later with framework detection
    };

    // Step 7b: Post review with inline comments (errors/warnings) and review body (suggestions)
    core.info('Posting inline review comments...');

    // Separate issues into those in PR files and those outside
    const changedFilesSet = new Set(changedFiles);
    const inlineAnnotations: InlineAnnotation[] = [];
    const outsideIssues = { errors: [] as typeof result.issues, warnings: [] as typeof result.issues };
    let outsideSuggestionCount = 0;

    result.issues.forEach((issue) => {
      const isInPR = changedFilesSet.has(issue.file);
      const shouldIncludeOutside = config.annotateFilesOutsidePR;

      if ((issue.severity === 'error' || issue.severity === 'warning') && issue.line) {
        if (isInPR || shouldIncludeOutside) {
          // Add to inline annotations (will be filtered later in pr-client)
          inlineAnnotations.push({
            path: issue.file,
            line: issue.line,
            message: formatInlineMessage(issue),
            annotation_level: issue.severity === 'error' ? 'failure' : 'warning',
          });
        }

        // Track outside issues for review comment
        if (!isInPR && shouldIncludeOutside) {
          if (issue.severity === 'error') {
            outsideIssues.errors.push(issue);
          } else {
            outsideIssues.warnings.push(issue);
          }
        }
      }

      // Track outside suggestions
      if (issue.severity === 'suggestion' && !isInPR && shouldIncludeOutside) {
        outsideSuggestionCount++;
      }
    });

    // Generate review comment body (suggestions + outside issues)
    const reviewBody = generateReviewComment(result, outsideIssues);

    // Prepare outside issues info for summary comment
    const outsideIssuesInfo = config.annotateFilesOutsidePR ? {
      errorCount: outsideIssues.errors.length,
      warningCount: outsideIssues.warnings.length,
      suggestionCount: outsideSuggestionCount,
    } : undefined;

    // Generate and post summary comment with outside issues breakdown
    const comment = generatePRComment(result, {
      verbosity: config.outputVerbosity,
      includePropertyDetails: false,
    }, sdkInfo, outsideIssuesInfo);

    await postOrUpdateComment(prContext, config.githubToken, comment);

    // Post review with inline comments and suggestions
    if (inlineAnnotations.length > 0 || reviewBody) {
      await postInlineAnnotations(inlineAnnotations, {
        owner: prContext.owner,
        repo: prContext.repo,
        pullNumber: prContext.prNumber,
        token: config.githubToken,
        clearPrevious: config.clearPreviousComments,
        annotateFilesOutsidePR: config.annotateFilesOutsidePR,
        reviewBody: reviewBody || undefined,
      });
    } else {
      core.info('No inline comments or suggestions to post');
    }

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
