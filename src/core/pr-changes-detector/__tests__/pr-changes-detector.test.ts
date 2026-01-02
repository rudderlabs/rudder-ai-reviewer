import type { GitHubPRContext } from '@core/shared/github';
import { PRChangesDetector } from '../pr-changes-detector';

jest.mock('@clients/github.client');

describe('PRChangesDetector', () => {
  const mockPRContext: GitHubPRContext = {
    owner: 'test-owner',
    repo: 'test-repo',
    prNumber: 123,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should detect PR changes successfully', async () => {
    const mockPRMetadata = {
      number: 123,
      title: 'Test PR',
      head_sha: 'abc123',
      base_sha: 'def456',
      head_ref: 'feature',
      base_ref: 'main',
    };

    const mockFiles = [
      {
        filename: 'src/file1.ts',
        status: 'modified',
        additions: 10,
        deletions: 5,
        patch: '@@ -1,3 +1,5 @@ function test() {\n+  new line\n }',
      },
      {
        filename: 'src/file2.ts',
        status: 'added',
        additions: 20,
        deletions: 0,
        patch: '@@ -0,0 +1,20 @@\n+new file content',
      },
    ];

    const mockGitHubClient = {
      getPRMetadata: jest.fn().mockResolvedValue(mockPRMetadata),
      getChangedFiles: jest.fn().mockResolvedValue(mockFiles),
    };

    const detector = new PRChangesDetector(mockGitHubClient as any);
    const result = await detector.detect(mockPRContext);

    expect(result.pull_request).toEqual({
      number: 123,
      title: 'Test PR',
      head_sha: 'abc123',
      base_sha: 'def456',
      head_ref: 'feature',
      base_ref: 'main',
      files_changed_count: 2,
      lines_added: 30,
      lines_deleted: 5,
      lines_changed: 35,
    });

    expect(result.diff_context).toHaveLength(2);
    expect(result.diff_context[0]).toEqual({
      file_path: 'src/file1.ts',
      patch: '@@ -1,3 +1,5 @@ function test() {\n+  new line\n }',
      hunks: 1,
      additions: 10,
      deletions: 5,
      status: 'modified',
    });
    expect(result.diff_context[1]).toEqual({
      file_path: 'src/file2.ts',
      patch: '@@ -0,0 +1,20 @@\n+new file content',
      hunks: 1,
      additions: 20,
      deletions: 0,
      status: 'added',
    });

    expect(mockGitHubClient.getPRMetadata).toHaveBeenCalledWith(mockPRContext);
    expect(mockGitHubClient.getChangedFiles).toHaveBeenCalledWith(mockPRContext);
  });

  it('should handle files without patches (binary files)', async () => {
    const mockPRMetadata = {
      number: 456,
      title: 'Binary files PR',
      head_sha: 'ghi789',
      base_sha: 'jkl012',
      head_ref: 'binary-branch',
      base_ref: 'main',
    };

    const mockFiles = [
      {
        filename: 'image.png',
        status: 'added',
        additions: 0,
        deletions: 0,
        // No patch for binary files
      },
    ];

    const mockGitHubClient = {
      getPRMetadata: jest.fn().mockResolvedValue(mockPRMetadata),
      getChangedFiles: jest.fn().mockResolvedValue(mockFiles),
    };

    const detector = new PRChangesDetector(mockGitHubClient as any);
    const result = await detector.detect(mockPRContext);

    expect(result.diff_context[0]).toEqual({
      file_path: 'image.png',
      patch: '',
      hunks: 0,
      additions: 0,
      deletions: 0,
      status: 'added',
    });
  });

  it('should propagate errors from GitHub client', async () => {
    const mockGitHubClient = {
      getPRMetadata: jest.fn().mockRejectedValue(new Error('API error')),
      getChangedFiles: jest.fn(),
    };

    const detector = new PRChangesDetector(mockGitHubClient as any);
    await expect(detector.detect(mockPRContext)).rejects.toThrow('API error');
  });
});
