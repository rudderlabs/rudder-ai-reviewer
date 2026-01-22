export type IssueSeverity = 'error' | 'warning' | 'suggestion' | 'info';
export type IssueCategory =
  | 'event_tracking'
  | 'schema_change'
  | 'best_practice'
  | 'reliability'
  | 'security'
  | 'performance'
  | 'compliance';
export type EventStatus = 'added' | 'modified' | 'deleted' | 'unchanged';
export type PropertyType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null'
  | 'unknown';
export type ReviewVerdict = 'approved' | 'changes_requested' | 'comment' | 'no_comment';
export type SDKInstallationType = 'npm' | 'cdn';

export interface ReviewResponse {
  reviewId: string;
  sdk: SDKInfo;
  summary: ReviewSummary;
  events: EventDetection[];
  issues: ReviewIssue[];
  stats: ReviewStats;
}

export interface SDKInfo {
  name: string;
  version: string;
  installationType: SDKInstallationType;
}

export interface ReviewSummary {
  overallAssessment: string;
  filesAnalyzed: number;
  totalIssues: number;
  verdict: ReviewVerdict;
  keyRecommendations?: string[];
}

export interface EventDetection {
  name: string;
  status: EventStatus;
  file: string;
  line: number;
  properties?: EventProperty[];
}

export interface EventProperty {
  name: string;
  type: PropertyType;
  required: boolean;
}

export interface ReviewIssue {
  id: string;
  severity: IssueSeverity;
  category: IssueCategory;
  message: string;
  file: string;
  line: number;
  column?: number;
  impact: string;
  suggestedFix?: string;
  relatedEvents: string[];
  affectedDestinations?: string[];
}

export interface ReviewStats {
  errors: number;
  warnings: number;
  suggestions: number;
  eventsAdded: number;
  eventsModified: number;
  eventsDeleted?: number;
}

export interface InlineComment {
  path: string;
  line: number;
  body: string;
}
