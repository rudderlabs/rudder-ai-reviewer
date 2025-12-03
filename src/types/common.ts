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
  filePatterns?: string[];
  excludePatterns?: string[];
  outputVerbosity: 'minimal' | 'standard' | 'detailed';
  reviewUnchangedFiles: boolean;
  aiModel: string; // Allow any Anthropic model name
  maxTokensPerRequest: number;
  annotationMode: 'errors_only' | 'errors_warnings';
}

export interface FileConfig {
  file_patterns?: {
    include?: string[];
    exclude?: string[];
  };
  output_format?: {
    verbosity?: 'minimal' | 'standard' | 'detailed';
  };
  limits?: {
    max_files?: number;
    max_file_size_mb?: number;
  };
  ai?: {
    model?: string; // Allow any Anthropic model name
    max_tokens_per_request?: number;
  };
  annotation_mode?: 'errors_only' | 'errors_warnings';
}

export interface PerformanceLimits {
  maxFiles: number;
  maxFileSizeMB: number;
  maxLinesPerFile: number;
  maxTotalLines: number;
  staticAnalysisTimeoutMs: number;
  aiAnalysisTimeoutMs: number;
  totalTimeoutMs: number;
  maxAIRequests: number;
}

// ============================================================================
// Analysis Results
// ============================================================================

export interface Issue {
  id: string;
  severity: IssueSeverity;
  message: string;
  file: string;
  line?: number;
  column?: number;
  impact?: string;
  fix?: string;
  confidence?: ConfidenceLevel;
  source: 'static' | 'ai' | 'tracking-plan' | 'destination';
}

export interface AnalysisResult {
  status: AnalysisStatus;
  issues: Issue[];
  changes: ChangesSummary;
  filesAnalyzed: FileAnalysisInfo[];
  destinationImpacts?: DestinationImpact[];
  aiInsights?: AIInsight[];
  errors?: string[];
}

export interface FileAnalysisInfo {
  path: string;
  analyzed: boolean;
  reason?: string; // Why it was skipped (e.g., "file too large", "no SDK usage")
  sdkDetected: boolean;
  framework?: string;
}

// ============================================================================
// Changes Detection
// ============================================================================

export interface ChangesSummary {
  eventsAdded: EventChange[];
  eventsModified: EventChange[];
  eventsRemoved: EventChange[];
  propertyChanges: PropertyChange[];
}

export interface EventChange {
  eventName: string;
  file: string;
  line?: number;
  properties?: PropertyInfo[];
}

export interface PropertyChange {
  eventName: string;
  propertyName: string;
  changeType: 'added' | 'removed' | 'type_changed' | 'structure_changed';
  oldType?: string;
  newType?: string;
  file: string;
  line?: number;
}

export interface PropertyInfo {
  name: string;
  type: string;
  required?: boolean;
}

// ============================================================================
// SDK Detection
// ============================================================================

export interface SDKUsage {
  type: 'npm' | 'cdn';
  version?: string;
  detected: boolean;
  locations: SDKCallLocation[];
}

export interface SDKCallLocation {
  file: string;
  line: number;
  column: number;
  method: string; // 'track', 'identify', 'page', 'load', etc.
  callType: 'valid' | 'invalid' | 'uncertain';
}

// ============================================================================
// Framework Detection
// ============================================================================

export type SupportedFramework =
  | 'react'
  | 'nextjs'
  | 'vue'
  | 'angular'
  | 'vanilla'
  | 'unknown';

export interface FrameworkInfo {
  framework: SupportedFramework;
  confidence: ConfidenceLevel;
  version?: string;
  detectedFrom: string; // e.g., "package.json", "file patterns"
}

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
// AI Analysis
// ============================================================================

export interface AIAnalysisRequest {
  id: string;
  analysisType: 'dynamic_event_inference' | 'complex_pattern' | 'intent_analysis';
  issue: string;
  astStructure: Record<string, unknown>;
  context: Record<string, unknown>;
}

export interface AIAnalysisResponse {
  id: string;
  status: 'success' | 'failed' | 'throttled';
  confidence: ConfidenceLevel;
  findings?: {
    inferredPattern?: string;
    recommendations?: string[];
    impactAssessment?: string;
  };
  error?: string;
}

export interface AIInsight {
  file: string;
  line?: number;
  insight: string;
  confidence: ConfidenceLevel;
  recommendations?: string[];
}

export interface AIProxyBatchRequest {
  analysis_requests: AIAnalysisRequest[];
}

export interface AIProxyBatchResponse {
  results: AIAnalysisResponse[];
  rate_limit?: {
    remaining: number;
    reset_at: string;
  };
}

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
// File Scanning & Prioritization
// ============================================================================

export interface FileScore {
  path: string;
  score: number;
  reasons: {
    rudderStackChangeCount: number;
    fileStatus: 'changed' | 'new' | 'unchanged';
    fileSizeBytes: number;
    fileType: string;
  };
}

export interface ScanResult {
  files: string[];
  prioritizedFiles: FileScore[];
  totalFiles: number;
  skippedFiles: number;
}

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
  analysisResult: AnalysisResult;
}

// ============================================================================
// Output Generation
// ============================================================================

export interface ReportSections {
  summary: string;
  filesAnalyzed: string;
  errors?: string;
  warnings?: string;
  suggestions?: string;
  destinationImpacts?: string;
  changesDetected?: string;
  aiAnalysis?: string;
}
