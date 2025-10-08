/**
 * RudderStack API Client
 * Handles communication with RudderStack workspace API for tracking plans and destinations
 * Uses native fetch API (Node 24+)
 */

import * as core from '@actions/core';
import { TrackingPlan, WorkspaceConfig, DestinationConfig } from '../../types/common';

export interface RudderStackAPIConfig {
  serviceAccessToken: string;
  sourceId?: string;
  baseURL?: string;
  timeout?: number;
  maxRetries?: number;
}

export interface APIErrorResponse {
  error: string;
  message: string;
  statusCode: number;
}

/**
 * RudderStack API Client
 */
export class RudderStackAPIClient {
  private baseURL: string;
  private headers: Record<string, string>;
  private timeout: number;
  private maxRetries: number;
  private sourceId?: string;

  constructor(config: RudderStackAPIConfig) {
    this.baseURL = config.baseURL || 'https://api.rudderstack.com';
    this.timeout = config.timeout || 30000;
    this.maxRetries = config.maxRetries || 3;
    this.sourceId = config.sourceId;

    this.headers = {
      Authorization: `Bearer ${config.serviceAccessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Fetch workspace configuration including destinations
   */
  async getWorkspaceConfig(): Promise<WorkspaceConfig | null> {
    core.info('Fetching workspace configuration from RudderStack API...');

    try {
      const url = new URL('/workspace-config', this.baseURL);
      if (this.sourceId) {
        url.searchParams.set('source_id', this.sourceId);
      }

      const data: any = await this.retryRequest(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
          const res = await fetch(url.toString(), {
            method: 'GET',
            headers: this.headers,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!res.ok) {
            throw new FetchError(`HTTP ${res.status}: ${res.statusText}`, res.status, await res.text());
          }

          return res.json();
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      });

      // Transform API response to our internal format
      const config: WorkspaceConfig = {
        workspaceId: data.workspaceId || data.workspace_id,
        sourceId: data.sourceId || data.source_id || this.sourceId || '',
        destinations: this.transformDestinations(data.destinations || []),
      };

      core.info(`Successfully fetched ${config.destinations.length} destinations`);
      return config;
    } catch (error) {
      return this.handleError(error, 'fetch workspace config');
    }
  }

  /**
   * Fetch tracking plans for the source and get the tracking plan details with events
   * First lists all tracking plans, then finds the one connected to the source
   */
  async getTrackingPlan(): Promise<TrackingPlan | null> {
    core.info('Fetching tracking plans from RudderStack API...');

    try {
      // Step 1: List all tracking plans
      const listUrl = new URL('/v2/catalog/tracking-plans', this.baseURL);
      const trackingPlansData: any = await this.retryRequest(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
          const res = await fetch(listUrl.toString(), {
            method: 'GET',
            headers: this.headers,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!res.ok) {
            throw new FetchError(`HTTP ${res.status}: ${res.statusText}`, res.status, await res.text());
          }

          return res.json();
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      });

      // Check if there are any tracking plans
      if (!trackingPlansData || !trackingPlansData.trackingPlans || trackingPlansData.trackingPlans.length === 0) {
        core.info('No tracking plans found in this workspace');
        return null;
      }

      // If sourceId is provided, find tracking plan connected to this source
      // Otherwise, use the first available tracking plan
      let selectedTrackingPlan: any;
      if (this.sourceId) {
        // We'll need to check each tracking plan's connections to find the one for this source
        // For now, we'll use the first one (TODO: implement source filtering)
        core.warning('Source-specific tracking plan filtering not yet implemented, using first available');
        selectedTrackingPlan = trackingPlansData.trackingPlans[0];
      } else {
        selectedTrackingPlan = trackingPlansData.trackingPlans[0];
      }

      // Step 2: Get the full tracking plan details with events
      const trackingPlanId = selectedTrackingPlan.id;
      core.info(`Fetching tracking plan details for ID: ${trackingPlanId}`);

      const detailUrl = new URL(`/v2/catalog/tracking-plans/${trackingPlanId}`, this.baseURL);
      const detailsData: any = await this.retryRequest(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
          const res = await fetch(detailUrl.toString(), {
            method: 'GET',
            headers: this.headers,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!res.ok) {
            throw new FetchError(`HTTP ${res.status}: ${res.statusText}`, res.status, await res.text());
          }

          return res.json();
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      });

      // Transform API response to our internal format
      const trackingPlan: TrackingPlan = {
        version: detailsData.version?.toString() || '1',
        events: (detailsData.events || []).map((event: any) => ({
          name: event.name,
          description: event.description,
          namingConvention: event.namingConvention,
          properties: (event.properties || []).map((prop: any) => ({
            name: prop.name,
            type: prop.type,
            required: prop.required || false,
            description: prop.description,
            allowedValues: prop.allowedValues,
            pattern: prop.pattern,
          })),
        })),
      };

      core.info(`Successfully fetched tracking plan with ${trackingPlan.events.length} events`);
      return trackingPlan;
    } catch (error) {
      return this.handleError(error, 'fetch tracking plan');
    }
  }

  /**
   * Test API credentials
   */
  async testConnection(): Promise<boolean> {
    core.debug('Testing RudderStack API connection...');

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
        core.info('RudderStack API connection successful');
        return true;
      }

      core.warning('Failed to connect to RudderStack API');
      return false;
    } catch (error) {
      core.warning('Failed to connect to RudderStack API');
      return false;
    }
  }

  /**
   * Transform destinations from API format to internal format
   */
  private transformDestinations(destinations: any[]): DestinationConfig[] {
    return destinations.map((dest) => ({
      id: dest.id,
      name: dest.name,
      type: dest.type || dest.destinationType || 'unknown',
      enabled: dest.enabled !== false,
      fieldMappings: dest.field_mappings || dest.fieldMappings || dest.config?.fieldMappings,
    }));
  }

  /**
   * Retry a request with exponential backoff
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

      const isRetryable = this.isRetryableError(error);
      if (!isRetryable) {
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt - 1) * 1000;
      core.debug(`Retrying request after ${delay}ms (attempt ${attempt}/${this.maxRetries})`);

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
   * Handle API errors
   */
  private handleError(error: any, operation: string): null {
    if (error instanceof FetchError) {
      const status = error.status;

      if (status === 401 || status === 403) {
        core.error(
          `Authentication failed: Invalid or expired RudderStack credentials. Unable to ${operation}.`
        );
      } else if (status === 404) {
        core.warning(`Resource not found while trying to ${operation}. This may be expected.`);
      } else {
        try {
          const data = JSON.parse(error.responseText) as APIErrorResponse;
          core.warning(`Failed to ${operation}: ${data.message || error.message}`);
        } catch {
          core.warning(`Failed to ${operation}: ${error.message}`);
        }
      }
    } else {
      core.warning(`Failed to ${operation}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return null;
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
    public status: number,
    public responseText: string = ''
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

/**
 * Create RudderStack API client instance
 */
export function createRudderStackClient(config: RudderStackAPIConfig): RudderStackAPIClient {
  return new RudderStackAPIClient(config);
}
