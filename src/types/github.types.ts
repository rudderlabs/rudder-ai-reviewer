export interface GitHubPRMetadata {
  number: number;
  title: string;
  head_sha: string;
  base_sha: string;
  head_ref: string;
  base_ref: string;
}
