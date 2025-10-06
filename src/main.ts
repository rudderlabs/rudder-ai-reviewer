/**
 * RudderStack PR Reviewer - Main Entry Point
 *
 * This GitHub Action analyzes RudderStack SDK instrumentation changes in pull requests
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { ActionConfig } from './types/common';
import { detectSDKInstallation } from './core/sdk-detector';
import { postSDKDetectionComment, postInlineAnnotations, InlineAnnotation } from './integrations/github/pr-client';

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

    core.info('🔍 Detecting RudderStack SDK installation...');

    // Detect SDK installation
    const sdkDetection = await detectSDKInstallation(workspacePath);

    core.info(`SDK detection complete: ${sdkDetection.installationType}`);
    if (sdkDetection.npmVersion) {
      core.info(`- NPM version: ${sdkDetection.npmVersion}`);
    }
    if (sdkDetection.cdnVersion) {
      core.info(`- CDN version: ${sdkDetection.cdnVersion}`);
    }

    // Post PR comment with detection results
    core.info('💬 Posting SDK detection comment to PR...');
    await postSDKDetectionComment(sdkDetection, {
      owner,
      repo,
      pullNumber: prNumber,
      token: config.githubToken,
    });

    // Try to create inline annotations for SDK locations in changed files
    if (sdkDetection.locations.length > 0) {
      core.info(`📍 Attempting to create inline comments for ${sdkDetection.locations.length} location(s)...`);

      const annotations: InlineAnnotation[] = sdkDetection.locations.map((loc) => {
        // Adjust path for GitHub (add prefix if analyzing subdirectory)
        const githubPath = pathPrefix ? `${pathPrefix}/${loc.file}` : loc.file;

        return {
          path: githubPath,
          line: loc.line,
          annotation_level: 'notice',
          message: `🔍 **RudderStack SDK detected (${loc.type.toUpperCase()})**\n\n\`\`\`\n${loc.snippet}\n\`\`\``,
        };
      });

      // This will only post comments on files that are part of the PR diff
      // All locations are listed in the main PR comment
      await postInlineAnnotations(annotations, {
        owner,
        repo,
        pullNumber: prNumber,
        token: config.githubToken,
      });
    }

    // Set outputs
    core.setOutput('analysis_status', 'success');
    core.setOutput('error_count', 0);
    core.setOutput('warning_count', 0);
    core.setOutput('suggestion_count', 0);

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

// Run the action
run();
