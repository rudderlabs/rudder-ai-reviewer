/**
 * Unified Parser Interface
 * Routes to TypeScript or Babel parser based on file extension
 */

import * as path from 'path';
import * as tsParser from './typescript-parser';
import * as babelParser from './babel-parser';
import * as ts from 'typescript';
import * as t from '@babel/types';

export interface UnifiedParseResult {
  success: boolean;
  filePath: string;
  fileType: 'typescript' | 'javascript';
  ast: any; // ts.SourceFile or t.File
  errors: Array<{
    message: string;
    line: number;
    column: number;
    code?: string;
  }>;
  rudderStackCalls: Array<{
    line: number;
    column: number;
    method: string;
    arguments: any[];
  }>;
}

/**
 * Parse file using appropriate parser based on extension
 */
export function parseFile(filePath: string): UnifiedParseResult {
  const ext = path.extname(filePath);
  const isTypeScript = ext === '.ts' || ext === '.tsx';

  if (isTypeScript) {
    return parseTypeScriptFile(filePath);
  } else {
    return parseJavaScriptFile(filePath);
  }
}

/**
 * Parse TypeScript file
 */
function parseTypeScriptFile(filePath: string): UnifiedParseResult {
  const result = tsParser.parseTypeScriptFile(filePath);

  const rudderStackCalls: UnifiedParseResult['rudderStackCalls'] = [];

  if (result.sourceFile) {
    const calls = tsParser.findRudderStackCalls(result.sourceFile);

    calls.forEach((call) => {
      const { line, character } = result.sourceFile!.getLineAndCharacterOfPosition(
        call.getStart(result.sourceFile)
      );

      let methodName = 'unknown';
      if (ts.isPropertyAccessExpression(call.expression)) {
        methodName = call.expression.name.text;
      }

      rudderStackCalls.push({
        line: line + 1,
        column: character + 1,
        method: methodName,
        arguments: call.arguments.map((arg) => arg.getText(result.sourceFile!)),
      });
    });
  }

  return {
    success: result.success,
    filePath,
    fileType: 'typescript',
    ast: result.sourceFile,
    errors: result.errors,
    rudderStackCalls,
  };
}

/**
 * Parse JavaScript file
 */
function parseJavaScriptFile(filePath: string): UnifiedParseResult {
  const result = babelParser.parseBabelFile(filePath);

  const rudderStackCalls: UnifiedParseResult['rudderStackCalls'] = [];

  if (result.ast) {
    const calls = babelParser.findRudderStackCalls(result.ast);

    calls.forEach((call) => {
      let methodName = 'unknown';
      if (t.isMemberExpression(call.callee) && t.isIdentifier(call.callee.property)) {
        methodName = call.callee.property.name;
      }

      const args = babelParser.extractCallArguments(call);

      rudderStackCalls.push({
        line: call.loc?.start.line || 0,
        column: call.loc?.start.column || 0,
        method: methodName,
        arguments: args,
      });
    });
  }

  return {
    success: result.success,
    filePath,
    fileType: 'javascript',
    ast: result.ast,
    errors: result.errors,
    rudderStackCalls,
  };
}

/**
 * Extract detailed information from a RudderStack call
 */
export interface RudderStackCallInfo {
  method: string;
  eventName?: string;
  properties?: Record<string, any>;
  hasDynamicEventName: boolean;
  hasDynamicProperties: boolean;
  line: number;
  column: number;
}

/**
 * Extract call information from parsed call node
 */
export function extractCallInfo(
  call: any,
  fileType: 'typescript' | 'javascript',
  sourceFile?: ts.SourceFile
): RudderStackCallInfo | null {
  if (fileType === 'typescript' && sourceFile && ts.isCallExpression(call)) {
    return extractTypeScriptCallInfo(call, sourceFile);
  } else if (fileType === 'javascript' && t.isCallExpression(call)) {
    return extractBabelCallInfo(call);
  }

  return null;
}

/**
 * Extract TypeScript call info
 */
function extractTypeScriptCallInfo(
  call: ts.CallExpression,
  sourceFile: ts.SourceFile
): RudderStackCallInfo {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(call.getStart(sourceFile));

  let method = 'unknown';
  if (ts.isPropertyAccessExpression(call.expression)) {
    method = call.expression.name.text;
  }

  let eventName: string | undefined;
  let hasDynamicEventName = false;

  // First argument is typically the event name for track/page
  if (call.arguments.length > 0) {
    const firstArg = call.arguments[0];

    if (ts.isStringLiteral(firstArg)) {
      eventName = firstArg.text;
      hasDynamicEventName = false;
    } else if (ts.isTemplateExpression(firstArg)) {
      hasDynamicEventName = true;
    } else {
      hasDynamicEventName = true;
    }
  }

  let properties: Record<string, any> | undefined;
  let hasDynamicProperties = false;

  // Second argument is typically properties object
  if (call.arguments.length > 1) {
    const secondArg = call.arguments[1];

    if (ts.isObjectLiteralExpression(secondArg)) {
      properties = {};
      const props = tsParser.extractObjectProperties(secondArg, sourceFile);
      props.forEach((prop) => {
        if (properties) {
          properties[prop.name] = prop.value;
        }
      });
      // Check if any properties are dynamic
      hasDynamicProperties = secondArg.properties.some(
        (p) =>
          ts.isPropertyAssignment(p) &&
          !ts.isStringLiteral(p.initializer) &&
          !ts.isNumericLiteral(p.initializer) &&
          !(p.initializer.kind === ts.SyntaxKind.TrueKeyword) &&
          !(p.initializer.kind === ts.SyntaxKind.FalseKeyword)
      );
    } else {
      hasDynamicProperties = true;
    }
  }

  return {
    method,
    eventName,
    properties,
    hasDynamicEventName,
    hasDynamicProperties,
    line: line + 1,
    column: character + 1,
  };
}

/**
 * Extract Babel call info
 */
function extractBabelCallInfo(call: t.CallExpression): RudderStackCallInfo {
  let method = 'unknown';
  if (t.isMemberExpression(call.callee) && t.isIdentifier(call.callee.property)) {
    method = call.callee.property.name;
  }

  let eventName: string | undefined;
  let hasDynamicEventName = false;

  // First argument is typically the event name
  if (call.arguments.length > 0) {
    const firstArg = call.arguments[0];

    if (t.isStringLiteral(firstArg)) {
      eventName = firstArg.value;
      hasDynamicEventName = false;
    } else if (t.isTemplateLiteral(firstArg)) {
      hasDynamicEventName = firstArg.expressions.length > 0;
    } else {
      hasDynamicEventName = true;
    }
  }

  let properties: Record<string, any> | undefined;
  let hasDynamicProperties = false;

  // Second argument is typically properties
  if (call.arguments.length > 1) {
    const secondArg = call.arguments[1];

    if (t.isObjectExpression(secondArg)) {
      properties = {};
      const props = babelParser.extractObjectProperties(secondArg);
      props.forEach((prop) => {
        if (properties && !prop.isDynamic) {
          properties[prop.name] = prop.value;
        }
      });
      hasDynamicProperties = props.some((p) => p.isDynamic);
    } else {
      hasDynamicProperties = true;
    }
  }

  return {
    method,
    eventName,
    properties,
    hasDynamicEventName,
    hasDynamicProperties,
    line: call.loc?.start.line || 0,
    column: call.loc?.start.column || 0,
  };
}

export { tsParser, babelParser };
