import type { ChangeRequestContext, SCMProvider } from '@core/providers';
import type { ReviewIssue } from '@custom-types/review.types';
import { CommentSplitter } from '../comment-splitter';

describe('CommentSplitter', () => {
  const mockContext: ChangeRequestContext = {
    provider: 'github',
    owner: 'test-owner',
    repo: 'test-repo',
    number: 123,
  };

  const mockIssue = (
    id: string,
    file: string,
    line: number,
    severity: 'error' | 'warning' = 'error'
  ): ReviewIssue => ({
    id,
    severity,
    category: 'tracking_plan_violation',
    message: `Issue ${id}`,
    file,
    line: line,
    impact: 'High',
    relatedEvents: [],
  });

  describe('getInlineAndSummaryIssues', () => {
    it('should split issues correctly based on changed files map', async () => {
      const issues: ReviewIssue[] = [
        mockIssue('1', 'src/app.ts', 10),
        mockIssue('2', 'src/app.ts', 50),
        mockIssue('3', 'src/utils.ts', 5),
      ];

      const changedFilesMap = new Map([
        ['src/app.ts', { start: 5, end: 20, status: 'modified' }],
        ['src/utils.ts', { start: 1, end: 10, status: 'added' }],
      ]);

      const mockGitHubClient = {
        getChangedFilesMap: jest.fn().mockResolvedValue(changedFilesMap),
      } as any;

      const splitter = new CommentSplitter(mockGitHubClient);

      const result = await splitter.getInlineAndSummaryIssues(mockContext, issues);

      expect(result.inlineIssues).toHaveLength(2);
      expect(result.inlineIssues.map(i => i.id)).toEqual(['1', '3']);
      expect(result.summaryIssues).toHaveLength(1);
      expect(result.summaryIssues[0].id).toBe('2');
      expect(mockGitHubClient.getChangedFilesMap).toHaveBeenCalledWith(mockContext);
    });

    it('should handle all eligible issues', async () => {
      const issues: ReviewIssue[] = [
        mockIssue('1', 'src/app.ts', 10),
        mockIssue('2', 'src/app.ts', 15),
      ];

      const changedFilesMap = new Map([['src/app.ts', { start: 5, end: 20, status: 'modified' }]]);

      const mockGitHubClient = {
        getChangedFilesMap: jest.fn().mockResolvedValue(changedFilesMap),
      } as any;

      const splitter = new CommentSplitter(mockGitHubClient);

      const result = await splitter.getInlineAndSummaryIssues(mockContext, issues);

      expect(result.inlineIssues).toHaveLength(2);
      expect(result.summaryIssues).toHaveLength(0);
    });

    it('should handle all ineligible issues', async () => {
      const issues: ReviewIssue[] = [
        mockIssue('1', 'src/app.ts', 50),
        mockIssue('2', 'src/other.ts', 10),
      ];

      const changedFilesMap = new Map([['src/app.ts', { start: 5, end: 20, status: 'modified' }]]);

      const mockGitHubClient = {
        getChangedFilesMap: jest.fn().mockResolvedValue(changedFilesMap),
      } as any;

      const splitter = new CommentSplitter(mockGitHubClient);

      const result = await splitter.getInlineAndSummaryIssues(mockContext, issues);

      expect(result.inlineIssues).toHaveLength(0);
      expect(result.summaryIssues).toHaveLength(2);
    });
  });

  describe('filterInlineEligibleIssues', () => {
    it('should return eligible issues within line ranges', () => {
      const issues: ReviewIssue[] = [
        mockIssue('1', 'src/app.ts', 10),
        mockIssue('2', 'src/app.ts', 15),
        mockIssue('3', 'src/app.ts', 20),
      ];

      const changedFiles = new Map([['src/app.ts', { start: 10, end: 20, status: 'modified' }]]);

      const mockGitHubClient = {} as SCMProvider;
      const splitter = new CommentSplitter(mockGitHubClient);

      const { eligible, skipped } = splitter.filterInlineEligibleIssues(issues, changedFiles);

      expect(eligible).toHaveLength(3);
      expect(eligible.map(i => i.id)).toEqual(['1', '2', '3']);
      expect(skipped).toHaveLength(0);
    });

    it('should skip issues outside line ranges', () => {
      const issues: ReviewIssue[] = [
        mockIssue('1', 'src/app.ts', 5),
        mockIssue('2', 'src/app.ts', 15),
        mockIssue('3', 'src/app.ts', 25),
      ];

      const changedFiles = new Map([['src/app.ts', { start: 10, end: 20, status: 'modified' }]]);

      const mockGitHubClient = {} as SCMProvider;
      const splitter = new CommentSplitter(mockGitHubClient);

      const { eligible, skipped } = splitter.filterInlineEligibleIssues(issues, changedFiles);

      expect(eligible).toHaveLength(1);
      expect(eligible[0].id).toBe('2');
      expect(skipped).toHaveLength(2);
      expect(skipped.map(i => i.id)).toEqual(['1', '3']);
    });

    it('should skip issues for removed files', () => {
      const issues: ReviewIssue[] = [
        mockIssue('1', 'src/deleted.ts', 10),
        mockIssue('2', 'src/app.ts', 15),
      ];

      const changedFiles = new Map([
        ['src/deleted.ts', { start: 1, end: 0, status: 'removed' }],
        ['src/app.ts', { start: 10, end: 20, status: 'modified' }],
      ]);

      const mockGitHubClient = {} as SCMProvider;
      const splitter = new CommentSplitter(mockGitHubClient);

      const { eligible, skipped } = splitter.filterInlineEligibleIssues(issues, changedFiles);

      expect(eligible).toHaveLength(1);
      expect(eligible[0].id).toBe('2');
      expect(skipped).toHaveLength(1);
      expect(skipped[0].id).toBe('1');
    });

    it('should skip issues for files not in map', () => {
      const issues: ReviewIssue[] = [
        mockIssue('1', 'src/app.ts', 10),
        mockIssue('2', 'src/unknown.ts', 15),
      ];

      const changedFiles = new Map([['src/app.ts', { start: 5, end: 20, status: 'modified' }]]);

      const mockGitHubClient = {} as SCMProvider;
      const splitter = new CommentSplitter(mockGitHubClient);

      const { eligible, skipped } = splitter.filterInlineEligibleIssues(issues, changedFiles);

      expect(eligible).toHaveLength(1);
      expect(eligible[0].id).toBe('1');
      expect(skipped).toHaveLength(1);
      expect(skipped[0].id).toBe('2');
    });

    it('should handle empty issues array', () => {
      const changedFiles = new Map([['src/app.ts', { start: 5, end: 20, status: 'modified' }]]);

      const mockGitHubClient = {} as SCMProvider;
      const splitter = new CommentSplitter(mockGitHubClient);

      const { eligible, skipped } = splitter.filterInlineEligibleIssues([], changedFiles);

      expect(eligible).toHaveLength(0);
      expect(skipped).toHaveLength(0);
    });

    it('should handle empty changed files map', () => {
      const issues: ReviewIssue[] = [mockIssue('1', 'src/app.ts', 10)];

      const changedFiles = new Map();

      const mockGitHubClient = {} as SCMProvider;
      const splitter = new CommentSplitter(mockGitHubClient);

      const { eligible, skipped } = splitter.filterInlineEligibleIssues(issues, changedFiles);

      expect(eligible).toHaveLength(0);
      expect(skipped).toHaveLength(1);
      expect(skipped[0].id).toBe('1');
    });

    it('should skip issues with invalid line numbers (zero)', () => {
      const issues: ReviewIssue[] = [
        mockIssue('1', 'src/app.ts', 0),
        mockIssue('2', 'src/app.ts', 10),
      ];

      const changedFiles = new Map([['src/app.ts', { start: 1, end: 20, status: 'modified' }]]);

      const mockGitHubClient = {} as SCMProvider;
      const splitter = new CommentSplitter(mockGitHubClient);

      const { eligible, skipped } = splitter.filterInlineEligibleIssues(issues, changedFiles);

      expect(eligible).toHaveLength(1);
      expect(eligible[0].id).toBe('2');
      expect(skipped).toHaveLength(1);
      expect(skipped[0].id).toBe('1');
    });

    it('should skip issues with invalid line numbers (negative)', () => {
      const issues: ReviewIssue[] = [
        mockIssue('1', 'src/app.ts', -5),
        mockIssue('2', 'src/app.ts', 15),
      ];

      const changedFiles = new Map([['src/app.ts', { start: 10, end: 20, status: 'modified' }]]);

      const mockGitHubClient = {} as SCMProvider;
      const splitter = new CommentSplitter(mockGitHubClient);

      const { eligible, skipped } = splitter.filterInlineEligibleIssues(issues, changedFiles);

      expect(eligible).toHaveLength(1);
      expect(eligible[0].id).toBe('2');
      expect(skipped).toHaveLength(1);
      expect(skipped[0].id).toBe('1');
    });
  });
});
