/**
 * PR Annotation Generator
 * Generates inline file annotations for GitHub PR reviews
 */

import { Issue, PRAnnotation } from '../types/common';

export interface AnnotationOptions {
  changedLines?: Set<string>; // Set of "file:line" strings for changed lines
}

/**
 * Generate PR annotations from issues
 */
export function generateAnnotations(
  issues: Issue[],
  options: AnnotationOptions
): PRAnnotation[] {
  const annotations: PRAnnotation[] = [];

  for (const issue of issues) {
    // Only annotate changed lines if changedLines is provided
    if (options.changedLines) {
      const lineKey = `${issue.file}:${issue.line || 0}`;
      if (!options.changedLines.has(lineKey)) {
        continue;
      }
    }

    const annotation = createAnnotation(issue);
    if (annotation) {
      annotations.push(annotation);
    }
  }

  return annotations;
}

/**
 * Create annotation from issue
 */
function createAnnotation(issue: Issue): PRAnnotation | null {
  if (!issue.line) {
    // Skip issues without line numbers
    return null;
  }

  const level = mapSeverityToLevel(issue.severity);
  const title = getAnnotationTitle(issue);
  const message = formatAnnotationMessage(issue);

  return {
    path: issue.file,
    startLine: issue.line,
    endLine: issue.line,
    annotationLevel: level,
    title,
    message,
  };
}

/**
 * Map issue severity to GitHub annotation level
 */
function mapSeverityToLevel(
  severity: 'error' | 'warning' | 'suggestion'
): 'failure' | 'warning' | 'notice' {
  switch (severity) {
    case 'error':
      return 'failure';
    case 'warning':
      return 'warning';
    case 'suggestion':
      return 'notice';
  }
}

/**
 * Get annotation title
 */
function getAnnotationTitle(issue: Issue): string {
  const prefix = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : '💡';
  const sourcePrefix = getSourcePrefix(issue.source);

  return `${prefix} ${sourcePrefix}${issue.message.split('\n')[0].substring(0, 80)}`;
}

/**
 * Get source prefix for title
 */
function getSourcePrefix(source: 'static' | 'ai' | 'tracking-plan' | 'destination'): string {
  switch (source) {
    case 'static':
      return '';
    case 'ai':
      return 'AI: ';
    case 'tracking-plan':
      return 'Tracking Plan: ';
    case 'destination':
      return 'Destination Impact: ';
  }
}

/**
 * Format annotation message with all details
 */
function formatAnnotationMessage(issue: Issue): string {
  const sections: string[] = [];

  // Main message
  sections.push(`**Issue:** ${issue.message}`);

  // Impact
  if (issue.impact) {
    sections.push(`\n**Impact:** ${issue.impact}`);
  }

  // Fix suggestion
  if (issue.fix) {
    sections.push(`\n**Suggested Fix:**\n\`\`\`javascript\n${issue.fix}\n\`\`\``);
  }

  // Confidence level
  if (issue.confidence) {
    sections.push(`\n**Confidence:** ${capitalize(issue.confidence)}`);
  }

  // Source
  const sourceLabel = getSourceLabel(issue.source);
  sections.push(`\n*Source: ${sourceLabel}*`);

  return sections.join('\n');
}

/**
 * Get source label
 */
function getSourceLabel(source: 'static' | 'ai' | 'tracking-plan' | 'destination'): string {
  switch (source) {
    case 'static':
      return 'Static Analysis';
    case 'ai':
      return 'AI-Enhanced Analysis';
    case 'tracking-plan':
      return 'Tracking Plan Validation';
    case 'destination':
      return 'Destination Impact Analysis';
  }
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Group annotations by file
 */
export function groupAnnotationsByFile(
  annotations: PRAnnotation[]
): Map<string, PRAnnotation[]> {
  const grouped = new Map<string, PRAnnotation[]>();

  for (const annotation of annotations) {
    const existing = grouped.get(annotation.path) || [];
    existing.push(annotation);
    grouped.set(annotation.path, existing);
  }

  return grouped;
}

/**
 * Sort annotations by severity and line number
 */
export function sortAnnotations(annotations: PRAnnotation[]): PRAnnotation[] {
  return annotations.sort((a, b) => {
    // Sort by severity first (failure > warning > notice)
    const severityOrder = { failure: 0, warning: 1, notice: 2 };
    const severityDiff = severityOrder[a.annotationLevel] - severityOrder[b.annotationLevel];

    if (severityDiff !== 0) {
      return severityDiff;
    }

    // Then by line number
    return a.startLine - b.startLine;
  });
}
