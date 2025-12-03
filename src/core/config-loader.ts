/**
 * Configuration Loader
 * Loads and merges configuration from file and workflow inputs
 */

import * as core from '@actions/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ActionConfig, FileConfig } from '../types/common';

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
    anthropicApiKey: core.getInput('anthropic_api_key', { required: true }),
    rootDirectory: core.getInput('root_directory') || undefined,
    configPath: core.getInput('config_path') || '.rudderstack-pr-reviewer.yml',
    reviewUnchangedFiles: core.getBooleanInput('review_unchanged_files') || false,
    aiModel: core.getInput('ai_model') || 'claude-sonnet-4-5',
    maxTokensPerRequest: parseInt(core.getInput('max_tokens_per_request') || '64000', 10),
    annotationMode: (core.getInput('annotation_mode') as 'errors_only' | 'errors_warnings') || 'errors_warnings',
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

  // AI configuration (workflow overrides file config)
  const aiModel =
    workflowConfig.aiModel !== 'claude-sonnet-4-5'
      ? workflowConfig.aiModel
      : fileConfig.ai?.model || 'claude-sonnet-4-5';

  const maxTokensPerRequest =
    workflowConfig.maxTokensPerRequest !== 64000
      ? workflowConfig.maxTokensPerRequest
      : fileConfig.ai?.max_tokens_per_request || 64000;

  const annotationMode =
    workflowConfig.annotationMode !== 'errors_warnings'
      ? workflowConfig.annotationMode
      : fileConfig.annotation_mode || 'errors_warnings';

  return {
    ...workflowConfig,
    aiModel,
    maxTokensPerRequest,
    annotationMode,
  };
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

  if (!config.anthropicApiKey) {
    errors.push('anthropic_api_key is required');
  }

  // Allow any model name - validation happens at Anthropic API level
  if (!config.aiModel || config.aiModel.trim() === '') {
    errors.push('ai_model cannot be empty');
  }

  if (config.maxTokensPerRequest < 10000 || config.maxTokensPerRequest > 200000) {
    errors.push(`Invalid max_tokens_per_request: ${config.maxTokensPerRequest} (must be between 10000 and 200000)`);
  }

  if (!['errors_only', 'errors_warnings'].includes(config.annotationMode)) {
    errors.push(`Invalid annotation_mode: ${config.annotationMode}`);
  }

  if (errors.length > 0) {
    errors.forEach((error) => core.error(error));
    return false;
  }

  return true;
}
