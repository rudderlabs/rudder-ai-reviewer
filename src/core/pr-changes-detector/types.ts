export interface PRChangesResult {
  pull_request: {
    number: number;
    title: string;
    head_sha: string;
    base_sha: string;
    head_ref: string;
    base_ref: string;
    files_changed_count: number;
    lines_added: number;
    lines_deleted: number;
    lines_changed: number;
  };
  diff_context: DiffFile[];
}

export interface DiffFile {
  file_path: string;
  patch: string;
  hunks: number;
  additions: number;
  deletions: number;
  status: FileStatus;
}

export type FileStatus =
  | 'added'
  | 'removed'
  | 'modified'
  | 'renamed'
  | 'copied'
  | 'changed'
  | 'unchanged';
