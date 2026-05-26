import { NotPullRequestContextError } from '@core/shared/errors';

export interface GitLabMergeRequestContext {
  projectPath: string;
  mergeRequestIid: number;
}

/**
 * Extracts merge request context from GitLab CI environment.
 */
export function extractGitLabMergeRequestContext(
  env: NodeJS.ProcessEnv = process.env
): GitLabMergeRequestContext {
  const projectPath = env.CI_PROJECT_PATH;
  const mergeRequestIidRaw = env.CI_MERGE_REQUEST_IID;

  const mergeRequestIid = mergeRequestIidRaw ? Number.parseInt(mergeRequestIidRaw, 10) : NaN;

  if (!projectPath || !Number.isFinite(mergeRequestIid)) {
    throw new NotPullRequestContextError();
  }

  return {
    projectPath,
    mergeRequestIid,
  };
}
