import type {
  ConfidenceLevel,
  EventDetection,
  EventStatus,
  IssueSeverity,
  ReviewIssue,
  ReviewResponse,
  ReviewStats,
  ReviewSummary,
  SDKInfo,
} from '@custom-types/review.types';
import { COMMENT_MARKER } from '@utils/constants';

export function formatReviewComment(review: ReviewResponse): string {
  const sections: string[] = [
    COMMENT_MARKER,
    formatHeader(review),
    formatSummarySection(review),
    formatIssuesSection(review),
    formatEventsSection(review),
    formatFooter(review),
  ].filter(section => section.length > 0);

  return sections.join('\n\n');
}

/**
 * Header with SDK badge and overall verdict
 */
function formatHeader(review: ReviewResponse): string {
  const verdictBadge = getVerdictBadge(review.stats);
  const sdkBadge = formatSDKBadge(review.sdk);

  return `## ${verdictBadge} RudderStack PR Review\n\n${sdkBadge}`;
}

/**
 * Summary section with assessment, stats, and recommendations
 */
function formatSummarySection(review: ReviewResponse): string {
  let section = `### 📊 Summary\n\n`;
  section += `${review.summary.overallAssessment}\n\n`;
  section += formatStatsTable(review.stats, review.summary);

  if (review.summary.keyRecommendations && review.summary.keyRecommendations.length > 0) {
    section += `\n\n**🎯 Key Recommendations:**\n\n`;
    review.summary.keyRecommendations.forEach((rec, idx) => {
      section += `${idx + 1}. ${rec}\n`;
    });
  }

  return section;
}

/**
 * Issues section grouped by severity (collapsible)
 */
function formatIssuesSection(review: ReviewResponse): string {
  if (review.issues.length === 0) {
    return '';
  }

  const issuesBySeverity = groupIssuesBySeverity(review.issues);
  let section = '';

  // Errors (always expanded if present)
  if (issuesBySeverity.error && issuesBySeverity.error.length > 0) {
    section += formatIssueGroup('error', issuesBySeverity.error, false);
  }

  // Warnings (collapsible)
  if (issuesBySeverity.warning && issuesBySeverity.warning.length > 0) {
    section += formatIssueGroup('warning', issuesBySeverity.warning, true);
  }

  // Suggestions (collapsible)
  if (issuesBySeverity.suggestion && issuesBySeverity.suggestion.length > 0) {
    section += formatIssueGroup('suggestion', issuesBySeverity.suggestion, true);
  }

  // Info (collapsible)
  if (issuesBySeverity.info && issuesBySeverity.info.length > 0) {
    section += formatIssueGroup('info', issuesBySeverity.info, true);
  }

  return section;
}

/**
 * Events section as collapsible table
 */
function formatEventsSection(review: ReviewResponse): string {
  if (review.events.length === 0) {
    return '';
  }

  const eventsByStatus = groupEventsByStatus(review.events);

  let section = `<details>\n`;
  section += `<summary><b>🎯 Events Detected (${review.events.length})</b></summary>\n\n`;
  section += formatEventsTable(eventsByStatus);
  section += `\n</details>`;

  return section;
}

/**
 * Footer with metadata and help links
 */
function formatFooter(review: ReviewResponse): string {
  return (
    `---\n` +
    `<sub>🤖 Review ID: \`${review.reviewId}\` • ` +
    `Confidence: ${formatConfidence(review.confidence)}</sub>`
  );
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
 * Formats stats table
 */
function formatStatsTable(stats: ReviewStats, summary: ReviewSummary): string {
  return (
    `| Metric | Count |\n` +
    `|--------|-------|\n` +
    `| 📁 Files Analyzed | ${summary.filesAnalyzed} |\n` +
    `| ❌ Errors | ${stats.errors} |\n` +
    `| ⚠️  Warnings | ${stats.warnings} |\n` +
    `| 💡 Suggestions | ${stats.suggestions} |\n` +
    `| ✅ Events Added | ${stats.eventsAdded} |\n` +
    `| ✏️  Events Modified | ${stats.eventsModified} |`
  );
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
  collapsible: boolean
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
    section += `**📄 \`${file}\`**\n\n`;
    fileIssues.forEach((issue, idx) => {
      section += formatIssueItem(issue, idx + 1);
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
function formatIssueItem(issue: ReviewIssue, index: number): string {
  let item = `${index}. **${issue.message}** \`[${issue.id}]\`\n\n`;
  item += `   📍 Line ${issue.line}${issue.column ? `:${issue.column}` : ''} • `;
  item += `🎯 ${formatConfidence(issue.confidence)} • `;
  item += `📦 ${formatCategory(issue.category)}\n\n`;

  if (issue.impact) {
    item += `   **💥 Impact:** ${issue.impact}\n\n`;
  }

  if (issue.suggestedFix) {
    const fileExtension = getFileExtension(issue.file);
    item += `   **🔧 Suggested Fix:**\n`;
    item += `   \`\`\`${fileExtension}\n   ${issue.suggestedFix}\n   \`\`\`\n\n`;
  }

  if (issue.relatedEvents.length > 0) {
    item += `   **🔗 Related Events:** ${issue.relatedEvents.map(e => `\`${e}\``).join(', ')}\n\n`;
  }

  if (issue.affectedDestinations && issue.affectedDestinations.length > 0) {
    item += `   **📤 Affected Destinations:** ${issue.affectedDestinations.join(', ')}\n\n`;
  }

  return item;
}

function getFileExtension(file: string): string {
  return file.split('.').pop() || '';
}

/**
 * Formats events table
 */
function formatEventsTable(eventsByStatus: Record<string, EventDetection[]>): string {
  let table = `| Status | Event | File | Line | Properties |\n`;
  table += `|--------|-------|------|------|------------|\n`;

  const statusOrder: EventStatus[] = ['added', 'modified', 'deleted', 'unchanged'];

  statusOrder.forEach(status => {
    const events = eventsByStatus[status] || [];
    events.forEach(event => {
      const icon = getEventStatusIcon(status);
      const propCount = event.properties?.length || 0;
      const propDetails = propCount > 0 ? `${propCount} props` : '-';
      table += `| ${icon} ${status} | \`${event.name}\` | \`${event.file}\` | ${event.line} | ${propDetails} |\n`;
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
 * Formats confidence level
 */
function formatConfidence(confidence: ConfidenceLevel): string {
  const emojis: Record<ConfidenceLevel, string> = {
    high: '🎯 High',
    medium: '🔍 Medium',
    low: '💭 Low',
  };
  return emojis[confidence] || confidence;
}

/**
 * Formats category label
 */
function formatCategory(category: string): string {
  return category
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
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
