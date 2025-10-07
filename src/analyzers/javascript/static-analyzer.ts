/**
 * Static Analyzer
 * Deep analysis of RudderStack SDK usage with variable tracking and control flow
 */

import { parseFile, RudderStackCallInfo, extractCallInfo } from './parsers';
import * as ts from 'typescript';
import * as t from '@babel/types';
import traverse from '@babel/traverse';

export interface StaticAnalysisResult {
  calls: AnalyzedCall[];
  variables: VariableTracker;
  patterns: DetectedPattern[];
  complexity: ComplexityMetrics;
}

export interface AnalyzedCall extends RudderStackCallInfo {
  file: string;
  confidence: 'high' | 'medium' | 'low';
  issues: string[];
  requiresAIAnalysis: boolean;
  context?: CallContext;
}

export interface CallContext {
  containingFunction?: string;
  conditionalDepth: number;
  loopDepth: number;
  isAsync: boolean;
  scope: 'global' | 'function' | 'block';
}

export interface VariableTracker {
  eventNames: Map<string, VariableInfo>;
  properties: Map<string, VariableInfo>;
}

export interface VariableInfo {
  name: string;
  type: string;
  value?: any;
  isDynamic: boolean;
  usageLocations: Array<{ line: number; column: number }>;
  mutations: Array<{ line: number; value?: any }>;
}

export interface DetectedPattern {
  type: 'dynamic_event' | 'computed_property' | 'conditional_tracking' | 'loop_tracking';
  description: string;
  file: string;
  line: number;
  requiresAIAnalysis: boolean;
}

export interface ComplexityMetrics {
  totalCalls: number;
  dynamicCalls: number;
  staticCalls: number;
  nestedDepth: number;
  conditionalCalls: number;
  loopCalls: number;
}

/**
 * Perform static analysis on a file
 */
export async function analyzeFile(filePath: string): Promise<StaticAnalysisResult> {
  const parseResult = parseFile(filePath);

  if (!parseResult.success) {
    return {
      calls: [],
      variables: { eventNames: new Map(), properties: new Map() },
      patterns: [],
      complexity: {
        totalCalls: 0,
        dynamicCalls: 0,
        staticCalls: 0,
        nestedDepth: 0,
        conditionalCalls: 0,
        loopCalls: 0,
      },
    };
  }

  const calls: AnalyzedCall[] = [];
  const variables: VariableTracker = {
    eventNames: new Map(),
    properties: new Map(),
  };
  const patterns: DetectedPattern[] = [];

  // Track variables first
  if (parseResult.fileType === 'typescript') {
    trackTypeScriptVariables(parseResult.ast as ts.SourceFile, variables);
  } else {
    trackBabelVariables(parseResult.ast as t.File, variables);
  }

  // Analyze each RudderStack call
  for (const callInfo of parseResult.rudderStackCalls) {
    const analyzedCall = analyzeCall(callInfo, parseResult, variables, filePath);
    calls.push(analyzedCall);

    // Detect patterns
    if (analyzedCall.hasDynamicEventName) {
      patterns.push({
        type: 'dynamic_event',
        description: `Dynamic event name detected in ${analyzedCall.method} call`,
        file: filePath,
        line: analyzedCall.line,
        requiresAIAnalysis: true,
      });
    }

    if (analyzedCall.context && analyzedCall.context.loopDepth > 0) {
      patterns.push({
        type: 'loop_tracking',
        description: `${analyzedCall.method} call inside loop (depth: ${analyzedCall.context.loopDepth})`,
        file: filePath,
        line: analyzedCall.line,
        requiresAIAnalysis: false,
      });
    }

    if (analyzedCall.context && analyzedCall.context.conditionalDepth > 0) {
      patterns.push({
        type: 'conditional_tracking',
        description: `${analyzedCall.method} call inside conditional (depth: ${analyzedCall.context.conditionalDepth})`,
        file: filePath,
        line: analyzedCall.line,
        requiresAIAnalysis: false,
      });
    }
  }

  // Calculate complexity metrics
  const complexity = calculateComplexity(calls, patterns);

  return {
    calls,
    variables,
    patterns,
    complexity,
  };
}

/**
 * Analyze a single RudderStack call
 */
function analyzeCall(
  callInfo: any,
  parseResult: any,
  variables: VariableTracker,
  filePath: string
): AnalyzedCall {
  const issues: string[] = [];
  let confidence: 'high' | 'medium' | 'low' = 'high';
  let requiresAIAnalysis = false;

  // Check if event name is dynamic
  if (callInfo.method === 'track' || callInfo.method === 'page') {
    if (!callInfo.arguments || callInfo.arguments.length === 0) {
      issues.push('Missing event name argument');
      confidence = 'high';
    } else {
      const firstArg = callInfo.arguments[0];
      if (typeof firstArg !== 'string') {
        // Dynamic event name
        confidence = 'medium';
        requiresAIAnalysis = true;
        issues.push('Dynamic event name requires runtime analysis');
      }
    }
  }

  // Check if properties are dynamic
  if (callInfo.arguments && callInfo.arguments.length > 1) {
    const propsArg = callInfo.arguments[1];
    if (propsArg && typeof propsArg === 'object' && propsArg.isDynamic) {
      confidence = 'medium';
      requiresAIAnalysis = true;
    }
  }

  // Get context
  const context = getCallContext(parseResult, callInfo.line);

  return {
    ...callInfo,
    file: filePath,
    confidence,
    issues,
    requiresAIAnalysis,
    context,
  };
}

/**
 * Get context for a call (containing function, loop/conditional depth, etc.)
 */
function getCallContext(parseResult: any, line: number): CallContext {
  const context: CallContext = {
    conditionalDepth: 0,
    loopDepth: 0,
    isAsync: false,
    scope: 'global',
  };

  if (parseResult.fileType === 'typescript') {
    // TypeScript analysis would go here
    // For now, return basic context
  } else if (parseResult.fileType === 'javascript') {
    // Babel analysis
    let currentDepth = 0;
    let loopDepth = 0;
    let foundFunction: string | undefined;

    traverse(parseResult.ast, {
      enter(path: any) {
        // Track conditionals
        if (path.isIfStatement() || path.isConditionalExpression()) {
          currentDepth++;
        }

        // Track loops
        if (
          path.isForStatement() ||
          path.isWhileStatement() ||
          path.isDoWhileStatement() ||
          path.isForInStatement() ||
          path.isForOfStatement()
        ) {
          loopDepth++;
        }

        // Track functions
        if (
          path.isFunctionDeclaration() ||
          path.isFunctionExpression() ||
          path.isArrowFunctionExpression()
        ) {
          if (path.node.loc && path.node.loc.start.line <= line && path.node.loc.end.line >= line) {
            if (path.isFunctionDeclaration() && path.node.id) {
              foundFunction = path.node.id.name;
            }
            context.isAsync = path.node.async || false;
            context.scope = 'function';
          }
        }
      },
      exit(path: any) {
        if (path.isIfStatement() || path.isConditionalExpression()) {
          currentDepth--;
        }
        if (
          path.isForStatement() ||
          path.isWhileStatement() ||
          path.isDoWhileStatement() ||
          path.isForInStatement() ||
          path.isForOfStatement()
        ) {
          loopDepth--;
        }
      },
    });

    context.conditionalDepth = currentDepth;
    context.loopDepth = loopDepth;
    context.containingFunction = foundFunction;
  }

  return context;
}

/**
 * Track TypeScript variables
 */
function trackTypeScriptVariables(sourceFile: ts.SourceFile, tracker: VariableTracker): void {
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node)) {
      if (ts.isIdentifier(node.name)) {
        const varName = node.name.text;
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

        let value: any;
        let isDynamic = true;

        if (node.initializer) {
          if (ts.isStringLiteral(node.initializer)) {
            value = node.initializer.text;
            isDynamic = false;
          } else if (ts.isNumericLiteral(node.initializer)) {
            value = Number(node.initializer.text);
            isDynamic = false;
          }
        }

        const varInfo: VariableInfo = {
          name: varName,
          type: 'unknown',
          value,
          isDynamic,
          usageLocations: [{ line: line + 1, column: character + 1 }],
          mutations: [],
        };

        // Heuristic: if variable name contains 'event' or 'name', track as event name
        if (varName.toLowerCase().includes('event') || varName.toLowerCase().includes('name')) {
          tracker.eventNames.set(varName, varInfo);
        } else {
          tracker.properties.set(varName, varInfo);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

/**
 * Track Babel variables
 */
function trackBabelVariables(ast: t.File, tracker: VariableTracker): void {
  traverse(ast, {
    VariableDeclarator(path: any) {
      if (t.isIdentifier(path.node.id)) {
        const varName = path.node.id.name;
        const line = path.node.loc?.start.line || 0;
        const column = path.node.loc?.start.column || 0;

        let value: any;
        let isDynamic = true;

        if (path.node.init) {
          if (t.isStringLiteral(path.node.init)) {
            value = path.node.init.value;
            isDynamic = false;
          } else if (t.isNumericLiteral(path.node.init)) {
            value = path.node.init.value;
            isDynamic = false;
          }
        }

        const varInfo: VariableInfo = {
          name: varName,
          type: t.isStringLiteral(path.node.init)
            ? 'string'
            : t.isNumericLiteral(path.node.init)
              ? 'number'
              : 'unknown',
          value,
          isDynamic,
          usageLocations: [{ line, column }],
          mutations: [],
        };

        if (varName.toLowerCase().includes('event') || varName.toLowerCase().includes('name')) {
          tracker.eventNames.set(varName, varInfo);
        } else {
          tracker.properties.set(varName, varInfo);
        }
      }
    },
    AssignmentExpression(path: any) {
      if (t.isIdentifier(path.node.left)) {
        const varName = path.node.left.name;
        const line = path.node.loc?.start.line || 0;

        // Track mutation
        const eventVar = tracker.eventNames.get(varName);
        const propVar = tracker.properties.get(varName);

        if (eventVar) {
          eventVar.mutations.push({ line, value: undefined });
          eventVar.isDynamic = true;
        }

        if (propVar) {
          propVar.mutations.push({ line, value: undefined });
          propVar.isDynamic = true;
        }
      }
    },
  });
}

/**
 * Calculate complexity metrics
 */
function calculateComplexity(calls: AnalyzedCall[], patterns: DetectedPattern[]): ComplexityMetrics {
  const dynamicCalls = calls.filter((c) => c.hasDynamicEventName || c.hasDynamicProperties).length;
  const staticCalls = calls.length - dynamicCalls;
  const conditionalCalls = calls.filter((c) => c.context && c.context.conditionalDepth > 0).length;
  const loopCalls = calls.filter((c) => c.context && c.context.loopDepth > 0).length;

  const maxNestingDepth = Math.max(
    ...calls.map((c) => (c.context ? c.context.conditionalDepth + c.context.loopDepth : 0)),
    0
  );

  return {
    totalCalls: calls.length,
    dynamicCalls,
    staticCalls,
    nestedDepth: maxNestingDepth,
    conditionalCalls,
    loopCalls,
  };
}
