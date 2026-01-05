import * as core from '@actions/core';
import * as github from '@actions/github';
import { PRReviewerServiceClient } from '@clients/pr-reviewer-service.client';
import { detectFrameworks } from '@core/framework-detector';
import { detectPRChanges } from '@core/pr-changes-detector';
import { buildReviewPayload } from '@core/review-payload-builder';
import { detectSDK } from '@core/sdk-detector';
import type { GitHubPRContext } from '@core/shared/github';
import { resolve } from 'path';

async function run(): Promise<void> {
  try {
    core.info('🚀 RudderStack PR Reviewer starting...');

    const githubToken = core.getInput('github-token', { required: true });
    const sourceId = core.getInput('source-id', { required: true });
    const serviceAccessToken = core.getInput('service-access-token', { required: true });
    const rootDirectory = core.getInput('root-directory') || '.';

    const prNumber = github.context.payload.pull_request?.number;
    if (!prNumber) {
      throw new Error('This action must be run in a pull request context');
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
      core.info('No SDK detected');
    }

    core.info('🔍 Detecting frameworks...');
    const frameworks = await detectFrameworks(repoPath);
    if (frameworks.length > 0) {
      core.info(
        `✅ Detected frameworks: ${frameworks.map(f => `${f.name}@${f.version || 'unknown'}`).join(', ')}`
      );
    } else {
      core.info('No frameworks detected');
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

    core.info('📤 Posting review to PR Reviewer Service...');
    await serviceClient.postReview(payload);

    core.setOutput('status', 'success');
    core.setOutput('message', 'Successfully analyzed and submitted PR review');
    core.info('✨ RudderStack PR Reviewer completed successfully!');
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
