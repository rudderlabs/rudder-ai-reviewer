/**
 * RudderStack PR Reviewer - Main Entry Point
 *
 * This GitHub Action analyzes RudderStack SDK instrumentation changes in pull requests
 */

import * as core from '@actions/core';
import { loadConfig, validateConfig } from './core/config-loader';
import { runSimplifiedAnalysis } from './core/simple-orchestrator';

/**
 * Main action entry point
 */
async function run(): Promise<void> {
  try {
    core.info('🚀 RudderStack PR Reviewer starting...');

    // Load and validate configuration
    const config = await loadConfig();

    // Validate configuration
    if (!validateConfig(config)) {
      core.setFailed('Invalid configuration');
      return;
    }

    core.info('Configuration:');
    core.info(`- Source ID: ${config.sourceId || 'not specified'}`);
    core.info(`- Output verbosity: ${config.outputVerbosity}`);

    // Run simplified analysis (core functionality that works)
    await runSimplifiedAnalysis(config);

    core.info('✅ Analysis complete');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    core.error(`Action failed: ${errorMessage}`);
    if (errorStack) {
      core.debug(`Stack trace: ${errorStack}`);
    }

    core.setFailed(errorMessage);

    // Set failed outputs
    core.setOutput('analysis_status', 'failed');
    core.setOutput('error_count', 0);
    core.setOutput('warning_count', 0);
    core.setOutput('suggestion_count', 0);
  }
}

// Run the action
run();
