import * as core from '@actions/core';
import type {
  ChangeRequestContext,
  ProviderChangedFile,
  ProviderCommentReference,
  ProviderInlineComment,
  ProviderPRMetadata,
  ProviderRepositoryMetadata,
  SCMProvider,
} from '@core/providers';
import { Gitlab } from '@gitbeaker/rest';
import { COMMENT_INLINE_MARKER } from '@utils/constants';

interface GitLabClientOptions {
  host: string;
  token?: string;
}

interface GitLabNoteLike {
  id: number;
  body?: string;
  system?: boolean;
}

interface GitLabDiscussionLike {
  id: string;
  notes?: GitLabNoteLike[];
}

export class GitLabClient implements SCMProvider {
  readonly id = 'gitlab' as const;

  private readonly host: string;

  constructor(
    private readonly gitlab: InstanceType<typeof Gitlab>,
    options: { host: string }
  ) {
    this.host = options.host.replace(/\/+$/, '');
  }

  static create(options: GitLabClientOptions): GitLabClient {
    const api = new Gitlab({
      host: options.host,
      token: options.token,
    });

    return new GitLabClient(api, { host: options.host });
  }

  async getRepositoryMetadata(ctx: ChangeRequestContext): Promise<ProviderRepositoryMetadata> {
    const projectPath = this.toProjectPath(ctx);
    const [project, languages] = await Promise.all([
      this.gitlab.Projects.show(projectPath),
      this.gitlab.Projects.showLanguages(projectPath),
    ]);

    return {
      visibility: project.visibility as 'public' | 'private' | 'internal',
      primary_language: (project as { language?: string | null }).language ?? undefined,
      languages: languages as Record<string, number>,
    };
  }

  async getChangeRequestMetadata(ctx: ChangeRequestContext): Promise<ProviderPRMetadata> {
    const projectPath = this.toProjectPath(ctx);
    const [mergeRequest, diffRefs] = await Promise.all([
      this.gitlab.MergeRequests.show(projectPath, ctx.number),
      this.getDiffRefs(projectPath, ctx.number),
    ]);

    return {
      number: (mergeRequest as { iid?: number }).iid ?? ctx.number,
      title: (mergeRequest as { title?: string }).title ?? `MR ${ctx.number}`,
      head_sha: (mergeRequest as { sha?: string }).sha ?? diffRefs.head_sha,
      base_sha: diffRefs.base_sha,
      head_ref: (mergeRequest as { source_branch?: string }).source_branch ?? '',
      base_ref: (mergeRequest as { target_branch?: string }).target_branch ?? '',
    };
  }

  async getChangedFiles(ctx: ChangeRequestContext): Promise<ProviderChangedFile[]> {
    const projectPath = this.toProjectPath(ctx);
    const changesResponse = await this.gitlab.MergeRequests.showChanges(projectPath, ctx.number);
    const changes = (changesResponse as { changes?: Array<Record<string, unknown>> }).changes ?? [];

    return changes.map(change => {
      const diff = typeof change.diff === 'string' ? change.diff : '';
      const { additions, deletions } = this.countDiffStats(diff);
      const newPath = typeof change.new_path === 'string' ? change.new_path : '';
      const oldPath = typeof change.old_path === 'string' ? change.old_path : newPath;

      return {
        filename: newPath || oldPath,
        previous_filename: oldPath !== newPath ? oldPath : undefined,
        status: this.mapFileStatus(change),
        additions,
        deletions,
        patch: diff || undefined,
      };
    });
  }

  async getChangedFilesMap(
    ctx: ChangeRequestContext
  ): Promise<Map<string, { start: number; end: number; status: string }>> {
    const files = await this.getChangedFiles(ctx);
    const fileMap = new Map<string, { start: number; end: number; status: string }>();

    files.forEach(file => {
      if (file.patch && file.status !== 'removed') {
        const lineRanges = this.parsePatchLineRanges(file.patch);
        if (lineRanges) {
          fileMap.set(file.filename, {
            start: lineRanges.start,
            end: lineRanges.end,
            status: file.status,
          });
          return;
        }
      }

      fileMap.set(file.filename, {
        start: 1,
        end: file.status === 'removed' ? 0 : Number.MAX_SAFE_INTEGER,
        status: file.status,
      });
    });

    return fileMap;
  }

  async findSummaryComment(ctx: ChangeRequestContext, marker: string): Promise<number | null> {
    const notes = await this.getMergeRequestNotes(ctx);
    const existing = notes.find(note => note.body?.includes(marker));
    return existing?.id ?? null;
  }

  async createSummaryComment(ctx: ChangeRequestContext, body: string): Promise<number> {
    const projectPath = this.toProjectPath(ctx);
    const note = await this.gitlab.MergeRequestNotes.create(projectPath, ctx.number, body);
    return (note as { id: number }).id;
  }

  async updateSummaryComment(
    ctx: ChangeRequestContext,
    commentId: number,
    body: string
  ): Promise<void> {
    const projectPath = this.toProjectPath(ctx);
    await this.gitlab.MergeRequestNotes.edit(projectPath, ctx.number, commentId, { body });
  }

  async findInlineComments(
    ctx: ChangeRequestContext,
    marker: string
  ): Promise<ProviderCommentReference[]> {
    const projectPath = this.toProjectPath(ctx);
    const discussions = (await this.gitlab.MergeRequestDiscussions.all(projectPath, ctx.number, {
      maxPages: 20,
      perPage: 100,
    })) as GitLabDiscussionLike[];
    const notes = await this.getMergeRequestNotes(ctx);

    const results = new Map<number, ProviderCommentReference>();
    discussions.forEach(discussion => {
      (discussion.notes ?? []).forEach(note => {
        if (!note.system && typeof note.body === 'string' && note.body.includes(marker)) {
          results.set(note.id, { id: note.id, body: note.body });
        }
      });
    });

    notes.forEach(note => {
      if (!note.system && typeof note.body === 'string' && note.body.includes(marker)) {
        results.set(note.id, { id: note.id, body: note.body });
      }
    });

    return Array.from(results.values());
  }

  async createInlineReview(
    ctx: ChangeRequestContext,
    comments: ProviderInlineComment[],
    commitId?: string
  ): Promise<number> {
    if (comments.length === 0) {
      return 0;
    }

    const projectPath = this.toProjectPath(ctx);
    const metadata = await this.getChangeRequestMetadata(ctx);
    let firstDiscussionId = 0;
    const fallbackComments: ProviderInlineComment[] = [];

    for (const comment of comments) {
      try {
        const created = await this.gitlab.MergeRequestDiscussions.create(
          projectPath,
          ctx.number,
          `${COMMENT_INLINE_MARKER}\n${comment.body}`,
          {
            commitId,
            position: this.toDiscussionPosition(comment, metadata) as any,
          }
        );

        if (!firstDiscussionId) {
          const createdId = Number.parseInt((created as { id?: string }).id ?? '', 10);
          firstDiscussionId = Number.isFinite(createdId) ? createdId : 1;
        }
      } catch (error) {
        fallbackComments.push(comment);
        const message = error instanceof Error ? error.message : 'Unknown error';
        core.warning(
          `Failed to create GitLab inline comment for ${comment.path}:${comment.line}. ${message}`
        );
      }
    }

    if (fallbackComments.length > 0) {
      const fallbackBody = this.formatInlineFallbackNote(fallbackComments, commitId);
      const note = await this.gitlab.MergeRequestNotes.create(
        projectPath,
        ctx.number,
        fallbackBody
      );
      const fallbackNoteId = (note as { id: number }).id;
      core.warning(
        `Fell back to summary note for ${fallbackComments.length} inline comment(s) in GitLab.`
      );
      return firstDiscussionId || fallbackNoteId;
    }

    return firstDiscussionId || 1;
  }

  buildLineUrl(
    ctx: ChangeRequestContext,
    commitSha: string,
    file: string,
    line: number,
    _column?: number
  ): string {
    const encodedPath = encodeURI(file);
    return `${this.host}/${ctx.owner}/${ctx.repo}/-/blob/${commitSha}/${encodedPath}#L${line}`;
  }

  private toProjectPath(ctx: ChangeRequestContext): string {
    return `${ctx.owner}/${ctx.repo}`;
  }

  private async getMergeRequestNotes(ctx: ChangeRequestContext): Promise<GitLabNoteLike[]> {
    const projectPath = this.toProjectPath(ctx);
    const perPage = 100;
    const notes: GitLabNoteLike[] = [];
    let page = 1;

    while (true) {
      const pageNotes = (await this.gitlab.MergeRequestNotes.all(projectPath, ctx.number, {
        page,
        perPage,
        sort: 'desc',
        orderBy: 'updated_at',
      })) as GitLabNoteLike[];

      notes.push(...pageNotes);

      if (pageNotes.length < perPage) {
        break;
      }

      page += 1;
    }

    return notes.filter(note => !note.system);
  }

  private mapFileStatus(change: Record<string, unknown>): string {
    if (change.deleted_file) {
      return 'removed';
    }
    if (change.new_file) {
      return 'added';
    }
    if (change.renamed_file) {
      return 'renamed';
    }
    return 'modified';
  }

  private countDiffStats(diff: string): { additions: number; deletions: number } {
    return diff.split('\n').reduce(
      (acc, line) => {
        if (line.startsWith('+++') || line.startsWith('---')) {
          return acc;
        }
        if (line.startsWith('+')) {
          acc.additions += 1;
        } else if (line.startsWith('-')) {
          acc.deletions += 1;
        }
        return acc;
      },
      { additions: 0, deletions: 0 }
    );
  }

  private parsePatchLineRanges(patch: string): { start: number; end: number } | null {
    const lines = patch.split('\n');
    let minLine = Number.MAX_SAFE_INTEGER;
    let maxLine = 0;

    for (const line of lines) {
      const match = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/);
      if (!match) {
        continue;
      }

      const start = Number.parseInt(match[1], 10);
      const count = match[2] ? Number.parseInt(match[2], 10) : 1;
      const end = count === 0 ? start : start + count - 1;
      minLine = Math.min(minLine, start);
      maxLine = Math.max(maxLine, end);
    }

    if (minLine === Number.MAX_SAFE_INTEGER || maxLine === 0) {
      return null;
    }

    return { start: minLine, end: maxLine };
  }

  private async getDiffRefs(
    projectPath: string,
    mergeRequestIid: number
  ): Promise<{ head_sha: string; base_sha: string; start_sha: string }> {
    const versions = (await this.gitlab.MergeRequests.allDiffVersions(
      projectPath,
      mergeRequestIid
    )) as Array<{ head_commit_sha?: string; base_commit_sha?: string; start_commit_sha?: string }>;
    const latest = versions[0] ?? {};

    const headSha = latest.head_commit_sha ?? '';
    const baseSha = latest.base_commit_sha ?? process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA ?? '';
    const startSha = latest.start_commit_sha ?? baseSha;

    return {
      head_sha: headSha,
      base_sha: baseSha,
      start_sha: startSha,
    };
  }

  private toDiscussionLinePosition(
    side: ProviderInlineComment['side'],
    line: number
  ): Record<string, number> {
    if (side === 'LEFT') {
      return { oldLine: line };
    }

    return { newLine: line };
  }

  private toDiscussionPosition(
    comment: ProviderInlineComment,
    metadata: ProviderPRMetadata
  ): Record<string, string | number | Record<string, number> | Record<string, Record<string, number>>> {
    const position: Record<
      string,
      string | number | Record<string, number> | Record<string, Record<string, number>>
    > = {
      positionType: 'text',
      baseSha: metadata.base_sha,
      headSha: metadata.head_sha,
      startSha: metadata.start_sha ?? metadata.base_sha,
      oldPath: comment.path,
      newPath: comment.path,
      ...this.toDiscussionLinePosition(comment.side, comment.line),
    };

    if (comment.start_line && comment.start_side) {
      position.lineRange = {
        start: this.toDiscussionLinePosition(comment.start_side, comment.start_line),
        end: this.toDiscussionLinePosition(comment.side, comment.line),
      };
    }

    return position;
  }

  private formatInlineFallbackNote(comments: ProviderInlineComment[], commitId?: string): string {
    const lines = comments.map(
      comment => `- \`${comment.path}:${comment.line}\`: ${comment.body.replace(/\n/g, ' ')}`
    );

    return [
      COMMENT_INLINE_MARKER,
      '### Inline Findings (Fallback)',
      'GitLab could not attach some inline comments directly to diff positions, so they are listed here.',
      '',
      ...lines,
      commitId ? `\nCommit: \`${commitId}\`` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
