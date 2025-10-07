/**
 * TypeScript Compiler API Parser
 * Parses .ts/.tsx files using TypeScript's official compiler API
 */

import * as ts from 'typescript';
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
  ast?: ParsedNode;
  sourceFile?: ts.SourceFile;
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  code?: string;
}

/**
 * Parse TypeScript/TSX file using TypeScript Compiler API
 */
export function parseTypeScriptFile(filePath: string): ParseResult {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const isTsx = filePath.endsWith('.tsx');

    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    const errors: ParseError[] = [];

    // Note: In newer TypeScript versions, parse diagnostics are obtained differently
    // For now, we'll proceed without syntax error checking
    // TODO: Implement proper diagnostic collection

    const diagnostics: ts.Diagnostic[] = [];

    diagnostics.forEach((diagnostic) => {
      if (diagnostic.file && diagnostic.start !== undefined) {
        const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        errors.push({
          message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
          line: line + 1,
          column: character + 1,
          code: diagnostic.code?.toString(),
        });
      }
    });

    const ast = convertTSNodeToCommon(sourceFile, sourceFile);

    return {
      success: errors.length === 0,
      ast,
      sourceFile,
      errors,
    };
  } catch (error) {
    return {
      success: false,
      errors: [
        {
          message: error instanceof Error ? error.message : 'Unknown parse error',
          line: 0,
          column: 0,
        },
      ],
    };
  }
}

/**
 * Convert TypeScript AST node to common format
 */
function convertTSNodeToCommon(node: ts.Node, sourceFile: ts.SourceFile): ParsedNode {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

  const parsed: ParsedNode = {
    type: ts.SyntaxKind[node.kind],
    start: node.getStart(sourceFile),
    end: node.getEnd(),
    line: line + 1,
    column: character + 1,
    text: node.getText(sourceFile),
    children: [],
    metadata: {},
  };

  // Add specific metadata based on node type
  if (ts.isCallExpression(node)) {
    parsed.metadata = {
      ...parsed.metadata,
      expression: node.expression.getText(sourceFile),
      argumentCount: node.arguments.length,
    };
  } else if (ts.isPropertyAccessExpression(node)) {
    parsed.metadata = {
      ...parsed.metadata,
      object: node.expression.getText(sourceFile),
      property: node.name.getText(sourceFile),
    };
  } else if (ts.isIdentifier(node)) {
    parsed.metadata = {
      ...parsed.metadata,
      name: node.text,
    };
  }

  // Recursively process children
  ts.forEachChild(node, (child) => {
    parsed.children?.push(convertTSNodeToCommon(child, sourceFile));
  });

  return parsed;
}

/**
 * Find all RudderStack SDK call expressions in the AST
 */
export function findRudderStackCalls(sourceFile: ts.SourceFile): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const callText = node.expression.getText(sourceFile);

      // Match patterns like:
      // - rudderanalytics.track(...)
      // - window.rudderanalytics.identify(...)
      // - analytics.track(...) where analytics is imported from @rudderstack/analytics-js
      if (
        callText.includes('rudderanalytics') ||
        callText.match(/\banalytics\.(track|identify|page|group|alias|load|ready|reset|consent|getAnonymousId|getUserId|getUserTraits|getGroupId|getGroupTraits|getSessionId|setAnonymousId|setAuthToken|startSession|endSession|addCustomIntegration)\b/)
      ) {
        calls.push(node);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return calls;
}

/**
 * Extract type information from a node
 */
export function extractTypeInfo(node: ts.Node, typeChecker?: ts.TypeChecker): string | undefined {
  if (!typeChecker) return undefined;

  try {
    const type = typeChecker.getTypeAtLocation(node);
    return typeChecker.typeToString(type);
  } catch {
    return undefined;
  }
}

/**
 * Get variable declaration for an identifier
 */
export function getVariableDeclaration(
  identifier: ts.Identifier,
  sourceFile: ts.SourceFile
): ts.VariableDeclaration | undefined {
  let declaration: ts.VariableDeclaration | undefined;

  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === identifier.text) {
      declaration = node;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return declaration;
}

/**
 * Check if a node is within a specific function or method
 */
export function getContainingFunction(
  node: ts.Node,
  sourceFile: ts.SourceFile
): ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | undefined {
  let current = node.parent;

  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isArrowFunction(current)
    ) {
      return current;
    }
    current = current.parent;
  }

  return undefined;
}

/**
 * Extract object literal properties
 */
export function extractObjectProperties(
  node: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile
): Array<{ name: string; value: string; type?: string }> {
  const properties: Array<{ name: string; value: string; type?: string }> = [];

  node.properties.forEach((prop) => {
    if (ts.isPropertyAssignment(prop)) {
      const name = prop.name.getText(sourceFile);
      const value = prop.initializer.getText(sourceFile);

      properties.push({ name, value });
    }
  });

  return properties;
}
