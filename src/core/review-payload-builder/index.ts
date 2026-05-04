import type { ChangeRequestContext, SCMProvider } from '@core/providers';
import { ReviewPayload } from '@custom-types/review-payload.types';
import { PayloadBuilderInput, ReviewPayloadBuilder } from './payload-builder';

export { ReviewPayloadBuilder } from './payload-builder';
export type { PayloadBuilderInput } from './payload-builder';

export async function buildReviewPayload(
  provider: SCMProvider,
  context: ChangeRequestContext,
  payloadBuilderInput: PayloadBuilderInput
): Promise<ReviewPayload> {
  const reviewPayloadBuilder = new ReviewPayloadBuilder(provider);
  return reviewPayloadBuilder.buildPayload(context, payloadBuilderInput);
}
