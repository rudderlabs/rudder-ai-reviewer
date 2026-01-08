import * as core from '@actions/core';
import * as github from '@actions/github';
import { PRReviewerServiceClient } from '@clients/pr-reviewer-service.client';
import { detectFrameworks } from '@core/framework-detector';
import { detectPRChanges } from '@core/pr-changes-detector';
import { postReviewComment } from '@core/review-commenter';
import { buildReviewPayload } from '@core/review-payload-builder';
import { detectSDK } from '@core/sdk-detector';
import type { GitHubPRContext } from '@core/shared/github';
import { resolve } from 'path';

async function run(): Promise<void> {
  try {
    core.info('🚀 RudderStack PR Reviewer starting...');

    const sourceId = process.env.INPUT_SOURCE_ID || '';
    const serviceAccessToken = process.env.INPUT_SERVICE_ACCESS_TOKEN || '';
    const rootDirectory = process.env.INPUT_ROOT_DIRECTORY || '.';
    const githubToken = process.env.INPUT_GITHUB_TOKEN || '';

    const prNumber = github.context.payload.pull_request?.number;
    if (!prNumber) {
      core.warning('This action must be run in a pull request context');
      core.setOutput('status', 'warning');
      core.setOutput('message', 'This action must be run in a pull request context');
      return;
    }

    const { owner, repo } = github.context.repo;
    core.info(`Repository: ${owner}/${repo}`);
    core.info(`PR Number: ${prNumber}`);

    const serviceClient = new PRReviewerServiceClient(serviceAccessToken);
    const prContext: GitHubPRContext = { owner, repo, prNumber };

    core.info('🔍 Detecting PR changes...');
    const prChanges = await detectPRChanges(githubToken, prContext);
    core.info(`✅ Detected ${prChanges.diff_context.length} changed files`);

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
    const payload = await buildReviewPayload(githubToken, {
      sourceId,
      owner,
      repo,
      prChanges,
      sdkDetection,
      frameworks,
    });

    core.info('📤 Sending code changes to PR Reviewer Service...');
    const reviewResponse = await serviceClient.postReview(payload);

    core.info('📤 Posting review comment to PR...');
    await postReviewComment(githubToken, prContext, reviewResponse);

    core.info('✨ RudderStack PR Reviewer completed successfully!');
    core.setOutput('status', 'success');
    core.setOutput('message', 'Successfully analyzed and submitted PR review');
  } catch (error) {
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
