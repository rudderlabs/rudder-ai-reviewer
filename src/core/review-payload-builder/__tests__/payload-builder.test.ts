import type { GitHubClient } from '@clients/github.client';
import type { ChangeRequestContext } from '@core/providers';
import type { FrameworkDetectionResult } from '@core/framework-detector';
import type { PRChangesResult } from '@core/pr-changes-detector';
import type { SDKDetectionResult } from '@core/sdk-detector';
import { PayloadBuilderInput, ReviewPayloadBuilder } from '../payload-builder';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}));

import * as core from '@actions/core';
import { readFileSync } from 'fs';

describe('ReviewPayloadBuilder', () => {
  const mockRepoMetadata = {
    visibility: 'public' as const,
    primary_language: 'TypeScript',
    languages: {
      TypeScript: 50000,
      JavaScript: 30000,
    },
  };

  const mockPRChanges: PRChangesResult = {
    pull_request: {
      number: 123,
      title: 'Test PR',
      head_sha: 'abc123',
      base_sha: 'def456',
      head_ref: 'feature-branch',
      base_ref: 'main',
      files_changed_count: 2,
      lines_added: 50,
      lines_deleted: 10,
      lines_changed: 60,
    },
    diff_context: [
      {
        file_path: 'src/test.ts',
        patch: '@@ -1,3 +1,5 @@',
        hunks: 1,
        additions: 2,
        deletions: 0,
        status: 'modified',
      },
    ],
  };

  const mockSDKDetection: SDKDetectionResult = {
    name: '@rudderstack/analytics-js',
    installationType: 'npm',
    version: '3.0.0',
  };

  const mockFrameworks: FrameworkDetectionResult[] = [
    { name: 'React', version: '18.2.0', category: 'frontend' },
    { name: 'Next.js', version: '14.0.0', category: 'frontend' },
  ];

  let mockGitHubClient: jest.Mocked<GitHubClient>;
  const mockContext: ChangeRequestContext = {
    provider: 'github',
    owner: 'test-owner',
    repo: 'test-repo',
    number: 123,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockGitHubClient = {
      getRepositoryMetadata: jest.fn().mockResolvedValue(mockRepoMetadata),
      findInlineComments: jest.fn().mockResolvedValue([]),
    } as any;

    (readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({
        name: 'rudderstack-pr-reviewer',
        version: '1.0.0',
      })
    );
  });

  describe('buildPayload', () => {
    it('should build payload with all required fields', async () => {
      const input: PayloadBuilderInput = {
        sourceId: 'test-source-id',
        prChanges: mockPRChanges,
      };

      const builder = new ReviewPayloadBuilder(mockGitHubClient);
      const payload = await builder.buildPayload(mockContext, input);

      expect(payload).toEqual({
        source_id: 'test-source-id',
        repository: {
          owner: 'test-owner',
          name: 'test-repo',
          visibility: 'public',
          primary_language: 'TypeScript',
          languages: {
            TypeScript: 50000,
            JavaScript: 30000,
          },
        },
        pull_request: mockPRChanges.pull_request,
        diff_context: mockPRChanges.diff_context,
        github_action: {
          name: 'rudderstack-pr-reviewer',
          version: '1.0.0',
        },
        frameworks: [],
        existing_review_comments: [],
      });

      expect(mockGitHubClient.getRepositoryMetadata).toHaveBeenCalledWith(mockContext);
    });

    it('should include SDK detection when provided', async () => {
      const input: PayloadBuilderInput = {
        sourceId: 'test-source-id',
        prChanges: mockPRChanges,
        sdkDetection: mockSDKDetection,
      };

      const builder = new ReviewPayloadBuilder(mockGitHubClient);
      const payload = await builder.buildPayload(mockContext, input);

      expect(payload.detected_sdk).toEqual({
        name: '@rudderstack/analytics-js',
        version: '3.0.0',
        installation_type: 'npm',
      });
    });

    it('should include frameworks when provided', async () => {
      const input: PayloadBuilderInput = {
        sourceId: 'test-source-id',
        prChanges: mockPRChanges,
        frameworks: mockFrameworks,
      };

      const builder = new ReviewPayloadBuilder(mockGitHubClient);
      const payload = await builder.buildPayload(mockContext, input);

      expect(payload.frameworks).toEqual([
        { name: 'React', version: '18.2.0' },
        { name: 'Next.js', version: '14.0.0' },
      ]);
    });

    it('should include both SDK and frameworks when provided', async () => {
      const input: PayloadBuilderInput = {
        sourceId: 'test-source-id',
        prChanges: mockPRChanges,
        sdkDetection: mockSDKDetection,
        frameworks: mockFrameworks,
      };

      const builder = new ReviewPayloadBuilder(mockGitHubClient);
      const payload = await builder.buildPayload(mockContext, input);

      expect(payload.detected_sdk).toEqual({
        name: '@rudderstack/analytics-js',
        version: '3.0.0',
        installation_type: 'npm',
      });
      expect(payload.frameworks).toEqual([
        { name: 'React', version: '18.2.0' },
        { name: 'Next.js', version: '14.0.0' },
      ]);
    });

    it('should not include SDK when sdkDetection is null', async () => {
      const input: PayloadBuilderInput = {
        sourceId: 'test-source-id',
        prChanges: mockPRChanges,
        sdkDetection: null,
      };

      const builder = new ReviewPayloadBuilder(mockGitHubClient);
      const payload = await builder.buildPayload(mockContext, input);

      expect(payload.detected_sdk).toBeUndefined();
    });

    it('should not include frameworks when empty array is provided', async () => {
      const input: PayloadBuilderInput = {
        sourceId: 'test-source-id',
        prChanges: mockPRChanges,
        frameworks: [],
      };

      const builder = new ReviewPayloadBuilder(mockGitHubClient);
      const payload = await builder.buildPayload(mockContext, input);

      expect(payload.frameworks).toEqual([]);
    });

    it('should handle SDK with CDN installation type', async () => {
      const cdnSDK: SDKDetectionResult = {
        name: '@rudderstack/analytics-js',
        installationType: 'cdn',
        version: '2.5.0',
      };

      const input: PayloadBuilderInput = {
        sourceId: 'test-source-id',
        prChanges: mockPRChanges,
        sdkDetection: cdnSDK,
      };

      const builder = new ReviewPayloadBuilder(mockGitHubClient);
      const payload = await builder.buildPayload(mockContext, input);

      expect(payload.detected_sdk).toEqual({
        name: '@rudderstack/analytics-js',
        version: '2.5.0',
        installation_type: 'cdn',
      });
    });

    it('should handle SDK without version', async () => {
      const sdkNoVersion: SDKDetectionResult = {
        name: '@rudderstack/analytics-js',
        installationType: 'npm',
        version: undefined,
      };

      const input: PayloadBuilderInput = {
        sourceId: 'test-source-id',
        prChanges: mockPRChanges,
        sdkDetection: sdkNoVersion,
      };

      const builder = new ReviewPayloadBuilder(mockGitHubClient);
      const payload = await builder.buildPayload(mockContext, input);

      expect(payload.detected_sdk).toEqual({
        name: '@rudderstack/analytics-js',
        version: undefined,
        installation_type: 'npm',
      });
    });

    it('should handle frameworks without versions', async () => {
      const frameworksNoVersion: FrameworkDetectionResult[] = [
        { name: 'React', category: 'frontend' },
        { name: 'Vue', category: 'frontend' },
      ];

      const input: PayloadBuilderInput = {
        sourceId: 'test-source-id',
        prChanges: mockPRChanges,
        frameworks: frameworksNoVersion,
      };

      const builder = new ReviewPayloadBuilder(mockGitHubClient);
      const payload = await builder.buildPayload(mockContext, input);

      expect(payload.frameworks).toEqual([
        { name: 'React', version: undefined },
        { name: 'Vue', version: undefined },
      ]);
    });

    it('should handle repository without primary language', async () => {
      mockGitHubClient.getRepositoryMetadata.mockResolvedValue({
        visibility: 'private',
        primary_language: undefined,
        languages: {},
      });

      const input: PayloadBuilderInput = {
        sourceId: 'test-source-id',
        prChanges: mockPRChanges,
      };

      const builder = new ReviewPayloadBuilder(mockGitHubClient);
      const payload = await builder.buildPayload(mockContext, input);

      expect(payload.repository).toEqual({
        owner: 'test-owner',
        name: 'test-repo',
        visibility: 'private',
        primary_language: undefined,
        languages: {},
      });
    });

    it('should use default package details when package.json read fails', async () => {
      (readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('File not found');
      });

      const input: PayloadBuilderInput = {
        sourceId: 'test-source-id',
        prChanges: mockPRChanges,
      };

      const builder = new ReviewPayloadBuilder(mockGitHubClient);
      const payload = await builder.buildPayload(mockContext, input);

      expect(payload.github_action).toEqual({
        name: 'rudderstack-ai-reviewer',
        version: '1.0.0',
      });
      expect(core.warning).toHaveBeenCalledWith(
        'Failed to read package.json: File not found. Using default: rudderstack-ai-reviewer@1.0.0'
      );
    });

    it('should read package.json from repoPath when provided', async () => {
      const input: PayloadBuilderInput = {
        sourceId: 'test-source-id',
        prChanges: mockPRChanges,
        repoPath: '/tmp/fixtures/e2e-test-app',
      };

      const builder = new ReviewPayloadBuilder(mockGitHubClient);
      await builder.buildPayload(mockContext, input);

      expect(readFileSync).toHaveBeenCalledWith('/tmp/fixtures/e2e-test-app/package.json', 'utf-8');
    });

    it('should throw error when GitHub API fails', async () => {
      mockGitHubClient.getRepositoryMetadata.mockRejectedValue(new Error('GitHub API error'));

      const input: PayloadBuilderInput = {
        sourceId: 'test-source-id',
        prChanges: mockPRChanges,
      };

      const builder = new ReviewPayloadBuilder(mockGitHubClient);

      await expect(builder.buildPayload(mockContext, input)).rejects.toThrow('GitHub API error');
    });

    it('should include existing review comments when present', async () => {
      const mockExistingComments = [
        { id: 123, body: '<!-- rudder-pr-reviewer-bot-inline -->\nExisting comment 1' },
        { id: 456, body: '<!-- rudder-pr-reviewer-bot-inline -->\nExisting comment 2' },
      ];

      mockGitHubClient.findInlineComments = jest
        .fn()
        .mockResolvedValue(mockExistingComments as any);

      const input: PayloadBuilderInput = {
        sourceId: 'test-source-id',
        prChanges: mockPRChanges,
      };

      const builder = new ReviewPayloadBuilder(mockGitHubClient);
      const payload = await builder.buildPayload(mockContext, input);

      expect(payload.existing_review_comments).toEqual([
        { id: 123, body: '<!-- rudder-pr-reviewer-bot-inline -->\nExisting comment 1' },
        { id: 456, body: '<!-- rudder-pr-reviewer-bot-inline -->\nExisting comment 2' },
      ]);
      expect(mockGitHubClient.findInlineComments).toHaveBeenCalledWith(
        mockContext,
        expect.stringContaining('rudder-pr-reviewer-bot-inline')
      );
    });
  });
});
