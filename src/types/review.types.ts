export type IssueSeverity = 'error' | 'warning' | 'suggestion' | 'info';
export type IssueCategory =
  | 'tracking_plan_violation'
  | 'missing_event'
  | 'best_practice'
  | 'incorrect_property'
  | 'security'
  | 'performance'
  | 'deprecated_api';
export type EventStatus = 'added' | 'modified' | 'removed' | 'unchanged';
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
  startLine?: number;
  column?: number;
  impact?: string;
  suggestedFix?: string;
  relatedEvents?: string[];
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
  body: string;
  line: number;
  start_line?: number;
  side: 'LEFT' | 'RIGHT';
  start_side?: 'LEFT' | 'RIGHT';
}
