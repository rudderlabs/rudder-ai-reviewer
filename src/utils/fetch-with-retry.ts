import * as core from '@actions/core';

interface FetchWithRetryOptions extends RequestInit {
  retries?: number;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wrapper around native fetch with retry logic and exponential backoff
 *
 * @param url - The URL to fetch
 * @param options - Fetch options including optional retries parameter
 * @returns Promise<Response>
 * @throws Error if all retry attempts fail
 */
export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const { retries = 3, ...fetchOptions } = options;
  const validatedRetries = Math.max(0, Math.floor(retries));

  for (let attempt = 0; attempt <= validatedRetries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions);

      // Return if successful or if we shouldn't retry this status or if we're out of retries
      if (response.ok || !isRetryableStatus(response.status) || attempt === validatedRetries) {
        return response;
      }

      // Consume the response body to free up the connection before retrying
      await response.text().catch(() => {
        // Ignore errors when consuming body - we're retrying anyway
      });

      core.warning(
        `Request failed with status ${response.status}, retrying (${attempt + 1}/${validatedRetries})...`
      );

      // Exponential backoff with full jitter to prevent thundering herd
      const baseMs = 1000 * 2 ** attempt;
      await sleep(Math.random() * baseMs);
    } catch (error) {
      if (attempt === validatedRetries) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      core.warning(
        `Request failed with error: ${message}, retrying (${attempt + 1}/${validatedRetries})...`
      );

      // Exponential backoff with full jitter to prevent thundering herd
      const baseMs = 1000 * 2 ** attempt;
      await sleep(Math.random() * baseMs);
    }
  }

  throw new Error('Unreachable');
}
