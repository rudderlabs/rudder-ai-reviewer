/**
 * GitHub Integration
 * Exports GitHub-related functionality
 */

export {
  getPRContext,
  getChangedFiles,
  postOrUpdateComment,
  postAnnotations,
  deletePreviousComments,
  setOutputs,
} from './enhanced-pr-client';

export {
  storeAnalysisArtifact,
  retrieveAnalysisArtifact,
  shouldPerformIncrementalAnalysis,
  deleteAnalysisArtifact,
} from './artifact-manager';

export { getPRDiff, isLineChanged } from './diff-parser';
