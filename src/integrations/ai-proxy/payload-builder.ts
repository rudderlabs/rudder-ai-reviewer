/**
 * AI Analysis Payload Builder
 * CRITICAL: Ensures no source code is sent to AI - only AST metadata
 */

import * as core from '@actions/core';
import { AIAnalysisRequest } from '../../types/common';
import { AnalyzedCall, DetectedPattern } from '../../analyzers/javascript/static-analyzer';

/**
 * Build AI analysis request from analyzed call
 * NEVER includes actual source code, variable names, or literals
 */
export function buildAnalysisRequest(
  call: AnalyzedCall,
  pattern: DetectedPattern | null
): AIAnalysisRequest | null {
  // Only create requests for cases that need AI analysis
  if (!call.requiresAIAnalysis && !pattern) {
    return null;
  }

  const requestId = `${call.file.split('/').pop()}-${call.line}-${call.method}`;

  // Determine analysis type
  let analysisType: AIAnalysisRequest['analysisType'] = 'complex_pattern';

  if (call.hasDynamicEventName) {
    analysisType = 'dynamic_event_inference';
  } else if (pattern && pattern.type === 'loop_tracking') {
    analysisType = 'complex_pattern';
  } else if (call.hasDynamicProperties) {
    analysisType = 'complex_pattern';
  }

  // Build sanitized AST structure (NO actual code)
  const astStructure = buildSanitizedASTStructure(call, pattern);

  // Build sanitized context (NO actual code)
  const context = buildSanitizedContext(call, pattern);

  // Generate issue description (NO actual code)
  const issue = generateIssueDescription(call, pattern);

  return {
    id: requestId,
    analysisType,
    issue,
    astStructure,
    context,
  };
}

/**
 * Build multiple requests from analyzed calls and patterns
 */
export function buildBatchRequests(
  calls: AnalyzedCall[],
  patterns: DetectedPattern[]
): AIAnalysisRequest[] {
  const requests: AIAnalysisRequest[] = [];

  // Create a map of patterns by file:line for quick lookup
  const patternMap = new Map<string, DetectedPattern>();
  patterns.forEach((p) => {
    patternMap.set(`${p.file}:${p.line}`, p);
  });

  for (const call of calls) {
    const pattern = patternMap.get(`${call.file}:${call.line}`) || null;
    const request = buildAnalysisRequest(call, pattern);

    if (request) {
      requests.push(request);
    }
  }

  core.debug(`Built ${requests.length} AI analysis requests`);
  return requests;
}

/**
 * Build sanitized AST structure metadata
 * NEVER includes actual code, identifiers, or literals
 */
function buildSanitizedASTStructure(
  call: AnalyzedCall,
  pattern: DetectedPattern | null
): Record<string, unknown> {
  const structure: Record<string, unknown> = {
    method: call.method,
    argument_count: call.eventName ? 2 : 1, // Approximate
    has_event_name: !!call.eventName,
    has_properties: !!call.properties,
    event_name_type: call.hasDynamicEventName ? 'dynamic' : 'static',
    properties_type: call.hasDynamicProperties ? 'dynamic' : 'static',
  };

  // Add property structure (count only, NO names/values)
  if (call.properties) {
    structure.property_count = Object.keys(call.properties).length;
    structure.has_nested_objects = hasNestedObjects(call.properties);
  }

  // Add pattern information
  if (pattern) {
    structure.pattern_type = pattern.type;
    structure.pattern_description = sanitizeDescription(pattern.description);
  }

  // Add context information (NO code)
  if (call.context) {
    structure.context = {
      in_function: !!call.context.containingFunction,
      conditional_depth: call.context.conditionalDepth,
      loop_depth: call.context.loopDepth,
      is_async: call.context.isAsync,
      scope: call.context.scope,
    };
  }

  return structure;
}

/**
 * Build sanitized context metadata
 * NEVER includes actual code or identifiers
 */
function buildSanitizedContext(
  call: AnalyzedCall,
  pattern: DetectedPattern | null
): Record<string, unknown> {
  const context: Record<string, unknown> = {
    file_type: call.file.endsWith('.ts') || call.file.endsWith('.tsx') ? 'typescript' : 'javascript',
    is_tsx: call.file.endsWith('.tsx'),
    is_jsx: call.file.endsWith('.jsx'),
    confidence: call.confidence,
  };

  // Add pattern context
  if (pattern) {
    context.pattern = {
      type: pattern.type,
      requires_ai: pattern.requiresAIAnalysis,
    };
  }

  // Add call issues (sanitized)
  if (call.issues && call.issues.length > 0) {
    context.has_issues = true;
    context.issue_count = call.issues.length;
  }

  return context;
}

/**
 * Generate issue description without revealing code
 */
function generateIssueDescription(call: AnalyzedCall, pattern: DetectedPattern | null): string {
  const parts: string[] = [];

  if (call.hasDynamicEventName) {
    parts.push('Event name is dynamically generated using runtime values');
  }

  if (call.hasDynamicProperties) {
    parts.push('Properties contain dynamic values or computed fields');
  }

  if (call.context) {
    if (call.context.conditionalDepth > 0) {
      parts.push(`Call is nested inside ${call.context.conditionalDepth} conditional block(s)`);
    }

    if (call.context.loopDepth > 0) {
      parts.push(`Call is inside ${call.context.loopDepth} loop(s)`);
    }

    if (call.context.isAsync) {
      parts.push('Call is in async context');
    }
  }

  if (pattern && pattern.description) {
    parts.push(sanitizeDescription(pattern.description));
  }

  if (parts.length === 0) {
    return `Complex ${call.method}() call pattern detected`;
  }

  return parts.join('. ');
}

/**
 * Check if object has nested objects (structure analysis only)
 */
function hasNestedObjects(obj: Record<string, any>): boolean {
  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return true;
    }
  }
  return false;
}

/**
 * Sanitize description to remove any code snippets or identifiers
 */
function sanitizeDescription(description: string): string {
  // Remove anything that looks like code
  return description
    .replace(/`[^`]+`/g, '[code]') // Remove backtick code
    .replace(/\b[a-z_][a-zA-Z0-9_]*\s*\(/g, 'function(') // Replace function calls
    .replace(/\b[A-Z_][A-Z0-9_]+\b/g, 'CONSTANT') // Replace constants
    .replace(/['"][^'"]*['"]/g, '""'); // Remove string literals
}

/**
 * Validate that request doesn't contain source code
 * Safety check before sending to AI
 */
export function validateRequestSafety(request: AIAnalysisRequest): boolean {
  const requestStr = JSON.stringify(request);

  // Check for common code patterns that shouldn't be present
  const unsafePatterns = [
    /const\s+\w+\s*=/i,
    /let\s+\w+\s*=/i,
    /var\s+\w+\s*=/i,
    /function\s+\w+\s*\(/i,
    /=>\s*{/i,
    /import\s+/i,
    /require\(/i,
  ];

  for (const pattern of unsafePatterns) {
    if (pattern.test(requestStr)) {
      core.warning(`Unsafe pattern detected in AI request: ${pattern}`);
      return false;
    }
  }

  return true;
}
