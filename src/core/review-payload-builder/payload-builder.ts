import * as core from '@actions/core';
import { GitHubClient } from '@clients/github.client';
import type { FrameworkDetectionResult } from '@core/framework-detector';
import type { PRChangesResult } from '@core/pr-changes-detector';
import type { SDKDetectionResult } from '@core/sdk-detector';
import type { ReviewPayload } from '@custom-types/review-payload.types';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface PayloadBuilderInput {
  sourceId: string;
  owner: string;
  repo: string;
  prChanges: PRChangesResult;
  sdkDetection?: SDKDetectionResult | null;
  frameworks?: FrameworkDetectionResult[];
}

export class ReviewPayloadBuilder {
  constructor(private readonly githubClient: GitHubClient) {}

  /**
   * Builds the complete payload for PR Reviewer Service
   */
  async buildPayload(input: PayloadBuilderInput): Promise<ReviewPayload> {
    const { sourceId, owner, repo, prChanges, sdkDetection, frameworks = [] } = input;

    core.info('Fetching repository metadata...');
    const repoMetadata = await this.githubClient.getRepositoryMetadata(owner, repo);

    const { name, version } = this.getPackageDetails();

    const payload: ReviewPayload = {
      source_id: sourceId,
      repository: {
        owner,
        name: repo,
        visibility: repoMetadata.visibility,
        primary_language: repoMetadata.primary_language,
        languages: repoMetadata.languages,
      },
      pull_request: prChanges.pull_request,
      diff_context: prChanges.diff_context,
      github_action: {
        name,
        version,
      },
      frameworks: frameworks.map(fw => ({
        name: fw.name,
        version: fw.version,
      })),
    };

    if (sdkDetection) {
      payload.detected_sdk = {
        name: sdkDetection.name,
        version: sdkDetection.version,
        installation_type: sdkDetection.installationType,
      };
    }

    return payload;
  }

  /**
   * Reads package details from package.json
   */
  private getPackageDetails(): { name: string; version: string } {
    try {
      // Try reading from the action's root directory
      const packageJsonPath = join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

      if (!packageJson.name || !packageJson.version) {
        throw new Error('package.json is missing name or version field');
      }

      return { name: packageJson.name, version: packageJson.version };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      core.warning(
        `Failed to read package.json: ${errorMessage}. Using default: rudderstack-ai-reviewer@1.0.0`
      );
      return { name: 'rudderstack-ai-reviewer', version: '1.0.0' };
    }
  }
}
