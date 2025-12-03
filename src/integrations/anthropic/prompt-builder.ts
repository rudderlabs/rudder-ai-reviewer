/**
 * Prompt Builder for AI Analysis
 * Constructs system and user prompts for Anthropic API
 */

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
- rudderanalytics.reset()

Custom Abstractions:
Users often create wrappers around RudderStack calls. Look for:
- Custom utilities (e.g., trackPurchase, logEvent)
- React hooks (e.g., useTracking, useAnalytics)
- Service classes (e.g., AnalyticsService.log)
- Higher-order components
- Event builder functions

Output Format:
IMPORTANT: Return ONLY valid JSON. Ensure all strings are properly escaped:
- Escape double quotes inside strings: \\"
- Escape backslashes: \\\\
- Escape newlines: \\n
- Do not include any text outside the JSON object
- Do not wrap in markdown code blocks

Return a JSON object in the following structure:
{
  "summary": {
    "overallAssessment": "High-level assessment of the instrumentation (2-3 sentences)",
    "sdkVersion": "Detected SDK version (e.g., '3.24.2' from NPM or 'v3' from CDN) or 'unknown'",
    "sdkInstallationType": "npm|cdn|unknown",
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
): string {
  let prompt = `Analyze the following code changes for RudderStack SDK instrumentation:\n\n`;

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
  prompt += `1. **Detect SDK version**: Identify the RudderStack SDK version and installation type (NPM or CDN)\n`;
  prompt += `   - For NPM: Look for @rudderstack/analytics-js version in package.json or imports\n`;
  prompt += `   - For CDN: Look for version in script URLs or window.RudderSnippetVersion\n`;
  prompt += `2. **Focus on changed files first**: Identify all RudderStack SDK usage (direct and through abstractions)\n`;
  prompt += `3. **Identify events**: List all events being tracked with their properties (including property-level changes)\n`;
  prompt += `4. **Validate SDK usage**: Check API correctness, method signatures, and best practices\n`;
  prompt += `5. **Check naming conventions**: Ensure event and property names follow common patterns\n`;
  prompt += `6. **Detect issues**: Find errors, warnings, and areas for improvement\n`;
  prompt += `7. **Property-level analysis**: For modified events, identify specific property changes (added/removed/type changed)\n`;
  prompt += `8. **Provide fixes**: For each issue in changed code, provide file path, line number, and specific fix\n`;
  prompt += `9. **Review unchanged files**: If you find issues in unchanged files, list them separately\n\n`;

  prompt += `Return your analysis as a JSON object following the structure specified in the system prompt.\n\n`;
  prompt += `CRITICAL: Ensure the JSON is valid:\n`;
  prompt += `- Properly escape all special characters in strings (quotes, backslashes, newlines)\n`;
  prompt += `- Do not include any text outside the JSON object\n`;
  prompt += `- Return ONLY the JSON object, no markdown formatting`;

  return prompt;
}

/**
 * Estimate token count for text (rough approximation: 1 token ≈ 4 characters)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
