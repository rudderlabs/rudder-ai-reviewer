/**
 * Type definitions for Anthropic AI integration
 */

// ============================================================================
// Configuration
// ============================================================================

export interface AnthropicConfig {
  apiKey: string;
  model: string; // Any Anthropic model name (e.g., claude-3-5-sonnet-20241022)
  maxTokens: number;
}

// ============================================================================
// Analysis Request/Response
// ============================================================================

export interface AnthropicAnalysisRequest {
  systemPrompt: string;
  userPrompt: string;
}

export interface AnthropicAnalysisResponse {
  status: 'success' | 'failed';
  content?: string;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// ============================================================================
// AI Analysis Result (Parsed from AI response)
// ============================================================================

export interface AIAnalysisResult {
  summary: AISummary;
  events: AIEvent[];
  issues: AIIssues;
  destinationImpacts: AIDestinationImpact[];
  unchangedFileIssues: AIUnchangedFileIssue[];
}

export interface AISummary {
  overallAssessment: string;
  filesAnalyzed: number;
  totalIssues: number;
  recommendations: string[];
}

export interface AIEvent {
  name: string;
  file: string;
  line?: number;
  status: 'added' | 'modified' | 'removed' | 'existing';
  properties?: AIEventProperty[];
  issues?: string[];
}

export interface AIEventProperty {
  name: string;
  type: string;
  required: boolean;
}

export interface AIIssues {
  errors: AIIssue[];
  warnings: AIIssue[];
  suggestions: AIIssue[];
}

export interface AIIssue {
  severity: 'error' | 'warning' | 'suggestion';
  message: string;
  file: string;
  line?: number;
  column?: number;
  impact?: string;
  fix?: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface AIDestinationImpact {
  destinationName: string;
  destinationType: string;
  impact: string;
  affectedEvents: string[];
  recommendations: string[];
}

export interface AIUnchangedFileIssue {
  file: string;
  line?: number;
  severity: 'error' | 'warning' | 'suggestion';
  message: string;
  fix?: string;
}

// ============================================================================
// Chunking
// ============================================================================

export interface CodeChunk {
  id: string;
  files: FileContent[];
  isChangedFiles: boolean;
  estimatedTokens: number;
}

export interface FileContent {
  path: string;
  content: string;
  isChanged: boolean;
}

export interface TruncatedFileInfo {
  path: string;
  originalTokens: number;
  truncatedTokens: number;
}

export interface ChunkingResult {
  chunks: CodeChunk[];
  truncatedFiles: TruncatedFileInfo[];
}
