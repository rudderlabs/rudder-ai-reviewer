import * as core from '@actions/core';
import { PRReviewerServiceClient } from '@clients/pr-reviewer-service.client';
import { detectFrameworks } from '@core/framework-detector';
import { detectPRChanges } from '@core/pr-changes-detector';
import { createProviderRuntime, NotPullRequestContextError } from '@core/providers';
import { postAIReviewerComments } from '@core/review-commenter';
import { buildReviewPayload } from '@core/review-payload-builder';
import { detectSDK } from '@core/sdk-detector';
import { resolve } from 'path';

async function run(): Promise<void> {
  try {
    core.info('🚀 Rudder AI Reviewer starting...');

    const sourceId = process.env.INPUT_SOURCE_ID || '';
    const serviceAccessToken = process.env.INPUT_SERVICE_ACCESS_TOKEN || '';
    const rootDirectory = process.env.INPUT_ROOT_DIRECTORY || '.';
    const { provider, context } = createProviderRuntime();
    const { owner, repo } = context;
    const prNumber = context.number;
    core.info(`Repository: ${owner}/${repo}`);
    core.info(`PR Number: ${prNumber}`);

    const serviceClient = new PRReviewerServiceClient(serviceAccessToken);
    core.info('🔍 Detecting PR changes...');
    const prChanges = await detectPRChanges(provider, context, rootDirectory);
    core.info(`✅ Detected ${prChanges.diff_context.length} relevant source files`);
    if (prChanges.diff_context.length === 0) {
      core.info('No relevant source file changes detected. Skipping PR Reviewer Service call.');
      core.setOutput('status', 'success');
      core.setOutput('message', 'No relevant source file changes detected; skipped review');
      return;
    }

    const repoPath = resolve(process.cwd(), rootDirectory);
    core.info('🔍 Detecting SDK...');
    const sdkDetection = await detectSDK(repoPath);
    if (sdkDetection) {
      core.info(
        `✅ Detected SDK: ${sdkDetection.installationType}, version: ${sdkDetection.version || 'unknown'}`
      );
    } else {
      core.warning('No SDK detected');
      core.setOutput('status', 'warning');
      core.setOutput('message', 'No SDK detected');
      return;
    }

    core.info('🔍 Detecting frameworks...');
    const frameworks = await detectFrameworks(repoPath);
    if (frameworks.length > 0) {
      core.info(
        `✅ Detected frameworks: ${frameworks.map(f => `${f.name}@${f.version || 'unknown'}`).join(', ')}`
      );
    } else {
      core.warning('No frameworks detected');
    }

    core.info('📦 Building review payload...');
    const payload = await buildReviewPayload(provider, context, {
      sourceId,
      prChanges,
      repoPath,
      sdkDetection,
      frameworks,
    });
    core.debug(`Payload: ${JSON.stringify(payload, null, 2)}`);

    core.info('📤 Sending code changes to PR Reviewer Service...');
    const reviewResponse = await serviceClient.postReview(payload);
    core.debug(`Review response: ${JSON.stringify(reviewResponse, null, 2)}`);

    core.info('📤 Posting review comment to PR...');
    await postAIReviewerComments(provider, context, reviewResponse);

    core.info('✨ Rudder AI Reviewer completed successfully!');
    core.setOutput('status', 'success');
    core.setOutput('message', 'Successfully analyzed and submitted PR review');
  } catch (error) {
    if (error instanceof NotPullRequestContextError) {
      core.warning('This action must be run in a pull request or merge request context');
      core.setOutput('status', 'warning');
      core.setOutput(
        'message',
        'This action must be run in a pull request or merge request context'
      );
      return;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    core.error(`Action failed: ${errorMessage}`);

    if (errorStack) {
      core.debug(`Stack trace: ${errorStack}`);
    }

    core.setFailed(errorMessage);
    core.setOutput('status', 'failed');
  }
}

run();
