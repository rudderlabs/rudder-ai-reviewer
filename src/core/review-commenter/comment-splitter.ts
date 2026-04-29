import type { ChangeRequestContext, SCMProvider } from '@core/providers';
import type { ReviewIssue } from '@custom-types/review.types';

export class CommentSplitter {
  constructor(private readonly provider: SCMProvider) {}

  async getInlineAndSummaryIssues(
    prContext: ChangeRequestContext,
    issues: ReviewIssue[]
  ): Promise<{ inlineIssues: ReviewIssue[]; summaryIssues: ReviewIssue[] }> {
    const changedFilesMap = await this.provider.getChangedFilesMap(prContext);
    const { eligible, skipped } = this.filterInlineEligibleIssues(issues, changedFilesMap);

    return {
      inlineIssues: eligible,
      summaryIssues: skipped,
    };
  }

  filterInlineEligibleIssues(
    issues: ReviewIssue[],
    changedFiles: Map<string, { start: number; end: number; status: string }>
  ): { eligible: ReviewIssue[]; skipped: ReviewIssue[] } {
    const eligible: ReviewIssue[] = [];
    const skipped: ReviewIssue[] = [];

    issues.forEach(issue => {
      const fileInfo = changedFiles.get(issue.file);

      if (!fileInfo || fileInfo.status === 'removed') {
        skipped.push(issue);
        return;
      }

      if (!issue.line || issue.line <= 0) {
        skipped.push(issue);
        return;
      }

      if (issue.line < fileInfo.start || issue.line > fileInfo.end) {
        skipped.push(issue);
        return;
      }

      eligible.push(issue);
    });

    return { eligible, skipped };
  }
}
