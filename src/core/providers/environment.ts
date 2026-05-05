import type { ProviderId } from './types';

export function isGitLabMergeRequestEnvironment(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.CI_MERGE_REQUEST_IID && env.CI_PROJECT_PATH);
}

export function detectProviderIdFromEnvironment(env: NodeJS.ProcessEnv): ProviderId {
  if (isGitLabMergeRequestEnvironment(env)) {
    return 'gitlab';
  }

  return 'github';
}
