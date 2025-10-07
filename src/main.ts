/**
 * RudderStack PR Reviewer - Main Entry Point
 *
 * This GitHub Action analyzes RudderStack SDK instrumentation changes in pull requests
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { ActionConfig } from './types/common';
import { detectSDKInstallation } from './core/sdk-detector';
import { scanFilesForSDKUsage, SDKMethodCall } from './core/file-scanner';
import { validateSDKMethodCalls } from './core/api-validator';
import { detectSDKChanges } from './core/change-detector';
import { postAnalysisReport, postInlineAnnotations, postNoSDKComment, InlineAnnotation } from './integrations/github/pr-client';
import { getPRDiff, isLineChanged } from './integrations/github/diff-parser';

/**
 * Main action entry point
 */
async function run(): Promise<void> {
  try {
    core.info('🚀 RudderStack PR Reviewer starting...');

    // Parse action inputs
    const config = getActionConfig();

    core.info(`Configuration loaded:`);
    core.info(`- Source ID: ${config.sourceId || 'not specified'}`);
    core.info(`- Config path: ${config.configPath}`);
    core.info(`- Output verbosity: ${config.outputVerbosity}`);
    core.info(`- Annotate existing code: ${config.annotateExistingCode}`);

    // Get PR context
    const context = github.context;
    if (!context.payload.pull_request) {
      throw new Error('This action can only be run on pull_request events');
    }

    const prNumber = context.payload.pull_request.number;
    const owner = context.repo.owner;
    const repo = context.repo.repo;

    core.info(`Analyzing PR #${prNumber} in ${owner}/${repo}`);

    // Get workspace path (use root_directory if provided, otherwise GitHub workspace)
    const githubWorkspace = process.env.GITHUB_WORKSPACE;
    if (!githubWorkspace) {
      throw new Error('GITHUB_WORKSPACE environment variable is not set');
    }

    let workspacePath = config.rootDirectory;
    if (!workspacePath) {
      workspacePath = githubWorkspace;
    }

    // Calculate path prefix for GitHub annotations (relative to repo root)
    const pathPrefix = config.rootDirectory
      ? config.rootDirectory.replace(githubWorkspace, '').replace(/^\//, '')
      : '';

    core.info(`Analyzing directory: ${workspacePath}`);
    if (pathPrefix) {
      core.info(`Path prefix for annotations: ${pathPrefix}`);
    }

    // Step 1: Detect SDK installation
    core.info('🔍 Step 1: Detecting RudderStack SDK installation...');
    const sdkDetection = await detectSDKInstallation(workspacePath);

    core.info(`SDK detection complete: ${sdkDetection.installationType}`);
    if (sdkDetection.npmVersion) {
      core.info(`- NPM version: ${sdkDetection.npmVersion}`);
    }
    if (sdkDetection.cdnVersion) {
      core.info(`- CDN version: ${sdkDetection.cdnVersion}`);
    }

    // Early exit if SDK not detected
    if (sdkDetection.installationType === 'none') {
      core.info('⏭️  No RudderStack SDK detected. Skipping analysis.');

      await postNoSDKComment({
        owner,
        repo,
        pullNumber: prNumber,
        token: config.githubToken,
      });

      core.setOutput('analysis_status', 'success');
      core.setOutput('error_count', 0);
      core.setOutput('warning_count', 0);
      core.setOutput('suggestion_count', 0);

      core.info('✅ Analysis complete (no SDK detected)');
      return;
    }

    // Step 2: Get PR diff information
    core.info('📋 Step 2: Getting PR diff information...');
    const diffInfo = await getPRDiff(owner, repo, prNumber, config.githubToken);
    core.info(`PR has ${diffInfo.changedFiles.size} changed file(s)`);

    // Step 3: Scan files for SDK method calls
    core.info('📂 Step 3: Scanning files for SDK usage...');
    const scanResult = await scanFilesForSDKUsage(workspacePath);
    core.info(`Found ${scanResult.methodCalls.length} SDK method calls in ${scanResult.filesWithSDK} file(s)`);

    // Step 4: Filter SDK calls based on annotate_existing_code config
    let callsToValidate = scanResult.methodCalls;

    if (!config.annotateExistingCode) {
      core.info('🔍 Filtering to only validate changed lines (annotate_existing_code=false)...');
      callsToValidate = filterCallsToChangedLines(scanResult.methodCalls, diffInfo, workspacePath, pathPrefix);
      core.info(`Filtered to ${callsToValidate.length} SDK calls on changed lines`);
    } else {
      core.info('🔍 Validating all SDK calls (annotate_existing_code=true)');
    }

    // Step 5: Validate SDK method calls
    core.info('✅ Step 5: Validating SDK method calls...');
    // Use NPM version if available, otherwise CDN version, otherwise latest
    const sdkVersionForValidation = sdkDetection.npmVersion || sdkDetection.cdnVersion;
    const validation = await validateSDKMethodCalls(callsToValidate, sdkVersionForValidation);
    core.info(`Validation complete: ${validation.errors.length} errors, ${validation.warnings.length} warnings, ${validation.suggestions.length} suggestions`);

    // Step 6: Detect changes from base branch
    core.info('🔄 Step 6: Detecting changes from base branch...');
    const baseBranch = context.payload.pull_request.base.ref;
    const headBranch = context.payload.pull_request.head.ref;
    core.info(`Comparing ${baseBranch}...${headBranch}`);

    const changes = await detectSDKChanges(workspacePath, baseBranch, headBranch);
    core.info(`Changes: ${changes.addedCalls.length} added, ${changes.removedCalls.length} removed, ${changes.modifiedCalls.length} modified`);

    // Step 7: Post analysis report
    core.info('💬 Step 7: Posting analysis report to PR...');
    await postAnalysisReport(sdkDetection, validation, changes, {
      owner,
      repo,
      pullNumber: prNumber,
      token: config.githubToken,
      pathPrefix: pathPrefix || undefined,
    });

    // Step 8: Create inline annotations for validation issues (or clear previous if configured)
    core.info(`📍 Step 8: Processing inline comments...`);

    const annotations: InlineAnnotation[] = [];

    // Add error annotations
    for (const error of validation.errors) {
      const githubPath = pathPrefix ? `${pathPrefix}/${error.file}` : error.file;
      const fixBlock = error.fix ? `\n\n**Fix:**\n\`\`\`javascript\n${error.fix}\n\`\`\`` : '';
      annotations.push({
        path: githubPath,
        line: error.line,
        annotation_level: 'failure',
        message: `❌ **Error in \`${error.method}()\`**\n\n**Issue:** ${error.message}${fixBlock}\n\n**Current code:**\n\`\`\`javascript\n${error.code}\n\`\`\``,
      });
    }

    // Add warning annotations
    for (const warning of validation.warnings) {
      const githubPath = pathPrefix ? `${pathPrefix}/${warning.file}` : warning.file;
      const fixBlock = warning.fix ? `\n\n**Recommendation:**\n\`\`\`javascript\n${warning.fix}\n\`\`\`` : '';
      annotations.push({
        path: githubPath,
        line: warning.line,
        annotation_level: 'warning',
        message: `⚠️ **Warning in \`${warning.method}()\`**\n\n**Issue:** ${warning.message}${fixBlock}`,
      });
    }

    // Add suggestion annotations (only if verbosity is high)
    if (config.outputVerbosity === 'detailed') {
      for (const suggestion of validation.suggestions) {
        const githubPath = pathPrefix ? `${pathPrefix}/${suggestion.file}` : suggestion.file;
        const fixBlock = suggestion.fix ? `\n\n**Suggestion:**\n\`\`\`javascript\n${suggestion.fix}\n\`\`\`` : '';
        annotations.push({
          path: githubPath,
          line: suggestion.line,
          annotation_level: 'notice',
          message: `💡 **Suggestion for \`${suggestion.method}()\`**\n\n**Issue:** ${suggestion.message}${fixBlock}`,
        });
      }
    }

    // Always call postInlineAnnotations if clearPrevious is true (to clear old comments)
    // or if we have new annotations to post
    if (config.clearPreviousComments || annotations.length > 0) {
      await postInlineAnnotations(annotations, {
        owner,
        repo,
        pullNumber: prNumber,
        token: config.githubToken,
        clearPrevious: config.clearPreviousComments,
      });
    }

    // Set outputs
    core.setOutput('analysis_status', 'success');
    core.setOutput('error_count', validation.errors.length);
    core.setOutput('warning_count', validation.warnings.length);
    core.setOutput('suggestion_count', validation.suggestions.length);

    core.info('✅ Analysis complete');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.setFailed(`Action failed: ${errorMessage}`);

    // Set failed outputs
    core.setOutput('analysis_status', 'failed');
  }
}

/**
 * Parse GitHub Action inputs into config object
 */
function getActionConfig(): ActionConfig {
  return {
    serviceAccessToken: core.getInput('service_access_token', { required: true }),
    sourceId: core.getInput('source_id') || undefined,
    githubToken: core.getInput('github_token', { required: true }),
    rootDirectory: core.getInput('root_directory') || undefined,
    configPath: core.getInput('config_path') || '.rudderstack-pr-reviewer.yml',
    filePatterns: parseCommaSeparated(core.getInput('file_patterns')),
    excludePatterns: parseCommaSeparated(core.getInput('exclude_patterns')),
    annotateExistingCode: core.getBooleanInput('annotate_existing_code'),
    outputVerbosity: (core.getInput('output_verbosity') || 'standard') as 'minimal' | 'standard' | 'detailed',
    clearPreviousComments: core.getBooleanInput('clear_previous_comments'),
  };
}

/**
 * Parse comma-separated string into array
 */
function parseCommaSeparated(input: string): string[] | undefined {
  if (!input || input.trim() === '') {
    return undefined;
  }
  return input.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Filters SDK method calls to only those on changed lines
 */
function filterCallsToChangedLines(
  allCalls: SDKMethodCall[],
  diffInfo: ReturnType<typeof getPRDiff> extends Promise<infer T> ? T : never,
  _workspacePath: string,
  pathPrefix: string
): SDKMethodCall[] {
  return allCalls.filter((call) => {
    // call.file is already relative to workspacePath (from file scanner)
    // If we have a path prefix, we need to add it for GitHub comparison
    const githubPath = pathPrefix ? `${pathPrefix}/${call.file}` : call.file;

    // Check if this line was changed in the PR
    const isChanged = isLineChanged(diffInfo, githubPath, call.line);

    if (isChanged) {
      core.debug(`Including ${githubPath}:${call.line} - line was changed`);
    } else {
      core.debug(`Skipping ${githubPath}:${call.line} - line was not changed`);
    }

    return isChanged;
  });
}

// Run the action
run();
