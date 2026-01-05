import type { GitHubPRContext } from '@core/shared/github';
import { GitHubClient } from '../github.client';

describe('GitHubClient', () => {
  const mockContext: GitHubPRContext = {
    owner: 'test-owner',
    repo: 'test-repo',
    prNumber: 123,
  };

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
});
