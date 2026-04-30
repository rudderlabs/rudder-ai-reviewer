import type { ChangeRequestContext, ProviderInlineComment } from '@core/providers';
import { GitLabClient } from '@clients/gitlab.client';
import { COMMENT_INLINE_MARKER } from '@utils/constants';

describe('GitLabClient provider contract', () => {
  const context: ChangeRequestContext = {
    provider: 'gitlab',
    owner: 'test-group/subgroup',
    repo: 'test-repo',
    number: 7,
  };

  function makeGitLabApi() {
    return {
      Projects: {
        show: jest.fn().mockResolvedValue({ visibility: 'private', language: 'TypeScript' }),
        showLanguages: jest.fn().mockResolvedValue({ TypeScript: 100 }),
      },
      MergeRequests: {
        show: jest.fn().mockResolvedValue({
          iid: 7,
          title: 'MR',
          sha: 'head',
          source_branch: 'feature',
          target_branch: 'main',
        }),
        showChanges: jest.fn().mockResolvedValue({
          changes: [
            {
              new_path: 'src/a.ts',
              old_path: 'src/a.ts',
              new_file: false,
              deleted_file: false,
              renamed_file: false,
              diff: '@@ -1 +1 @@\n-old\n+new',
            },
          ],
        }),
        allDiffVersions: jest.fn().mockResolvedValue([
          {
            head_commit_sha: 'head',
            base_commit_sha: 'base',
            start_commit_sha: 'start',
          },
        ]),
      },
      MergeRequestNotes: {
        all: jest.fn().mockResolvedValue([{ id: 99, body: 'hello <!-- marker -->', system: false }]),
        create: jest.fn().mockResolvedValue({ id: 11 }),
        edit: jest.fn().mockResolvedValue({}),
      },
      MergeRequestDiscussions: {
        all: jest
          .fn()
          .mockResolvedValue([{ id: '15', notes: [{ id: 201, body: 'inline <!-- marker-inline -->' }] }]),
        create: jest.fn().mockResolvedValue({ id: '55' }),
      },
    };
  }

  it('adapts metadata and changed-files methods to provider contract', async () => {
    const api = makeGitLabApi();
    const client = new GitLabClient(api as any, { host: 'https://gitlab.example.com' });

    await expect(client.getRepositoryMetadata(context)).resolves.toMatchObject({
      visibility: 'private',
      primary_language: 'TypeScript',
    });
    await expect(client.getChangeRequestMetadata(context)).resolves.toMatchObject({
      number: 7,
      head_sha: 'head',
      base_sha: 'base',
    });
    await expect(client.getChangedFiles(context)).resolves.toHaveLength(1);
    await expect(client.getChangedFilesMap(context)).resolves.toBeInstanceOf(Map);
  });

  it('adapts summary comment methods to provider contract', async () => {
    const api = makeGitLabApi();
    const client = new GitLabClient(api as any, { host: 'https://gitlab.example.com' });

    await expect(client.findSummaryComment(context, '<!-- marker -->')).resolves.toBe(99);
    await expect(client.createSummaryComment(context, 'new summary')).resolves.toBe(11);
    await expect(client.updateSummaryComment(context, 99, 'updated')).resolves.toBeUndefined();

    expect(api.MergeRequestNotes.create).toHaveBeenCalledWith(
      'test-group/subgroup/test-repo',
      7,
      'new summary'
    );
    expect(api.MergeRequestNotes.edit).toHaveBeenCalledWith(
      'test-group/subgroup/test-repo',
      7,
      99,
      { body: 'updated' }
    );
  });

  it('adapts inline comment methods to provider contract', async () => {
    const api = makeGitLabApi();
    const client = new GitLabClient(api as any, { host: 'https://gitlab.example.com' });
    const comments: ProviderInlineComment[] = [
      { path: 'src/a.ts', line: 10, body: 'msg', side: 'RIGHT' },
    ];

    await expect(client.findInlineComments(context, '<!-- marker-inline -->')).resolves.toEqual([
      { id: 201, body: 'inline <!-- marker-inline -->' },
    ]);
    await expect(client.createInlineReview(context, comments, 'head')).resolves.toBe(55);

    expect(api.MergeRequestDiscussions.create).toHaveBeenCalledWith(
      'test-group/subgroup/test-repo',
      7,
      expect.stringContaining(`${COMMENT_INLINE_MARKER}\nmsg`),
      expect.objectContaining({
        commitId: 'head',
      })
    );
  });

  it('falls back to MR note when inline discussion creation fails', async () => {
    const api = makeGitLabApi();
    api.MergeRequestDiscussions.create.mockRejectedValue(new Error('position error'));
    const client = new GitLabClient(api as any, { host: 'https://gitlab.example.com' });
    const comments: ProviderInlineComment[] = [
      { path: 'src/a.ts', line: 10, body: 'msg', side: 'RIGHT' },
    ];

    await expect(client.createInlineReview(context, comments, 'head')).resolves.toBe(11);
    expect(api.MergeRequestNotes.create).toHaveBeenCalledWith(
      'test-group/subgroup/test-repo',
      7,
      expect.stringContaining('Inline Findings (Fallback)')
    );
  });

  it('builds line URL via provider helper', () => {
    const client = new GitLabClient(makeGitLabApi() as any, { host: 'https://gitlab.example.com/' });
    const url = client.buildLineUrl(context, 'abc123', 'src/app.ts', 42, 9);
    expect(url).toBe(
      'https://gitlab.example.com/test-group/subgroup/test-repo/-/blob/abc123/src/app.ts#L42'
    );
  });
});
