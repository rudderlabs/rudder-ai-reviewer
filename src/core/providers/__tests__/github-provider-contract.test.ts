import type { ChangeRequestContext, ProviderInlineComment } from '@core/providers';
import { GitHubClient } from '@clients/github.client';

describe('GitHubClient provider contract', () => {
  const context: ChangeRequestContext = {
    provider: 'github',
    owner: 'test-owner',
    repo: 'test-repo',
    number: 7,
  };

  function makeOctokit() {
    return {
      rest: {
        repos: {
          get: jest
            .fn()
            .mockResolvedValue({ data: { visibility: 'public', language: 'TypeScript' } }),
          listLanguages: jest.fn().mockResolvedValue({ data: { TypeScript: 100 } }),
        },
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: {
              number: 7,
              title: 'PR',
              head: { sha: 'head', ref: 'feature' },
              base: { sha: 'base', ref: 'main' },
            },
          }),
          listFiles: jest.fn(),
          listReviewComments: jest.fn(),
          createReview: jest.fn().mockResolvedValue({ data: { id: 55 } }),
        },
        issues: {
          listComments: jest.fn(),
          createComment: jest.fn().mockResolvedValue({ data: { id: 11 } }),
          updateComment: jest.fn().mockResolvedValue({ data: {} }),
        },
      },
      paginate: jest.fn(),
    };
  }

  it('adapts metadata and changed-files methods to provider contract', async () => {
    const octokit = makeOctokit();
    octokit.paginate.mockResolvedValue([
      {
        filename: 'src/a.ts',
        status: 'modified',
        additions: 1,
        deletions: 1,
        patch: '@@ -1 +1 @@',
      },
    ]);

    const client = new GitHubClient(octokit as any);

    await expect(client.getRepositoryMetadata(context)).resolves.toMatchObject({
      visibility: 'public',
      primary_language: 'TypeScript',
    });
    await expect(client.getChangeRequestMetadata(context)).resolves.toMatchObject({ number: 7 });
    await expect(client.getChangedFiles(context)).resolves.toHaveLength(1);
    await expect(client.getChangedFilesMap(context)).resolves.toBeInstanceOf(Map);
  });

  it('adapts summary comment methods to provider contract', async () => {
    const octokit = makeOctokit();
    octokit.paginate.mockResolvedValueOnce([{ id: 99, body: 'hello <!-- marker -->' }]);
    const client = new GitHubClient(octokit as any);

    await expect(client.findSummaryComment(context, '<!-- marker -->')).resolves.toBe(99);
    await expect(client.createSummaryComment(context, 'new summary')).resolves.toBe(11);
    await expect(client.updateSummaryComment(context, 99, 'updated')).resolves.toBeUndefined();

    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      issue_number: 7,
      body: 'new summary',
    });
    expect(octokit.rest.issues.updateComment).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      comment_id: 99,
      body: 'updated',
    });
  });

  it('adapts inline comment methods to provider contract', async () => {
    const octokit = makeOctokit();
    octokit.paginate
      .mockResolvedValueOnce([{ id: 201, body: 'inline <!-- marker-inline -->' }])
      .mockResolvedValueOnce([
        { filename: 'src/a.ts', status: 'modified', additions: 1, deletions: 0 },
      ]);
    const client = new GitHubClient(octokit as any);
    const comments: ProviderInlineComment[] = [
      { path: 'src/a.ts', line: 10, body: 'msg', side: 'RIGHT' },
    ];

    await expect(client.findInlineComments(context, '<!-- marker-inline -->')).resolves.toEqual([
      { id: 201, body: 'inline <!-- marker-inline -->' },
    ]);
    await expect(client.createInlineReview(context, comments, 'head')).resolves.toBe(55);

    expect(octokit.rest.pulls.createReview).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      pull_number: 7,
      event: 'COMMENT',
      body: undefined,
      comments,
      commit_id: 'head',
    });
  });

  it('builds line URL via provider helper', () => {
    const client = new GitHubClient(makeOctokit() as any);
    const url = client.buildLineUrl(context, 'abc123', 'src/app.ts', 42, 9);
    expect(url).toBe('https://github.com/test-owner/test-repo/blob/abc123/src/app.ts#L42');
  });
});
