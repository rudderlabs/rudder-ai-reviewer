import * as core from '@actions/core';
import * as github from '@actions/github';

async function run(): Promise<void> {
  try {
    core.info('🚀 RudderStack PR Reviewer starting...');

    core.info(`Repository: ${github.context.repo.owner}/${github.context.repo.repo}`);
    core.info(`Event: ${github.context.eventName}`);

    const prNumber = github.context.payload.pull_request?.number;
    if (prNumber) {
      core.info(`PR Number: ${prNumber}`);
    } else {
      core.warning('Not running in a pull request context');
    }

    core.info('Hello from RudderStack PR Reviewer!');

    core.setOutput('status', 'success');
    core.setOutput('message', 'Hello World from RudderStack PR Reviewer');
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
