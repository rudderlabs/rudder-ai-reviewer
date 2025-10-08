/**
 * Simplified Orchestrator
 * Coordinates core components with proper error handling
 */

import * as core from '@actions/core';
import * as path from 'path';
import { ActionConfig, AnalysisResult, Issue } from '../types/common';
import { JavaScriptAnalyzer } from '../analyzers/javascript/javascript-analyzer';
import { getPRContext, getChangedFiles, postOrUpdateComment, setOutputs, getPRDiff, isLineChanged } from '../integrations/github';
import { generatePRComment, generateReviewComment } from '../reporters/comment-generator';
import { postInlineAnnotations, InlineAnnotation } from '../integrations/github/pr-client';
import { createRudderStackClient } from '../integrations/rudderstack-api';
import { validateAgainstTrackingPlan } from '../integrations/rudderstack-api/tracking-plan-validator';
import { analyzeFile } from '../analyzers/javascript/static-analyzer';

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

    // Step 5b: Tracking Plan Validation (if credentials provided)
    let trackingPlanIssues: Issue[] = [];

    if (config.serviceAccessToken) {
      core.info('=== Starting RudderStack API Integration ===');
      core.debug(`Service access token provided: true`);
      core.debug(`Source ID: ${config.sourceId || 'not provided'}`);

      try {
        const rudderStackClient = createRudderStackClient({
          serviceAccessToken: config.serviceAccessToken,
          sourceId: config.sourceId,
        });

        // Test connection
        core.info('Testing connection to RudderStack API...');
        const connected = await rudderStackClient.testConnection();
        core.info(`Connection status: ${connected ? 'SUCCESS' : 'FAILED'}`);

        if (connected) {
          // Fetch tracking plan
          core.info('Fetching tracking plan...');
          const trackingPlan = await rudderStackClient.getTrackingPlan();

          if (trackingPlan) {
            core.info(`✓ Tracking plan retrieved with ${trackingPlan.events.length} events`);
            core.debug(`Tracking plan events: ${trackingPlan.events.map(e => e.name).join(', ')}`);

            // Analyze files to extract SDK calls
            core.info('Analyzing files for SDK calls...');
            const allAnalyzedCalls: Array<{ file: string; calls: any[] }> = [];

            // Use changed files for analysis
            for (const file of changedFiles) {
              try {
                const filePath = path.join(scanPath, file);
                core.debug(`Analyzing file: ${filePath}`);
                const fileAnalysis = await analyzeFile(filePath);
                core.debug(`File analysis complete: ${fileAnalysis.calls.length} SDK calls found`);

                if (fileAnalysis.calls.length > 0) {
                  allAnalyzedCalls.push({
                    file: file,
                    calls: fileAnalysis.calls,
                  });
                  core.debug(`Added ${fileAnalysis.calls.length} calls from ${file} for tracking plan validation`);
                }
              } catch (error) {
                core.debug(`Failed to analyze ${file}: ${error}`);
              }
            }

            core.info(`Total files with SDK calls: ${allAnalyzedCalls.length}`);
            const totalCalls = allAnalyzedCalls.reduce((sum, f) => sum + f.calls.length, 0);
            core.info(`Total SDK calls to validate: ${totalCalls}`);

            if (allAnalyzedCalls.length === 0) {
              core.warning('No SDK calls found to validate against tracking plan');
            } else {
              core.info('Validating against tracking plan...');
              core.info(`Validating ${allAnalyzedCalls.length} files with SDK calls...`);

              // Validate each file's calls
              for (const { file, calls } of allAnalyzedCalls) {
                core.debug(`Validating ${calls.length} calls in ${file}...`);

                // Log event names found
                const eventNames = calls
                  .filter(c => c.eventName && !c.hasDynamicEventName)
                  .map(c => c.eventName);
                if (eventNames.length > 0) {
                  core.debug(`  Event names in ${file}: ${eventNames.join(', ')}`);
                }

                const validationResult = validateAgainstTrackingPlan(calls, trackingPlan, file);
                trackingPlanIssues.push(...validationResult.issues);

                core.info(
                  `✓ ${file}: ${validationResult.validEvents.length} valid, ${validationResult.unknownEvents.length} unknown, ${validationResult.issues.length} issues`
                );

                if (validationResult.unknownEvents.length > 0) {
                  core.debug(`  Unknown events: ${validationResult.unknownEvents.join(', ')}`);
                }
                if (validationResult.issues.length > 0) {
                  core.debug(`  Issues: ${validationResult.issues.map(i => `${i.severity}: ${i.message}`).join('; ')}`);
                }
              }

              core.info(`Total tracking plan issues found: ${trackingPlanIssues.length}`);
            }
          } else {
            core.warning('⚠ No tracking plan found for this workspace/source');
          }
        }
      } catch (error) {
        core.error(`❌ RudderStack API integration failed: ${error}`);
        if (error instanceof Error) {
          core.debug(`Error stack: ${error.stack}`);
        }
        core.warning('Continuing with static analysis only (tracking plan validation skipped)');
      }

      core.info('=== RudderStack API Integration Complete ===');
    } else {
      core.debug('No service access token provided, skipping tracking plan validation');
    }

    // Merge tracking plan issues with API issues
    const allIssues = [...issues, ...trackingPlanIssues];

    core.info('=== Issue Summary ===');
    core.info(`API issues: ${issues.length}`);
    core.info(`Tracking plan issues: ${trackingPlanIssues.length}`);
    core.info(`Total issues: ${allIssues.length}`);

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
      status: allIssues.some((i) => i.severity === 'error') ? 'partial' : 'success',
      issues: allIssues,
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

    // Get PR diff to check which lines are actually in the diff
    const diffInfo = await getPRDiff(prContext.owner, prContext.repo, prContext.prNumber, config.githubToken);
    const changedFilesSet = new Set(changedFiles);
    const inlineAnnotations: InlineAnnotation[] = [];
    const outsideIssues = {
      errors: [] as typeof result.issues,
      warnings: [] as typeof result.issues,
      suggestions: [] as typeof result.issues,
    };
    const inPRSuggestions: typeof result.issues = [];

    result.issues.forEach((issue) => {
      // Check if both file AND specific line are in the PR diff
      const isInPR = changedFilesSet.has(issue.file) && issue.line && isLineChanged(diffInfo, issue.file, issue.line);
      const shouldIncludeOutside = config.reviewUnchangedFiles;

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

      // Track suggestions (separate in-PR from outside)
      if (issue.severity === 'suggestion') {
        if (isInPR) {
          inPRSuggestions.push(issue);
        } else if (shouldIncludeOutside) {
          outsideIssues.suggestions.push(issue);
        }
      }
    });

    // Generate review comment body (in-PR suggestions + outside issues)
    const reviewBody = generateReviewComment(inPRSuggestions, outsideIssues);

    // Prepare outside issues info for summary comment
    const outsideIssuesInfo = config.reviewUnchangedFiles ? {
      errorCount: outsideIssues.errors.length,
      warningCount: outsideIssues.warnings.length,
      suggestionCount: outsideIssues.suggestions.length,
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
        reviewUnchangedFiles: config.reviewUnchangedFiles,
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
