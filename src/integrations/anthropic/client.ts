/**
 * Anthropic AI Client
 * Handles communication with Anthropic API for AI-based analysis
 */

import Anthropic from '@anthropic-ai/sdk';
import * as core from '@actions/core';
import { AnthropicAnalysisRequest, AnthropicAnalysisResponse, AnthropicConfig } from './types';

export class AnthropicClient {
  private client: Anthropic;
  private config: AnthropicConfig;

  constructor(config: AnthropicConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
  }

  /**
   * Test connection to Anthropic API
   */
  async testConnection(): Promise<boolean> {
    try {
      // Make a minimal request to test the API key
      await this.client.messages.create({
        model: this.config.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }],
      });
      return true;
    } catch (error) {
      core.warning(`Anthropic API connection test failed: ${error}`);
      return false;
    }
  }

  /**
   * Analyze code with AI
   * @param request Analysis request with system prompt, user prompt, and code context
   * @returns AI analysis response
   */
  async analyze(request: AnthropicAnalysisRequest): Promise<AnthropicAnalysisResponse> {
    try {
      core.debug(`Making AI analysis request with model: ${this.config.model}`);
      core.debug(`System prompt length: ${request.systemPrompt.length} chars`);
      core.debug(`User prompt length: ${request.userPrompt.length} chars`);

      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        system: request.systemPrompt,
        messages: [
          {
            role: 'user',
            content: request.userPrompt,
          },
        ],
      });

      // Extract text content from response
      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Anthropic API');
      }

      core.debug(`AI response length: ${content.text.length} chars`);

      return {
        status: 'success',
        content: content.text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (error) {
      core.error(`Anthropic API request failed: ${error}`);
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get the model being used
   */
  getModel(): string {
    return this.config.model;
  }

  /**
   * Get max tokens per request
   */
  getMaxTokens(): number {
    return this.config.maxTokens;
  }
}

/**
 * Create an Anthropic client instance
 */
export function createAnthropicClient(config: AnthropicConfig): AnthropicClient {
  return new AnthropicClient(config);
}
