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
});
