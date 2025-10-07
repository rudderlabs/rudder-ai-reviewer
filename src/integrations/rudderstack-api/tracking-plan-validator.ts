/**
 * Tracking Plan Validator
 * Validates SDK calls against tracking plan schemas
 */

import * as core from '@actions/core';
import {
  TrackingPlan,
  TrackingPlanEvent,
  TrackingPlanProperty,
  Issue,
  ConfidenceLevel,
} from '../../types/common';
import { RudderStackCallInfo } from '../../analyzers/javascript/parsers';

export interface TrackingPlanValidationResult {
  issues: Issue[];
  validEvents: string[];
  unknownEvents: string[];
  violations: ValidationViolation[];
}

export interface ValidationViolation {
  eventName: string;
  violationType: 'unknown_event' | 'missing_property' | 'unknown_property' | 'type_mismatch' | 'naming_convention';
  description: string;
  severity: 'error' | 'warning' | 'suggestion';
  file: string;
  line: number;
}

/**
 * Validate SDK calls against tracking plan
 */
export function validateAgainstTrackingPlan(
  calls: RudderStackCallInfo[],
  trackingPlan: TrackingPlan,
  filePath: string
): TrackingPlanValidationResult {
  core.info(`Validating ${calls.length} SDK calls against tracking plan...`);

  const issues: Issue[] = [];
  const validEvents: string[] = [];
  const unknownEvents: string[] = [];
  const violations: ValidationViolation[] = [];

  // Create event lookup map
  const eventMap = new Map<string, TrackingPlanEvent>();
  trackingPlan.events.forEach((event) => {
    eventMap.set(event.name, event);
  });

  for (const call of calls) {
    // Only validate track and page calls
    if (call.method !== 'track' && call.method !== 'page') {
      continue;
    }

    // Skip if event name is dynamic (can't validate)
    if (call.hasDynamicEventName) {
      core.debug(`Skipping dynamic event name at ${filePath}:${call.line}`);
      continue;
    }

    const eventName = call.eventName;
    if (!eventName) {
      continue;
    }

    const trackingPlanEvent = eventMap.get(eventName);

    if (!trackingPlanEvent) {
      // Unknown event
      unknownEvents.push(eventName);

      const violation: ValidationViolation = {
        eventName,
        violationType: 'unknown_event',
        description: `Event '${eventName}' is not defined in the tracking plan`,
        severity: 'warning',
        file: filePath,
        line: call.line,
      };

      violations.push(violation);

      issues.push({
        id: `tracking-plan-unknown-${eventName}-${call.line}`,
        severity: 'warning',
        message: `Event '${eventName}' is not defined in tracking plan`,
        file: filePath,
        line: call.line,
        column: call.column,
        impact: 'This event may not be tracked correctly in downstream destinations',
        fix: `Add '${eventName}' to your tracking plan, or use an existing event name`,
        confidence: 'high',
        source: 'tracking-plan',
      });
    } else {
      // Event exists in tracking plan
      validEvents.push(eventName);

      // Validate naming convention
      if (trackingPlanEvent.namingConvention) {
        const namingIssue = validateNamingConvention(
          eventName,
          trackingPlanEvent.namingConvention,
          filePath,
          call.line,
          call.column
        );
        if (namingIssue) {
          issues.push(namingIssue);
          violations.push({
            eventName,
            violationType: 'naming_convention',
            description: namingIssue.message,
            severity: namingIssue.severity,
            file: filePath,
            line: call.line,
          });
        }
      }

      // Validate properties if not dynamic
      if (!call.hasDynamicProperties && call.properties) {
        const propertyIssues = validateProperties(
          eventName,
          call.properties,
          trackingPlanEvent.properties,
          filePath,
          call.line,
          call.column
        );

        issues.push(...propertyIssues);
        propertyIssues.forEach((issue) => {
          violations.push({
            eventName,
            violationType: 'type_mismatch',
            description: issue.message,
            severity: issue.severity,
            file: filePath,
            line: call.line,
          });
        });
      }
    }
  }

  core.info(
    `Tracking plan validation complete: ${validEvents.length} valid, ${unknownEvents.length} unknown, ${issues.length} issues`
  );

  return {
    issues,
    validEvents,
    unknownEvents,
    violations,
  };
}

/**
 * Validate event naming convention
 */
function validateNamingConvention(
  eventName: string,
  convention: string,
  file: string,
  line: number,
  column: number
): Issue | null {
  let isValid = false;
  let expectedFormat = '';

  switch (convention) {
    case 'snake_case':
      isValid = /^[a-z][a-z0-9_]*$/.test(eventName);
      expectedFormat = 'lowercase_with_underscores';
      break;
    case 'camelCase':
      isValid = /^[a-z][a-zA-Z0-9]*$/.test(eventName);
      expectedFormat = 'camelCase';
      break;
    case 'PascalCase':
      isValid = /^[A-Z][a-zA-Z0-9]*$/.test(eventName);
      expectedFormat = 'PascalCase';
      break;
    case 'kebab-case':
      isValid = /^[a-z][a-z0-9-]*$/.test(eventName);
      expectedFormat = 'lowercase-with-dashes';
      break;
    default:
      return null;
  }

  if (!isValid) {
    return {
      id: `naming-convention-${eventName}-${line}`,
      severity: 'warning',
      message: `Event name '${eventName}' doesn't follow ${convention} naming convention`,
      file,
      line,
      column,
      impact: 'Inconsistent naming can make data analysis more difficult',
      fix: `Use ${expectedFormat} format, e.g., '${convertToConvention(eventName, convention)}'`,
      confidence: 'high',
      source: 'tracking-plan',
    };
  }

  return null;
}

/**
 * Convert event name to specified convention (best effort)
 */
function convertToConvention(eventName: string, convention: string): string {
  // Split by common delimiters
  const words = eventName.split(/[\s_-]+|(?=[A-Z])/);
  const cleanWords = words.map((w) => w.toLowerCase()).filter((w) => w.length > 0);

  switch (convention) {
    case 'snake_case':
      return cleanWords.join('_');
    case 'camelCase':
      return cleanWords.map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))).join('');
    case 'PascalCase':
      return cleanWords.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    case 'kebab-case':
      return cleanWords.join('-');
    default:
      return eventName;
  }
}

/**
 * Validate event properties against tracking plan
 */
function validateProperties(
  eventName: string,
  actualProperties: Record<string, any>,
  expectedProperties: TrackingPlanProperty[],
  file: string,
  line: number,
  column: number
): Issue[] {
  const issues: Issue[] = [];

  // Create property lookup map
  const propMap = new Map<string, TrackingPlanProperty>();
  expectedProperties.forEach((prop) => {
    propMap.set(prop.name, prop);
  });

  const actualPropNames = Object.keys(actualProperties);

  // Check for missing required properties
  for (const expectedProp of expectedProperties) {
    if (expectedProp.required && !actualPropNames.includes(expectedProp.name)) {
      issues.push({
        id: `missing-property-${eventName}-${expectedProp.name}-${line}`,
        severity: 'error',
        message: `Missing required property '${expectedProp.name}' for event '${eventName}'`,
        file,
        line,
        column,
        impact: 'Required property is missing, may cause tracking issues',
        fix: `Add property: ${expectedProp.name}: ${getExampleValue(expectedProp.type)}`,
        confidence: 'high',
        source: 'tracking-plan',
      });
    }
  }

  // Check for unknown properties
  for (const propName of actualPropNames) {
    if (!propMap.has(propName)) {
      issues.push({
        id: `unknown-property-${eventName}-${propName}-${line}`,
        severity: 'warning',
        message: `Property '${propName}' is not defined in tracking plan for event '${eventName}'`,
        file,
        line,
        column,
        impact: 'Unknown properties may not be tracked correctly',
        fix: `Remove property or add it to the tracking plan`,
        confidence: 'high',
        source: 'tracking-plan',
      });
    } else {
      // Validate property type
      const expectedProp = propMap.get(propName)!;
      const actualValue = actualProperties[propName];
      const actualType = typeof actualValue;

      if (!isTypeCompatible(actualType, expectedProp.type)) {
        issues.push({
          id: `type-mismatch-${eventName}-${propName}-${line}`,
          severity: 'error',
          message: `Property '${propName}' has incorrect type for event '${eventName}'. Expected ${expectedProp.type}, got ${actualType}`,
          file,
          line,
          column,
          impact: 'Type mismatch may cause data processing issues',
          fix: `Change type to ${expectedProp.type}`,
          confidence: 'high',
          source: 'tracking-plan',
        });
      }

      // Validate allowed values
      if (expectedProp.allowedValues && expectedProp.allowedValues.length > 0) {
        const stringValue = String(actualValue);
        if (!expectedProp.allowedValues.includes(stringValue)) {
          issues.push({
            id: `invalid-value-${eventName}-${propName}-${line}`,
            severity: 'error',
            message: `Property '${propName}' has invalid value '${stringValue}'. Allowed values: ${expectedProp.allowedValues.join(', ')}`,
            file,
            line,
            column,
            impact: 'Invalid value may be rejected by downstream destinations',
            fix: `Use one of: ${expectedProp.allowedValues.join(', ')}`,
            confidence: 'high',
            source: 'tracking-plan',
          });
        }
      }

      // Validate pattern
      if (expectedProp.pattern) {
        const stringValue = String(actualValue);
        const regex = new RegExp(expectedProp.pattern);
        if (!regex.test(stringValue)) {
          issues.push({
            id: `pattern-mismatch-${eventName}-${propName}-${line}`,
            severity: 'error',
            message: `Property '${propName}' does not match required pattern: ${expectedProp.pattern}`,
            file,
            line,
            column,
            impact: 'Value does not match expected format',
            fix: `Ensure value matches pattern: ${expectedProp.pattern}`,
            confidence: 'high',
            source: 'tracking-plan',
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Check if actual type is compatible with expected type
 */
function isTypeCompatible(actualType: string, expectedType: string): boolean {
  // Normalize types
  const normalized = expectedType.toLowerCase();

  switch (normalized) {
    case 'string':
      return actualType === 'string';
    case 'number':
    case 'integer':
    case 'float':
      return actualType === 'number';
    case 'boolean':
      return actualType === 'boolean';
    case 'object':
      return actualType === 'object';
    case 'array':
      return Array.isArray(actualType);
    default:
      // Unknown type, assume compatible
      return true;
  }
}

/**
 * Get example value for a type
 */
function getExampleValue(type: string): string {
  const normalized = type.toLowerCase();

  switch (normalized) {
    case 'string':
      return "'value'";
    case 'number':
    case 'integer':
      return '123';
    case 'float':
      return '123.45';
    case 'boolean':
      return 'true';
    case 'object':
      return '{}';
    case 'array':
      return '[]';
    default:
      return 'value';
  }
}
