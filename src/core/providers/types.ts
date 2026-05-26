export type ProviderId = 'github' | 'gitlab';

export interface ChangeRequestContext {
  provider: ProviderId;
  owner: string;
  repo: string;
  number: number;
}

export interface ProviderRepositoryMetadata {
  visibility?: 'public' | 'private' | 'internal';
  primary_language?: string;
  languages?: Record<string, number>;
}

export interface ProviderPRMetadata {
  number: number;
  title: string;
  head_sha: string;
  base_sha: string;
  head_ref: string;
  base_ref: string;
  start_sha?: string;
}

export interface ProviderChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface ProviderInlineComment {
  path: string;
  body: string;
  line: number;
  start_line?: number;
  side: 'LEFT' | 'RIGHT';
  start_side?: 'LEFT' | 'RIGHT';
}

export interface ProviderCommentReference {
  id: number;
  body: string;
}

export interface SCMProvider {
  readonly id: ProviderId;
  getRepositoryMetadata(ctx: ChangeRequestContext): Promise<ProviderRepositoryMetadata>;
  getChangeRequestMetadata(ctx: ChangeRequestContext): Promise<ProviderPRMetadata>;
  getChangedFiles(ctx: ChangeRequestContext): Promise<ProviderChangedFile[]>;
  getChangedFilesMap(
    ctx: ChangeRequestContext
  ): Promise<Map<string, { start: number; end: number; status: string }>>;
  findSummaryComment(ctx: ChangeRequestContext, marker: string): Promise<number | null>;
  createSummaryComment(ctx: ChangeRequestContext, body: string): Promise<number>;
  updateSummaryComment(ctx: ChangeRequestContext, commentId: number, body: string): Promise<void>;
  findInlineComments(
    ctx: ChangeRequestContext,
    marker: string
  ): Promise<ProviderCommentReference[]>;
  createInlineReview(
    ctx: ChangeRequestContext,
    comments: ProviderInlineComment[],
    commitId?: string
  ): Promise<number>;
  buildLineUrl(
    ctx: ChangeRequestContext,
    commitSha: string,
    file: string,
    line: number,
    column?: number
  ): string;
}
