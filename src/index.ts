import * as core from '@actions/core';
import { PRReviewerServiceClient } from '@clients/pr-reviewer-service.client';
import { detectFrameworks } from '@core/framework-detector';
import { detectPRChanges } from '@core/pr-changes-detector';
import { createProviderRuntime, NotPullRequestContextError } from '@core/providers';
import { postAIReviewerComments } from '@core/review-commenter';
import { buildReviewPayload } from '@core/review-payload-builder';
import { detectSDK } from '@core/sdk-detector';
import { resolve } from 'path';
import { logger } from '@core/logging/logger';

async function run(): Promise<void> {
  try {
    logger.info('🚀 Rudder AI Reviewer starting...');

    const sourceId = process.env.INPUT_SOURCE_ID || '';
    const serviceAccessToken = process.env.INPUT_SERVICE_ACCESS_TOKEN || '';
    const rootDirectory = process.env.INPUT_ROOT_DIRECTORY || '.';
    const { provider, context } = createProviderRuntime();
    const { owner, repo } = context;
    const prNumber = context.number;
    logger.info(`Repository: ${owner}/${repo}`);
    logger.info(`PR Number: ${prNumber}`);

    const serviceClient = new PRReviewerServiceClient(serviceAccessToken);
    logger.info('🔍 Detecting PR changes...');
    const prChanges = await detectPRChanges(provider, context, rootDirectory);
    logger.info(`✅ Detected ${prChanges.diff_context.length} relevant source files`);
    if (prChanges.diff_context.length === 0) {
      logger.info('No relevant source file changes detected. Skipping PR Reviewer Service call.');
      core.setOutput('status', 'success');
      core.setOutput('message', 'No relevant source file changes detected; skipped review');
      return;
    }

    const repoPath = resolve(process.cwd(), rootDirectory);
    logger.info('🔍 Detecting SDK...');
    const sdkDetection = await detectSDK(repoPath);
    if (sdkDetection) {
      logger.info(
        `✅ Detected SDK: ${sdkDetection.installationType}, version: ${sdkDetection.version || 'unknown'}`
      );
    } else {
      logger.warning('No SDK detected');
      core.setOutput('status', 'warning');
      core.setOutput('message', 'No SDK detected');
      return;
    }

    logger.info('🔍 Detecting frameworks...');
    const frameworks = await detectFrameworks(repoPath);
    if (frameworks.length > 0) {
      logger.info(
        `✅ Detected frameworks: ${frameworks.map(f => `${f.name}@${f.version || 'unknown'}`).join(', ')}`
      );
    } else {
      logger.warning('No frameworks detected');
    }

    logger.info('📦 Building review payload...');
    const payload = await buildReviewPayload(provider, context, {
      sourceId,
      prChanges,
      repoPath,
      sdkDetection,
      frameworks,
    });
    logger.debug(`Payload: ${JSON.stringify(payload, null, 2)}`);

    logger.info('📤 Sending code changes to PR Reviewer Service...');
    const reviewResponse = await serviceClient.postReview(payload);
    logger.debug(`Review response: ${JSON.stringify(reviewResponse, null, 2)}`);

    logger.info('📤 Posting review comment to PR...');
    await postAIReviewerComments(provider, context, reviewResponse);

    logger.info('✨ Rudder AI Reviewer completed successfully!');
    core.setOutput('status', 'success');
    core.setOutput('message', 'Successfully analyzed and submitted PR review');
  } catch (error) {
    if (error instanceof NotPullRequestContextError) {
      logger.warning('This action must be run in a pull request or merge request context');
      core.setOutput('status', 'warning');
      core.setOutput(
        'message',
        'This action must be run in a pull request or merge request context'
      );
      return;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error(`Action failed: ${errorMessage}`);

    if (errorStack) {
      logger.debug(`Stack trace: ${errorStack}`);
    }

    core.setFailed(errorMessage);
    core.setOutput('status', 'failed');
  }
}

run();
