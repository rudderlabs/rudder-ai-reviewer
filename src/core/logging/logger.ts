import * as core from '@actions/core';
import { detectProviderIdFromEnvironment } from '@core/providers/environment';

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}

const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const providerId = detectProviderIdFromEnvironment(process.env);
const isDebugEnabled = process.env.RUNNER_DEBUG === '1' || process.env.LOG_LEVEL === 'debug';

const consoleLogger: Logger = {
  debug: message => {
    if (isDebugEnabled) {
      console.debug(message);
    }
  },
  info: message => {
    console.info(message);
  },
  warning: message => {
    console.warn(message);
  },
  error: message => {
    console.error(message);
  },
};

const actionsLogger: Logger = {
  debug: message => core.debug(message),
  info: message => core.info(message),
  warning: message => core.warning(message),
  error: message => core.error(message),
};

export const logger: Logger =
  providerId === 'github' && isGitHubActions ? actionsLogger : consoleLogger;
