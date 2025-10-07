import * as fs from 'fs/promises';
import * as path from 'path';
import * as core from '@actions/core';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

/**
 * Represents a RudderStack SDK method call found in code
 */
export interface SDKMethodCall {
  file: string;
  line: number;
  column: number;
  method: 'track' | 'identify' | 'page' | 'group' | 'alias' | 'reset' | 'load' | 'ready' | 'setAnonymousId';
  code: string;
  arguments: SDKArgument[];
}

/**
 * Represents an argument passed to an SDK method
 */
export interface SDKArgument {
  type: 'string' | 'number' | 'boolean' | 'object' | 'null' | 'undefined' | 'identifier' | 'template' | 'unknown';
  value?: string | number | boolean | null | Record<string, unknown>;
  raw: string;
  isStatic: boolean; // Can we statically analyze this?
}

/**
 * Result of scanning files for SDK usage
 */
export interface FileScanResult {
  totalFilesScanned: number;
  filesWithSDK: number;
  methodCalls: SDKMethodCall[];
}

const SUPPORTED_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.html', '.htm'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const RUDDERSTACK_METHODS = [
  'track',
  'identify',
  'page',
  'group',
  'alias',
  'reset',
  'load',
  'ready',
  'setAnonymousId',
];

/**
 * Scans repository for RudderStack SDK method calls
 */
export async function scanFilesForSDKUsage(scanPath: string, repoRoot?: string): Promise<FileScanResult> {
  core.info(`Scanning files in ${scanPath} for RudderStack SDK usage...`);

  // Use repo root for relative paths, or default to scan path
  const pathBase = repoRoot || scanPath;

  const files = await findJavaScriptFiles(scanPath);
  core.info(`Found ${files.length} JavaScript/TypeScript files to scan`);

  let totalScanned = 0;
  let filesWithSDK = 0;
  const allMethodCalls: SDKMethodCall[] = [];

  for (const file of files) {
    try {
      const methodCalls = await scanFileForSDKCalls(file, pathBase);
      totalScanned++;

      if (methodCalls.length > 0) {
        filesWithSDK++;
        allMethodCalls.push(...methodCalls);
        core.debug(`Found ${methodCalls.length} SDK calls in ${file}`);
      }
    } catch (error) {
      core.warning(`Failed to scan ${file}: ${error}`);
    }
  }

  core.info(`Scanned ${totalScanned} files, found SDK usage in ${filesWithSDK} files`);
  core.info(`Total SDK method calls found: ${allMethodCalls.length}`);

  return {
    totalFilesScanned: totalScanned,
    filesWithSDK,
    methodCalls: allMethodCalls,
  };
}

/**
 * Recursively finds all JavaScript/TypeScript files in a directory
 */
async function findJavaScriptFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Skip common directories we don't want to scan
    if (entry.isDirectory()) {
      const dirName = entry.name;
      if (
        dirName === 'node_modules' ||
        dirName === '.git' ||
        dirName === 'dist' ||
        dirName === 'build' ||
        dirName === 'coverage' ||
        dirName === '.next' ||
        dirName === '.cache'
      ) {
        continue;
      }
      files.push(...(await findJavaScriptFiles(fullPath)));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        // Check file size
        const stats = await fs.stat(fullPath);
        if (stats.size <= MAX_FILE_SIZE) {
          files.push(fullPath);
        } else {
          core.warning(`Skipping ${fullPath} (size: ${stats.size} bytes exceeds limit)`);
        }
      }
    }
  }

  return files;
}

/**
 * Extracts JavaScript from HTML <script> tags
 */
function extractScriptFromHTML(html: string): { script: string; lineOffset: number } {
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  const scripts: string[] = [];
  let lineOffset = 0;
  let match;

  while ((match = scriptRegex.exec(html)) !== null) {
    const scriptContent = match[1];
    if (scriptContent.trim()) {
      // Calculate line offset for first script tag
      if (scripts.length === 0) {
        const beforeScript = html.substring(0, match.index);
        lineOffset = (beforeScript.match(/\n/g) || []).length;
      }
      scripts.push(scriptContent);
    }
  }

  return {
    script: scripts.join('\n'),
    lineOffset,
  };
}

/**
 * Scans a single file for RudderStack SDK method calls
 */
async function scanFileForSDKCalls(filePath: string, repoPath: string): Promise<SDKMethodCall[]> {
  let content = await fs.readFile(filePath, 'utf-8');
  const methodCalls: SDKMethodCall[] = [];

  // Convert absolute path to relative path from repo root
  const relativePath = path.relative(repoPath, filePath);

  // Extract JavaScript from HTML <script> tags if this is an HTML file
  const ext = path.extname(filePath);
  let lineOffset = 0;
  if (ext === '.html' || ext === '.htm') {
    const extracted = extractScriptFromHTML(content);
    content = extracted.script;
    lineOffset = extracted.lineOffset;
  }

  try {
    const ast = parser.parse(content, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true,
    });

    // Track variable names that hold RudderAnalytics instances
    const rudderAnalyticsVars = new Set<string>();
    // Track function names that return RudderAnalytics instances
    const rudderAnalyticsFunctions = new Set<string>();

    // Collect all variable assignments and function definitions for iterative analysis
    interface VariableAssignment {
      varName: string;
      init: t.Node;
    }
    interface FunctionDef {
      funcName: string;
      path: any;
    }

    const variableAssignments: VariableAssignment[] = [];
    const functionDefs: FunctionDef[] = [];

    // First pass: Collect all variable assignments (declarations and assignments) and function definitions
    traverse(ast, {
      VariableDeclarator(path) {
        const { node } = path;
        if (t.isIdentifier(node.id) && node.init) {
          variableAssignments.push({
            varName: node.id.name,
            init: node.init,
          });
        }
      },
      AssignmentExpression(path) {
        const { node } = path;
        // Track assignments like: analytics = new RudderAnalytics()
        if (t.isIdentifier(node.left)) {
          variableAssignments.push({
            varName: node.left.name,
            init: node.right,
          });
        }
      },
      FunctionDeclaration(path) {
        const { node } = path;
        if (t.isIdentifier(node.id)) {
          functionDefs.push({
            funcName: node.id.name,
            path,
          });
        }
      },
      ArrowFunctionExpression(path) {
        const parent = path.parent;
        if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
          functionDefs.push({
            funcName: parent.id.name,
            path,
          });
        }
      },
    });

    // Iteratively analyze until no new variables/functions are discovered
    let changed = true;
    let iterations = 0;
    const MAX_ITERATIONS = 10; // Safety limit

    while (changed && iterations < MAX_ITERATIONS) {
      changed = false;
      iterations++;

      // Check variable assignments
      for (const { varName, init } of variableAssignments) {
        if (rudderAnalyticsVars.has(varName)) {
          continue; // Already tracked
        }

        // Direct instantiation: const analytics = new RudderAnalytics()
        if (
          t.isNewExpression(init) &&
          t.isIdentifier(init.callee) &&
          init.callee.name === 'RudderAnalytics'
        ) {
          rudderAnalyticsVars.add(varName);
          core.debug(`[Iteration ${iterations}] Detected RudderAnalytics instance variable: ${varName}`);
          changed = true;
          continue;
        }

        // Assignment from tracked variable: const x = analytics
        if (t.isIdentifier(init) && rudderAnalyticsVars.has(init.name)) {
          rudderAnalyticsVars.add(varName);
          core.debug(`[Iteration ${iterations}] Detected variable assigned from tracked variable: ${varName} = ${init.name}`);
          changed = true;
          continue;
        }

        // Assignment from function call: const rudder = getAnalytics()
        if (
          t.isCallExpression(init) &&
          t.isIdentifier(init.callee) &&
          rudderAnalyticsFunctions.has(init.callee.name)
        ) {
          rudderAnalyticsVars.add(varName);
          core.debug(`[Iteration ${iterations}] Detected variable assigned from RudderAnalytics function: ${varName} = ${init.callee.name}()`);
          changed = true;
          continue;
        }

        // Conditional expression: const x = condition ? analytics : null
        if (t.isConditionalExpression(init)) {
          const consequent = init.consequent;
          const alternate = init.alternate;
          if (
            (t.isIdentifier(consequent) && rudderAnalyticsVars.has(consequent.name)) ||
            (t.isIdentifier(alternate) && rudderAnalyticsVars.has(alternate.name))
          ) {
            rudderAnalyticsVars.add(varName);
            core.debug(`[Iteration ${iterations}] Detected variable from conditional with RudderAnalytics: ${varName}`);
            changed = true;
            continue;
          }
        }

        // Logical expression: const x = analytics || fallback
        if (t.isLogicalExpression(init)) {
          const left = init.left;
          const right = init.right;
          if (
            (t.isIdentifier(left) && rudderAnalyticsVars.has(left.name)) ||
            (t.isIdentifier(right) && rudderAnalyticsVars.has(right.name))
          ) {
            rudderAnalyticsVars.add(varName);
            core.debug(`[Iteration ${iterations}] Detected variable from logical expression with RudderAnalytics: ${varName}`);
            changed = true;
            continue;
          }
        }
      }

      // Check function definitions
      for (const { funcName, path } of functionDefs) {
        if (rudderAnalyticsFunctions.has(funcName)) {
          continue; // Already tracked
        }

        let returnsRudderAnalytics = false;

        path.traverse({
          ReturnStatement(returnPath: any) {
            const returnNode = returnPath.node;
            if (!returnNode.argument) return;

            // Returns new RudderAnalytics()
            if (
              t.isNewExpression(returnNode.argument) &&
              t.isIdentifier(returnNode.argument.callee) &&
              returnNode.argument.callee.name === 'RudderAnalytics'
            ) {
              returnsRudderAnalytics = true;
              return;
            }

            // Returns tracked variable
            if (t.isIdentifier(returnNode.argument) && rudderAnalyticsVars.has(returnNode.argument.name)) {
              returnsRudderAnalytics = true;
              return;
            }

            // Returns call to tracked function
            if (
              t.isCallExpression(returnNode.argument) &&
              t.isIdentifier(returnNode.argument.callee) &&
              rudderAnalyticsFunctions.has(returnNode.argument.callee.name)
            ) {
              returnsRudderAnalytics = true;
              return;
            }

            // Returns conditional with RudderAnalytics
            if (t.isConditionalExpression(returnNode.argument)) {
              const consequent = returnNode.argument.consequent;
              const alternate = returnNode.argument.alternate;
              if (
                (t.isIdentifier(consequent) && rudderAnalyticsVars.has(consequent.name)) ||
                (t.isIdentifier(alternate) && rudderAnalyticsVars.has(alternate.name)) ||
                (t.isCallExpression(consequent) && t.isIdentifier(consequent.callee) && rudderAnalyticsFunctions.has(consequent.callee.name)) ||
                (t.isCallExpression(alternate) && t.isIdentifier(alternate.callee) && rudderAnalyticsFunctions.has(alternate.callee.name))
              ) {
                returnsRudderAnalytics = true;
                return;
              }
            }

            // Returns logical expression with RudderAnalytics
            if (t.isLogicalExpression(returnNode.argument)) {
              const left = returnNode.argument.left;
              const right = returnNode.argument.right;
              if (
                (t.isIdentifier(left) && rudderAnalyticsVars.has(left.name)) ||
                (t.isIdentifier(right) && rudderAnalyticsVars.has(right.name)) ||
                (t.isCallExpression(left) && t.isIdentifier(left.callee) && rudderAnalyticsFunctions.has(left.callee.name)) ||
                (t.isCallExpression(right) && t.isIdentifier(right.callee) && rudderAnalyticsFunctions.has(right.callee.name))
              ) {
                returnsRudderAnalytics = true;
                return;
              }
            }
          },
        });

        if (returnsRudderAnalytics) {
          rudderAnalyticsFunctions.add(funcName);
          core.debug(`[Iteration ${iterations}] Detected function returning RudderAnalytics: ${funcName}`);
          changed = true;
        }
      }
    }

    if (iterations >= MAX_ITERATIONS) {
      core.warning(`Reached maximum iterations (${MAX_ITERATIONS}) while analyzing RudderAnalytics variable propagation`);
    }

    core.debug(`Completed variable propagation analysis in ${iterations} iteration(s)`);
    core.debug(`Tracked variables: ${Array.from(rudderAnalyticsVars).join(', ')}`);
    core.debug(`Tracked functions: ${Array.from(rudderAnalyticsFunctions).join(', ')}`);

    // Final pass: Find method calls on rudderanalytics or any tracked variables
    traverse(ast, {
      CallExpression(path) {
        const { node } = path;

        // Check if this is a call to <object>.method()
        if (t.isMemberExpression(node.callee)) {
          const object = node.callee.object;
          const property = node.callee.property;

          // Check for:
          // 1. rudderanalytics.track()
          // 2. window.rudderanalytics.page()
          // 3. analytics.track() where analytics = new RudderAnalytics()
          // 4. rudder.track() where rudder = getAnalytics() and getAnalytics() returns RudderAnalytics
          const isRudderObject =
            (t.isIdentifier(object) && object.name === 'rudderanalytics') ||
            (t.isIdentifier(object) && rudderAnalyticsVars.has(object.name)) ||
            (t.isMemberExpression(object) &&
              t.isIdentifier(object.object) &&
              object.object.name === 'window' &&
              t.isIdentifier(object.property) &&
              object.property.name === 'rudderanalytics');

          if (isRudderObject && t.isIdentifier(property) && RUDDERSTACK_METHODS.includes(property.name)) {
            const method = property.name as SDKMethodCall['method'];
            const astLine = node.loc?.start.line || 0;
            const line = astLine + lineOffset;
            const column = node.loc?.start.column || 0;

            // Extract code snippet (from the parsed content, not including line offset)
            const codeLines = content.split('\n');
            const snippet = codeLines[astLine - 1]?.trim() || '';

            // Parse arguments with variable tracking from the current scope
            const args = node.arguments.map((arg) => parseArgument(arg, content, path));

            methodCalls.push({
              file: relativePath,
              line,
              column,
              method,
              code: snippet,
              arguments: args,
            });
          }
        }
      },
    });
  } catch (error) {
    core.debug(`Failed to parse ${filePath}: ${error}`);
  }

  return methodCalls;
}

/**
 * Parses an argument node to extract type and value information
 */
function parseArgument(arg: t.Node, sourceCode: string, nodePath?: any): SDKArgument {
  // String literal
  if (t.isStringLiteral(arg)) {
    return {
      type: 'string',
      value: arg.value,
      raw: JSON.stringify(arg.value),
      isStatic: true,
    };
  }

  // Numeric literal
  if (t.isNumericLiteral(arg)) {
    return {
      type: 'number',
      value: arg.value,
      raw: arg.value.toString(),
      isStatic: true,
    };
  }

  // Boolean literal
  if (t.isBooleanLiteral(arg)) {
    return {
      type: 'boolean',
      value: arg.value,
      raw: arg.value.toString(),
      isStatic: true,
    };
  }

  // Null literal
  if (t.isNullLiteral(arg)) {
    return {
      type: 'null',
      value: null,
      raw: 'null',
      isStatic: true,
    };
  }

  // Undefined
  if (t.isIdentifier(arg) && arg.name === 'undefined') {
    return {
      type: 'undefined',
      value: undefined,
      raw: 'undefined',
      isStatic: true,
    };
  }

  // Object expression
  if (t.isObjectExpression(arg)) {
    const properties = parseObjectExpression(arg);
    return {
      type: 'object',
      value: properties,
      raw: getCodeSnippet(arg, sourceCode),
      isStatic: isStaticObject(arg),
    };
  }

  // Template literal
  if (t.isTemplateLiteral(arg)) {
    if (arg.expressions.length === 0) {
      // Static template (no expressions)
      const value = arg.quasis.map((q) => q.value.cooked).join('');
      return {
        type: 'string',
        value,
        raw: `\`${value}\``,
        isStatic: true,
      };
    }
    return {
      type: 'template',
      raw: getCodeSnippet(arg, sourceCode),
      isStatic: false,
    };
  }

  // Identifier (variable reference) - try to resolve it
  if (t.isIdentifier(arg) && nodePath) {
    const resolved = resolveIdentifier(arg.name, nodePath);
    if (resolved) {
      // Mark as static since we resolved it
      return { ...resolved, isStatic: true };
    }

    return {
      type: 'identifier',
      raw: arg.name,
      isStatic: false,
    };
  }

  // Identifier without path (can't resolve)
  if (t.isIdentifier(arg)) {
    return {
      type: 'identifier',
      raw: arg.name,
      isStatic: false,
    };
  }

  // Unknown/complex expression
  return {
    type: 'unknown',
    raw: getCodeSnippet(arg, sourceCode),
    isStatic: false,
  };
}

/**
 * Tries to resolve an identifier to its constant value
 * Simple constant propagation for const/let declarations in the same scope
 */
function resolveIdentifier(name: string, nodePath: any): SDKArgument | null {
  try {
    // Get the binding for this identifier
    const binding = nodePath.scope.getBinding(name);

    if (!binding || !binding.constant) {
      // Not a constant binding
      return null;
    }

    const bindingPath = binding.path;

    // Check if it's a variable declarator (const x = 1)
    if (bindingPath.isVariableDeclarator() && bindingPath.node.init) {
      const init = bindingPath.node.init;

      // Recursively parse the initializer
      if (t.isStringLiteral(init)) {
        return {
          type: 'string',
          value: init.value,
          raw: JSON.stringify(init.value),
          isStatic: true,
        };
      }

      if (t.isNumericLiteral(init)) {
        return {
          type: 'number',
          value: init.value,
          raw: init.value.toString(),
          isStatic: true,
        };
      }

      if (t.isBooleanLiteral(init)) {
        return {
          type: 'boolean',
          value: init.value,
          raw: init.value.toString(),
          isStatic: true,
        };
      }

      if (t.isNullLiteral(init)) {
        return {
          type: 'null',
          value: null,
          raw: 'null',
          isStatic: true,
        };
      }

      if (t.isObjectExpression(init)) {
        const properties = parseObjectExpression(init);
        return {
          type: 'object',
          value: properties,
          raw: '{ ... }',
          isStatic: isStaticObject(init),
        };
      }
    }
  } catch (error) {
    // Failed to resolve, return null
    core.debug(`Failed to resolve identifier ${name}: ${error}`);
  }

  return null;
}

/**
 * Parses an object expression into a key-value map
 */
function parseObjectExpression(node: t.ObjectExpression): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const prop of node.properties) {
    if (t.isObjectProperty(prop)) {
      let key: string;

      // Get property key
      if (t.isIdentifier(prop.key)) {
        key = prop.key.name;
      } else if (t.isStringLiteral(prop.key)) {
        key = prop.key.value;
      } else {
        continue; // Skip computed properties
      }

      // Get property value (only static values)
      if (t.isStringLiteral(prop.value)) {
        result[key] = prop.value.value;
      } else if (t.isNumericLiteral(prop.value)) {
        result[key] = prop.value.value;
      } else if (t.isBooleanLiteral(prop.value)) {
        result[key] = prop.value.value;
      } else if (t.isNullLiteral(prop.value)) {
        result[key] = null;
      } else if (t.isObjectExpression(prop.value)) {
        result[key] = parseObjectExpression(prop.value);
      } else {
        result[key] = '<non-static>';
      }
    }
  }

  return result;
}

/**
 * Checks if an object expression contains only static values
 */
function isStaticObject(node: t.ObjectExpression): boolean {
  return node.properties.every((prop) => {
    if (t.isObjectProperty(prop)) {
      return (
        t.isStringLiteral(prop.value) ||
        t.isNumericLiteral(prop.value) ||
        t.isBooleanLiteral(prop.value) ||
        t.isNullLiteral(prop.value) ||
        (t.isObjectExpression(prop.value) && isStaticObject(prop.value))
      );
    }
    return false;
  });
}

/**
 * Extracts code snippet for a node from source code
 */
function getCodeSnippet(node: t.Node, sourceCode: string): string {
  if (!node.loc) return '<unknown>';

  const lines = sourceCode.split('\n');
  const startLine = node.loc.start.line - 1;
  const endLine = node.loc.end.line - 1;

  if (startLine === endLine) {
    const line = lines[startLine];
    return line.substring(node.loc.start.column, node.loc.end.column);
  }

  // Multi-line node - just return first line with ellipsis
  const firstLine = lines[startLine].substring(node.loc.start.column);
  return `${firstLine}...`;
}
