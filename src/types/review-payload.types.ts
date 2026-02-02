export interface ReviewPayload {
  source_id: string;
  repository: RepositoryInfo;
  pull_request: PullRequestInfo;
  detected_sdk?: DetectedSDK;
  diff_context: DiffContext[];
  github_action: GitHubActionInfo;
  frameworks: FrameworkInfo[];
  existing_review_comments?: ExistingReviewComment[];
}

export interface ExistingReviewComment {
  id: number;
  body: string;
}

export interface RepositoryInfo {
  owner: string;
  name: string;
  visibility?: 'public' | 'private' | 'internal';
  primary_language?: string;
  languages?: Record<string, number>;
}

export interface PullRequestInfo {
  number: number;
  title: string;
  head_sha: string;
  base_sha: string;
  head_ref: string;
  base_ref: string;
  files_changed_count?: number;
  lines_added?: number;
  lines_deleted?: number;
  lines_changed?: number;
}

export interface DetectedSDK {
  name?: string;
  version?: string;
  installation_type?: 'npm' | 'cdn';
}

export interface DiffContext {
  file_path: string;
  patch: string;
  hunks?: number;
  additions?: number;
  deletions?: number;
  status?: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged';
}

export interface GitHubActionInfo {
  name: string;
  version: string;
}

export interface FrameworkInfo {
  name: string;
  version?: string;
}
