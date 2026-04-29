import type { ChangeRequestContext } from '@core/providers';
import { PRChangesDetector } from '../pr-changes-detector';

jest.mock('@clients/github.client');

describe('PRChangesDetector', () => {
  const mockPRContext: ChangeRequestContext = {
    provider: 'github',
    owner: 'test-owner',
    repo: 'test-repo',
    number: 123,
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
      getChangeRequestMetadata: jest.fn().mockResolvedValue(mockPRMetadata),
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

    expect(mockGitHubClient.getChangeRequestMetadata).toHaveBeenCalledWith(mockPRContext);
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
      getChangeRequestMetadata: jest.fn().mockResolvedValue(mockPRMetadata),
      getChangedFiles: jest.fn().mockResolvedValue(mockFiles),
    };

    const detector = new PRChangesDetector(mockGitHubClient as any);
    const result = await detector.detect(mockPRContext);

    // Binary files (like images) should be filtered out
    expect(result.diff_context.length).toBe(0);
    expect(result.pull_request.files_changed_count).toBe(0);
  });

  it('should propagate errors from GitHub client', async () => {
    const mockGitHubClient = {
      getChangeRequestMetadata: jest.fn().mockRejectedValue(new Error('API error')),
      getChangedFiles: jest.fn(),
    };

    const detector = new PRChangesDetector(mockGitHubClient as any);
    await expect(detector.detect(mockPRContext)).rejects.toThrow('API error');
  });

  it('should filter files by root directory', async () => {
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
        patch: '@@ -1,3 +1,5 @@ test',
      },
      {
        filename: 'docs/README.md',
        status: 'modified',
        additions: 5,
        deletions: 2,
        patch: '@@ -1,1 +1,2 @@ readme',
      },
      {
        filename: 'package.json',
        status: 'modified',
        additions: 1,
        deletions: 1,
        patch: '@@ -1,1 +1,1 @@ package',
      },
    ];

    const mockGitHubClient = {
      getChangeRequestMetadata: jest.fn().mockResolvedValue(mockPRMetadata),
      getChangedFiles: jest.fn().mockResolvedValue(mockFiles),
    };

    const detector = new PRChangesDetector(mockGitHubClient as any);
    const result = await detector.detect(mockPRContext, 'src');

    expect(result.pull_request.files_changed_count).toBe(1);
    expect(result.pull_request.lines_added).toBe(10);
    expect(result.pull_request.lines_deleted).toBe(5);
    expect(result.diff_context).toHaveLength(1);
    expect(result.diff_context[0].file_path).toBe('src/file1.ts');
  });

  it('should handle nested directories in root path filtering', async () => {
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
        filename: 'src/core/module1.ts',
        status: 'modified',
        additions: 15,
        deletions: 3,
        patch: '@@ -1,3 +1,5 @@ test',
      },
      {
        filename: 'src/utils/helper.ts',
        status: 'added',
        additions: 25,
        deletions: 0,
        patch: '@@ -0,0 +1,25 @@ helper',
      },
      {
        filename: 'tests/unit/test.ts',
        status: 'added',
        additions: 50,
        deletions: 0,
        patch: '@@ -0,0 +1,50 @@ test',
      },
    ];

    const mockGitHubClient = {
      getChangeRequestMetadata: jest.fn().mockResolvedValue(mockPRMetadata),
      getChangedFiles: jest.fn().mockResolvedValue(mockFiles),
    };

    const detector = new PRChangesDetector(mockGitHubClient as any);
    const result = await detector.detect(mockPRContext, 'src/core');

    expect(result.pull_request.files_changed_count).toBe(1);
    expect(result.pull_request.lines_added).toBe(15);
    expect(result.pull_request.lines_deleted).toBe(3);
    expect(result.diff_context).toHaveLength(1);
    expect(result.diff_context[0].file_path).toBe('src/core/module1.ts');
  });
});
