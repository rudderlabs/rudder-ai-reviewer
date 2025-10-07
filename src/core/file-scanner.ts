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
export async function scanFilesForSDKUsage(repoPath: string): Promise<FileScanResult> {
  core.info(`Scanning files in ${repoPath} for RudderStack SDK usage...`);

  const files = await findJavaScriptFiles(repoPath);
  core.info(`Found ${files.length} JavaScript/TypeScript files to scan`);

  let totalScanned = 0;
  let filesWithSDK = 0;
  const allMethodCalls: SDKMethodCall[] = [];

  for (const file of files) {
    try {
      const methodCalls = await scanFileForSDKCalls(file);
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
async function scanFileForSDKCalls(filePath: string): Promise<SDKMethodCall[]> {
  let content = await fs.readFile(filePath, 'utf-8');
  const methodCalls: SDKMethodCall[] = [];

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

    traverse(ast, {
      CallExpression(path) {
        const { node } = path;

        // Check if this is a call to rudderanalytics.method()
        if (t.isMemberExpression(node.callee)) {
          const object = node.callee.object;
          const property = node.callee.property;

          // Check for rudderanalytics.track(), window.rudderanalytics.page(), etc.
          const isRudderObject =
            (t.isIdentifier(object) && object.name === 'rudderanalytics') ||
            (t.isMemberExpression(object) &&
              t.isIdentifier(object.object) &&
              object.object.name === 'window' &&
              t.isIdentifier(object.property) &&
              object.property.name === 'rudderanalytics');

          if (isRudderObject && t.isIdentifier(property) && RUDDERSTACK_METHODS.includes(property.name)) {
            const method = property.name as SDKMethodCall['method'];
            const line = (node.loc?.start.line || 0) + lineOffset;
            const column = node.loc?.start.column || 0;

            // Extract code snippet (the full call expression)
            const codeLines = content.split('\n');
            const snippet = codeLines[line - 1]?.trim() || '';

            // Parse arguments
            const args = node.arguments.map((arg) => parseArgument(arg, content));

            methodCalls.push({
              file: filePath,
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
function parseArgument(arg: t.Node, sourceCode: string): SDKArgument {
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

  // Identifier (variable reference)
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
