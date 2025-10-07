/**
 * Babel Parser
 * Parses .js/.jsx files using Babel parser (faster, lighter than TS)
 */

import { parse, ParserOptions } from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import * as fs from 'fs';

export interface ParsedNode {
  type: string;
  start: number;
  end: number;
  line: number;
  column: number;
  text?: string;
  children?: ParsedNode[];
  metadata?: Record<string, unknown>;
}

export interface ParseResult {
  success: boolean;
  ast?: t.File;
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  code?: string;
}

/**
 * Parse JavaScript/JSX file using Babel
 */
export function parseBabelFile(filePath: string): ParseResult {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const isJsx = filePath.endsWith('.jsx');

    const parserOptions: ParserOptions = {
      sourceType: 'module',
      plugins: [
        'jsx',
        'dynamicImport',
        'classProperties',
        'decorators-legacy',
        'optionalChaining',
        'nullishCoalescingOperator',
      ],
    };

    const ast = parse(content, parserOptions);

    return {
      success: true,
      ast,
      errors: [],
    };
  } catch (error: any) {
    const parseError: ParseError = {
      message: error.message || 'Unknown parse error',
      line: error.loc?.line || 0,
      column: error.loc?.column || 0,
      code: error.code,
    };

    return {
      success: false,
      errors: [parseError],
    };
  }
}

/**
 * Find all RudderStack SDK call expressions in the AST
 */
export function findRudderStackCalls(ast: t.File): t.CallExpression[] {
  const calls: t.CallExpression[] = [];

  traverse(ast, {
    CallExpression(path: NodePath<t.CallExpression>) {
      const { callee } = path.node;

      // Match patterns like:
      // - rudderanalytics.track(...)
      // - window.rudderanalytics.identify(...)
      // - analytics.track(...) where analytics is imported from @rudderstack/analytics-js
      if (
        t.isMemberExpression(callee) &&
        t.isIdentifier(callee.property) &&
        isRudderStackMethod(callee.property.name)
      ) {
        // Check if the object is rudderanalytics or analytics
        const objectName = getObjectName(callee.object);
        if (objectName === 'rudderanalytics' || objectName === 'analytics') {
          calls.push(path.node);
        }
      }
    },
  });

  return calls;
}

/**
 * Check if method name is a RudderStack SDK method
 */
function isRudderStackMethod(methodName: string): boolean {
  const methods = [
    'track',
    'identify',
    'page',
    'group',
    'alias',
    'load',
    'ready',
    'reset',
    'consent',
    'getAnonymousId',
    'getUserId',
    'getUserTraits',
    'getGroupId',
    'getGroupTraits',
    'getSessionId',
    'setAnonymousId',
    'setAuthToken',
    'startSession',
    'endSession',
    'addCustomIntegration',
  ];
  return methods.includes(methodName);
}

/**
 * Get the object name from a member expression or identifier
 */
function getObjectName(node: t.Expression | t.Super | t.V8IntrinsicIdentifier): string | undefined {
  if (t.isIdentifier(node)) {
    return node.name;
  } else if (t.isMemberExpression(node) && t.isIdentifier(node.property)) {
    // Handle window.rudderanalytics or similar nested access
    return getObjectName(node.property as any);
  }
  return undefined;
}

/**
 * Extract arguments from a call expression
 */
export function extractCallArguments(callExpr: t.CallExpression): Array<{
  type: string;
  value?: any;
  isDynamic: boolean;
}> {
  return callExpr.arguments.map((arg) => {
    if (t.isStringLiteral(arg)) {
      return {
        type: 'string',
        value: arg.value,
        isDynamic: false,
      };
    } else if (t.isNumericLiteral(arg)) {
      return {
        type: 'number',
        value: arg.value,
        isDynamic: false,
      };
    } else if (t.isBooleanLiteral(arg)) {
      return {
        type: 'boolean',
        value: arg.value,
        isDynamic: false,
      };
    } else if (t.isObjectExpression(arg)) {
      return {
        type: 'object',
        value: extractObjectProperties(arg),
        isDynamic: hasDynamicValues(arg),
      };
    } else if (t.isTemplateLiteral(arg)) {
      return {
        type: 'template',
        isDynamic: arg.expressions.length > 0,
      };
    } else if (t.isIdentifier(arg)) {
      return {
        type: 'identifier',
        value: arg.name,
        isDynamic: true,
      };
    } else {
      return {
        type: arg.type,
        isDynamic: true,
      };
    }
  });
}

/**
 * Extract object literal properties
 */
export function extractObjectProperties(
  objExpr: t.ObjectExpression
): Array<{ name: string; value?: any; type: string; isDynamic: boolean }> {
  return objExpr.properties
    .map((prop) => {
      if (t.isObjectProperty(prop)) {
        const name = getPropertyName(prop.key);
        if (!name) return null;

        if (t.isStringLiteral(prop.value)) {
          return {
            name,
            value: prop.value.value,
            type: 'string',
            isDynamic: false,
          };
        } else if (t.isNumericLiteral(prop.value)) {
          return {
            name,
            value: prop.value.value,
            type: 'number',
            isDynamic: false,
          };
        } else if (t.isBooleanLiteral(prop.value)) {
          return {
            name,
            value: prop.value.value,
            type: 'boolean',
            isDynamic: false,
          };
        } else if (t.isObjectExpression(prop.value)) {
          return {
            name,
            type: 'object',
            isDynamic: hasDynamicValues(prop.value),
          };
        } else if (t.isArrayExpression(prop.value)) {
          return {
            name,
            type: 'array',
            isDynamic: hasDynamicValues(prop.value),
          };
        } else {
          return {
            name,
            type: prop.value.type,
            isDynamic: true,
          };
        }
      }
      return null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
}

/**
 * Get property name from key
 */
function getPropertyName(key: t.Expression | t.Identifier | t.PrivateName | t.StringLiteral | t.NumericLiteral): string | undefined {
  if (t.isIdentifier(key)) {
    return key.name;
  } else if (t.isStringLiteral(key)) {
    return key.value;
  } else if (t.isNumericLiteral(key)) {
    return key.value.toString();
  }
  return undefined;
}

/**
 * Check if an object/array has dynamic values (identifiers, computed properties, etc.)
 */
function hasDynamicValues(node: t.ObjectExpression | t.ArrayExpression): boolean {
  let hasDynamic = false;

  traverse(
    t.file(t.program([t.expressionStatement(node)])),
    {
      Identifier() {
        hasDynamic = true;
      },
      MemberExpression() {
        hasDynamic = true;
      },
      CallExpression() {
        hasDynamic = true;
      },
    },
    undefined,
    {}
  );

  return hasDynamic;
}

/**
 * Find imports from @rudderstack/analytics-js
 */
export function findRudderStackImports(ast: t.File): Array<{
  local: string;
  imported: string;
  source: string;
}> {
  const imports: Array<{ local: string; imported: string; source: string }> = [];

  traverse(ast, {
    ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
      const source = path.node.source.value;

      if (source.includes('@rudderstack/analytics-js') || source.includes('rudder-sdk-js')) {
        path.node.specifiers.forEach((spec) => {
          if (t.isImportDefaultSpecifier(spec)) {
            imports.push({
              local: spec.local.name,
              imported: 'default',
              source,
            });
          } else if (t.isImportSpecifier(spec)) {
            imports.push({
              local: spec.local.name,
              imported: t.isIdentifier(spec.imported) ? spec.imported.name : '',
              source,
            });
          }
        });
      }
    },
  });

  return imports;
}

/**
 * Track variable assignments and mutations
 */
export function trackVariableFlow(
  ast: t.File,
  variableName: string
): Array<{ type: string; line?: number; value?: any }> {
  const flow: Array<{ type: string; line?: number; value?: any }> = [];

  traverse(ast, {
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      if (t.isIdentifier(path.node.id) && path.node.id.name === variableName) {
        flow.push({
          type: 'declaration',
          line: path.node.loc?.start.line,
          value: path.node.init,
        });
      }
    },
    AssignmentExpression(path: NodePath<t.AssignmentExpression>) {
      if (t.isIdentifier(path.node.left) && path.node.left.name === variableName) {
        flow.push({
          type: 'assignment',
          line: path.node.loc?.start.line,
          value: path.node.right,
        });
      }
    },
  });

  return flow;
}
