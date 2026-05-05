import type { ChangeRequestContext, SCMProvider } from '@core/providers';
import type { FrameworkDetectionResult } from '@core/framework-detector';
import type { PRChangesResult } from '@core/pr-changes-detector';
import type { SDKDetectionResult } from '@core/sdk-detector';
import type { ReviewPayload } from '@custom-types/review-payload.types';
import { COMMENT_INLINE_MARKER } from '@utils/constants';
import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '@core/logging/logger';

export interface PayloadBuilderInput {
  sourceId: string;
  prChanges: PRChangesResult;
  repoPath?: string;
  sdkDetection?: SDKDetectionResult | null;
  frameworks?: FrameworkDetectionResult[];
}

export class ReviewPayloadBuilder {
  constructor(private readonly provider: SCMProvider) {}

  /**
   * Builds the complete payload for PR Reviewer Service
   */
  async buildPayload(
    context: ChangeRequestContext,
    input: PayloadBuilderInput
  ): Promise<ReviewPayload> {
    const { sourceId, prChanges, repoPath, sdkDetection, frameworks = [] } = input;
    const { owner, repo } = context;

    logger.info('Fetching repository metadata...');
    const repoMetadata = await this.provider.getRepositoryMetadata(context);

    logger.info('Fetching existing review comments...');
    const existingReviewComments = await this.getExistingReviewComments(
      context,
      COMMENT_INLINE_MARKER
    );

    const { name, version } = this.getPackageDetails(repoPath);

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
  private getPackageDetails(repoPath?: string): { name: string; version: string } {
    try {
      // Try reading from the configured repository root first.
      const packageJsonPath = join(repoPath || process.cwd(), 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

      if (!packageJson.name || !packageJson.version) {
        throw new Error('package.json is missing name or version field');
      }

      return { name: packageJson.name, version: packageJson.version };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warning(
        `Failed to read package.json: ${errorMessage}. Using default: rudderstack-ai-reviewer@1.0.0`
      );
      return { name: 'rudderstack-ai-reviewer', version: '1.0.0' };
    }
  }

  private async getExistingReviewComments(context: ChangeRequestContext, marker: string) {
    return this.provider.findInlineComments(context, marker);
  }
}
