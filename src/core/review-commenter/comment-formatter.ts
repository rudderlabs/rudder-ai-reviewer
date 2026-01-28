import type {
  EventDetection,
  EventStatus,
  InlineComment,
  IssueSeverity,
  ReviewIssue,
  ReviewResponse,
  ReviewStats,
  SDKInfo,
} from '@custom-types/review.types';
import { COMMENT_INLINE_MARKER, COMMENT_SUMMARY_MARKER } from '@utils/constants';

export interface GitHubContext {
  owner: string;
  repo: string;
  commitSha: string;
}

export function formatReviewComment(review: ReviewResponse, githubContext: GitHubContext): string {
  const sections: string[] = [
    COMMENT_SUMMARY_MARKER,
    formatHeader(review),
    formatSummarySection(review),
    formatIssuesSection(review, githubContext),
    formatEventsSection(review, githubContext),
    formatFooter(review),
  ].filter(section => section.length > 0);

  return sections.join('\n\n');
}

/**
 * Builds a GitHub permalink URL to a specific line in a file
 */
function buildGitHubLineUrl(
  file: string,
  line: number,
  _column: number | undefined,
  context: GitHubContext
): string {
  const lineAnchor = `L${line}`;
  return `https://github.com/${context.owner}/${context.repo}/blob/${context.commitSha}/${file}#${lineAnchor}`;
}

/**
 * Header with SDK badge and overall verdict
 */
function formatHeader(review: ReviewResponse): string {
  const verdictBadge = getVerdictBadge(review.stats);
  const sdkBadge = formatSDKBadge(review.sdk);

  return `## ${verdictBadge} Rudder AI Reviewer\n\n${sdkBadge}`;
}

/**
 * Summary section with assessment and recommendations
 */
function formatSummarySection(review: ReviewResponse): string {
  let section = `### Summary\n\n`;
  section += `${review.summary.overallAssessment}`;

  if (review.summary.keyRecommendations && review.summary.keyRecommendations.length > 0) {
    section += `\n\n**Key Recommendations:**\n\n`;
    review.summary.keyRecommendations.forEach((rec, idx) => {
      section += `${idx + 1}. ${rec}\n`;
    });
  }

  return section;
}

/**
 * Issues section grouped by severity (collapsible)
 */
function formatIssuesSection(review: ReviewResponse, githubContext: GitHubContext): string {
  if (review.issues.length === 0) {
    return '';
  }

  const issuesBySeverity = groupIssuesBySeverity(review.issues);
  let section = '';

  // Errors (always expanded if present)
  if (issuesBySeverity.error && issuesBySeverity.error.length > 0) {
    section += formatIssueGroup('error', issuesBySeverity.error, false, githubContext);
  }

  // Warnings (collapsible)
  if (issuesBySeverity.warning && issuesBySeverity.warning.length > 0) {
    section += formatIssueGroup('warning', issuesBySeverity.warning, true, githubContext);
  }

  // Suggestions (collapsible)
  if (issuesBySeverity.suggestion && issuesBySeverity.suggestion.length > 0) {
    section += formatIssueGroup('suggestion', issuesBySeverity.suggestion, true, githubContext);
  }

  // Info (collapsible)
  if (issuesBySeverity.info && issuesBySeverity.info.length > 0) {
    section += formatIssueGroup('info', issuesBySeverity.info, true, githubContext);
  }

  return section;
}

/**
 * Events section as collapsible table
 */
function formatEventsSection(review: ReviewResponse, githubContext: GitHubContext): string {
  if (review.events.length === 0) {
    return '';
  }

  const eventsByStatus = groupEventsByStatus(review.events);

  let section = `<details>\n`;
  section += `<summary><b>Events Detected (${review.events.length})</b></summary>\n\n`;
  section += formatEventsTable(eventsByStatus, githubContext);
  section += `\n</details>`;

  return section;
}

/**
 * Footer with metadata
 */
function formatFooter(review: ReviewResponse): string {
  return `---\n<sub>Review ID: \`${review.reviewId}\`</sub>`;
}

/**
 * Gets verdict badge based on errors and warnings
 */
function getVerdictBadge(stats: ReviewStats): string {
  if (stats.errors > 0) return '🔴';
  if (stats.warnings > 0) return '🟡';
  return '🟢';
}

/**
 * Formats SDK badge
 */
function formatSDKBadge(sdk: SDKInfo): string {
  const installIcon = sdk.installationType === 'npm' ? '📦' : '🌐';
  return `${installIcon} **${sdk.name}** v${sdk.version} (${sdk.installationType.toUpperCase()})`;
}

/**
 * Groups issues by severity
 */
function groupIssuesBySeverity(issues: ReviewIssue[]): Record<IssueSeverity, ReviewIssue[]> {
  return issues.reduce(
    (acc, issue) => {
      if (!acc[issue.severity]) {
        acc[issue.severity] = [];
      }
      acc[issue.severity].push(issue);
      return acc;
    },
    {} as Record<IssueSeverity, ReviewIssue[]>
  );
}

/**
 * Formats a group of issues by severity
 */
function formatIssueGroup(
  severity: IssueSeverity,
  issues: ReviewIssue[],
  collapsible: boolean,
  githubContext: GitHubContext
): string {
  const icon = getSeverityIcon(severity);
  const label = severity.charAt(0).toUpperCase() + severity.slice(1) + 's';

  let section = '';

  if (collapsible) {
    section += `<details>\n<summary><b>${icon} ${label} (${issues.length})</b></summary>\n\n`;
  } else {
    section += `### ${icon} ${label} (${issues.length})\n\n`;
  }

  // Group by file
  const issuesByFile = groupIssuesByFile(issues);

  Object.entries(issuesByFile).forEach(([file, fileIssues]) => {
    section += `#### \`${file}\`\n\n`;
    fileIssues.forEach((issue, idx) => {
      section += formatIssueItem(issue, idx + 1, githubContext);
    });
  });

  if (collapsible) {
    section += `</details>\n\n`;
  }

  return section;
}

/**
 * Formats a single issue item
 */
function formatIssueItem(issue: ReviewIssue, index: number, githubContext: GitHubContext): string {
  let item = `${index}. **${issue.message}**\n`;

  // Make line number clickable with GitHub permalink, showing full path
  const url = buildGitHubLineUrl(issue.file, issue.line, issue.column, githubContext);
  const locationText = `${issue.file}:${issue.line}${issue.column ? `:${issue.column}` : ''}`;
  item += `   - Location: [${locationText}](${url})\n`;

  if (issue.impact) {
    item += `   - Impact: ${issue.impact}\n`;
  }

  if (issue.affectedDestinations && issue.affectedDestinations.length > 0) {
    item += `   - Affected Destinations: ${issue.affectedDestinations.join(', ')}\n`;
  }

  if (issue.suggestedFix) {
    const fileExtension = getFileExtension(issue.file);
    item += `\n   **Suggested Fix:**\n\n`;
    item += `\`\`\`${fileExtension}\n${issue.suggestedFix}\n\`\`\`\n\n`;
  }

  item += `\n`;

  return item;
}

function getFileExtension(file: string): string {
  return file.split('.').pop() || '';
}

/**
 * Formats events table
 */
function formatEventsTable(
  eventsByStatus: Record<string, EventDetection[]>,
  githubContext: GitHubContext
): string {
  let table = `| Status | Event | Location | Properties |\n`;
  table += `|--------|-------|----------|------------|\n`;

  const statusOrder: EventStatus[] = ['added', 'modified', 'deleted', 'unchanged'];

  statusOrder.forEach(status => {
    const events = eventsByStatus[status] || [];
    events.forEach(event => {
      const icon = getEventStatusIcon(status);
      const propCount = event.properties?.length || 0;
      const propDetails = propCount > 0 ? `${propCount} props` : '-';

      // Make location clickable with GitHub permalink
      const location = `[\`${event.file}:${event.line}\`](${buildGitHubLineUrl(event.file, event.line, undefined, githubContext)})`;

      table += `| ${icon} ${status} | \`${event.name}\` | ${location} | ${propDetails} |\n`;
    });
  });

  return table;
}

/**
 * Gets severity icon
 */
function getSeverityIcon(severity: IssueSeverity): string {
  const icons: Record<IssueSeverity, string> = {
    error: '❌',
    warning: '⚠️',
    suggestion: '💡',
    info: 'ℹ️',
  };
  return icons[severity] || '•';
}

/**
 * Gets event status icon
 */
function getEventStatusIcon(status: EventStatus): string {
  const icons: Record<EventStatus, string> = {
    added: '✅',
    modified: '✏️',
    deleted: '🗑️',
    unchanged: '📍',
  };
  return icons[status] || '•';
}

/**
 * Groups issues by file
 */
function groupIssuesByFile(issues: ReviewIssue[]): Record<string, ReviewIssue[]> {
  return issues.reduce(
    (acc, issue) => {
      if (!acc[issue.file]) {
        acc[issue.file] = [];
      }
      acc[issue.file].push(issue);
      return acc;
    },
    {} as Record<string, ReviewIssue[]>
  );
}

/**
 * Groups events by status
 */
function groupEventsByStatus(events: EventDetection[]): Record<string, EventDetection[]> {
  return events.reduce(
    (acc, event) => {
      if (!acc[event.status]) {
        acc[event.status] = [];
      }
      acc[event.status].push(event);
      return acc;
    },
    {} as Record<string, EventDetection[]>
  );
}

/**
 * Formats issue details (impact, destinations, suggested fix)
 */
function formatIssueDetails(issue: ReviewIssue): string {
  let details = '';

  if (issue.impact) {
    details += `**Impact:** ${issue.impact}\n\n`;
  }

  if (issue.affectedDestinations && issue.affectedDestinations.length > 0) {
    details += `**Affected Destinations:** ${issue.affectedDestinations.join(', ')}\n\n`;
  }

  if (issue.suggestedFix) {
    if (issue.startLine) {
      details += `**Suggested Fix:**\n\n\`\`\`suggestion\n${issue.suggestedFix}\n\`\`\`\n\n`;
    } else {
      details += `**Suggested Fix:**\n\n\`\`\`${getFileExtension(issue.file)}\n${issue.suggestedFix}\n\`\`\`\n\n`;
    }
  }

  return details;
}

/**
 * Formats a single issue as inline comment body
 *
 * @param issue - Review issue to format
 * @returns Markdown string for inline comment
 */
function formatCommentBody(issue: ReviewIssue): string {
  const icon = getSeverityIcon(issue.severity);
  let body = `${icon} **${issue.message}**\n\n`;
  body += formatIssueDetails(issue);
  body += `\n\n<sub>${COMMENT_INLINE_MARKER}</sub>`;
  return body;
}

/**
 * Builds inline comments array from issues
 *
 * @param issues - Issues to convert to inline comments
 * @returns Array of inline comments formatted for GitHub API
 */
export function formatInlineComments(issues: ReviewIssue[]): InlineComment[] {
  return issues.map(issue => {
    const comment: InlineComment = {
      path: issue.file,
      body: formatCommentBody(issue),
      line: issue.line,
      side: 'RIGHT',
    };

    if (issue.startLine && issue.startLine !== issue.line) {
      comment.start_line = issue.startLine;
      comment.start_side = 'RIGHT';
    }

    return comment;
  });
}
