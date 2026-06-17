import type { ReviewPayload } from '@custom-types/review-payload.types';
import { ReviewResponse } from '@custom-types/review.types';
import { logger } from '@core/logging/logger';
import { fetchWithRetry } from '@utils/fetch-with-retry';

const PR_REVIEWER_SERVICE_BASE_URL =
  process.env.INPUT_REVIEW_SERVICE_BASE_URL || 'https://ai-api.rudderstack.com';

export class PRReviewerServiceClient {
  constructor(private readonly serviceAccessToken: string) {}

  /**
   * Posts review payload to PR Reviewer Service
   *
   * @param payload - Complete review payload
   * @throws Error if the request fails
   */
  async postReview(payload: ReviewPayload): Promise<ReviewResponse> {
    try {
      logger.info(`Posting review to PR Reviewer Service: ${PR_REVIEWER_SERVICE_BASE_URL}`);

      const response = await fetchWithRetry(`${PR_REVIEWER_SERVICE_BASE_URL}/v2/ai/pr-review`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.serviceAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        retries: 3,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `PR Reviewer Service request failed with status ${response.status}: ${errorBody}`
        );
      }

      const responseData = (await response.json()) as ReviewResponse;
      logger.debug(`Review response: ${JSON.stringify(responseData)}`);
      return responseData;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to post review: ${message}`);
      throw error;
    }
  }
}
