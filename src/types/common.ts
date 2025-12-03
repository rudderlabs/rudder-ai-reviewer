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
// RudderStack API types removed - AI analyzes SDK usage directly from code
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
// Incremental Analysis
// ============================================================================

export interface AnalysisArtifact {
  version: string;
  timestamp: string;
  prNumber: number;
  commitSha: string;
  analysisResult: any; // AIAnalysisResult from anthropic/types.ts (any for JSON serialization)
}
