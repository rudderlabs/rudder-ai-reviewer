import * as core from '@actions/core';
import { GitHubClient } from '@clients/github.client';
import type { FrameworkDetectionResult } from '@core/framework-detector';
import type { PRChangesResult } from '@core/pr-changes-detector';
import type { SDKDetectionResult } from '@core/sdk-detector';
import { GitHubPRContext } from '@core/shared/github/pr-context';
import type { ReviewPayload } from '@custom-types/review-payload.types';
import { COMMENT_INLINE_MARKER } from '@utils/constants';
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

    core.info('Fetching existing review comments...');
    const existingReviewComments = await this.getExistingReviewComments(
      input,
      COMMENT_INLINE_MARKER
    );

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
      existing_review_comments: existingReviewComments,
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

  private async getExistingReviewComments(input: PayloadBuilderInput, marker: string) {
    const { owner, repo, prChanges } = input;
    const context: GitHubPRContext = { owner, repo, prNumber: prChanges.pull_request.number };
    const comments = await this.githubClient.findReviewComments(context, marker);
    return comments.map(comment => {
      return {
        id: comment.id,
        body: comment.body ?? '',
      };
    });
  }
}
