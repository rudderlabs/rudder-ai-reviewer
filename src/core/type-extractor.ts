/**
 * Extracts and analyzes TypeScript type definitions from @rudderstack/analytics-js
 */

import * as core from '@actions/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as ts from 'typescript';

const execAsync = promisify(exec);

export interface MethodSignature {
  method: string;
  parameters: ParameterInfo[];
  returnType: string;
}

export interface ParameterInfo {
  name: string;
  type: string;
  optional: boolean;
  description?: string;
}

/**
 * Gets method signatures for RudderStack SDK by analyzing its TypeScript types
 */
export async function getSDKMethodSignatures(version: string): Promise<Map<string, MethodSignature>> {
  core.info(`Extracting type information for @rudderstack/analytics-js@${version}...`);

  try {
    // Create temporary directory for package download
    const tempDir = path.join(process.cwd(), '.rudderstack-temp-types');
    await fs.mkdir(tempDir, { recursive: true });

    // Download the specific version of the package
    core.debug(`Downloading @rudderstack/analytics-js@${version} to ${tempDir}`);
    await execAsync(`npm install --prefix "${tempDir}" --no-save @rudderstack/analytics-js@${version}`, {
      cwd: tempDir,
    });

    // Find the package's type definition file
    const packagePath = path.join(tempDir, 'node_modules', '@rudderstack', 'analytics-js');
    const packageJson = JSON.parse(await fs.readFile(path.join(packagePath, 'package.json'), 'utf-8'));

    // Get types entry point (usually from "types" or "typings" field)
    let typesFile = packageJson.types || packageJson.typings;

    if (!typesFile) {
      // Fallback: look for index.d.ts
      typesFile = 'index.d.ts';
    }

    const typesPath = path.join(packagePath, typesFile);
    core.debug(`Found types file: ${typesPath}`);

    // Parse TypeScript types
    const signatures = await parseTypeDefinitions(typesPath);

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });

    core.info(`Extracted ${signatures.size} method signature(s) from SDK types`);
    return signatures;
  } catch (error) {
    core.warning(`Failed to extract types from SDK package: ${error}`);
    core.info('Falling back to built-in method signatures');
    return getBuiltInSignatures();
  }
}

/**
 * Parses TypeScript type definitions to extract method signatures
 */
async function parseTypeDefinitions(typesFilePath: string): Promise<Map<string, MethodSignature>> {
  const signatures = new Map<string, MethodSignature>();

  try {
    const sourceCode = await fs.readFile(typesFilePath, 'utf-8');

    // Create TypeScript program
    const sourceFile = ts.createSourceFile(
      typesFilePath,
      sourceCode,
      ts.ScriptTarget.Latest,
      true
    );

    // Find the RudderAnalytics interface or class
    function visit(node: ts.Node) {
      // Look for interface or class named RudderAnalytics or similar
      if (ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node)) {
        const name = node.name?.getText(sourceFile);
        if (name && (name.includes('RudderAnalytics') || name.includes('Analytics'))) {
          core.debug(`Found interface/class: ${name}`);

          // Extract method signatures
          node.members.forEach((member) => {
            if (ts.isMethodSignature(member) || ts.isMethodDeclaration(member)) {
              const methodName = member.name?.getText(sourceFile);
              if (methodName && isSDKMethod(methodName)) {
                const signature = extractMethodSignature(member, sourceFile);
                if (signature) {
                  signatures.set(methodName, signature);
                  core.debug(`Extracted signature for ${methodName}`);
                }
              }
            }
          });
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  } catch (error) {
    core.warning(`Failed to parse type definitions: ${error}`);
  }

  return signatures;
}

/**
 * Checks if a method name is a RudderStack SDK method
 */
function isSDKMethod(name: string): boolean {
  const methods = ['track', 'identify', 'page', 'group', 'alias', 'reset', 'load', 'ready', 'setAnonymousId'];
  return methods.includes(name);
}

/**
 * Extracts method signature information from a TypeScript method node
 */
function extractMethodSignature(
  node: ts.MethodSignature | ts.MethodDeclaration,
  sourceFile: ts.SourceFile
): MethodSignature | null {
  const methodName = node.name?.getText(sourceFile);
  if (!methodName) return null;

  const parameters: ParameterInfo[] = [];

  // Extract parameters
  node.parameters.forEach((param) => {
    const paramName = param.name.getText(sourceFile);
    const paramType = param.type ? param.type.getText(sourceFile) : 'any';
    const isOptional = !!param.questionToken;

    parameters.push({
      name: paramName,
      type: paramType,
      optional: isOptional,
    });
  });

  // Extract return type
  const returnType = node.type ? node.type.getText(sourceFile) : 'void';

  return {
    method: methodName,
    parameters,
    returnType,
  };
}

/**
 * Returns built-in method signatures as fallback (SDK v3 common signatures)
 */
function getBuiltInSignatures(): Map<string, MethodSignature> {
  const signatures = new Map<string, MethodSignature>();

  signatures.set('track', {
    method: 'track',
    parameters: [
      { name: 'event', type: 'string', optional: false },
      { name: 'properties', type: 'object', optional: true },
      { name: 'options', type: 'object', optional: true },
      { name: 'callback', type: 'function', optional: true },
    ],
    returnType: 'void',
  });

  signatures.set('identify', {
    method: 'identify',
    parameters: [
      { name: 'userId', type: 'string | number', optional: true },
      { name: 'traits', type: 'object', optional: true },
      { name: 'options', type: 'object', optional: true },
      { name: 'callback', type: 'function', optional: true },
    ],
    returnType: 'void',
  });

  signatures.set('page', {
    method: 'page',
    parameters: [
      { name: 'category', type: 'string', optional: true },
      { name: 'name', type: 'string', optional: true },
      { name: 'properties', type: 'object', optional: true },
      { name: 'options', type: 'object', optional: true },
      { name: 'callback', type: 'function', optional: true },
    ],
    returnType: 'void',
  });

  signatures.set('group', {
    method: 'group',
    parameters: [
      { name: 'groupId', type: 'string | number', optional: false },
      { name: 'traits', type: 'object', optional: true },
      { name: 'options', type: 'object', optional: true },
      { name: 'callback', type: 'function', optional: true },
    ],
    returnType: 'void',
  });

  signatures.set('alias', {
    method: 'alias',
    parameters: [
      { name: 'to', type: 'string | number', optional: false },
      { name: 'from', type: 'string | number', optional: true },
      { name: 'options', type: 'object', optional: true },
      { name: 'callback', type: 'function', optional: true },
    ],
    returnType: 'void',
  });

  signatures.set('reset', {
    method: 'reset',
    parameters: [
      { name: 'resetAnonymousId', type: 'boolean', optional: true },
    ],
    returnType: 'void',
  });

  signatures.set('load', {
    method: 'load',
    parameters: [
      { name: 'writeKey', type: 'string', optional: false },
      { name: 'dataPlaneUrl', type: 'string', optional: false },
      { name: 'options', type: 'object', optional: true },
    ],
    returnType: 'void',
  });

  signatures.set('ready', {
    method: 'ready',
    parameters: [
      { name: 'callback', type: 'function', optional: false },
    ],
    returnType: 'void',
  });

  signatures.set('setAnonymousId', {
    method: 'setAnonymousId',
    parameters: [
      { name: 'anonymousId', type: 'string', optional: false },
    ],
    returnType: 'void',
  });

  return signatures;
}

/**
 * Validates if an argument type matches expected type
 */
export function isTypeCompatible(actualType: string, expectedType: string): boolean {
  // Normalize types
  const actual = actualType.toLowerCase().trim();
  const expected = expectedType.toLowerCase().trim();

  // Exact match
  if (actual === expected) return true;

  // Handle union types (e.g., "string | number")
  if (expected.includes('|')) {
    const expectedTypes = expected.split('|').map((t) => t.trim());
    return expectedTypes.some((t) => isTypeCompatible(actual, t));
  }

  // Handle any type
  if (expected === 'any' || expected === 'unknown') return true;

  // Handle object types
  if (expected === 'object' && actual === 'object') return true;

  // Handle function types
  if (expected === 'function' && actual === 'function') return true;

  return false;
}
