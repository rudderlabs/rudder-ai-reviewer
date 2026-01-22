import { GitHubClient } from '@clients/github.client';
import { GitHubPRContext } from '@core/shared/github/pr-context';
import type { IssueSeverity, ReviewIssue } from '@custom-types/review.types';
import type { CommentStrategy, PostReviewOptions } from '@custom-types/review.types';

export const DEFAULT_COMMENT_STRATEGY: CommentStrategy = 'errors-warnings-inline';

export class CommentSplitter {
  constructor(private readonly githubClient: GitHubClient) {}

  async getInlineAndSummaryIssues(
    prContext: GitHubPRContext,
    issues: ReviewIssue[],
    options?: PostReviewOptions
  ): Promise<{ inlineIssues: ReviewIssue[]; summaryIssues: ReviewIssue[] }> {
    const strategy = options?.strategy || DEFAULT_COMMENT_STRATEGY;
    const inlineSeverities = this.getInlineSeverities(strategy);

    // Separate issues into inline and summary categories
    const inlineIssues = issues.filter(issue => inlineSeverities.includes(issue.severity));
    const summaryIssues = issues.filter(issue => !inlineSeverities.includes(issue.severity));

    const changedFilesMap = await this.githubClient.getChangedFilesMap(prContext);
    const [eligibleInlineIssues, skippedInlineIssues] = this.filterInlineEligibleIssues(
      inlineIssues,
      changedFilesMap
    );

    return {
      inlineIssues: eligibleInlineIssues,
      summaryIssues: [...summaryIssues, ...skippedInlineIssues],
    };
  }

  filterInlineEligibleIssues(
    issues: ReviewIssue[],
    changedFiles: Map<string, { start: number; end: number; status: string }>
  ): [ReviewIssue[], ReviewIssue[]] {
    const eligible: ReviewIssue[] = [];
    const skipped: ReviewIssue[] = [];

    issues.forEach(issue => {
      const fileInfo = changedFiles.get(issue.file);

      if (!fileInfo || fileInfo.status === 'removed') {
        skipped.push(issue);
        return;
      }

      if (issue.line < fileInfo.start || issue.line > fileInfo.end) {
        skipped.push(issue);
        return;
      }

      eligible.push(issue);
    });

    return [eligible, skipped];
  }

  getInlineSeverities(strategy: CommentStrategy): IssueSeverity[] {
    switch (strategy) {
      case 'errors-warnings-inline':
        return ['error', 'warning'];
      case 'all-inline':
        return ['error', 'warning', 'suggestion', 'info'];
      case 'summary-only':
        return [];
    }
    return ['error', 'warning'];
  }
}
