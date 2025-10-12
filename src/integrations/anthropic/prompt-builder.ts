/**
 * Prompt Builder for AI Analysis
 * Constructs system and user prompts for Anthropic API
 */

import { TrackingPlan, WorkspaceConfig } from '../../types/common';
import { FileContent } from './types';

/**
 * Build system prompt (role definition)
 */
export function buildSystemPrompt(): string {
  return `You are an expert at analyzing RudderStack JavaScript SDK v3 instrumentation.

Your responsibilities:
- Identify all RudderStack SDK usage (direct calls and custom abstractions/wrappers)
- Validate against tracking plans and destination requirements
- Detect instrumentation issues, anti-patterns, and areas for improvement
- Provide actionable, specific recommendations with code examples

RudderStack SDK Methods:
- rudderanalytics.load(writeKey, dataPlaneUrl, options)
- rudderanalytics.ready(callback)
- rudderanalytics.identify(userId, traits, options, callback)
- rudderanalytics.track(eventName, properties, options, callback)
- rudderanalytics.page(category, name, properties, options, callback)
- rudderanalytics.group(groupId, traits, options, callback)
- rudderanalytics.alias(to, from, options, callback)
- rudderanalylytics.reset()

Custom Abstractions:
Users often create wrappers around RudderStack calls. Look for:
- Custom utilities (e.g., trackPurchase, logEvent)
- React hooks (e.g., useTracking, useAnalytics)
- Service classes (e.g., AnalyticsService.log)
- Higher-order components
- Event builder functions

Output Format:
Return a JSON object with natural language markdown in the following structure:
{
  "summary": {
    "overallAssessment": "High-level assessment of the instrumentation (2-3 sentences)",
    "filesAnalyzed": <number>,
    "totalIssues": <number>,
    "recommendations": ["recommendation 1", "recommendation 2", ...]
  },
  "events": [
    {
      "name": "event_name",
      "file": "src/path/to/file.ts",
      "line": 42,
      "status": "added|modified|removed|existing",
      "properties": [
        {"name": "property_name", "type": "string|number|boolean|object|array", "required": true|false}
      ],
      "issues": ["Issue description if any"]
    }
  ],
  "issues": {
    "errors": [
      {
        "severity": "error",
        "message": "Clear description of the error",
        "file": "src/path/to/file.ts",
        "line": 42,
        "column": 10,
        "impact": "Explanation of the impact",
        "fix": "Specific fix with code example",
        "confidence": "high|medium|low"
      }
    ],
    "warnings": [...],
    "suggestions": [...]
  },
  "destinationImpacts": [
    {
      "destinationName": "Google Analytics",
      "destinationType": "GA4",
      "impact": "Description of the impact on this destination",
      "affectedEvents": ["event1", "event2"],
      "recommendations": ["recommendation 1", "recommendation 2"]
    }
  ],
  "unchangedFileIssues": [
    {
      "file": "src/path/to/file.ts",
      "line": 42,
      "severity": "error|warning|suggestion",
      "message": "Issue description",
      "fix": "Suggested fix"
    }
  ]
}

Guidelines:
- Be specific and actionable in all recommendations
- Include code examples in fix suggestions
- Consider both direct SDK calls and custom abstractions
- Validate event and property naming conventions
- Check for common mistakes (missing required parameters, incorrect method signatures)
- Provide confidence levels based on the certainty of your analysis`;
}

/**
 * Build user prompt (task execution)
 */
export function buildUserPrompt(
  changedFiles: FileContent[],
  unchangedFiles: FileContent[],
  trackingPlan?: TrackingPlan,
  workspaceConfig?: WorkspaceConfig
): string {
  let prompt = `Analyze the following code changes for RudderStack SDK instrumentation:\n\n`;

  // Add RudderStack context if available
  if (trackingPlan || workspaceConfig) {
    prompt += `## RudderStack Context\n\n`;

    if (trackingPlan) {
      prompt += `### Tracking Plan\n`;
      prompt += `The workspace has a defined tracking plan with ${trackingPlan.events.length} events:\n\n`;
      prompt += '```json\n';
      prompt += JSON.stringify(trackingPlan, null, 2);
      prompt += '\n```\n\n';
    }

    if (workspaceConfig) {
      prompt += `### Configured Destinations\n`;
      prompt += `The workspace has ${workspaceConfig.destinations.length} configured destination(s):\n\n`;
      prompt += '```json\n';
      prompt += JSON.stringify(workspaceConfig, null, 2);
      prompt += '\n```\n\n';
    }
  }

  // Add changed files
  prompt += `## Changed Files (Primary Focus)\n\n`;
  prompt += `Analyze these ${changedFiles.length} changed file(s) carefully:\n\n`;

  for (const file of changedFiles) {
    prompt += `### File: ${file.path}\n`;
    prompt += '```typescript\n';
    prompt += file.content;
    prompt += '\n```\n\n';
  }

  // Add unchanged files for context (if any)
  if (unchangedFiles.length > 0) {
    prompt += `## Unchanged Files (For Context)\n\n`;
    prompt += `These ${unchangedFiles.length} file(s) provide context but were not changed in this PR:\n\n`;

    for (const file of unchangedFiles) {
      prompt += `### File: ${file.path}\n`;
      prompt += '```typescript\n';
      prompt += file.content;
      prompt += '\n```\n\n';
    }
  }

  // Add analysis requirements
  prompt += `## Analysis Requirements\n\n`;
  prompt += `1. **Focus on changed files first**: Identify all RudderStack SDK usage (direct and through abstractions)\n`;
  prompt += `2. **Identify events**: List all events being tracked with their properties\n`;
  prompt += `3. **Validate against tracking plan**: Check if events match the defined schema${!trackingPlan ? ' (no tracking plan available - focus on general best practices)' : ''}\n`;
  prompt += `4. **Check destination compatibility**: Analyze if the instrumentation works well with configured destinations${!workspaceConfig ? ' (no destination config available - provide general guidance)' : ''}\n`;
  prompt += `5. **Detect issues**: Find errors, warnings, and areas for improvement\n`;
  prompt += `6. **Provide fixes**: For each issue in changed code, provide file path, line number, and specific fix\n`;
  prompt += `7. **Review unchanged files**: If you find issues in unchanged files, list them separately\n\n`;

  prompt += `Return your analysis as a JSON object following the structure specified in the system prompt.`;

  return prompt;
}

/**
 * Estimate token count for text (rough approximation: 1 token ≈ 4 characters)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
