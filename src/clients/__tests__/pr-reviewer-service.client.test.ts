import type { ReviewPayload } from '@custom-types/review-payload.types';
import { PRReviewerServiceClient } from '../pr-reviewer-service.client';

// Mock @actions/core
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
}));

describe('PRReviewerServiceClient', () => {
  const mockServiceAccessToken = 'test-service-token-12345';
  const mockPayload: ReviewPayload = {
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
    pull_request: {
      number: 123,
      title: 'Test PR',
      head_sha: 'abc123',
      base_sha: 'def456',
      head_ref: 'feature-branch',
      base_ref: 'main',
      files_changed_count: 5,
      lines_added: 100,
      lines_deleted: 50,
      lines_changed: 150,
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
    github_action: {
      name: 'rudderstack-ai-reviewer',
      version: '1.0.0',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('postReview', () => {
    it('should successfully post review to service', async () => {
      const mockResponseData = { success: true, review_id: 'review-123' };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponseData),
      });

      const client = new PRReviewerServiceClient(mockServiceAccessToken);

      await expect(client.postReview(mockPayload)).resolves.toBeUndefined();

      expect(global.fetch).toHaveBeenCalledWith('https://api.rudderstack.com/v1/review', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mockServiceAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mockPayload),
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should throw error when response is not ok', async () => {
      const errorBody = 'Invalid payload format';

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue(errorBody),
      });

      const client = new PRReviewerServiceClient(mockServiceAccessToken);

      await expect(client.postReview(mockPayload)).rejects.toThrow(
        'PR Reviewer Service request failed with status 400: Invalid payload format'
      );
    });

    it('should throw error on 401 unauthorized', async () => {
      const errorBody = 'Unauthorized';

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue(errorBody),
      });

      const client = new PRReviewerServiceClient(mockServiceAccessToken);

      await expect(client.postReview(mockPayload)).rejects.toThrow(
        'PR Reviewer Service request failed with status 401: Unauthorized'
      );
    });

    it('should throw error on 500 server error', async () => {
      const errorBody = 'Internal Server Error';

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue(errorBody),
      });

      const client = new PRReviewerServiceClient(mockServiceAccessToken);

      await expect(client.postReview(mockPayload)).rejects.toThrow(
        'PR Reviewer Service request failed with status 500: Internal Server Error'
      );
    });

    it('should throw error on network failure', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const client = new PRReviewerServiceClient(mockServiceAccessToken);

      await expect(client.postReview(mockPayload)).rejects.toThrow('Network error');
    });

    it('should handle non-Error exceptions', async () => {
      (global.fetch as jest.Mock).mockRejectedValue('String error');

      const client = new PRReviewerServiceClient(mockServiceAccessToken);

      await expect(client.postReview(mockPayload)).rejects.toBe('String error');
    });

    it('should post payload with optional fields', async () => {
      const payloadWithOptionals: ReviewPayload = {
        ...mockPayload,
        detected_sdk: {
          name: '@rudderstack/analytics-js',
          version: '3.0.0',
          installation_type: 'npm',
        },
        frameworks: [
          { name: 'React', version: '18.2.0' },
          { name: 'Next.js', version: '14.0.0' },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true }),
      });

      const client = new PRReviewerServiceClient(mockServiceAccessToken);

      await expect(client.postReview(payloadWithOptionals)).resolves.toBeUndefined();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.rudderstack.com/v1/review',
        expect.objectContaining({
          body: JSON.stringify(payloadWithOptionals),
        })
      );
    });
  });
});
