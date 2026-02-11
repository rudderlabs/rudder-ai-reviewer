import * as core from '@actions/core';

interface FetchWithRetryOptions extends RequestInit {
  retries?: number;
}

/**
 * Checks if an HTTP status code is retryable
 * Matches ky's default retry behavior: 408, 429, 5xx
 */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

/**
 * Sleep for the specified number of milliseconds
 */
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

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions);

      // Return if successful or if we shouldn't retry this status or if we're out of retries
      if (response.ok || !isRetryableStatus(response.status) || attempt === retries) {
        return response;
      }

      // Consume the response body to free up the connection before retrying
      await response.text().catch(() => {
        // Ignore errors when consuming body - we're retrying anyway
      });

      core.warning(
        `Request failed with status ${response.status}, retrying (${attempt + 1}/${retries})...`
      );
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      core.warning(
        `Request failed with error: ${message}, retrying (${attempt + 1}/${retries})...`
      );
    }

    // Exponential backoff: 1s, 2s, 4s
    await sleep(1000 * 2 ** attempt);
  }

  throw new Error('Unreachable');
}
