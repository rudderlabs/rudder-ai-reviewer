import * as core from '@actions/core';
import { SDKMethodCall, SDKArgument } from './file-scanner';
import { getSDKMethodSignatures, MethodSignature as SDKMethodSignature, isTypeCompatible } from './type-extractor';

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
 * Validates SDK method calls against official API signatures
 */
export async function validateSDKMethodCalls(
  methodCalls: SDKMethodCall[],
  sdkVersion?: string
): Promise<ValidationResult> {
  core.info(`Validating ${methodCalls.length} SDK method calls...`);

  // Get method signatures (either from SDK types or built-in fallback)
  let methodSignatures: Map<string, SDKMethodSignature>;
  if (sdkVersion) {
    core.info(`Using SDK version ${sdkVersion} for type validation`);
    methodSignatures = await getSDKMethodSignatures(sdkVersion);
  } else {
    core.info('No SDK version detected, using built-in method signatures');
    methodSignatures = await getSDKMethodSignatures('latest');
  }

  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const suggestions: ValidationIssue[] = [];

  for (const call of methodCalls) {
    const issues = validateMethodCall(call, methodSignatures);
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
 * Validates a single SDK method call using dynamic type signatures
 */
function validateMethodCall(call: SDKMethodCall, methodSignatures: Map<string, SDKMethodSignature>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const signature = methodSignatures.get(call.method);

  if (!signature) {
    // Unknown method (shouldn't happen based on scanner)
    core.debug(`No signature found for method: ${call.method}`);
    return issues;
  }

  // Check argument count
  const argCount = call.arguments.length;
  const requiredParams = signature.parameters.filter((p) => !p.optional);
  const minArgs = requiredParams.length;
  const maxArgs = signature.parameters.length;

  if (argCount < minArgs) {
    issues.push({
      file: call.file,
      line: call.line,
      column: call.column,
      severity: 'error',
      method: call.method,
      code: call.code,
      message: `Missing required arguments for ${call.method}(). Expected at least ${minArgs} argument(s), got ${argCount}.`,
      fix: generateFixForMissingArgs(call, signature),
    });
  }

  if (argCount > maxArgs) {
    issues.push({
      file: call.file,
      line: call.line,
      column: call.column,
      severity: 'warning',
      method: call.method,
      code: call.code,
      message: `Too many arguments for ${call.method}(). Expected at most ${maxArgs} argument(s), got ${argCount}.`,
    });
  }

  // Validate argument types (only for static arguments)
  for (let i = 0; i < call.arguments.length && i < signature.parameters.length; i++) {
    const arg = call.arguments[i];
    const param = signature.parameters[i];

    if (arg.isStatic) {
      const typeIssue = validateArgumentTypeAgainstSignature(arg, param, call);
      if (typeIssue) {
        issues.push(typeIssue);
      }
    }
  }

  // Method-specific validations
  const methodSpecificIssues = validateMethodSpecificRules(call);
  issues.push(...methodSpecificIssues);

  return issues;
}

/**
 * Validates an argument's type against SDK signature parameter
 */
function validateArgumentTypeAgainstSignature(
  arg: SDKArgument,
  param: SDKMethodSignature['parameters'][0],
  call: SDKMethodCall
): ValidationIssue | null {
  // Check if argument type is compatible with expected type
  if (!isTypeCompatible(arg.type, param.type)) {
    return {
      file: call.file,
      line: call.line,
      column: call.column,
      severity: 'error',
      method: call.method,
      code: call.code,
      message: `Invalid type for argument '${param.name}' in ${call.method}(). Expected ${param.type}, got ${arg.type}.`,
      fix: `Provide a ${param.type} for the '${param.name}' parameter`,
    };
  }

  return null;
}


/**
 * Validates method-specific business rules
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
    case 'page':
      issues.push(...validatePageCall(call));
      break;
    case 'load':
      issues.push(...validateLoadCall(call));
      break;
  }

  return issues;
}

/**
 * Validates track() method call
 */
function validateTrackCall(call: SDKMethodCall): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const eventArg = call.arguments[0];

  // Event name should be a non-empty string
  if (eventArg && eventArg.isStatic && eventArg.type === 'string' && typeof eventArg.value === 'string') {
    if (!eventArg.value || eventArg.value.trim() === '') {
      issues.push({
        file: call.file,
        line: call.line,
        column: call.column,
        severity: 'error',
        method: call.method,
        code: call.code,
        message: 'Event name cannot be empty',
        fix: "Provide a descriptive event name like 'button_clicked' or 'form_submitted'",
      });
    }

    // Suggest snake_case naming convention
    if (eventArg.value && !/^[a-z0-9_]+$/.test(eventArg.value)) {
      issues.push({
        file: call.file,
        line: call.line,
        column: call.column,
        severity: 'suggestion',
        method: call.method,
        code: call.code,
        message: 'Event names should follow snake_case convention (lowercase with underscores)',
        fix: `Use snake_case: '${toSnakeCase(eventArg.value)}'`,
      });
    }
  }

  // Properties should be an object if provided
  const propsArg = call.arguments[1];
  if (propsArg && propsArg.isStatic && propsArg.type !== 'object' && propsArg.type !== 'null' && propsArg.type !== 'undefined') {
    issues.push({
      file: call.file,
      line: call.line,
      column: call.column,
      severity: 'error',
      method: call.method,
      code: call.code,
      message: 'Properties parameter must be an object',
      fix: 'Pass an object with event properties: { key: "value" }',
    });
  }

  // Warn if no properties provided
  if (!propsArg || propsArg.type === 'null' || propsArg.type === 'undefined') {
    issues.push({
      file: call.file,
      line: call.line,
      column: call.column,
      severity: 'suggestion',
      method: call.method,
      code: call.code,
      message: 'Consider adding properties to provide context for this event',
      fix: 'rudderanalytics.track("event_name", { /* properties */ })',
    });
  }

  return issues;
}

/**
 * Validates identify() method call
 */
function validateIdentifyCall(call: SDKMethodCall): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Warn if both userId and traits are missing
  if (call.arguments.length === 0) {
    issues.push({
      file: call.file,
      line: call.line,
      column: call.column,
      severity: 'warning',
      method: call.method,
      code: call.code,
      message: 'identify() called without userId or traits. At least one should be provided.',
      fix: 'rudderanalytics.identify(userId, { /* traits */ })',
    });
  }

  const traitsArg = call.arguments[1];
  if (traitsArg && traitsArg.isStatic && traitsArg.type !== 'object' && traitsArg.type !== 'null' && traitsArg.type !== 'undefined') {
    issues.push({
      file: call.file,
      line: call.line,
      column: call.column,
      severity: 'error',
      method: call.method,
      code: call.code,
      message: 'Traits parameter must be an object',
      fix: 'Pass an object with user traits: { email: "user@example.com" }',
    });
  }

  return issues;
}

/**
 * Validates page() method call
 */
function validatePageCall(call: SDKMethodCall): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check if properties are at the right position
  // page() can be called as: page(category, name, properties) or page(name, properties)
  const lastArg = call.arguments[call.arguments.length - 1];
  if (lastArg && lastArg.type === 'object' && lastArg.isStatic) {
    // Good - properties provided
  } else {
    issues.push({
      file: call.file,
      line: call.line,
      column: call.column,
      severity: 'suggestion',
      method: call.method,
      code: call.code,
      message: 'Consider adding properties to provide context for this page view',
      fix: 'rudderanalytics.page("Page Name", { /* properties */ })',
    });
  }

  return issues;
}

/**
 * Validates load() method call
 */
function validateLoadCall(call: SDKMethodCall): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const writeKeyArg = call.arguments[0];
  const dataPlaneArg = call.arguments[1];

  // Check for hardcoded write key (security issue)
  if (writeKeyArg && writeKeyArg.isStatic && writeKeyArg.type === 'string') {
    issues.push({
      file: call.file,
      line: call.line,
      column: call.column,
      severity: 'warning',
      method: call.method,
      code: call.code,
      message: 'Write key appears to be hardcoded. Consider using environment variables.',
      fix: 'Use process.env.RUDDERSTACK_WRITE_KEY or import from config',
    });
  }

  // Check data plane URL format
  if (dataPlaneArg && dataPlaneArg.isStatic && dataPlaneArg.type === 'string') {
    const url = dataPlaneArg.value as string;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      issues.push({
        file: call.file,
        line: call.line,
        column: call.column,
        severity: 'error',
        method: call.method,
        code: call.code,
        message: 'Data plane URL must be a valid HTTP/HTTPS URL',
        fix: 'Ensure the URL starts with https:// (e.g., "https://example.dataplane.rudderstack.com")',
      });
    }
  }

  return issues;
}

/**
 * Generates a fix suggestion for missing arguments (SDK signature version)
 */
function generateFixForMissingArgs(call: SDKMethodCall, signature: SDKMethodSignature): string {
  const requiredParams = signature.parameters.filter((p) => !p.optional);
  const argExamples = requiredParams.map((param) => {
    const type = param.type.toLowerCase();
    if (type.includes('string')) {
      return `"${param.name}"`;
    } else if (type.includes('number')) {
      return '123';
    } else if (type.includes('object')) {
      return '{}';
    } else if (type.includes('boolean')) {
      return 'true';
    } else if (type.includes('function')) {
      return '() => {}';
    } else {
      return param.name;
    }
  });

  return `rudderanalytics.${call.method}(${argExamples.join(', ')})`;
}


/**
 * Converts a string to snake_case
 */
function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
