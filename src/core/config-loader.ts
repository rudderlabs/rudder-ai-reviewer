/**
 * Configuration Loader
 * Loads and merges configuration from file and workflow inputs
 */

import * as core from '@actions/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ActionConfig, FileConfig, PerformanceLimits } from '../types/common';

/**
 * Default performance limits
 */
const DEFAULT_LIMITS: PerformanceLimits = {
  maxFiles: 100,
  maxFileSizeMB: 2,
  maxLinesPerFile: 10000,
  maxTotalLines: 100000,
  staticAnalysisTimeoutMs: 5 * 60 * 1000, // 5 minutes
  aiAnalysisTimeoutMs: 10 * 60 * 1000, // 10 minutes
  totalTimeoutMs: 20 * 60 * 1000, // 20 minutes
  maxAIRequests: 30,
};

/**
 * Load complete configuration
 */
export async function loadConfig(rootDirectory?: string): Promise<ActionConfig> {
  const workingDir = rootDirectory || process.cwd();

  // Load workflow inputs (from action inputs)
  const workflowConfig = loadWorkflowInputs();

  // Load file configuration
  const fileConfig = await loadFileConfig(workingDir, workflowConfig.configPath);

  // Merge configurations (workflow inputs take precedence)
  const mergedConfig = mergeConfigurations(workflowConfig, fileConfig);

  core.info('Configuration loaded successfully');
  return mergedConfig;
}

/**
 * Load configuration from workflow inputs
 */
function loadWorkflowInputs(): ActionConfig {
  return {
    serviceAccessToken: core.getInput('service_access_token', { required: true }),
    sourceId: core.getInput('source_id') || undefined,
    githubToken: core.getInput('github_token', { required: true }),
    rootDirectory: core.getInput('root_directory') || undefined,
    configPath: core.getInput('config_path') || '.rudderstack-pr-reviewer.yml',
    filePatterns: parseCommaSeparated(core.getInput('file_patterns')),
    excludePatterns: parseCommaSeparated(core.getInput('exclude_patterns')),
    outputVerbosity: (core.getInput('output_verbosity') as any) || 'standard',
    reviewUnchangedFiles: core.getBooleanInput('review_unchanged_files') || false,
  };
}

/**
 * Load configuration from file
 */
async function loadFileConfig(
  workingDir: string,
  configPath: string
): Promise<FileConfig | null> {
  try {
    const fullPath = path.join(workingDir, configPath);

    // Check if config file exists
    try {
      await fs.access(fullPath);
    } catch {
      core.info(`No config file found at ${configPath}, using defaults`);
      return null;
    }

    // Read and parse config file
    const content = await fs.readFile(fullPath, 'utf-8');
    const config = yaml.load(content) as FileConfig;

    core.info(`Loaded configuration from ${configPath}`);
    return config;
  } catch (error) {
    core.warning(`Failed to load config file: ${error}`);
    return null;
  }
}

/**
 * Merge workflow and file configurations
 */
function mergeConfigurations(
  workflowConfig: ActionConfig,
  fileConfig: FileConfig | null
): ActionConfig {
  if (!fileConfig) {
    return workflowConfig;
  }

  // File patterns: merge or override
  const filePatterns =
    workflowConfig.filePatterns ||
    fileConfig.file_patterns?.include ||
    ['**/*.{js,jsx,ts,tsx,mjs,cjs}'];

  const excludePatterns =
    workflowConfig.excludePatterns ||
    fileConfig.file_patterns?.exclude ||
    ['**/node_modules/**', '**/dist/**', '**/build/**', '**/*.test.{js,ts}', '**/*.spec.{js,ts}'];

  // Output verbosity
  const outputVerbosity =
    workflowConfig.outputVerbosity !== 'standard'
      ? workflowConfig.outputVerbosity
      : fileConfig.output_format?.verbosity || 'standard';

  return {
    ...workflowConfig,
    filePatterns,
    excludePatterns,
    outputVerbosity,
  };
}

/**
 * Get performance limits (with overrides from file config)
 */
export function getPerformanceLimits(fileConfig?: FileConfig): PerformanceLimits {
  if (!fileConfig || !fileConfig.limits) {
    return DEFAULT_LIMITS;
  }

  return {
    maxFiles: fileConfig.limits.max_files || DEFAULT_LIMITS.maxFiles,
    maxFileSizeMB: fileConfig.limits.max_file_size_mb || DEFAULT_LIMITS.maxFileSizeMB,
    maxLinesPerFile: DEFAULT_LIMITS.maxLinesPerFile,
    maxTotalLines: DEFAULT_LIMITS.maxTotalLines,
    staticAnalysisTimeoutMs: DEFAULT_LIMITS.staticAnalysisTimeoutMs,
    aiAnalysisTimeoutMs: DEFAULT_LIMITS.aiAnalysisTimeoutMs,
    totalTimeoutMs: DEFAULT_LIMITS.totalTimeoutMs,
    maxAIRequests: DEFAULT_LIMITS.maxAIRequests,
  };
}

/**
 * Parse comma-separated string into array
 */
function parseCommaSeparated(input: string): string[] | undefined {
  if (!input || input.trim() === '') {
    return undefined;
  }

  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Validate configuration
 */
export function validateConfig(config: ActionConfig): boolean {
  const errors: string[] = [];

  if (!config.serviceAccessToken) {
    errors.push('service_access_token is required');
  }

  if (!config.githubToken) {
    errors.push('github_token is required');
  }

  if (!['minimal', 'standard', 'detailed'].includes(config.outputVerbosity)) {
    errors.push(`Invalid output_verbosity: ${config.outputVerbosity}`);
  }

  if (errors.length > 0) {
    errors.forEach((error) => core.error(error));
    return false;
  }

  return true;
}
