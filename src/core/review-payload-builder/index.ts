import { getOctokit } from '@actions/github';
import { GitHubClient } from '@clients/github.client';
import { ReviewPayload } from '@custom-types/review-payload.types';
import { PayloadBuilderInput, ReviewPayloadBuilder } from './payload-builder';

export { ReviewPayloadBuilder } from './payload-builder';
export type { PayloadBuilderInput } from './payload-builder';

export async function buildReviewPayload(
  githubToken: string,
  payloadBuilderInput: PayloadBuilderInput
): Promise<ReviewPayload> {
  const octokit = getOctokit(githubToken);
  const githubClient = new GitHubClient(octokit);
  const reviewPayloadBuilder = new ReviewPayloadBuilder(githubClient);
  return reviewPayloadBuilder.buildPayload(payloadBuilderInput);
}
