/**
 * RudderStack API Integration
 * Exports all RudderStack API related functionality
 */

export { RudderStackAPIClient, createRudderStackClient, type RudderStackAPIConfig } from './client';
export {
  validateAgainstTrackingPlan,
  type TrackingPlanValidationResult,
  type ValidationViolation,
} from './tracking-plan-validator';
export {
  analyzeDestinationImpacts,
  type DestinationAnalysisResult,
} from './destination-analyzer';
