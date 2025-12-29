import type { ReviewResponse } from '@custom-types/review.types';
import { formatReviewComment } from '../comment-formatter';

describe('comment-formatter', () => {
  describe('formatReviewComment', () => {
    it('should format complete review with all sections', () => {
      const review: ReviewResponse = {
        reviewId: 'rev_123',
        sdk: {
          name: 'rudderstack-javascript-sdk',
          version: '3.0.0',
          installationType: 'npm',
        },
        summary: {
          overallAssessment: 'Found some issues that need attention before merging.',
          filesAnalyzed: 5,
          totalIssues: 3,
          verdict: 'changes_requested',
          keyRecommendations: ['Fix missing event names', 'Add proper error handling'],
        },
        events: [
          {
            name: 'purchase_completed',
            status: 'added',
            file: 'src/tracking.ts',
            line: 42,
            properties: [
              { name: 'orderId', type: 'string', required: true },
              { name: 'amount', type: 'number', required: true },
            ],
          },
        ],
        issues: [
          {
            id: 'RS_JS_001',
            severity: 'error',
            category: 'event_tracking',
            message: 'Missing event name in track() call',
            file: 'src/analytics.ts',
            line: 23,
            column: 5,
            impact: 'Event will not be sent',
            suggestedFix: "track('event_name', { ...properties });",
            relatedEvents: ['purchase_completed'],
            affectedDestinations: ['Google Analytics', 'Amplitude'],
            confidence: 'high',
          },
          {
            id: 'RS_JS_002',
            severity: 'warning',
            category: 'best_practice',
            message: 'Consider using snake_case for event names',
            file: 'src/tracking.ts',
            line: 15,
            impact: 'Inconsistent naming convention',
            relatedEvents: [],
            confidence: 'medium',
          },
        ],
        stats: {
          errors: 1,
          warnings: 1,
          suggestions: 0,
          eventsAdded: 1,
          eventsModified: 0,
          eventsDeleted: 0,
        },
        confidence: 'high',
      };

      const result = formatReviewComment(review);

      expect(result).toContain('<!-- rudder-pr-reviewer-bot -->');
      expect(result).toContain('🔴 RudderStack PR Review');
      expect(result).toContain('📦 **rudderstack-javascript-sdk** v3.0.0 (NPM)');
      expect(result).toContain('### 📊 Summary');
      expect(result).toContain('Found some issues that need attention before merging.');
      expect(result).toContain('Fix missing event names');
      expect(result).toContain('Add proper error handling');
      expect(result).toContain('### ❌ Errors (1)');
      expect(result).toContain('Missing event name in track() call');
      expect(result).toContain('<details>');
      expect(result).toContain('<summary><b>⚠️ Warnings (1)</b></summary>');
      expect(result).toContain('🎯 Events Detected (1)');
      expect(result).toContain('purchase_completed');
      expect(result).toContain('Review ID: `rev_123`');
      expect(result).toContain('🎯 High');
    });

    it('should handle review with no issues', () => {
      const review: ReviewResponse = {
        reviewId: 'rev_456',
        sdk: {
          name: 'rudderstack-javascript-sdk',
          version: '3.0.0',
          installationType: 'cdn',
        },
        summary: {
          overallAssessment: 'Great work! No issues found.',
          filesAnalyzed: 3,
          totalIssues: 0,
          verdict: 'approved',
        },
        events: [],
        issues: [],
        stats: {
          errors: 0,
          warnings: 0,
          suggestions: 0,
          eventsAdded: 0,
          eventsModified: 0,
        },
        confidence: 'high',
      };

      const result = formatReviewComment(review);

      expect(result).toContain('<!-- rudder-pr-reviewer-bot -->');
      expect(result).toContain('🟢 RudderStack PR Review');
      expect(result).toContain('🌐 **rudderstack-javascript-sdk** v3.0.0 (CDN)');
      expect(result).toContain('Great work! No issues found.');
      expect(result).not.toContain('### ❌ Errors');
      expect(result).not.toContain('### ⚠️ Warnings');
      expect(result).not.toContain('🎯 Events Detected');
    });

    it('should handle review with warnings but no errors', () => {
      const review: ReviewResponse = {
        reviewId: 'rev_789',
        sdk: {
          name: 'rudderstack-javascript-sdk',
          version: '3.0.0',
          installationType: 'npm',
        },
        summary: {
          overallAssessment: 'Some minor improvements recommended.',
          filesAnalyzed: 2,
          totalIssues: 1,
          verdict: 'comment',
        },
        events: [],
        issues: [
          {
            id: 'RS_JS_003',
            severity: 'warning',
            category: 'performance',
            message: 'Consider batching events',
            file: 'src/tracker.ts',
            line: 10,
            impact: 'May impact performance',
            relatedEvents: [],
            confidence: 'medium',
          },
        ],
        stats: {
          errors: 0,
          warnings: 1,
          suggestions: 0,
          eventsAdded: 0,
          eventsModified: 0,
        },
        confidence: 'medium',
      };

      const result = formatReviewComment(review);

      expect(result).toContain('🟡 RudderStack PR Review');
      expect(result).toContain('<summary><b>⚠️ Warnings (1)</b></summary>');
      expect(result).toContain('Consider batching events');
      expect(result).not.toContain('### ❌ Errors');
    });

    it('should format multiple issues grouped by file', () => {
      const review: ReviewResponse = {
        reviewId: 'rev_multi',
        sdk: {
          name: 'rudderstack-javascript-sdk',
          version: '3.0.0',
          installationType: 'npm',
        },
        summary: {
          overallAssessment: 'Multiple issues found.',
          filesAnalyzed: 2,
          totalIssues: 3,
          verdict: 'changes_requested',
        },
        events: [],
        issues: [
          {
            id: 'RS_JS_004',
            severity: 'error',
            category: 'event_tracking',
            message: 'Missing required property',
            file: 'src/analytics.ts',
            line: 10,
            impact: 'Event data incomplete',
            relatedEvents: [],
            confidence: 'high',
          },
          {
            id: 'RS_JS_005',
            severity: 'error',
            category: 'event_tracking',
            message: 'Invalid event name format',
            file: 'src/analytics.ts',
            line: 20,
            impact: 'Event will be rejected',
            relatedEvents: [],
            confidence: 'high',
          },
          {
            id: 'RS_JS_006',
            severity: 'error',
            category: 'reliability',
            message: 'Missing error handler',
            file: 'src/tracker.ts',
            line: 5,
            impact: 'Errors will be silent',
            relatedEvents: [],
            confidence: 'high',
          },
        ],
        stats: {
          errors: 3,
          warnings: 0,
          suggestions: 0,
          eventsAdded: 0,
          eventsModified: 0,
        },
        confidence: 'high',
      };

      const result = formatReviewComment(review);

      expect(result).toContain('### ❌ Errors (3)');
      expect(result).toContain('**📄 `src/analytics.ts`**');
      expect(result).toContain('**📄 `src/tracker.ts`**');
      expect(result).toContain('Missing required property');
      expect(result).toContain('Invalid event name format');
      expect(result).toContain('Missing error handler');
    });

    it('should format events with properties', () => {
      const review: ReviewResponse = {
        reviewId: 'rev_events',
        sdk: {
          name: 'rudderstack-javascript-sdk',
          version: '3.0.0',
          installationType: 'npm',
        },
        summary: {
          overallAssessment: 'Event tracking updates detected.',
          filesAnalyzed: 2,
          totalIssues: 0,
          verdict: 'approved',
        },
        events: [
          {
            name: 'page_view',
            status: 'added',
            file: 'src/pages.ts',
            line: 10,
            properties: [
              { name: 'url', type: 'string', required: true },
              { name: 'title', type: 'string', required: true },
            ],
          },
          {
            name: 'button_click',
            status: 'modified',
            file: 'src/interactions.ts',
            line: 25,
          },
          {
            name: 'old_event',
            status: 'deleted',
            file: 'src/legacy.ts',
            line: 5,
          },
        ],
        issues: [],
        stats: {
          errors: 0,
          warnings: 0,
          suggestions: 0,
          eventsAdded: 1,
          eventsModified: 1,
          eventsDeleted: 1,
        },
        confidence: 'high',
      };

      const result = formatReviewComment(review);

      expect(result).toContain('🎯 Events Detected (3)');
      expect(result).toContain('✅ added');
      expect(result).toContain('✏️ modified');
      expect(result).toContain('🗑️ deleted');
      expect(result).toContain('page_view');
      expect(result).toContain('button_click');
      expect(result).toContain('old_event');
      expect(result).toContain('2 props');
    });

    it('should handle missing optional fields gracefully', () => {
      const review: ReviewResponse = {
        reviewId: 'rev_minimal',
        sdk: {
          name: 'rudderstack-javascript-sdk',
          version: '3.0.0',
          installationType: 'npm',
        },
        summary: {
          overallAssessment: 'Minimal review.',
          filesAnalyzed: 1,
          totalIssues: 1,
          verdict: 'comment',
        },
        events: [],
        issues: [
          {
            id: 'RS_JS_007',
            severity: 'suggestion',
            category: 'best_practice',
            message: 'Consider adding documentation',
            file: 'src/utils.ts',
            line: 15,
            impact: 'Code may be harder to understand',
            relatedEvents: [],
            confidence: 'low',
          },
        ],
        stats: {
          errors: 0,
          warnings: 0,
          suggestions: 1,
          eventsAdded: 0,
          eventsModified: 0,
        },
        confidence: 'low',
      };

      const result = formatReviewComment(review);

      expect(result).toContain('<!-- rudder-pr-reviewer-bot -->');
      expect(result).toContain('💡 Suggestions (1)');
      expect(result).toContain('Consider adding documentation');
      expect(result).not.toContain('**🔧 Suggested Fix:**');
      expect(result).not.toContain('**🔗 Related Events:**');
      expect(result).not.toContain('**🎯 Key Recommendations:**');
    });
  });
});
