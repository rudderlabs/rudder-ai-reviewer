/**
 * RudderStack PR Reviewer - Main Entry Point
 *
 * This GitHub Action analyzes RudderStack SDK instrumentation changes in pull requests
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { ActionConfig } from './types/common';

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

    // TODO: Implement core analysis logic
    // 1. Load previous artifact (if incremental)
    // 2. Scan files for RudderStack usage
    // 3. Run static analysis
    // 4. Post initial PR comment
    // 5. Fetch workspace config & tracking plan (async)
    // 6. Run AI analysis (async)
    // 7. Update PR comment with all results
    // 8. Save artifact for next run

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
