import type { GitHubPRContext } from '@core/shared/github';
import { GitHubClient } from '../github.client';

describe('GitHubClient', () => {
  const mockContext: GitHubPRContext = {
    owner: 'test-owner',
    repo: 'test-repo',
    prNumber: 123,
  };

  describe('getRepositoryMetadata', () => {
    it('should fetch repository metadata successfully', async () => {
      const mockRepoData = {
        visibility: 'public',
        language: 'TypeScript',
      };

      const mockLanguagesData = {
        TypeScript: 50000,
        JavaScript: 30000,
        CSS: 5000,
      };

      const mockOctokit = {
        rest: {
          repos: {
            get: jest.fn().mockResolvedValue({ data: mockRepoData }),
            listLanguages: jest.fn().mockResolvedValue({ data: mockLanguagesData }),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      const metadata = await client.getRepositoryMetadata('test-owner', 'test-repo');

      expect(metadata).toEqual({
        visibility: 'public',
        primary_language: 'TypeScript',
        languages: {
          TypeScript: 50000,
          JavaScript: 30000,
          CSS: 5000,
        },
      });
      expect(mockOctokit.rest.repos.get).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
      });
      expect(mockOctokit.rest.repos.listLanguages).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
      });
    });

    it('should handle null language gracefully', async () => {
      const mockRepoData = {
        visibility: 'private',
        language: null,
      };

      const mockLanguagesData = {
        Python: 15000,
      };

      const mockOctokit = {
        rest: {
          repos: {
            get: jest.fn().mockResolvedValue({ data: mockRepoData }),
            listLanguages: jest.fn().mockResolvedValue({ data: mockLanguagesData }),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      const metadata = await client.getRepositoryMetadata('test-owner', 'test-repo');

      expect(metadata).toEqual({
        visibility: 'private',
        primary_language: undefined,
        languages: {
          Python: 15000,
        },
      });
    });

    it('should throw on API failure', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            get: jest.fn().mockRejectedValue(new Error('Repository not found')),
            listLanguages: jest.fn(),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      await expect(client.getRepositoryMetadata('test-owner', 'test-repo')).rejects.toThrow(
        'Repository not found'
      );
    });
  });

  describe('getChangedFiles', () => {
    it('should fetch all files with pagination', async () => {
      const mockFiles = [
        {
          filename: 'file1.ts',
          status: 'modified',
          additions: 10,
          deletions: 5,
          patch: '@@ -1,3 +1,5 @@',
        },
        {
          filename: 'file2.ts',
          status: 'added',
          additions: 20,
          deletions: 0,
          patch: '@@ -0,0 +1,20 @@',
        },
      ];

      const mockOctokit = {
        paginate: jest.fn().mockResolvedValue(mockFiles),
        rest: {
          pulls: {
            listFiles: jest.fn(),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      const files = await client.getChangedFiles(mockContext);

      expect(files).toHaveLength(2);
      expect(files[0].filename).toBe('file1.ts');
      expect(files[1].filename).toBe('file2.ts');
      expect(mockOctokit.paginate).toHaveBeenCalledWith(
        mockOctokit.rest.pulls.listFiles,
        expect.objectContaining({
          owner: 'test-owner',
          repo: 'test-repo',
          pull_number: 123,
          per_page: 100,
        })
      );
    });

    it('should throw on API failure', async () => {
      const mockOctokit = {
        paginate: jest.fn().mockRejectedValue(new Error('API error')),
        rest: {
          pulls: {
            listFiles: jest.fn(),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      await expect(client.getChangedFiles(mockContext)).rejects.toThrow('API error');
    });
  });

  describe('getPRMetadata', () => {
    it('should fetch PR metadata successfully', async () => {
      const mockPR = {
        number: 123,
        title: 'Test PR',
        head: {
          sha: 'abc123',
          ref: 'feature-branch',
        },
        base: {
          sha: 'def456',
          ref: 'main',
        },
      };

      const mockOctokit = {
        rest: {
          pulls: {
            get: jest.fn().mockResolvedValue({ data: mockPR }),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      const metadata = await client.getPRMetadata(mockContext);

      expect(metadata).toEqual({
        number: 123,
        title: 'Test PR',
        head_sha: 'abc123',
        base_sha: 'def456',
        head_ref: 'feature-branch',
        base_ref: 'main',
      });
      expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 123,
      });
    });

    it('should throw on API failure', async () => {
      const mockOctokit = {
        rest: {
          pulls: {
            get: jest.fn().mockRejectedValue(new Error('Not found')),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      await expect(client.getPRMetadata(mockContext)).rejects.toThrow('Not found');
    });
  });

  describe('findComment', () => {
    it('should find existing comment with magic marker', async () => {
      const mockComments = [
        { id: 1, body: 'Regular comment' },
        { id: 2, body: '<!-- rudder-pr-reviewer-bot -->\n## Review\nContent here' },
        { id: 3, body: 'Another comment' },
      ];

      const mockOctokit = {
        paginate: jest.fn().mockResolvedValue(mockComments),
        rest: {
          issues: {
            listComments: jest.fn(),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      const commentId = await client.findComment(mockContext, '<!-- rudder-pr-reviewer-bot -->');

      expect(commentId).toBe(2);
      expect(mockOctokit.paginate).toHaveBeenCalledWith(
        mockOctokit.rest.issues.listComments,
        expect.objectContaining({
          owner: 'test-owner',
          repo: 'test-repo',
          issue_number: 123,
          per_page: 100,
        })
      );
    });

    it('should return null when no comment exists', async () => {
      const mockComments = [
        { id: 1, body: 'Regular comment' },
        { id: 2, body: 'Another regular comment' },
      ];

      const mockOctokit = {
        paginate: jest.fn().mockResolvedValue(mockComments),
        rest: {
          issues: {
            listComments: jest.fn(),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      const commentId = await client.findComment(mockContext, '<!-- rudder-pr-reviewer-bot -->');

      expect(commentId).toBeNull();
    });

    it('should throw on API failure', async () => {
      const mockOctokit = {
        paginate: jest.fn().mockRejectedValue(new Error('API error')),
        rest: {
          issues: {
            listComments: jest.fn(),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      await expect(
        client.findComment(mockContext, '<!-- rudder-pr-reviewer-bot -->')
      ).rejects.toThrow('Failed to find review comment: API error');
    });
  });

  describe('createComment', () => {
    it('should create new comment successfully', async () => {
      const commentBody = '<!-- rudder-pr-reviewer-bot -->\n## Review\nContent';
      const mockResponse = { id: 123, body: commentBody };

      const mockOctokit = {
        rest: {
          issues: {
            createComment: jest.fn().mockResolvedValue({ data: mockResponse }),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      const commentId = await client.createComment(mockContext, commentBody);

      expect(commentId).toBe(123);
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        body: commentBody,
      });
    });

    it('should throw on API failure', async () => {
      const mockOctokit = {
        rest: {
          issues: {
            createComment: jest.fn().mockRejectedValue(new Error('Rate limit exceeded')),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      await expect(client.createComment(mockContext, 'test body')).rejects.toThrow(
        'Failed to create review comment: Rate limit exceeded'
      );
    });
  });

  describe('updateComment', () => {
    it('should update existing comment', async () => {
      const commentBody = '<!-- rudder-pr-reviewer-bot -->\n## Updated Review\nNew content';
      const commentId = 456;

      const mockOctokit = {
        rest: {
          issues: {
            updateComment: jest.fn().mockResolvedValue({ data: {} }),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      await client.updateComment(mockContext, commentId, commentBody);

      expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        comment_id: commentId,
        body: commentBody,
      });
    });

    it('should throw on API failure', async () => {
      const mockOctokit = {
        rest: {
          issues: {
            updateComment: jest.fn().mockRejectedValue(new Error('Comment not found')),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      await expect(client.updateComment(mockContext, 999, 'test body')).rejects.toThrow(
        'Failed to update review comment: Comment not found'
      );
    });
  });

  describe('findReviewComments', () => {
    it('should find existing review comments with marker', async () => {
      const mockComments = [
        { id: 1, body: 'Regular review comment' },
        { id: 2, body: '<!-- rudder-pr-reviewer-bot-inline -->\nInline comment 1' },
        { id: 3, body: 'Another regular comment' },
        { id: 4, body: '<!-- rudder-pr-reviewer-bot-inline -->\nInline comment 2' },
      ];

      const mockOctokit = {
        paginate: jest.fn().mockResolvedValue(mockComments),
        rest: {
          pulls: {
            listReviewComments: jest.fn(),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      const result = await client.findReviewComments(
        mockContext,
        '<!-- rudder-pr-reviewer-bot-inline -->'
      );

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(2);
      expect(result[1].id).toBe(4);
      expect(mockOctokit.paginate).toHaveBeenCalledWith(
        mockOctokit.rest.pulls.listReviewComments,
        expect.objectContaining({
          owner: 'test-owner',
          repo: 'test-repo',
          pull_number: 123,
        })
      );
    });

    it('should return empty array when no comments match', async () => {
      const mockComments = [
        { id: 1, body: 'Regular review comment' },
        { id: 2, body: 'Another regular comment' },
      ];

      const mockOctokit = {
        paginate: jest.fn().mockResolvedValue(mockComments),
        rest: {
          pulls: {
            listReviewComments: jest.fn(),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      const result = await client.findReviewComments(
        mockContext,
        '<!-- rudder-pr-reviewer-bot-inline -->'
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('createReview', () => {
    it('should create review with inline comments successfully', async () => {
      const inlineComments = [
        { path: 'src/app.ts', line: 10, body: 'Issue 1' },
        { path: 'src/utils.ts', line: 20, body: 'Issue 2' },
      ];
      const mockResponse = { id: 456 };

      const mockOctokit = {
        rest: {
          pulls: {
            createReview: jest.fn().mockResolvedValue({ data: mockResponse }),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      const reviewId = await client.createReview(mockContext, inlineComments, 'COMMENT');

      expect(reviewId).toBe(456);
      expect(mockOctokit.rest.pulls.createReview).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 123,
        event: 'COMMENT',
        body: undefined,
        comments: inlineComments,
        commit_id: undefined,
      });
    });

    it('should create review with commit_id when provided', async () => {
      const inlineComments = [{ path: 'src/app.ts', line: 10, body: 'Issue 1' }];
      const commitId = 'abc123def456';
      const mockResponse = { id: 789 };

      const mockOctokit = {
        rest: {
          pulls: {
            createReview: jest.fn().mockResolvedValue({ data: mockResponse }),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      const reviewId = await client.createReview(mockContext, inlineComments, 'COMMENT', commitId);

      expect(reviewId).toBe(789);
      expect(mockOctokit.rest.pulls.createReview).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 123,
        event: 'COMMENT',
        body: undefined,
        comments: inlineComments,
        commit_id: commitId,
      });
    });

    it('should throw on API failure', async () => {
      const mockOctokit = {
        rest: {
          pulls: {
            createReview: jest.fn().mockRejectedValue(new Error('Rate limit exceeded')),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      await expect(client.createReview(mockContext, [], 'COMMENT')).rejects.toThrow(
        'Failed to create review: Rate limit exceeded'
      );
    });
  });

  describe('getChangedFilesMap', () => {
    it('should build map for files with patches', async () => {
      const mockFiles = [
        {
          filename: 'src/app.ts',
          status: 'modified',
          additions: 10,
          deletions: 5,
          patch: '@@ -5,3 +5,5 @@\n line1\n+line2\n line3',
        },
        {
          filename: 'src/utils.ts',
          status: 'added',
          additions: 20,
          deletions: 0,
          patch: '@@ -0,0 +1,20 @@\n+new file content',
        },
      ];

      const mockOctokit = {
        paginate: jest.fn().mockResolvedValue(mockFiles),
        rest: {
          pulls: {
            listFiles: jest.fn(),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      const result = await client.getChangedFilesMap(mockContext);

      expect(result.size).toBe(2);
      expect(result.get('src/app.ts')).toEqual({
        start: 5,
        end: 9,
        status: 'modified',
      });
      expect(result.get('src/utils.ts')).toEqual({
        start: 1,
        end: 20,
        status: 'added',
      });
    });

    it('should handle removed files', async () => {
      const mockFiles = [
        {
          filename: 'src/deleted.ts',
          status: 'removed',
          additions: 0,
          deletions: 50,
        },
      ];

      const mockOctokit = {
        paginate: jest.fn().mockResolvedValue(mockFiles),
        rest: {
          pulls: {
            listFiles: jest.fn(),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      const result = await client.getChangedFilesMap(mockContext);

      expect(result.size).toBe(1);
      expect(result.get('src/deleted.ts')).toEqual({
        start: 1,
        end: 0,
        status: 'removed',
      });
    });

    it('should handle files without patches', async () => {
      const mockFiles = [
        {
          filename: 'binary-file.png',
          status: 'modified',
          additions: 0,
          deletions: 0,
        },
      ];

      const mockOctokit = {
        paginate: jest.fn().mockResolvedValue(mockFiles),
        rest: {
          pulls: {
            listFiles: jest.fn(),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      const result = await client.getChangedFilesMap(mockContext);

      expect(result.size).toBe(1);
      expect(result.get('binary-file.png')).toEqual({
        start: 1,
        end: Number.MAX_SAFE_INTEGER,
        status: 'modified',
      });
    });

    it('should handle patch with zero-count hunk', async () => {
      const mockFiles = [
        {
          filename: 'src/insert.ts',
          status: 'modified',
          additions: 2,
          deletions: 0,
          patch: '@@ -10,0 +10,2 @@\n+new line 1\n+new line 2',
        },
      ];

      const mockOctokit = {
        paginate: jest.fn().mockResolvedValue(mockFiles),
        rest: {
          pulls: {
            listFiles: jest.fn(),
          },
        },
      };

      const client = new GitHubClient(mockOctokit as any);

      const result = await client.getChangedFilesMap(mockContext);

      expect(result.size).toBe(1);
      expect(result.get('src/insert.ts')).toEqual({
        start: 10,
        end: 11,
        status: 'modified',
      });
    });
  });
});
