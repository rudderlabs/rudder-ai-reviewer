import type { ReviewPayload } from '@custom-types/review-payload.types';
import { PRReviewerServiceClient } from '../pr-reviewer-service.client';

// Mock @actions/core
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
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
    frameworks: [],
  };

  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    // Reset environment to ensure tests don't depend on external state
    process.env = { ...originalEnv };
    delete process.env.INPUT_REVIEW_SERVICE_BASE_URL;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    process.env = originalEnv;
  });

  describe('postReview', () => {
    it('should successfully post review to service', async () => {
      const mockResponseData = { success: true, review_id: 'review-123' };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponseData),
      });

      const client = new PRReviewerServiceClient(mockServiceAccessToken);

      await expect(client.postReview(mockPayload)).resolves.toEqual(mockResponseData);

      expect(global.fetch).toHaveBeenCalledWith('https://ai-api.rudderstack.com/v2/ai/pr-review', {
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

    it('should succeed after retrying on transient 500 error', async () => {
      jest.useFakeTimers();
      const errorBody = 'Temporary error';
      const mockResponseData = { success: true, review_id: 'r-1' };

      // First call returns 500 error, second call succeeds
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: jest.fn().mockResolvedValue(errorBody),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(mockResponseData),
        });

      const client = new PRReviewerServiceClient(mockServiceAccessToken);
      const promise = client.postReview(mockPayload);
      await jest.runAllTimersAsync();

      await expect(promise).resolves.toEqual(mockResponseData);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw error on 500 server error after retries', async () => {
      jest.useFakeTimers();
      const errorBody = 'Internal Server Error';

      // Mock fetch to return 500 error for all retry attempts
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue(errorBody),
      });

      const client = new PRReviewerServiceClient(mockServiceAccessToken);

      const promise = client.postReview(mockPayload).catch(error => error);
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe(
        'PR Reviewer Service request failed with status 500: Internal Server Error'
      );

      // Should retry 3 times for 5xx errors (4 total calls)
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    it('should throw error on network failure after retries', async () => {
      jest.useFakeTimers();

      // Mock fetch to throw network error for all retry attempts
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const client = new PRReviewerServiceClient(mockServiceAccessToken);

      const promise = client.postReview(mockPayload).catch(error => error);
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('Network error');

      // Should retry 3 times for network errors (4 total calls)
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    it('should handle non-Error exceptions after retries', async () => {
      jest.useFakeTimers();

      // Mock fetch to throw non-Error exception for all retry attempts
      (global.fetch as jest.Mock).mockRejectedValue('String error');

      const client = new PRReviewerServiceClient(mockServiceAccessToken);

      const promise = client.postReview(mockPayload).catch(error => error);
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('String error');

      // Should retry 3 times for exceptions (4 total calls)
      expect(global.fetch).toHaveBeenCalledTimes(4);
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

      await expect(client.postReview(payloadWithOptionals)).resolves.toEqual({ success: true });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://ai-api.rudderstack.com/v2/ai/pr-review',
        expect.objectContaining({
          body: JSON.stringify(payloadWithOptionals),
        })
      );
    });

    it('should use custom base URL from environment variable', async () => {
      const customBaseUrl = 'https://custom-api.example.com';
      process.env.INPUT_REVIEW_SERVICE_BASE_URL = customBaseUrl;

      // Re-import module to pick up new environment variable
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PRReviewerServiceClient: ReloadedClient } = require('../pr-reviewer-service.client');

      const mockResponseData = { success: true, review_id: 'review-456' };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponseData),
      });

      const client = new ReloadedClient(mockServiceAccessToken);

      await expect(client.postReview(mockPayload)).resolves.toEqual(mockResponseData);

      expect(global.fetch).toHaveBeenCalledWith(`${customBaseUrl}/v2/ai/pr-review`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mockServiceAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mockPayload),
      });
    });
  });
});
