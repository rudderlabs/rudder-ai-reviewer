/**
 * Common type definitions used across the PR Reviewer action
 */

// ============================================================================
// Severity & Classification
// ============================================================================

export type IssueSeverity = 'error' | 'warning' | 'suggestion';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type AnalysisStatus = 'success' | 'partial' | 'failed';

// ============================================================================
// Configuration
// ============================================================================

export interface ActionConfig {
  serviceAccessToken: string;
  sourceId?: string;
  githubToken: string;
  anthropicApiKey: string;
  rootDirectory?: string;
  configPath: string;
  reviewUnchangedFiles: boolean;
  aiModel: string; // Allow any Anthropic model name
  maxTokensPerRequest: number;
  annotationMode: 'errors_only' | 'errors_warnings';
}

export interface FileConfig {
  ai?: {
    model?: string; // Allow any Anthropic model name
    max_tokens_per_request?: number;
  };
  annotation_mode?: 'errors_only' | 'errors_warnings';
  // Future: Add file patterns, limits, etc. when needed
}

// ============================================================================
// Legacy types removed - AI-based analysis uses different structure
// See AIAnalysisResult in integrations/anthropic/types.ts for new format
// ============================================================================

// ============================================================================
// Tracking Plan
// ============================================================================

export interface TrackingPlan {
  events: TrackingPlanEvent[];
  version?: string;
}

export interface TrackingPlanEvent {
  name: string;
  description?: string;
  properties: TrackingPlanProperty[];
  namingConvention?: 'snake_case' | 'camelCase' | 'PascalCase' | 'kebab-case';
}

export interface TrackingPlanProperty {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  allowedValues?: string[];
  pattern?: string;
}

// ============================================================================
// Destination Analysis
// ============================================================================

export interface DestinationImpact {
  destinationName: string;
  destinationType: string; // 'Google Analytics', 'Amplitude', etc.
  affectedMappings: FieldMapping[];
  severity: IssueSeverity;
  description: string;
}

export interface FieldMapping {
  sourceProperty: string;
  destinationField: string;
  changeType: 'added' | 'removed' | 'type_changed';
  impact: string;
}

// ============================================================================
// AI Analysis - Legacy proxy types removed
// See integrations/anthropic/types.ts for current AI analysis types
// ============================================================================

// ============================================================================
// RudderStack API
// ============================================================================

export interface WorkspaceConfig {
  destinations: DestinationConfig[];
  sourceId: string;
  workspaceId: string;
}

export interface DestinationConfig {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  fieldMappings?: Record<string, string>;
}

// ============================================================================
// File Scanning - Legacy types removed (no prioritization in AI approach)
// ============================================================================

// ============================================================================
// GitHub Integration
// ============================================================================

export interface PRContext {
  owner: string;
  repo: string;
  prNumber: number;
  baseSha: string;
  headSha: string;
  changedFiles: string[];
}

export interface PRComment {
  id?: number;
  body: string;
}

export interface PRAnnotation {
  path: string;
  startLine: number;
  endLine: number;
  annotationLevel: 'notice' | 'warning' | 'failure';
  message: string;
  title: string;
}

// ============================================================================
// Incremental Analysis - Legacy format
// TODO: Update to use AIAnalysisResult from anthropic/types.ts
// ============================================================================

export interface AnalysisArtifact {
  version: string;
  timestamp: string;
  prNumber: number;
  commitSha: string;
  analysisResult: any; // TODO: Use AIAnalysisResult when incremental analysis is implemented
}
