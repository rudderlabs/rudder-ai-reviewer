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

  // Status badge based on findings
  const hasErrors = allErrors.length > 0;
  const hasWarnings = allWarnings.length > 0;
  let statusBadge = '';
  let actionRequired = '';

  if (hasErrors) {
    statusBadge = '🔴 **Action Required** — Critical issues found';
    actionRequired = `⚠️ **Next Step:** Fix ${allErrors.length} critical error${allErrors.length > 1 ? 's' : ''} before merging`;
  } else if (hasWarnings) {
    statusBadge = '🟡 **Review Recommended** — Warnings detected';
    actionRequired = `💡 **Next Step:** Review ${allWarnings.length} warning${allWarnings.length > 1 ? 's' : ''} and address if needed`;
  } else {
    statusBadge = '🟢 **All Clear** — No critical issues found';
    actionRequired = `✅ **Ready:** Instrumentation looks good!`;
  }

  body += `${statusBadge}\n\n`;
  body += `> ${actionRequired}\n\n`;

  // SDK Version Badge (if available)
  if (current.summary.sdkVersion && current.summary.sdkVersion !== 'unknown') {
    const installBadge = current.summary.sdkInstallationType === 'npm' ? '📦 NPM' : current.summary.sdkInstallationType === 'cdn' ? '🌐 CDN' : '';
    body += `**SDK Version:** \`${current.summary.sdkVersion}\` ${installBadge}\n\n`;
  }

  body += `---\n\n`;

  // High-level summary
  body += `### 📊 Analysis Summary\n\n`;
  body += `${current.summary.overallAssessment}\n\n`;

  // Summary table with visual indicators and trends
  const previousErrors = history.length > 0 ? history[history.length - 1].issues.errors.length : 0;
  const previousWarnings = history.length > 0 ? history[history.length - 1].issues.warnings.length : 0;
  const errorTrend = history.length > 0 ? getTrend(allErrors.length, previousErrors) : '';
  const warningTrend = history.length > 0 ? getTrend(allWarnings.length, previousWarnings) : '';

  body += `| Metric | Count | Status |\n`;
  body += `|--------|-------|--------|\n`;
  body += `| 📁 Files Analyzed | ${current.summary.filesAnalyzed} | - |\n`;
  body += `| 🎯 Events Found | ${uniqueEvents.size} | ${uniqueEvents.size > 0 ? '✓' : '-'} |\n`;
  body += `| ❌ Errors | ${allErrors.length}${errorTrend} | ${allErrors.length > 0 ? '🔴 Fix Required' : '✅ None'} |\n`;
  body += `| ⚠️ Warnings | ${allWarnings.length}${warningTrend} | ${allWarnings.length > 0 ? '🟡 Review' : '✅ None'} |\n`;
  body += `| 💡 Suggestions | ${allSuggestions.length} | ${allSuggestions.length > 0 ? '📝 Optional' : '-'} |\n\n`;

  // Quick action links (if there are issues)
  if (allErrors.length > 0 || allWarnings.length > 0 || allSuggestions.length > 0) {
    body += `<details>\n<summary><b>📑 Quick Navigation</b></summary>\n\n`;
    body += `Jump to specific sections:\n\n`;
    const links = [];
    if (allErrors.length > 0) links.push(`- 🔴 [Critical Errors (${allErrors.length})](#-errors-${allErrors.length})`);
    if (allWarnings.length > 0) links.push(`- 🟡 [Warnings (${allWarnings.length})](#️-warnings-${allWarnings.length})`);
    if (allSuggestions.length > 0) links.push(`- 💡 [Suggestions (${allSuggestions.length})](#-suggestions-${allSuggestions.length})`);
    if (uniqueEvents.size > 0) links.push(`- 🎯 [Events Found (${uniqueEvents.size})](#-events-found-${uniqueEvents.size})`);
    if (allDestinationImpacts.length > 0) links.push(`- 🎯 [Destination Impacts (${allDestinationImpacts.length})](#-destination-impacts-${allDestinationImpacts.length})`);
    body += links.join('\n');
    body += `\n\n</details>\n\n`;
  }

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

  // Events section (collapsible with enhanced details)
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
      body += `#### ✅ Added Events (${eventsByStatus.added.length})\n\n`;
      eventsByStatus.added.forEach((e) => {
        body += `- **\`${e.name}\`**\n`;
        body += `  📍 **Location:** \`${e.file}\`${e.line ? ` (Line ${e.line})` : ''}\n`;
        if (e.properties && e.properties.length > 0) {
          body += `  <details><summary>📦 Properties (${e.properties.length})</summary>\n\n`;
          e.properties.forEach((p) => {
            const requiredBadge = p.required ? '🔴 Required' : '⚪ Optional';
            body += `  - \`${p.name}\`: \`${p.type}\` ${requiredBadge}\n`;
          });
          body += `  </details>\n`;
        }
        if (e.issues && e.issues.length > 0) {
          body += `  > ⚠️ ${e.issues.join(', ')}\n`;
        }
        body += '\n';
      });
    }

    if (eventsByStatus.modified.length > 0) {
      body += `#### ✏️ Modified Events (${eventsByStatus.modified.length})\n\n`;
      eventsByStatus.modified.forEach((e) => {
        body += `- **\`${e.name}\`**\n`;
        body += `  📍 **Location:** \`${e.file}\`${e.line ? ` (Line ${e.line})` : ''}\n`;
        if (e.properties && e.properties.length > 0) {
          body += `  <details><summary>📦 Properties (${e.properties.length})</summary>\n\n`;
          e.properties.forEach((p) => {
            const requiredBadge = p.required ? '🔴 Required' : '⚪ Optional';
            body += `  - \`${p.name}\`: \`${p.type}\` ${requiredBadge}\n`;
          });
          body += `  </details>\n`;
        }
        if (e.issues && e.issues.length > 0) {
          body += `  > ⚠️ ${e.issues.join(', ')}\n`;
        }
        body += '\n';
      });
    }

    if (eventsByStatus.removed.length > 0) {
      body += `#### ❌ Removed Events (${eventsByStatus.removed.length})\n\n`;
      eventsByStatus.removed.forEach((e) => {
        body += `- ~~**\`${e.name}\`**~~\n`;
        body += `  📍 **Was in:** \`${e.file}\`${e.line ? ` (Line ${e.line})` : ''}\n\n`;
      });
    }

    body += `</details>\n\n`;
  }

  // Errors section (expanded by default if present)
  if (allErrors.length > 0) {
    body += `### ❌ Errors (${allErrors.length})\n\n`;
    body += `> **🚨 Critical issues that must be fixed before merging**\n\n`;

    // Categorize errors by type for better organization
    const errorsByType = new Map<string, typeof allErrors>();
    allErrors.forEach((err) => {
      const type = categorizeIssue(err.message);
      if (!errorsByType.has(type)) {
        errorsByType.set(type, []);
      }
      errorsByType.get(type)!.push(err);
    });

    // Show error summary by category
    if (errorsByType.size > 1) {
      body += `**By Category:**\n\n`;
      errorsByType.forEach((errors, type) => {
        body += `- ${type}: ${errors.length}\n`;
      });
      body += '\n';
    }

    // Group errors by file for better organization
    const errorsByFile = new Map<string, typeof allErrors>();
    allErrors.forEach((err) => {
      if (!errorsByFile.has(err.file)) {
        errorsByFile.set(err.file, []);
      }
      errorsByFile.get(err.file)!.push(err);
    });

    errorsByFile.forEach((errors, file) => {
      body += `<details open>\n<summary><b>📄 \`${file}\`</b> — ${errors.length} error${errors.length > 1 ? 's' : ''}</summary>\n\n`;
      errors.forEach((err, idx) => {
        body += `**${idx + 1}. ${err.message}**\n\n`;
        body += `| Property | Value |\n`;
        body += `|----------|-------|\n`;
        body += `| 📍 File | \`${err.file}\` |\n`;
        body += `| 📏 Line | ${err.line || 'N/A'} |\n`;
        if (err.column) {
          body += `| 📐 Column | ${err.column} |\n`;
        }
        body += `| 🎯 Confidence | ${err.confidence} |\n\n`;
        if (err.impact) {
          body += `**💥 Impact:**\n> ${err.impact}\n\n`;
        }
        if (err.fix) {
          body += `**🔧 Suggested Fix:**\n\`\`\`javascript\n${err.fix}\n\`\`\`\n\n`;
        }
        body += `---\n\n`;
      });
      body += `</details>\n\n`;
    });
  }

  // Warnings section (collapsed)
  if (allWarnings.length > 0) {
    body += `<details>\n<summary><b>⚠️ Warnings (${allWarnings.length})</b></summary>\n\n`;
    body += `Issues that should be addressed:\n\n`;

    const warningsByFile = new Map<string, typeof allWarnings>();
    allWarnings.forEach((warn) => {
      if (!warningsByFile.has(warn.file)) {
        warningsByFile.set(warn.file, []);
      }
      warningsByFile.get(warn.file)!.push(warn);
    });

    warningsByFile.forEach((warnings, file) => {
      body += `**📄 \`${file}\`** — ${warnings.length} warning${warnings.length > 1 ? 's' : ''}\n\n`;
      warnings.forEach((warn, idx) => {
        body += `${idx + 1}. **${warn.message}**\n\n`;
        body += `   📍 **Location:** \`${warn.file}\` (Line ${warn.line || 'N/A'})\n`;
        if (warn.column) {
          body += `   📐 **Column:** ${warn.column}\n`;
        }
        if (warn.impact) {
          body += `   💥 **Impact:** ${warn.impact}\n`;
        }
        if (warn.fix) {
          body += `   🔧 **Fix:** \`${warn.fix}\`\n`;
        }
        body += `   🎯 **Confidence:** ${warn.confidence}\n\n`;
      });
      body += '\n';
    });

    body += `</details>\n\n`;
  }

  // Suggestions (collapsible)
  if (allSuggestions.length > 0) {
    body += `<details>\n<summary><b>💡 Suggestions (${allSuggestions.length})</b></summary>\n\n`;
    body += `Recommendations for improvement:\n\n`;

    const suggestionsByFile = new Map<string, typeof allSuggestions>();
    allSuggestions.forEach((s) => {
      if (!suggestionsByFile.has(s.file)) {
        suggestionsByFile.set(s.file, []);
      }
      suggestionsByFile.get(s.file)!.push(s);
    });

    suggestionsByFile.forEach((suggestions, file) => {
      body += `**📄 \`${file}\`** — ${suggestions.length} suggestion${suggestions.length > 1 ? 's' : ''}\n\n`;
      suggestions.forEach((s, idx) => {
        body += `${idx + 1}. **${s.message}**\n\n`;
        body += `   📍 **Location:** \`${s.file}\` (Line ${s.line || 'N/A'})\n`;
        if (s.fix) {
          body += `   🔧 **Suggestion:**\n   \`\`\`javascript\n   ${s.fix}\n   \`\`\`\n`;
        }
        body += `   🎯 **Confidence:** ${s.confidence}\n\n`;
      });
      body += '\n';
    });

    body += `</details>\n\n`;
  }

  // Destination impacts (collapsible with better formatting)
  if (allDestinationImpacts.length > 0) {
    body += `<details>\n<summary><b>🎯 Destination Impacts (${allDestinationImpacts.length})</b></summary>\n\n`;
    body += `Analysis of how changes affect downstream destinations:\n\n`;

    allDestinationImpacts.forEach((impact, idx) => {
      body += `#### ${idx + 1}. ${impact.destinationName} (${impact.destinationType})\n\n`;

      body += `> **Impact:** ${impact.impact}\n\n`;

      if (impact.affectedEvents.length > 0) {
        body += `**Affected Events:**\n`;
        impact.affectedEvents.forEach((event) => {
          body += `- \`${event}\`\n`;
        });
        body += '\n';
      }

      if (impact.recommendations.length > 0) {
        body += `**Recommendations:**\n`;
        impact.recommendations.forEach((r) => {
          body += `- ${r}\n`;
        });
        body += '\n';
      }

      if (idx < allDestinationImpacts.length - 1) {
        body += `---\n\n`;
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
      body += `**📄 \`${file}\`** — ${issues.length} issue${issues.length > 1 ? 's' : ''}\n\n`;
      issues.forEach((issue) => {
        const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : '💡';
        body += `${icon} **${issue.message}**\n\n`;
        body += `  📍 **Location:** \`${issue.file}\` (Line ${issue.line || 'N/A'})\n`;
        if (issue.fix) {
          body += `  🔧 **Fix:**\n  \`\`\`javascript\n  ${issue.fix}\n  \`\`\`\n`;
        }
        body += '\n';
      });
      body += '\n';
    });

    body += `</details>\n\n`;
  }

  // Key Recommendations (always visible if present)
  if (current.summary.recommendations && current.summary.recommendations.length > 0) {
    body += `### 🎯 Key Recommendations\n\n`;
    body += `Priority actions to improve your instrumentation:\n\n`;
    current.summary.recommendations.forEach((rec, idx) => {
      body += `${idx + 1}. ${rec}\n`;
    });
    body += '\n';
  }

  // Success message if no issues
  if (allErrors.length === 0 && allWarnings.length === 0) {
    body += `### ✅ All Clear!\n\n`;
    body += `No critical issues or warnings found. Your RudderStack instrumentation looks good! 🎉\n\n`;
  }

  // Quick summary for sharing (if there are issues)
  if (allErrors.length > 0 || allWarnings.length > 0) {
    body += `---\n\n`;
    body += `<details>\n<summary><b>📋 Summary for Team (Copy & Paste)</b></summary>\n\n`;
    body += '```\n';
    body += `RudderStack Instrumentation Review Summary\n`;
    body += `==========================================\n\n`;
    if (hasErrors) {
      body += `🔴 ${allErrors.length} error${allErrors.length > 1 ? 's' : ''} found - Action required\n`;
    }
    if (hasWarnings) {
      body += `🟡 ${allWarnings.length} warning${allWarnings.length > 1 ? 's' : ''} found - Review recommended\n`;
    }
    body += `\n`;
    body += `Files: ${current.summary.filesAnalyzed} | Events: ${uniqueEvents.size}\n`;
    if (current.summary.sdkVersion !== 'unknown') {
      body += `SDK: ${current.summary.sdkVersion} (${current.summary.sdkInstallationType?.toUpperCase() || 'unknown'})\n`;
    }
    body += '```\n';
    body += `</details>\n\n`;
  }

  // Help section with resources
  body += `---\n\n`;
  body += `<details>\n<summary><b>📚 Resources & Help</b></summary>\n\n`;
  body += `**Documentation:**\n`;
  body += `- [RudderStack JavaScript SDK Docs](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/)\n`;
  body += `- [API Reference](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/api-reference/)\n`;
  body += `- [Migration Guide](https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/migration-guide/)\n`;
  body += `- [Examples](https://github.com/rudderlabs/rudder-sdk-js/tree/develop/examples)\n\n`;
  body += `**Support:**\n`;
  body += `- [Community Slack](https://rudderstack.com/join-rudderstack-slack-community/)\n`;
  body += `- [GitHub Issues](https://github.com/rudderlabs/rudder-sdk-js/issues)\n`;
  body += `- [Report PR Reviewer Issues](https://github.com/rudderlabs/pr-reviewer/issues)\n\n`;
  body += `</details>\n\n`;
  body += `---\n`;
  body += `<sub>🤖 Generated by [RudderStack PR Reviewer](https://github.com/rudderlabs/pr-reviewer) • Powered by Anthropic Claude • [Report Issues](https://github.com/rudderlabs/pr-reviewer/issues)</sub>`;

  return body;
}

/**
 * Categorize issue by type based on message content
 */
function categorizeIssue(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('missing') || lower.includes('required')) {
    return '🔸 Missing Parameters';
  }
  if (lower.includes('type') || lower.includes('typeof')) {
    return '🔸 Type Errors';
  }
  if (lower.includes('deprecated')) {
    return '🔸 Deprecated API';
  }
  if (lower.includes('tracking plan') || lower.includes('schema')) {
    return '🔸 Schema Violations';
  }
  if (lower.includes('syntax') || lower.includes('invalid')) {
    return '🔸 Syntax Errors';
  }
  if (lower.includes('security') || lower.includes('credential') || lower.includes('token')) {
    return '🔸 Security Issues';
  }

  return '🔸 Other Issues';
}

/**
 * Get trend indicator for metrics
 */
function getTrend(current: number, previous: number): string {
  if (previous === 0) return '';

  const delta = current - previous;
  if (delta === 0) return ' →';
  if (delta > 0) return ` ↗️ (+${delta})`;
  return ` ↘️ (${delta})`;
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
    body += `- ✅ **New Events Detected**: ${newEvents.length}\n\n`;
    newEvents.forEach((e) => {
      body += `  **\`${e.name}\`**\n`;
      body += `  📍 \`${e.file}\`${e.line ? ` (Line ${e.line})` : ''}\n\n`;
    });
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
 * Format inline comment body with enhanced visuals and clear file path
 */
function formatInlineComment(issue: {
  severity: string;
  message: string;
  file: string;
  line?: number;
  column?: number;
  impact?: string;
  fix?: string;
  confidence: string;
}): string {
  const icon = issue.severity === 'error' ? '❌' : '⚠️';
  const severityLabel = issue.severity === 'error' ? 'ERROR' : 'WARNING';
  const confidenceEmoji = issue.confidence === 'high' ? '🎯' : issue.confidence === 'medium' ? '🔍' : '💭';

  let body = `## ${icon} ${severityLabel}\n\n`;

  body += `**${issue.message}**\n\n`;

  // Location table for clarity
  body += `| | |\n`;
  body += `|---|---|\n`;
  body += `| 📍 **File** | \`${issue.file}\` |\n`;
  body += `| 📏 **Line** | ${issue.line || 'N/A'} |\n`;
  if (issue.column) {
    body += `| 📐 **Column** | ${issue.column} |\n`;
  }
  body += `| ${confidenceEmoji} **Confidence** | ${issue.confidence} |\n\n`;

  if (issue.impact) {
    body += `### 💥 Impact\n\n`;
    body += `> ${issue.impact}\n\n`;
  }

  if (issue.fix) {
    body += `### 🔧 Suggested Fix\n\n`;
    body += `\`\`\`javascript\n${issue.fix}\n\`\`\`\n\n`;
  }

  body += `---\n`;
  body += `<sub>Generated by [RudderStack PR Reviewer](https://github.com/rudderlabs/pr-reviewer) • Powered by Anthropic Claude</sub>`;

  return body;
}
