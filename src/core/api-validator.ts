import * as core from '@actions/core';
import { SDKMethodCall, SDKArgument } from './file-scanner';

/**
 * Represents a validation issue found in SDK usage
 */
export interface ValidationIssue {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'suggestion';
  message: string;
  method: string;
  code: string;
  fix?: string;
}

/**
 * Result of validating SDK method calls
 */
export interface ValidationResult {
  totalIssues: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  suggestions: ValidationIssue[];
}

/**
 * Method overload signature
 */
interface MethodOverload {
  params: Array<{
    name: string;
    type: string;
    optional: boolean;
  }>;
  description: string;
}

/**
 * Comprehensive SDK method signatures with all overloads
 * Based on @rudderstack/analytics-js v3 API
 */
const SDK_METHOD_OVERLOADS: Record<string, MethodOverload[]> = {
  track: [
    // track(event: string)
    {
      params: [{ name: 'event', type: 'string', optional: false }],
      description: 'Track an event without properties',
    },
    // track(event: string, properties: object)
    {
      params: [
        { name: 'event', type: 'string', optional: false },
        { name: 'properties', type: 'object', optional: false },
      ],
      description: 'Track an event with properties',
    },
    // track(event: string, properties: object, options: object)
    {
      params: [
        { name: 'event', type: 'string', optional: false },
        { name: 'properties', type: 'object', optional: false },
        { name: 'options', type: 'object', optional: true },
      ],
      description: 'Track an event with properties and options',
    },
    // track(event: string, properties: object, callback: function)
    {
      params: [
        { name: 'event', type: 'string', optional: false },
        { name: 'properties', type: 'object', optional: false },
        { name: 'callback', type: 'function', optional: true },
      ],
      description: 'Track an event with properties and callback',
    },
    // track(event: string, callback: function)
    {
      params: [
        { name: 'event', type: 'string', optional: false },
        { name: 'callback', type: 'function', optional: true },
      ],
      description: 'Track an event with callback',
    },
    // track(event: string, properties: object, options: object, callback: function)
    {
      params: [
        { name: 'event', type: 'string', optional: false },
        { name: 'properties', type: 'object', optional: false },
        { name: 'options', type: 'object', optional: false },
        { name: 'callback', type: 'function', optional: true },
      ],
      description: 'Track an event with properties, options, and callback',
    },
  ],
  identify: [
    // identify(userId: string)
    {
      params: [{ name: 'userId', type: 'string', optional: false }],
      description: 'Identify with userId only',
    },
    // identify(userId: string, traits: object)
    {
      params: [
        { name: 'userId', type: 'string', optional: false },
        { name: 'traits', type: 'object', optional: false },
      ],
      description: 'Identify with userId and traits',
    },
    // identify(userId: string, traits: object, options: object)
    {
      params: [
        { name: 'userId', type: 'string', optional: false },
        { name: 'traits', type: 'object', optional: false },
        { name: 'options', type: 'object', optional: false },
      ],
      description: 'Identify with userId, traits, and options',
    },
    // identify(userId: string, traits: object, callback: function)
    {
      params: [
        { name: 'userId', type: 'string', optional: false },
        { name: 'traits', type: 'object', optional: false },
        { name: 'callback', type: 'function', optional: false },
      ],
      description: 'Identify with userId, traits, and callback',
    },
    // identify(userId: string, callback: function)
    {
      params: [
        { name: 'userId', type: 'string', optional: false },
        { name: 'callback', type: 'function', optional: false },
      ],
      description: 'Identify with userId and callback',
    },
    // identify(traits: object)
    {
      params: [{ name: 'traits', type: 'object', optional: false }],
      description: 'Identify with traits only (anonymous user)',
    },
    // identify(userId: string, traits: object, options: object, callback: function)
    {
      params: [
        { name: 'userId', type: 'string', optional: false },
        { name: 'traits', type: 'object', optional: false },
        { name: 'options', type: 'object', optional: false },
        { name: 'callback', type: 'function', optional: false },
      ],
      description: 'Identify with all parameters',
    },
  ],
  page: [
    // page()
    {
      params: [],
      description: 'Track page view without parameters',
    },
    // page(category: string)
    {
      params: [{ name: 'category', type: 'string', optional: false }],
      description: 'Track page view with category',
    },
    // page(name: string)
    {
      params: [{ name: 'name', type: 'string', optional: false }],
      description: 'Track page view with name',
    },
    // page(category: string, name: string)
    {
      params: [
        { name: 'category', type: 'string', optional: false },
        { name: 'name', type: 'string', optional: false },
      ],
      description: 'Track page view with category and name',
    },
    // page(category: string, name: string, properties: object)
    {
      params: [
        { name: 'category', type: 'string', optional: false },
        { name: 'name', type: 'string', optional: false },
        { name: 'properties', type: 'object', optional: false },
      ],
      description: 'Track page view with category, name, and properties',
    },
    // page(category: string, name: string, properties: object, options: object)
    {
      params: [
        { name: 'category', type: 'string', optional: false },
        { name: 'name', type: 'string', optional: false },
        { name: 'properties', type: 'object', optional: false },
        { name: 'options', type: 'object', optional: false },
      ],
      description: 'Track page view with category, name, properties, and options',
    },
    // page(category: string, name: string, properties: object, callback: function)
    {
      params: [
        { name: 'category', type: 'string', optional: false },
        { name: 'name', type: 'string', optional: false },
        { name: 'properties', type: 'object', optional: false },
        { name: 'callback', type: 'function', optional: false },
      ],
      description: 'Track page view with category, name, properties, and callback',
    },
    // page(properties: object)
    {
      params: [{ name: 'properties', type: 'object', optional: false }],
      description: 'Track page view with properties only',
    },
  ],
  group: [
    // group(groupId: string)
    {
      params: [{ name: 'groupId', type: 'string', optional: false }],
      description: 'Associate user with group',
    },
    // group(groupId: string, traits: object)
    {
      params: [
        { name: 'groupId', type: 'string', optional: false },
        { name: 'traits', type: 'object', optional: false },
      ],
      description: 'Associate user with group and traits',
    },
    // group(groupId: string, traits: object, options: object)
    {
      params: [
        { name: 'groupId', type: 'string', optional: false },
        { name: 'traits', type: 'object', optional: false },
        { name: 'options', type: 'object', optional: false },
      ],
      description: 'Associate user with group, traits, and options',
    },
    // group(groupId: string, traits: object, callback: function)
    {
      params: [
        { name: 'groupId', type: 'string', optional: false },
        { name: 'traits', type: 'object', optional: false },
        { name: 'callback', type: 'function', optional: false },
      ],
      description: 'Associate user with group, traits, and callback',
    },
    // group(groupId: string, callback: function)
    {
      params: [
        { name: 'groupId', type: 'string', optional: false },
        { name: 'callback', type: 'function', optional: false },
      ],
      description: 'Associate user with group and callback',
    },
    // group(groupId: string, traits: object, options: object, callback: function)
    {
      params: [
        { name: 'groupId', type: 'string', optional: false },
        { name: 'traits', type: 'object', optional: false },
        { name: 'options', type: 'object', optional: false },
        { name: 'callback', type: 'function', optional: false },
      ],
      description: 'Associate user with group with all parameters',
    },
  ],
  alias: [
    // alias(to: string)
    {
      params: [{ name: 'to', type: 'string', optional: false }],
      description: 'Create alias for current user',
    },
    // alias(to: string, from: string)
    {
      params: [
        { name: 'to', type: 'string', optional: false },
        { name: 'from', type: 'string', optional: false },
      ],
      description: 'Create alias with explicit from userId',
    },
    // alias(to: string, options: object)
    {
      params: [
        { name: 'to', type: 'string', optional: false },
        { name: 'options', type: 'object', optional: false },
      ],
      description: 'Create alias with options',
    },
    // alias(to: string, from: string, options: object)
    {
      params: [
        { name: 'to', type: 'string', optional: false },
        { name: 'from', type: 'string', optional: false },
        { name: 'options', type: 'object', optional: false },
      ],
      description: 'Create alias with from userId and options',
    },
    // alias(to: string, from: string, callback: function)
    {
      params: [
        { name: 'to', type: 'string', optional: false },
        { name: 'from', type: 'string', optional: false },
        { name: 'callback', type: 'function', optional: false },
      ],
      description: 'Create alias with from userId and callback',
    },
    // alias(to: string, callback: function)
    {
      params: [
        { name: 'to', type: 'string', optional: false },
        { name: 'callback', type: 'function', optional: false },
      ],
      description: 'Create alias with callback',
    },
    // alias(to: string, from: string, options: object, callback: function)
    {
      params: [
        { name: 'to', type: 'string', optional: false },
        { name: 'from', type: 'string', optional: false },
        { name: 'options', type: 'object', optional: false },
        { name: 'callback', type: 'function', optional: false },
      ],
      description: 'Create alias with all parameters',
    },
  ],
  reset: [
    // reset()
    {
      params: [],
      description: 'Reset user identity',
    },
    // reset(resetAnonymousId: boolean)
    {
      params: [{ name: 'resetAnonymousId', type: 'boolean', optional: false }],
      description: 'Reset user identity with anonymous ID control',
    },
    // reset(options: object)
    {
      params: [{ name: 'options', type: 'object', optional: true }],
      description: 'Reset user identity with options',
    },
  ],
  load: [
    // load(writeKey: string, dataPlaneUrl: string)
    {
      params: [
        { name: 'writeKey', type: 'string', optional: false },
        { name: 'dataPlaneUrl', type: 'string', optional: false },
      ],
      description: 'Initialize SDK with write key and data plane URL',
    },
    // load(writeKey: string, dataPlaneUrl: string, options: object)
    {
      params: [
        { name: 'writeKey', type: 'string', optional: false },
        { name: 'dataPlaneUrl', type: 'string', optional: false },
        { name: 'options', type: 'object', optional: false },
      ],
      description: 'Initialize SDK with write key, data plane URL, and options',
    },
  ],
  ready: [
    // ready(callback: function)
    {
      params: [{ name: 'callback', type: 'function', optional: false }],
      description: 'Execute callback when SDK is ready',
    },
  ],
  getAnonymousId: [
    // getAnonymousId()
    {
      params: [],
      description: 'Get current anonymous ID',
    },
    // getAnonymousId(options: object)
    {
      params: [{ name: 'options', type: 'object', optional: false }],
      description: 'Get anonymous ID with options',
    },
  ],
  getUserId: [
    // getUserId()
    {
      params: [],
      description: 'Get current user ID',
    },
  ],
  getUserTraits: [
    // getUserTraits()
    {
      params: [],
      description: 'Get current user traits',
    },
  ],
  getGroupId: [
    // getGroupId()
    {
      params: [],
      description: 'Get current group ID',
    },
  ],
  getGroupTraits: [
    // getGroupTraits()
    {
      params: [],
      description: 'Get current group traits',
    },
  ],
  setAnonymousId: [
    // setAnonymousId(anonymousId: string)
    {
      params: [{ name: 'anonymousId', type: 'string', optional: false }],
      description: 'Set anonymous ID',
    },
    // setAnonymousId(anonymousId: string, options: object)
    {
      params: [
        { name: 'anonymousId', type: 'string', optional: false },
        { name: 'options', type: 'object', optional: false },
      ],
      description: 'Set anonymous ID with options',
    },
  ],
  consent: [
    // consent(options: object)
    {
      params: [{ name: 'options', type: 'object', optional: false }],
      description: 'Set consent options',
    },
  ],
  startSession: [
    // startSession()
    {
      params: [],
      description: 'Start a new session',
    },
    // startSession(sessionId: number)
    {
      params: [{ name: 'sessionId', type: 'number', optional: false }],
      description: 'Start a new session with custom session ID',
    },
  ],
  endSession: [
    // endSession()
    {
      params: [],
      description: 'End current session',
    },
  ],
  getSessionId: [
    // getSessionId()
    {
      params: [],
      description: 'Get current session ID',
    },
  ],
};

/**
 * Validates SDK method calls against official API signatures
 */
export async function validateSDKMethodCalls(
  methodCalls: SDKMethodCall[],
  _sdkVersion?: string
): Promise<ValidationResult> {
  core.info(`Validating ${methodCalls.length} SDK method calls...`);

  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const suggestions: ValidationIssue[] = [];

  for (const call of methodCalls) {
    const issues = validateMethodCall(call);
    errors.push(...issues.filter((i) => i.severity === 'error'));
    warnings.push(...issues.filter((i) => i.severity === 'warning'));
    suggestions.push(...issues.filter((i) => i.severity === 'suggestion'));
  }

  core.info(`Validation complete: ${errors.length} errors, ${warnings.length} warnings, ${suggestions.length} suggestions`);

  return {
    totalIssues: errors.length + warnings.length + suggestions.length,
    errors,
    warnings,
    suggestions,
  };
}

/**
 * Validates a single SDK method call against all overloads
 */
function validateMethodCall(call: SDKMethodCall): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const overloads = SDK_METHOD_OVERLOADS[call.method];

  if (!overloads) {
    core.debug(`No overloads found for method: ${call.method}`);
    return issues;
  }

  // Check if the call matches any overload and collect detailed errors
  const { matchingOverload, detailedErrors } = findMatchingOverloadWithErrors(call, overloads);

  if (!matchingOverload) {
    // No overload matches - generate detailed error message
    let errorMessage = `Invalid call to ${call.method}().\n\n`;

    // Show what we got
    if (call.arguments.length === 0) {
      errorMessage += `**Problem:** Missing required arguments.\n\n`;
    } else {
      errorMessage += `**Problem:** Got ${call.arguments.length} argument(s) but they don't match any valid signature:\n`;
      call.arguments.forEach((arg, i) => {
        const argDesc = arg.isStatic
          ? `${arg.type}${arg.value !== undefined ? ` (value: ${JSON.stringify(arg.value)})` : ''}`
          : `${arg.type} (dynamic value)`;
        errorMessage += `  - Argument ${i + 1}: ${argDesc}\n`;
      });
      errorMessage += '\n';
    }

    // Show specific errors from attempted matches
    if (detailedErrors.length > 0) {
      errorMessage += `**Issues found:**\n`;
      detailedErrors.forEach(err => {
        errorMessage += `  - ${err}\n`;
      });
      errorMessage += '\n';
    }

    // Show valid signatures
    errorMessage += `**Valid signatures:**\n`;
    overloads.forEach((o, i) => {
      const params = o.params.map((p) => `${p.name}: ${p.type}`).join(', ');
      errorMessage += `  ${i + 1}. ${call.method}(${params})\n`;
    });

    // Generate a fix suggestion
    const suggestedOverload = overloads[0];
    const fixArgs = suggestedOverload.params.map(p => {
      if (p.type === 'string') return `'${p.name}'`;
      if (p.type === 'number') return '0';
      if (p.type === 'boolean') return 'false';
      if (p.type === 'object') return '{}';
      if (p.type === 'function') return '() => {}';
      return p.name;
    }).join(', ');

    issues.push({
      file: call.file,
      line: call.line,
      column: call.column,
      severity: 'error',
      method: call.method,
      code: call.code,
      message: errorMessage.trim(),
      fix: `${call.method}(${fixArgs})`,
    });
  }

  // Method-specific validations
  issues.push(...validateMethodSpecificRules(call));

  return issues;
}

/**
 * Finds a matching overload and collects detailed error messages
 */
function findMatchingOverloadWithErrors(
  call: SDKMethodCall,
  overloads: MethodOverload[]
): { matchingOverload: MethodOverload | null; detailedErrors: string[] } {
  const argCount = call.arguments.length;
  const detailedErrors: string[] = [];
  const attemptedOverloads: { overload: MethodOverload; errors: string[] }[] = [];

  // Try each overload and collect errors
  for (const overload of overloads) {
    const overloadErrors: string[] = [];

    // Check argument count
    if (overload.params.length !== argCount) {
      if (argCount < overload.params.length) {
        overloadErrors.push(
          `Signature with ${overload.params.length} parameter(s) needs ${overload.params.length - argCount} more argument(s)`
        );
      } else {
        overloadErrors.push(
          `Signature with ${overload.params.length} parameter(s) has ${argCount - overload.params.length} too many argument(s)`
        );
      }
      attemptedOverloads.push({ overload, errors: overloadErrors });
      continue;
    }

    // Check if argument types match
    let matches = true;
    for (let i = 0; i < argCount; i++) {
      const arg = call.arguments[i];
      const param = overload.params[i];

      if (!isArgumentCompatible(arg, param.type)) {
        matches = false;
        const argTypeDesc = arg.isStatic
          ? `${arg.type}${arg.value !== undefined ? ` (${JSON.stringify(arg.value)})` : ''}`
          : `${arg.type} (dynamic)`;
        overloadErrors.push(
          `Argument ${i + 1} ('${param.name}'): expected ${param.type}, got ${argTypeDesc}`
        );
      }
    }

    if (matches) {
      return { matchingOverload: overload, detailedErrors: [] };
    }

    attemptedOverloads.push({ overload, errors: overloadErrors });
  }

  // Collect the most relevant errors (from overload with fewest errors or matching arg count)
  const bestMatch = attemptedOverloads
    .filter(a => a.overload.params.length === argCount)
    .sort((a, b) => a.errors.length - b.errors.length)[0];

  if (bestMatch) {
    detailedErrors.push(...bestMatch.errors);
  } else if (attemptedOverloads.length > 0) {
    // Show errors from first overload if no matching arg count
    detailedErrors.push(...attemptedOverloads[0].errors);
  }

  return { matchingOverload: null, detailedErrors };
}

/**
 * Checks if an argument is compatible with expected type
 */
function isArgumentCompatible(arg: SDKArgument, expectedType: string): boolean {
  // For non-static arguments (dynamic values), we can't validate type
  if (!arg.isStatic) {
    return true; // Assume compatible
  }

  // Map argument types to expected types
  switch (expectedType) {
    case 'string':
      return arg.type === 'string';
    case 'number':
      return arg.type === 'number';
    case 'boolean':
      return arg.type === 'boolean';
    case 'object':
      return arg.type === 'object' || arg.type === 'null';
    case 'function':
      // Functions are rarely static in the code
      return arg.type === 'identifier' || arg.type === 'unknown';
    default:
      return true;
  }
}

/**
 * Validates method-specific business rules that type checking can't catch
 */
function validateMethodSpecificRules(call: SDKMethodCall): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  switch (call.method) {
    case 'track':
      issues.push(...validateTrackCall(call));
      break;
    case 'identify':
      issues.push(...validateIdentifyCall(call));
      break;
    case 'load':
      issues.push(...validateLoadCall(call));
      break;
  }

  return issues;
}

/**
 * Validates track() method specific rules
 */
function validateTrackCall(call: SDKMethodCall): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (call.arguments.length === 0) {
    return issues; // Type validation will catch this
  }

  const eventArg = call.arguments[0];

  // Check for empty event name
  if (eventArg.isStatic && eventArg.type === 'string' && eventArg.value === '') {
    issues.push({
      file: call.file,
      line: call.line,
      column: call.column,
      severity: 'error',
      method: call.method,
      code: call.code,
      message: 'Event name cannot be empty',
      fix: `rudderanalytics.track('event_name', properties)`,
    });
  }

  // Check if properties are provided (suggestion)
  if (call.arguments.length === 1 && eventArg.isStatic) {
    issues.push({
      file: call.file,
      line: call.line,
      column: call.column,
      severity: 'suggestion',
      method: call.method,
      code: call.code,
      message: 'Consider adding properties to provide more context for this event',
      fix: `rudderanalytics.track('${eventArg.value}', { /* properties */ })`,
    });
  }

  return issues;
}

/**
 * Validates identify() method specific rules
 */
function validateIdentifyCall(call: SDKMethodCall): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check if both userId and traits are missing (warning)
  if (call.arguments.length === 0) {
    issues.push({
      file: call.file,
      line: call.line,
      column: call.column,
      severity: 'warning',
      method: call.method,
      code: call.code,
      message: 'identify() called without userId or traits. Consider providing user information.',
      fix: `rudderanalytics.identify('userId', { email: 'user@example.com' })`,
    });
  }

  return issues;
}

/**
 * Validates load() method specific rules
 */
function validateLoadCall(call: SDKMethodCall): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (call.arguments.length < 2) {
    // Type validation will catch this, but add specific message
    issues.push({
      file: call.file,
      line: call.line,
      column: call.column,
      severity: 'error',
      method: call.method,
      code: call.code,
      message: 'load() requires writeKey and dataPlaneUrl parameters',
      fix: `rudderanalytics.load('YOUR_WRITE_KEY', 'https://your-dataplane-url.com')`,
    });
  }

  return issues;
}
