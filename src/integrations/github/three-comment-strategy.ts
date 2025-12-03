/**
 * Three-Comment Strategy Implementation
 * 1. Global Summary Comment (cumulative, updates in place)
 * 2. PR Review Body (incremental delta)
 * 3. Inline Annotations (errors + warnings on changed lines)
 */

import * as github from '@actions/github';
import * as core from '@actions/core';
import { PRContext } from '../../types/common';
import { AIAnalysisResult, TruncatedFileInfo } from '../anthropic/types';
import { getPRDiff, isLineChanged } from './diff-parser';

const GLOBAL_SUMMARY_IDENTIFIER = '<!-- rudderstack-global-summary -->';
const REVIEW_IDENTIFIER = '<!-- rudderstack-review -->';

/**
 * Post or update global summary comment (cumulative)
 */
export async function postOrUpdateGlobalSummary(
  prContext: PRContext,
  token: string,
  analysisResult: AIAnalysisResult,
  analysisHistory: AIAnalysisResult[],
  truncatedFiles: TruncatedFileInfo[] = []
): Promise<void> {
  core.info('Posting/updating global summary comment...');

  try {
    const octokit = github.getOctokit(token);

    // Generate cumulative summary
    const summaryBody = generateGlobalSummary(analysisResult, analysisHistory, truncatedFiles);
    const fullBody = `${GLOBAL_SUMMARY_IDENTIFIER}\n${summaryBody}`;

    // Find existing comment
    const { data: comments } = await octokit.rest.issues.listComments({
      owner: prContext.owner,
      repo: prContext.repo,
      issue_number: prContext.prNumber,
    });

    const existingComment = comments.find((comment) => comment.body?.includes(GLOBAL_SUMMARY_IDENTIFIER));

    if (existingComment) {
      // Update existing comment (full replacement)
      core.info(`Updating global summary comment #${existingComment.id}`);
      await octokit.rest.issues.updateComment({
        owner: prContext.owner,
        repo: prContext.repo,
        comment_id: existingComment.id,
        body: fullBody,
      });
    } else {
      // Create new comment
      core.info('Creating new global summary comment');
      await octokit.rest.issues.createComment({
        owner: prContext.owner,
        repo: prContext.repo,
        issue_number: prContext.prNumber,
        body: fullBody,
      });
    }

    core.info('✅ Global summary comment posted/updated');
  } catch (error) {
    core.error(`Failed to post global summary: ${error}`);
    throw error;
  }
}

/**
 * Generate global summary comment body
 */
function generateGlobalSummary(current: AIAnalysisResult, history: AIAnalysisResult[], truncatedFiles: TruncatedFileInfo[] = []): string {
  const allResults = [...history, current];

  // Merge all results for cumulative view
  const allEvents = allResults.flatMap((r) => r.events);
  const allErrors = allResults.flatMap((r) => r.issues.errors);
  const allWarnings = allResults.flatMap((r) => r.issues.warnings);
  const allSuggestions = allResults.flatMap((r) => r.issues.suggestions);
  const allDestinationImpacts = allResults.flatMap((r) => r.destinationImpacts);
  const allUnchangedFileIssues = allResults.flatMap((r) => r.unchangedFileIssues);

  // Deduplicate events by name and file
  const uniqueEvents = new Map<string, typeof allEvents[0]>();
  allEvents.forEach((event) => {
    const key = `${event.name}:${event.file}`;
    if (!uniqueEvents.has(key) || event.status !== 'existing') {
      uniqueEvents.set(key, event);
    }
  });

  let body = `## 🔍 RudderStack Instrumentation Review\n\n`;

  // High-level summary
  body += `### 📊 Summary\n\n`;
  body += `${current.summary.overallAssessment}\n\n`;
  body += `- **Files Analyzed**: ${current.summary.filesAnalyzed}\n`;
  body += `- **Events Found**: ${uniqueEvents.size}\n`;
  body += `- **Total Issues**: ${allErrors.length + allWarnings.length + allSuggestions.length}\n`;
  body += `  - ❌ Errors: ${allErrors.length}\n`;
  body += `  - ⚠️ Warnings: ${allWarnings.length}\n`;
  body += `  - 💡 Suggestions: ${allSuggestions.length}\n\n`;

  // Truncation warning (if files were truncated)
  if (truncatedFiles.length > 0) {
    body += `> **⚠️ Note**: ${truncatedFiles.length} file(s) were too large and had to be partially analyzed:\n`;
    truncatedFiles.forEach((tf) => {
      const percentAnalyzed = Math.round((tf.truncatedTokens / tf.originalTokens) * 100);
      body += `> - \`${tf.path}\` (~${percentAnalyzed}% analyzed)\n`;
    });
    body += `>\n`;
    body += `> **Recommendation**: Consider splitting these files or increasing \`max_tokens_per_request\` for complete analysis.\n\n`;
  }

  // Events section (collapsible)
  if (uniqueEvents.size > 0) {
    body += `<details>\n<summary><b>🎯 Events Found (${uniqueEvents.size})</b></summary>\n\n`;

    const eventsByStatus = {
      added: [] as typeof allEvents,
      modified: [] as typeof allEvents,
      removed: [] as typeof allEvents,
      existing: [] as typeof allEvents,
    };

    Array.from(uniqueEvents.values()).forEach((event) => {
      eventsByStatus[event.status].push(event);
    });

    if (eventsByStatus.added.length > 0) {
      body += `**✅ Added Events (${eventsByStatus.added.length}):**\n\n`;
      eventsByStatus.added.forEach((e) => {
        body += `- \`${e.name}\` in \`${e.file}\`${e.line ? `:${e.line}` : ''}\n`;
      });
      body += '\n';
    }

    if (eventsByStatus.modified.length > 0) {
      body += `**✏️ Modified Events (${eventsByStatus.modified.length}):**\n\n`;
      eventsByStatus.modified.forEach((e) => {
        body += `- \`${e.name}\` in \`${e.file}\`${e.line ? `:${e.line}` : ''}\n`;
      });
      body += '\n';
    }

    if (eventsByStatus.removed.length > 0) {
      body += `**❌ Removed Events (${eventsByStatus.removed.length}):**\n\n`;
      eventsByStatus.removed.forEach((e) => {
        body += `- \`${e.name}\` in \`${e.file}\`${e.line ? `:${e.line}` : ''}\n`;
      });
      body += '\n';
    }

    body += `</details>\n\n`;
  }

  // Issue count summary
  if (allErrors.length > 0 || allWarnings.length > 0) {
    body += `### 🚨 Issues Summary\n\n`;
    body += `See inline review comments for detailed error and warning information.\n\n`;
  }

  // Suggestions (collapsible)
  if (allSuggestions.length > 0) {
    body += `<details>\n<summary><b>💡 Suggestions (${allSuggestions.length})</b></summary>\n\n`;

    const suggestionsByFile = new Map<string, typeof allSuggestions>();
    allSuggestions.forEach((s) => {
      if (!suggestionsByFile.has(s.file)) {
        suggestionsByFile.set(s.file, []);
      }
      suggestionsByFile.get(s.file)!.push(s);
    });

    suggestionsByFile.forEach((suggestions, file) => {
      body += `**${file}**\n\n`;
      suggestions.forEach((s) => {
        body += `- Line ${s.line || 'N/A'}: ${s.message}\n`;
        if (s.fix) {
          body += `  \`\`\`javascript\n  ${s.fix}\n  \`\`\`\n`;
        }
      });
      body += '\n';
    });

    body += `</details>\n\n`;
  }

  // Destination impacts (collapsible)
  if (allDestinationImpacts.length > 0) {
    body += `<details>\n<summary><b>🎯 Destination Impacts (${allDestinationImpacts.length})</b></summary>\n\n`;

    allDestinationImpacts.forEach((impact) => {
      body += `**${impact.destinationName} (${impact.destinationType})**\n\n`;
      body += `${impact.impact}\n\n`;
      if (impact.affectedEvents.length > 0) {
        body += `Affected events: ${impact.affectedEvents.map((e) => `\`${e}\``).join(', ')}\n\n`;
      }
      if (impact.recommendations.length > 0) {
        body += `Recommendations:\n`;
        impact.recommendations.forEach((r) => {
          body += `- ${r}\n`;
        });
        body += '\n';
      }
    });

    body += `</details>\n\n`;
  }

  // Issues in unchanged files (collapsible)
  if (allUnchangedFileIssues.length > 0) {
    body += `<details>\n<summary><b>📝 Issues in Unchanged Code (${allUnchangedFileIssues.length})</b></summary>\n\n`;
    body += `These issues were found in existing code (not changed in this PR):\n\n`;

    const issuesByFile = new Map<string, typeof allUnchangedFileIssues>();
    allUnchangedFileIssues.forEach((issue) => {
      if (!issuesByFile.has(issue.file)) {
        issuesByFile.set(issue.file, []);
      }
      issuesByFile.get(issue.file)!.push(issue);
    });

    issuesByFile.forEach((issues, file) => {
      body += `**${file}**\n\n`;
      issues.forEach((issue) => {
        const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : '💡';
        body += `- ${icon} Line ${issue.line || 'N/A'}: ${issue.message}\n`;
        if (issue.fix) {
          body += `  \`\`\`javascript\n  ${issue.fix}\n  \`\`\`\n`;
        }
      });
      body += '\n';
    });

    body += `</details>\n\n`;
  }

  // Recommendations
  if (current.summary.recommendations.length > 0) {
    body += `### 💡 Key Recommendations\n\n`;
    current.summary.recommendations.forEach((rec) => {
      body += `- ${rec}\n`;
    });
    body += '\n';
  }

  body += `---\n`;
  body += `_🤖 Generated by [RudderStack PR Reviewer](https://github.com/rudderlabs/pr-reviewer) powered by AI_`;

  return body;
}

/**
 * Post PR review with incremental delta and inline annotations
 */
export async function postPRReview(
  prContext: PRContext,
  token: string,
  analysisResult: AIAnalysisResult,
  previousResult: AIAnalysisResult | null,
  annotationMode: 'errors_only' | 'errors_warnings'
): Promise<void> {
  core.info('Posting PR review with incremental delta...');

  try {
    const octokit = github.getOctokit(token);

    // Generate incremental review body
    const reviewBody = generateIncrementalReviewBody(analysisResult, previousResult);

    // Get PR diff to determine which lines can be annotated
    const diffInfo = await getPRDiff(prContext.owner, prContext.repo, prContext.prNumber, token);
    const changedFiles = new Set(Array.from(diffInfo.changedFiles.keys()));

    // Prepare inline comments (errors + warnings based on mode)
    const inlineComments = await prepareInlineComments(
      analysisResult,
      changedFiles,
      diffInfo,
      annotationMode
    );

    core.info(`Prepared ${inlineComments.length} inline comment(s)`);

    // Get commit SHA
    const { data: pr } = await octokit.rest.pulls.get({
      owner: prContext.owner,
      repo: prContext.repo,
      pull_number: prContext.prNumber,
    });

    const commitSha = pr.head.sha;

    // Post review
    const reviewComments = inlineComments.map((comment) => ({
      path: comment.path,
      line: comment.line,
      body: comment.body,
    }));

    await octokit.rest.pulls.createReview({
      owner: prContext.owner,
      repo: prContext.repo,
      pull_number: prContext.prNumber,
      commit_id: commitSha,
      event: 'COMMENT',
      body: `${REVIEW_IDENTIFIER}\n${reviewBody}`,
      comments: reviewComments.length > 0 ? reviewComments : undefined,
    });

    core.info(`✅ Posted PR review with ${inlineComments.length} inline comment(s)`);
  } catch (error) {
    core.error(`Failed to post PR review: ${error}`);
    throw error;
  }
}

/**
 * Generate incremental review body (delta since last analysis)
 */
function generateIncrementalReviewBody(current: AIAnalysisResult, previous: AIAnalysisResult | null): string {
  let body = `## 🔄 Incremental Analysis\n\n`;

  if (!previous) {
    body += `This is the first analysis for this PR.\n\n`;
    body += `- **Events Found**: ${current.events.length}\n`;
    body += `- **Issues**: ${current.issues.errors.length} errors, ${current.issues.warnings.length} warnings, ${current.issues.suggestions.length} suggestions\n\n`;
    return body;
  }

  // Calculate delta
  const newEvents = current.events.filter(
    (e) => !previous.events.some((pe) => pe.name === e.name && pe.file === e.file)
  );
  const newErrors = current.issues.errors.length - previous.issues.errors.length;
  const newWarnings = current.issues.warnings.length - previous.issues.warnings.length;
  const newSuggestions = current.issues.suggestions.length - previous.issues.suggestions.length;

  body += `**Changes since last analysis:**\n\n`;

  if (newEvents.length > 0) {
    body += `- ✅ **New Events**: ${newEvents.length}\n`;
    newEvents.forEach((e) => {
      body += `  - \`${e.name}\` in \`${e.file}\`\n`;
    });
    body += '\n';
  }

  if (newErrors !== 0) {
    const icon = newErrors > 0 ? '⬆️' : '⬇️';
    body += `- ${icon} **Errors**: ${newErrors > 0 ? '+' : ''}${newErrors} (total: ${current.issues.errors.length})\n`;
  }

  if (newWarnings !== 0) {
    const icon = newWarnings > 0 ? '⬆️' : '⬇️';
    body += `- ${icon} **Warnings**: ${newWarnings > 0 ? '+' : ''}${newWarnings} (total: ${current.issues.warnings.length})\n`;
  }

  if (newSuggestions !== 0) {
    const icon = newSuggestions > 0 ? '⬆️' : '⬇️';
    body += `- ${icon} **Suggestions**: ${newSuggestions > 0 ? '+' : ''}${newSuggestions} (total: ${current.issues.suggestions.length})\n`;
  }

  if (newEvents.length === 0 && newErrors === 0 && newWarnings === 0 && newSuggestions === 0) {
    body += `No significant changes detected.\n`;
  }

  body += `\n---\n`;
  body += `_See the global summary comment for cumulative analysis._`;

  return body;
}

/**
 * Prepare inline comments for review
 */
async function prepareInlineComments(
  analysisResult: AIAnalysisResult,
  changedFiles: Set<string>,
  diffInfo: any,
  annotationMode: 'errors_only' | 'errors_warnings'
): Promise<Array<{ path: string; line: number; body: string }>> {
  const comments: Array<{ path: string; line: number; body: string }> = [];

  // Include errors
  for (const error of analysisResult.issues.errors) {
    if (error.line && changedFiles.has(error.file) && isLineChanged(diffInfo, error.file, error.line)) {
      comments.push({
        path: error.file,
        line: error.line,
        body: formatInlineComment(error),
      });
    }
  }

  // Include warnings if mode allows
  if (annotationMode === 'errors_warnings') {
    for (const warning of analysisResult.issues.warnings) {
      if (warning.line && changedFiles.has(warning.file) && isLineChanged(diffInfo, warning.file, warning.line)) {
        comments.push({
          path: warning.file,
          line: warning.line,
          body: formatInlineComment(warning),
        });
      }
    }
  }

  return comments;
}

/**
 * Format inline comment body
 */
function formatInlineComment(issue: {
  severity: string;
  message: string;
  impact?: string;
  fix?: string;
  confidence: string;
}): string {
  const icon = issue.severity === 'error' ? '❌' : '⚠️';
  let body = `${icon} **${issue.severity.toUpperCase()}**\n\n`;

  body += `${issue.message}\n\n`;

  if (issue.impact) {
    body += `**Impact:** ${issue.impact}\n\n`;
  }

  if (issue.fix) {
    body += `**Suggested Fix:**\n\`\`\`javascript\n${issue.fix}\n\`\`\`\n\n`;
  }

  body += `_Confidence: ${issue.confidence}_`;

  return body;
}
