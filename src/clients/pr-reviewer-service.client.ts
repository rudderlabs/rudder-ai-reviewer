import * as core from '@actions/core';
import type { ReviewPayload } from '@custom-types/review-payload.types';
import { ReviewResponse } from '@custom-types/review.types';

// TODO: Add the actual URL once the service is deployed
const PR_REVIEWER_SERVICE_URL = 'https://api.rudderstack.com/v1/review';

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
      core.info(`Posting review to PR Reviewer Service: ${PR_REVIEWER_SERVICE_URL}`);

      const response = await fetch(PR_REVIEWER_SERVICE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.serviceAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `PR Reviewer Service request failed with status ${response.status}: ${errorBody}`
        );
      }

      const responseData = (await response.json()) as ReviewResponse;
      core.debug(`Review response: ${JSON.stringify(responseData)}`);
      return responseData;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      core.error(`Failed to post review: ${message}`);
      throw error;
    }
  }
}
