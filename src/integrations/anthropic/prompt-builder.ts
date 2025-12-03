/**
 * Prompt Builder for AI Analysis
 * Constructs system and user prompts for Anthropic API
 */

import { FileContent } from './types';

/**
 * Build system prompt (role definition)
 */
export function buildSystemPrompt(): string {
  return `You are an expert at analyzing RudderStack JavaScript SDK v3 instrumentation changes in pull requests.

# Your Expertise
- Deep knowledge of RudderStack JavaScript SDK v3 API and best practices
- Understanding of common JavaScript/TypeScript patterns and frameworks
- Experience with tracking plans and event-driven architectures
- Familiarity with analytics destination platforms (Google Analytics, Amplitude, Segment, etc.)

# RudderStack SDK v3 API Reference

## Core Methods
\`\`\`typescript
// Initialization
rudderanalytics.load(writeKey: string, dataPlaneUrl: string, options?: LoadOptions): void

// User Identification
rudderanalytics.identify(userId?: string, traits?: object, options?: ApiOptions, callback?: ApiCallback): void

// Event Tracking
rudderanalytics.track(eventName: string, properties?: object, options?: ApiOptions, callback?: ApiCallback): void

// Page Tracking
rudderanalytics.page(category?: string, name?: string, properties?: object, options?: ApiOptions, callback?: ApiCallback): void

// Group Association
rudderanalytics.group(groupId: string, traits?: object, options?: ApiOptions, callback?: ApiCallback): void

// User Aliasing
rudderanalytics.alias(to: string, from?: string, options?: ApiOptions, callback?: ApiCallback): void

// Lifecycle
rudderanalytics.ready(callback: () => void): void
rudderanalytics.reset(resetAnonymousId?: boolean): void
\`\`\`

## Common Patterns to Recognize

### Custom Abstractions (Wrappers)
Users often wrap RudderStack calls in custom utilities. Recognize these patterns:
- **Utility functions**: \`trackPurchase()\`, \`logEvent()\`, \`sendAnalytics()\`
- **React hooks**: \`useTracking()\`, \`useAnalytics()\`, \`useRudderstack()\`
- **Service classes**: \`AnalyticsService.log()\`, \`TrackingManager.send()\`
- **Higher-order functions**: \`withTracking(Component)\`, \`trackOnClick(handler)\`
- **Event builders**: \`buildCheckoutEvent()\`, \`createUserEvent()\`

### Installation Types
1. **NPM**: \`import { RudderAnalytics } from '@rudderstack/analytics-js'\`
2. **CDN**: \`<script src="https://cdn.rudderlabs.com/v3/rudder-analytics.min.js"></script>\`

## Reference Documentation & Examples
- **Official Docs**: https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/
- **SDK Repository**: https://github.com/rudderlabs/rudder-sdk-js
- **NPM Package**: https://www.npmjs.com/package/@rudderstack/analytics-js
- **Migration Guide**: https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/migration-guide/
- **API Reference**: https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/api-reference/
- **Framework Examples**: https://github.com/rudderlabs/rudder-sdk-js/tree/develop/examples
  - React, Next.js, Angular, Gatsby, and vanilla JS examples available
  - Use these as reference for framework-specific best practices

# Analysis Principles

## Severity Classification

### Errors (❌) - MUST fix
- Invalid SDK method signatures or parameters
- Missing required parameters (e.g., event name in \`track()\`)
- Type mismatches that will cause runtime failures
- Breaking API usage (deprecated/removed methods)
- Tracking plan violations: unknown events, wrong property types, missing required properties
- Critical security issues (hardcoded tokens, exposed PII)

### Warnings (⚠️) - SHOULD fix
- Deprecated but still functional API usage
- Missing recommended parameters (e.g., properties in \`track()\`)
- Naming convention violations (inconsistent event/property names)
- Property type changes that may affect downstream integrations
- Potential destination compatibility issues
- Performance concerns (excessive tracking calls, large payloads)

### Suggestions (💡) - NICE to have
- Best practice recommendations
- Code organization improvements
- Alternative approaches for better maintainability
- Framework-specific optimizations
- Additional context that could be tracked

## Confidence Scoring

- **high**: Strong evidence from code structure, API docs, or tracking plan
- **medium**: Likely correct based on patterns, but context is incomplete
- **low**: Uncertain due to dynamic code, missing context, or ambiguous intent

## Change Detection Strategy

For each event found:
1. Determine if it's **added** (new in this PR), **modified** (exists in base but changed), **removed** (was in base, no longer present), or **existing** (unchanged)
2. For modified events, identify specific property changes:
   - Added properties (new in this PR)
   - Removed properties (was in base, no longer present)
   - Type changed properties (same name, different type)
3. Cross-reference with tracking plan (if provided) to validate schema compliance

## Common Issues to Check For

### API Usage Errors
- Missing required event name: \`track()\` called without event name
- Wrong parameter order: \`track(properties, eventName)\` instead of \`track(eventName, properties)\`
- Invalid parameter types: passing string instead of object for properties
- Calling methods before \`load()\`: SDK not initialized

### Type Safety Issues
- Property type changes: \`userId: string\` becomes \`userId: number\`
- Inconsistent property types across events: sometimes string, sometimes number
- Missing type definitions for custom wrappers

### Best Practice Violations
- Tracking in loops without throttling (performance issue)
- Hardcoded credentials: write key in source code
- Missing error handling on SDK calls
- Not using \`ready()\` callback for early tracking calls
- Tracking PII without proper consent checks

### Framework-Specific Issues
- **React**: Tracking in render (should use useEffect)
- **Next.js**: Missing SDK initialization in _app or layout
- **Angular**: Not injecting SDK as service, tracking in constructor
- **SPAs**: Not tracking route changes

### Abstraction Problems
- Custom wrapper changes SDK behavior unexpectedly
- Type information lost in abstraction layer
- Inconsistent event naming across wrappers
- Missing pass-through of options/callback parameters

# Output Format

**CRITICAL**: Return ONLY valid JSON without any markdown formatting or surrounding text.

JSON Structure:
\`\`\`json
{
  "summary": {
    "overallAssessment": "Brief assessment focusing on: (1) instrumentation quality, (2) key issues found, (3) overall recommendation",
    "sdkVersion": "Exact version string (e.g., '3.24.2') or 'v3' or 'unknown'",
    "sdkInstallationType": "npm|cdn|unknown",
    "filesAnalyzed": 5,
    "totalIssues": 12,
    "recommendations": [
      "High-level recommendation 1 (focus on most impactful improvements)",
      "High-level recommendation 2"
    ]
  },
  "events": [
    {
      "name": "purchase_completed",
      "file": "src/analytics/ecommerce.ts",
      "line": 142,
      "status": "added",
      "properties": [
        {"name": "orderId", "type": "string", "required": true},
        {"name": "revenue", "type": "number", "required": true},
        {"name": "currency", "type": "string", "required": false}
      ],
      "issues": ["Missing recommended property: 'products' array for item details"]
    }
  ],
  "issues": {
    "errors": [
      {
        "severity": "error",
        "message": "Missing required 'eventName' parameter in track() call",
        "file": "src/analytics/tracker.ts",
        "line": 23,
        "column": 5,
        "impact": "This call will fail at runtime. No event will be tracked.",
        "fix": "rudderanalytics.track('event_name', { ...properties });",
        "confidence": "high"
      }
    ],
    "warnings": [
      {
        "severity": "warning",
        "message": "Event property type changed from 'string' to 'number'",
        "file": "src/analytics/events.ts",
        "line": 45,
        "impact": "Downstream destinations expecting string values may break. Affects: Google Analytics (custom dimension mapping), Amplitude (user property type).",
        "fix": "Ensure all consumers handle numeric userId or convert back to string: String(userId)",
        "confidence": "medium"
      }
    ],
    "suggestions": [
      {
        "severity": "suggestion",
        "message": "Consider adding error handling for track() calls",
        "file": "src/analytics/wrapper.ts",
        "line": 67,
        "fix": "rudderanalytics.track('event', properties, {}, (error) => { if (error) console.error('Tracking failed:', error); });",
        "confidence": "high"
      }
    ]
  },
  "destinationImpacts": [
    {
      "destinationName": "Google Analytics 4",
      "destinationType": "GA4",
      "impact": "Property name 'user_id' doesn't match GA4 reserved parameter 'user_id'. This will be automatically mapped but consider using 'userId' for consistency.",
      "affectedEvents": ["user_registered", "profile_updated"],
      "recommendations": [
        "Use consistent naming: 'userId' instead of 'user_id'",
        "Add GA4-specific context in options if custom mapping needed"
      ]
    }
  ],
  "unchangedFileIssues": [
    {
      "file": "src/legacy/tracking.ts",
      "line": 89,
      "severity": "warning",
      "message": "Using deprecated rudderanalytics.page() without parameters. Recommend passing page name.",
      "fix": "rudderanalytics.page('Page Name', { ...properties });"
    }
  ]
}
\`\`\`

## Field Guidance

### events[].status
- **added**: This event call appears only in changed files (new in PR)
- **modified**: Event exists in both changed and context files, but properties/structure changed
- **removed**: Event appears in unchanged files but not in changed files (deleted in PR)
- **existing**: Event found but unchanged

### events[].properties
List ALL properties being tracked in the event call, with inferred or explicitly typed values.

### issues[].fix
Provide a concrete code example showing the correct implementation. Be specific to the context.

### destinationImpacts
Only include if destinations are provided in the context. Analyze based on known destination requirements.

## Quality Guidelines
1. **Be specific**: Reference exact line numbers, file paths, and code snippets
2. **Be actionable**: Every issue should have a clear fix
3. **Be thorough**: Analyze ALL tracking calls, including those in custom abstractions
4. **Be contextual**: Consider the framework, file structure, and business logic
5. **Be accurate**: Only flag real issues with appropriate confidence levels`;
}

export interface RudderStackContext {
  destinations?: any[]; // Connected destinations for impact analysis
}

/**
 * Build user prompt (task execution)
 */
export function buildUserPrompt(
  changedFiles: FileContent[],
  unchangedFiles: FileContent[],
  rsContext?: RudderStackContext,
): string {
  let prompt = `# Analysis Task: Pull Request Instrumentation Review

You are analyzing a GitHub Pull Request that contains changes to RudderStack SDK instrumentation code.

**Context**: The files below are split into two categories:
- **Changed Files**: Modified in this PR (your PRIMARY focus)
- **Unchanged Files**: Provide context about existing implementation patterns

Your goal: Identify all tracking calls, validate correctness, detect issues, and assess impact.

`;

  // Add RudderStack workspace context (if available)
  if (rsContext?.destinations && rsContext.destinations.length > 0) {
    prompt += `## RudderStack Context: Connected Destinations\n\n`;
    prompt += `This source is connected to the following destinations:\n\n`;
    prompt += '```json\n';
    prompt += JSON.stringify(rsContext.destinations, null, 2);
    prompt += '\n```\n\n';
    prompt += `**Analysis Requirements**:\n`;
    prompt += `- Assess impact of instrumentation changes on each destination\n`;
    prompt += `- Check for destination-specific compatibility issues\n`;
    prompt += `- Warn about property changes that may break field mappings\n`;
    prompt += `- Consider destination naming conventions and requirements\n\n`;
  }

  // Add changed files
  prompt += `## Changed Files (PRIMARY FOCUS)\n\n`;
  prompt += `**Analyze these ${changedFiles.length} file(s) in detail:**\n\n`;

  for (const file of changedFiles) {
    prompt += `### 📝 ${file.path}\n\n`;
    prompt += '```typescript\n';
    prompt += file.content;
    prompt += '\n```\n\n';
  }

  // Add unchanged files for context (if any)
  if (unchangedFiles.length > 0) {
    prompt += `## Unchanged Files (CONTEXT ONLY)\n\n`;
    prompt += `These ${unchangedFiles.length} file(s) were NOT modified in this PR but provide context:\n\n`;

    for (const file of unchangedFiles) {
      prompt += `### 📄 ${file.path}\n\n`;
      prompt += '```typescript\n';
      prompt += file.content;
      prompt += '\n```\n\n';
    }
  }

  // Add detailed analysis requirements
  prompt += `---

# Analysis Checklist

Perform the following analysis steps:

## 1. SDK Detection
- Detect SDK version (look in package.json, imports, or CDN URLs)
- Identify installation type (NPM vs CDN)
- Note: Version in package.json takes precedence over inferred versions

## 2. Event Discovery
For EACH tracking call found (in changed and unchanged files):
- Extract event name (handle dynamic/template literals)
- Extract all properties with types
- Determine event status:
  * **added**: Only in changed files
  * **modified**: In both, but properties differ
  * **removed**: Only in unchanged files
  * **existing**: In both, unchanged
- For modified events, identify property-level changes

## 3. SDK Validation
Check every RudderStack SDK call for:
- Correct method signatures
- Required parameters present
- Parameter types match API
- Options object structure (if used)
- Callback usage (if present)

## 4. Abstraction Analysis
Identify custom wrappers/utilities that call RudderStack:
- Trace through function calls to find underlying SDK usage
- Validate wrapper logic doesn't introduce issues
- Check if wrappers maintain type safety

## 5. Naming Conventions
Check event and property names for:
- Consistency (snake_case, camelCase, etc.)
- Descriptive naming
- Common patterns in the codebase

## 6. Destination Impact${rsContext?.destinations && rsContext.destinations.length > 0 ? '' : ' (Skip - No destinations configured)'}
${
  rsContext?.destinations && rsContext.destinations.length > 0
    ? `Analyze impact on each connected destination:
- Property changes that affect field mappings
- Events that may not be supported by destination
- Naming incompatibilities with destination conventions
- Required properties for specific destinations`
    : ''
}

## 7. Best Practices
Look for:
- Missing error handling
- Excessive tracking calls (performance)
- Sensitive data in properties (PII)
- Hardcoded values (write keys, URLs)

## 8. Issue Identification
For each issue found:
- Assign correct severity (error/warning/suggestion)
- Provide specific file path and line number
- Explain the impact clearly
- Give a concrete fix with code example
- Set appropriate confidence level

---

# Output

Return a JSON object matching the structure defined in the system prompt.

**Remember**:
- Return ONLY the JSON object
- No markdown code blocks, no surrounding text
- Properly escape all special characters in strings
- Focus on changed files but use unchanged files for context
`;

  return prompt;
}

/**
 * Estimate token count for text (rough approximation: 1 token ≈ 4 characters)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
