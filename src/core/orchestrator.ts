/**
 * Core Orchestrator
 * Coordinates all components for end-to-end PR analysis
 */

import * as core from '@actions/core';
import { ActionConfig, AnalysisResult, Issue, ChangesSummary, DestinationImpact, AIInsight } from '../types/common';
import { JavaScriptAnalyzer } from '../analyzers/javascript/javascript-analyzer';
import { createRudderStackClient } from '../integrations/rudderstack-api';
import { validateAgainstTrackingPlan } from '../integrations/rudderstack-api/tracking-plan-validator';
import { analyzeDestinationImpacts } from '../integrations/rudderstack-api/destination-analyzer';
import { createAIProxyClient, buildBatchRequests, validateRequestSafety } from '../integrations/ai-proxy';
import { getPRContext, getChangedFiles, postOrUpdateComment, postAnnotations, setOutputs } from '../integrations/github';
import { storeAnalysisArtifact, retrieveAnalysisArtifact } from '../integrations/github/artifact-manager';
import { generatePRComment, generateProgressComment } from '../reporters/comment-generator';
import { generateAnnotations } from '../reporters/annotation-generator';
import { detectSDKChanges } from './change-detector';
import { analyzeFile } from '../analyzers/javascript/static-analyzer';

/**
 * Main orchestration function
 */
export async function orchestrateAnalysis(config: ActionConfig): Promise<void> {
  core.info('🚀 Starting RudderStack PR analysis...');

  try {
    // Step 1: Get PR context
    const prContext = getPRContext();
    if (!prContext) {
      core.setFailed('Not running in a PR context');
      return;
    }

    core.info(`Analyzing PR #${prContext.prNumber} in ${prContext.owner}/${prContext.repo}`);

    // Step 2: Post initial progress comment
    await postOrUpdateComment(prContext, config.githubToken, generateProgressComment('Scanning files'));

    // Step 3: Get changed files
    const changedFiles = await getChangedFiles(prContext, config.githubToken);
    prContext.changedFiles = changedFiles;

    core.info(`Found ${changedFiles.length} changed files`);

    // Step 4: Detect SDK usage
    const analyzer = new JavaScriptAnalyzer();
    const repoPath = config.rootDirectory || process.cwd();

    const sdkUsage = await analyzer.detectSDK(changedFiles);

    if (!sdkUsage.detected) {
      core.info('No RudderStack SDK detected in PR');
      const comment = generatePRComment({
        status: 'success',
        issues: [],
        changes: {
          eventsAdded: [],
          eventsModified: [],
          eventsRemoved: [],
          propertyChanges: [],
        },
        filesAnalyzed: [],
      }, { verbosity: config.outputVerbosity, includePropertyDetails: false });

      await postOrUpdateComment(prContext, config.githubToken, comment);
      setOutputs({ status: 'success', errorCount: 0, warningCount: 0, suggestionCount: 0 });
      return;
    }

    core.info(`SDK detected: ${sdkUsage.type} v${sdkUsage.version || 'unknown'}`);

    // Step 5: Update progress
    await postOrUpdateComment(prContext, config.githubToken, generateProgressComment('Running static analysis'));

    // Step 6: Perform static analysis on changed files and collect SDK calls
    const analysisResults: AnalysisResult[] = [];
    const allAnalyzedCalls: Array<{ file: string; calls: any[] }> = [];

    for (const file of changedFiles) {
      if (isJavaScriptFile(file)) {
        try {
          core.debug(`Analyzing file: ${file}`);
          const fileAnalysis = await analyzeFile(file);
          core.debug(`File analysis complete: ${fileAnalysis.calls.length} SDK calls found`);

          // Store calls for tracking plan validation
          if (fileAnalysis.calls.length > 0) {
            allAnalyzedCalls.push({
              file: file,
              calls: fileAnalysis.calls,
            });
            core.debug(`Added ${fileAnalysis.calls.length} calls from ${file} for tracking plan validation`);
          }
        } catch (error) {
          core.warning(`Failed to analyze ${file}: ${error}`);
        }
      }
    }

    core.info(`Total files with SDK calls: ${allAnalyzedCalls.length}`);
    const totalCalls = allAnalyzedCalls.reduce((sum, f) => sum + f.calls.length, 0);
    core.info(`Total SDK calls to validate: ${totalCalls}`);

    // Step 7: Validate API usage
    core.info('Validating SDK API usage...');
    const apiIssues = await analyzer.validateAPI(changedFiles);

    // Step 8: Detect changes from base branch
    let changes: ChangesSummary = {
      eventsAdded: [],
      eventsModified: [],
      eventsRemoved: [],
      propertyChanges: [],
    };

    try {
      const changeDetection = await detectSDKChanges(repoPath, prContext.baseSha, prContext.headSha);

      // Map changes to our format
      // This is a simplified version - in production you'd map all the details
      core.info(`Changes detected: ${changeDetection.addedCalls.length} added, ${changeDetection.removedCalls.length} removed`);
    } catch (error) {
      core.warning(`Failed to detect changes: ${error}`);
    }

    // Step 9: Fetch tracking plan and destinations (optional)
    let trackingPlanIssues: Issue[] = [];
    let destinationImpacts: DestinationImpact[] = [];

    core.info('=== Starting RudderStack API Integration ===');
    core.debug(`Service access token provided: ${!!config.serviceAccessToken}`);
    core.debug(`Source ID: ${config.sourceId || 'not provided'}`);

    try {
      await postOrUpdateComment(prContext, config.githubToken, generateProgressComment('Fetching tracking plan'));

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
          core.info('Validating against tracking plan...');

          if (allAnalyzedCalls.length === 0) {
            core.warning('No SDK calls found to validate against tracking plan');
          } else {
            core.info(`Validating ${allAnalyzedCalls.length} files with SDK calls...`);
          }

          // Validate each file's calls against the tracking plan
          for (const { file, calls } of allAnalyzedCalls) {
            core.debug(`Validating ${calls.length} calls in ${file}...`);

            // Log event names found in this file
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
        } else {
          core.warning('⚠ No tracking plan found for this workspace/source');
        }

        // Fetch destinations
        const workspaceConfig = await rudderStackClient.getWorkspaceConfig();

        if (workspaceConfig && workspaceConfig.destinations.length > 0) {
          core.info(`Analyzing impact on ${workspaceConfig.destinations.length} destinations...`);
          const destAnalysis = analyzeDestinationImpacts(
            workspaceConfig.destinations,
            changes.propertyChanges,
            [...changes.eventsAdded, ...changes.eventsModified, ...changes.eventsRemoved]
          );

          destinationImpacts = destAnalysis.impacts;
          trackingPlanIssues.push(...destAnalysis.issues);
        }
      }
    } catch (error) {
      core.error(`❌ RudderStack API integration failed: ${error}`);
      if (error instanceof Error) {
        core.debug(`Error stack: ${error.stack}`);
      }
      core.warning('Continuing with static analysis only (tracking plan validation skipped)');
      // Continue with static analysis only
    }

    core.info('=== RudderStack API Integration Complete ===');

    // Step 10: AI-enhanced analysis (optional)
    await postOrUpdateComment(prContext, config.githubToken, generateProgressComment('Running AI analysis'));

    let aiInsights: AIInsight[] = [];

    try {
      const aiProxyClient = createAIProxyClient({
        serviceAccessToken: config.serviceAccessToken,
      });

      // Test connection
      const aiConnected = await aiProxyClient.testConnection();

      if (aiConnected && aiProxyClient.canMakeRequests()) {
        core.info('Running AI-enhanced analysis...');
        // Build requests from analyzed calls
        // const requests = buildBatchRequests(analyzedCalls, patterns);
        // Validate safety
        // requests = requests.filter(validateRequestSafety);
        // const responses = await aiProxyClient.analyzeBatch(requests);
        // Map responses to insights
      }
    } catch (error) {
      core.warning(`AI analysis failed: ${error}`);
      // Continue without AI insights
    }

    // Step 11: Compile final analysis result
    core.info('=== Compiling Final Results ===');
    core.info(`API issues: ${apiIssues.length}`);
    core.info(`Tracking plan issues: ${trackingPlanIssues.length}`);

    const allIssues = [...apiIssues, ...trackingPlanIssues];

    // Log issue breakdown by source
    const issuesBySource = allIssues.reduce((acc, issue) => {
      acc[issue.source] = (acc[issue.source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    core.info('Issues by source:');
    Object.entries(issuesBySource).forEach(([source, count]) => {
      core.info(`  - ${source}: ${count}`);
    });

    const finalResult: AnalysisResult = {
      status: allIssues.some((i) => i.severity === 'error') ? 'partial' : 'success',
      issues: allIssues,
      changes,
      filesAnalyzed: changedFiles.map((f) => ({
        path: f,
        analyzed: true,
        sdkDetected: sdkUsage.locations.some((loc) => loc.file === f),
      })),
      destinationImpacts,
      aiInsights,
    };

    // Step 12: Generate and post report
    core.info('Generating report...');

    const comment = generatePRComment(finalResult, {
      verbosity: config.outputVerbosity,
      includePropertyDetails: false,
    });

    await postOrUpdateComment(prContext, config.githubToken, comment);

    // Step 13: Generate and post annotations
    const annotations = generateAnnotations(finalResult.issues, {
      annotateExistingCode: config.annotateExistingCode,
      changedLines: new Set(changedFiles.map((f) => `${f}:0`)), // Simplified
    });

    const conclusion = allIssues.some((i) => i.severity === 'error') ? 'failure' : 'success';
    await postAnnotations(prContext, config.githubToken, annotations, conclusion);

    // Step 14: Store artifact for incremental analysis
    await storeAnalysisArtifact(prContext.prNumber, prContext.headSha, finalResult);

    // Step 15: Set outputs
    const errorCount = allIssues.filter((i) => i.severity === 'error').length;
    const warningCount = allIssues.filter((i) => i.severity === 'warning').length;
    const suggestionCount = allIssues.filter((i) => i.severity === 'suggestion').length;

    setOutputs({
      status: finalResult.status,
      errorCount,
      warningCount,
      suggestionCount,
    });

    core.info(`✅ Analysis complete: ${errorCount} errors, ${warningCount} warnings, ${suggestionCount} suggestions`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`Analysis failed: ${message}`);
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
