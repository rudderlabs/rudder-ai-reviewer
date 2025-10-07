/**
 * AI Proxy Client
 * Handles communication with RudderStack AI proxy service for enhanced analysis
 * CRITICAL: Never sends actual source code - only AST metadata
 * Uses native fetch API (Node 24+)
 */

import * as core from '@actions/core';
import {
  AIAnalysisRequest,
  AIAnalysisResponse,
  AIProxyBatchRequest,
  AIProxyBatchResponse,
} from '../../types/common';

export interface AIProxyConfig {
  serviceAccessToken: string;
  baseURL?: string;
  timeout?: number;
  maxRetries?: number;
  maxBatchSize?: number;
}

/**
 * AI Proxy Client for enhanced code analysis
 */
export class AIProxyClient {
  private baseURL: string;
  private headers: Record<string, string>;
  private timeout: number;
  private maxRetries: number;
  private maxBatchSize: number;
  private requestCount: number = 0;
  private maxRequests: number = 30; // Cost control limit

  constructor(config: AIProxyConfig) {
    this.baseURL = config.baseURL || 'https://ai-proxy.rudderstack.com';
    this.timeout = config.timeout || 60000; // 60s for AI analysis
    this.maxRetries = config.maxRetries || 2;
    this.maxBatchSize = config.maxBatchSize || 10;

    this.headers = {
      Authorization: `Basic ${config.serviceAccessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Send batch analysis requests to AI proxy
   * Automatically batches requests and handles rate limiting
   */
  async analyzeBatch(requests: AIAnalysisRequest[]): Promise<AIAnalysisResponse[]> {
    if (requests.length === 0) {
      return [];
    }

    // Check if we've exceeded max requests
    if (this.requestCount >= this.maxRequests) {
      core.warning(`AI analysis request limit reached (${this.maxRequests}). Skipping remaining requests.`);
      return requests.map((req) => ({
        id: req.id,
        status: 'throttled' as const,
        confidence: 'low' as const,
        error: 'Request limit exceeded',
      }));
    }

    core.info(`Sending ${requests.length} analysis requests to AI proxy...`);

    const allResponses: AIAnalysisResponse[] = [];

    // Split into batches
    for (let i = 0; i < requests.length; i += this.maxBatchSize) {
      const batch = requests.slice(i, Math.min(i + this.maxBatchSize, requests.length));

      // Check limit before each batch
      if (this.requestCount >= this.maxRequests) {
        core.warning('AI request limit reached, stopping batch processing');
        break;
      }

      const responses = await this.sendBatch(batch);
      allResponses.push(...responses);
      this.requestCount += batch.length;
    }

    core.info(`AI analysis complete: ${allResponses.length} responses received`);
    return allResponses;
  }

  /**
   * Send single batch to AI proxy with retry logic
   */
  private async sendBatch(requests: AIAnalysisRequest[]): Promise<AIAnalysisResponse[]> {
    const batchRequest: AIProxyBatchRequest = {
      analysis_requests: requests,
    };

    try {
      const response = await this.retryRequest(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
          const res = await fetch(`${this.baseURL}/analyze`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(batchRequest),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!res.ok) {
            throw new FetchError(`HTTP ${res.status}: ${res.statusText}`, res.status);
          }

          return res.json() as Promise<AIProxyBatchResponse>;
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      });

      // Log rate limit info
      if (response.rate_limit) {
        core.debug(
          `AI Proxy rate limit: ${response.rate_limit.remaining} remaining, resets at ${response.rate_limit.reset_at}`
        );
      }

      return response.results;
    } catch (error) {
      core.warning(`AI analysis batch failed: ${this.getErrorMessage(error)}`);

      // Return failed status for all requests in batch
      return requests.map((req) => ({
        id: req.id,
        status: 'failed' as const,
        confidence: 'low' as const,
        error: this.getErrorMessage(error),
      }));
    }
  }

  /**
   * Test AI proxy connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${this.baseURL}/health`, {
        method: 'GET',
        headers: this.headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        core.info('AI Proxy connection successful');
        return true;
      }

      core.warning('Failed to connect to AI Proxy');
      return false;
    } catch (error) {
      core.warning('Failed to connect to AI Proxy');
      return false;
    }
  }

  /**
   * Get remaining request quota
   */
  getRemainingRequests(): number {
    return Math.max(0, this.maxRequests - this.requestCount);
  }

  /**
   * Check if more requests can be made
   */
  canMakeRequests(): boolean {
    return this.requestCount < this.maxRequests;
  }

  /**
   * Retry request with exponential backoff
   */
  private async retryRequest<T>(
    requestFn: () => Promise<T>,
    attempt: number = 1
  ): Promise<T> {
    try {
      return await requestFn();
    } catch (error) {
      if (attempt >= this.maxRetries) {
        throw error;
      }

      if (!this.isRetryableError(error)) {
        throw error;
      }

      // Exponential backoff: 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      core.debug(`Retrying AI request after ${delay}ms (attempt ${attempt}/${this.maxRetries})`);

      await this.sleep(delay);
      return this.retryRequest(requestFn, attempt + 1);
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Network errors (fetch throws TypeError)
    if (error.name === 'TypeError' || error.name === 'AbortError') {
      return true;
    }

    // HTTP errors
    if (error instanceof FetchError) {
      const status = error.status;
      // Retry on 5xx errors and 429 (rate limit)
      return status >= 500 || status === 429;
    }

    return false;
  }

  /**
   * Get error message from error object
   */
  private getErrorMessage(error: any): string {
    if (error instanceof FetchError) {
      return error.message;
    }

    return error instanceof Error ? error.message : 'Unknown error';
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Custom error class for fetch errors
 */
class FetchError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

/**
 * Create AI proxy client instance
 */
export function createAIProxyClient(config: AIProxyConfig): AIProxyClient {
  return new AIProxyClient(config);
}
