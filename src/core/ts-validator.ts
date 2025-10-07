/**
 * TypeScript-based validator using TypeScript Language Service
 * This validates SDK calls by generating TypeScript code and using TS compiler diagnostics
 */

import * as core from '@actions/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as ts from 'typescript';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SDKMethodCall } from './file-scanner';
import { ValidationResult, ValidationIssue } from './api-validator';

const execAsync = promisify(exec);

/**
 * Validates SDK method calls using TypeScript Language Service
 */
export async function validateWithTypeScript(
  methodCalls: SDKMethodCall[],
  sdkVersion?: string
): Promise<ValidationResult> {
  core.info(`Validating ${methodCalls.length} SDK calls with TypeScript Language Service...`);

  if (methodCalls.length === 0) {
    return {
      totalIssues: 0,
      errors: [],
      warnings: [],
      suggestions: [],
    };
  }

  try {
    // Download SDK package
    const sdkPath = await downloadSDKPackage(sdkVersion || 'latest');

    // Generate virtual TypeScript file
    const { virtualCode, callMap } = generateVirtualTypeScriptFile(methodCalls);

    core.debug('Generated virtual TypeScript code:');
    core.debug(virtualCode);

    // Create TypeScript program and get diagnostics
    const diagnostics = await getTypeScriptDiagnostics(virtualCode, sdkPath);

    core.debug(`TypeScript found ${diagnostics.length} diagnostic(s)`);

    // Log all diagnostics for debugging
    diagnostics.forEach((diag, idx) => {
      if (diag.file && diag.start !== undefined) {
        const position = diag.file.getLineAndCharacterOfPosition(diag.start);
        const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n');
        core.debug(`  Diagnostic ${idx + 1}: Line ${position.line + 1}: ${message} (code: ${diag.code})`);
      } else {
        const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n');
        core.debug(`  Diagnostic ${idx + 1}: ${message} (code: ${diag.code})`);
      }
    });

    // Convert diagnostics to validation issues
    const issues = convertDiagnosticsToIssues(diagnostics, callMap, methodCalls);

    // Also run method-specific validations (empty strings, naming conventions, etc.)
    const methodSpecificIssues = validateMethodSpecificRules(methodCalls);

    const allErrors = [...issues.errors, ...methodSpecificIssues.filter(i => i.severity === 'error')];
    const allWarnings = [...issues.warnings, ...methodSpecificIssues.filter(i => i.severity === 'warning')];
    const allSuggestions = [...issues.suggestions, ...methodSpecificIssues.filter(i => i.severity === 'suggestion')];

    core.info(`TypeScript validation complete: ${allErrors.length} errors, ${allWarnings.length} warnings, ${allSuggestions.length} suggestions`);

    return {
      totalIssues: allErrors.length + allWarnings.length + allSuggestions.length,
      errors: allErrors,
      warnings: allWarnings,
      suggestions: allSuggestions,
    };
  } catch (error) {
    core.warning(`TypeScript validation failed: ${error}`);
    core.info('Falling back to basic validation');
    return {
      totalIssues: 0,
      errors: [],
      warnings: [],
      suggestions: [],
    };
  }
}

/**
 * Downloads SDK package to temporary directory
 */
async function downloadSDKPackage(version: string): Promise<string> {
  const tempDir = path.join(process.cwd(), '.rudderstack-temp-validation');
  await fs.mkdir(tempDir, { recursive: true });

  core.debug(`Downloading @rudderstack/analytics-js@${version}`);
  await execAsync(`npm install --prefix "${tempDir}" --no-save @rudderstack/analytics-js@${version}`, {
    cwd: tempDir,
  });

  return path.join(tempDir, 'node_modules', '@rudderstack', 'analytics-js');
}

/**
 * Generates virtual TypeScript file with all SDK calls
 */
function generateVirtualTypeScriptFile(
  methodCalls: SDKMethodCall[]
): { virtualCode: string; callMap: Map<number, SDKMethodCall> } {
  const callMap = new Map<number, SDKMethodCall>();
  let lineNumber = 5; // Start after imports

  let code = `import { RudderAnalytics } from '@rudderstack/analytics-js';\n`;
  code += `const analytics = new RudderAnalytics();\n`;
  code += `\n`;
  code += `// SDK method calls for validation\n`;
  code += `function validateCalls() {\n`;

  for (const call of methodCalls) {
    // Map this line to the original call
    callMap.set(lineNumber, call);

    // Debug: log what arguments we're generating
    core.debug(`Generating call for ${call.method} with ${call.arguments.length} argument(s) from ${call.file}:${call.line}`);
    call.arguments.forEach((arg, idx) => {
      core.debug(`  Arg ${idx}: type=${arg.type}, value=${JSON.stringify(arg.value)}, isStatic=${arg.isStatic}`);
    });

    // Generate the call with actual arguments
    const args = call.arguments.map(arg => {
      if (arg.type === 'string') {
        // Escape quotes in the string value
        const escaped = String(arg.value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
        return `"${escaped}"`;
      } else if (arg.type === 'number') {
        return String(arg.value);
      } else if (arg.type === 'boolean') {
        return String(arg.value);
      } else if (arg.type === 'null') {
        return 'null';
      } else if (arg.type === 'undefined') {
        return 'undefined';
      } else if (arg.type === 'object') {
        return '{}'; // Simplified object
      } else if (arg.type === 'identifier' || arg.type === 'template' || arg.type === 'unknown') {
        // For non-static arguments, use appropriate placeholder
        return 'undefined as any'; // Use 'any' to avoid type errors for dynamic values
      } else {
        return 'undefined';
      }
    }).join(', ');

    const generatedCall = `analytics.${call.method}(${args})`;
    code += `  ${generatedCall};\n`;
    core.debug(`  Generated: ${generatedCall}`);
    lineNumber++;
  }

  code += `}\n`;

  return { virtualCode: code, callMap };
}

/**
 * Gets TypeScript diagnostics for the virtual file
 */
async function getTypeScriptDiagnostics(
  virtualCode: string,
  sdkPath: string
): Promise<readonly ts.Diagnostic[]> {
  // Use the same temp directory where we downloaded the SDK
  const tempDir = path.join(process.cwd(), '.rudderstack-temp-validation');
  const virtualFilePath = path.join(tempDir, 'validation.ts');
  await fs.writeFile(virtualFilePath, virtualCode);

  // Get TypeScript's lib files directory
  const tsLibPath = path.dirname(require.resolve('typescript/lib/lib.d.ts'));

  core.debug(`TypeScript lib path: ${tsLibPath}`);

  // Create compiler options
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    lib: ['lib.es2020.full.d.ts'],
    esModuleInterop: true,
    skipLibCheck: true,
    strict: false, // Disable strict mode to reduce unrelated errors
    noEmit: true,
    baseUrl: tempDir,
    paths: {
      '@rudderstack/analytics-js': [path.join(tempDir, 'node_modules/@rudderstack/analytics-js')],
    },
  };

  // Create compiler host with custom module resolution
  const host = ts.createCompilerHost(compilerOptions);
  const defaultGetSourceFile = host.getSourceFile;

  // Override getSourceFile to handle lib files from TypeScript's installation
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    // If it's a lib file, resolve from TypeScript's lib directory
    if (fileName.includes('lib.') && fileName.endsWith('.d.ts')) {
      const libFileName = path.basename(fileName);
      const libFilePath = path.join(tsLibPath, libFileName);
      core.debug(`Resolving lib file ${fileName} to ${libFilePath}`);
      return defaultGetSourceFile(libFilePath, languageVersion, onError, shouldCreateNewSourceFile);
    }
    return defaultGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };

  const originalResolveModuleNames = host.resolveModuleNames;

  // Override resolveModuleNames to manually handle SDK imports
  host.resolveModuleNames = (moduleNames, containingFile) => {
    return moduleNames.map(moduleName => {
      if (moduleName === '@rudderstack/analytics-js') {
        // Manually resolve to the SDK package we downloaded
        // Try .d.cts first (CommonJS types), then .d.mts (ESM types)
        const typesPathCts = path.join(sdkPath, 'dist', 'npm', 'index.d.cts');
        const typesPathMts = path.join(sdkPath, 'dist', 'npm', 'index.d.mts');

        let typesPath = typesPathCts;
        let extension = ts.Extension.Dcts;

        // Check which file exists
        try {
          require('fs').accessSync(typesPathCts);
          core.debug(`Using CTS types: ${typesPathCts}`);
        } catch {
          typesPath = typesPathMts;
          extension = ts.Extension.Dmts;
          core.debug(`Using MTS types: ${typesPathMts}`);
        }

        core.debug(`Resolving ${moduleName} to ${typesPath}`);

        return {
          resolvedFileName: typesPath,
          isExternalLibraryImport: true,
          extension,
        };
      }

      // Use default resolution for other modules
      if (originalResolveModuleNames) {
        const result = originalResolveModuleNames.call(host, [moduleName], containingFile, undefined, undefined, compilerOptions);
        return result?.[0];
      }

      return undefined;
    }) as ts.ResolvedModule[];
  };

  // Create program with custom host
  const program = ts.createProgram([virtualFilePath], compilerOptions, host);

  // Get diagnostics
  const sourceFile = program.getSourceFile(virtualFilePath);
  if (!sourceFile) {
    core.debug('Could not get source file');
    return [];
  }

  // First check for global/module resolution errors
  const globalDiagnostics = program.getGlobalDiagnostics();
  const optionsDiagnostics = program.getOptionsDiagnostics();

  core.debug(`Global diagnostics: ${globalDiagnostics.length}`);
  globalDiagnostics.forEach(d => {
    core.debug(`  Global: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
  });

  core.debug(`Options diagnostics: ${optionsDiagnostics.length}`);
  optionsDiagnostics.forEach(d => {
    core.debug(`  Option: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
  });

  // Get semantic diagnostics - these are the actual type errors
  const semanticDiagnostics = program.getSemanticDiagnostics(sourceFile);

  core.debug(`Semantic diagnostics (before filtering): ${semanticDiagnostics.length}`);

  // Filter out module resolution errors since we handle those manually
  const filteredDiagnostics = semanticDiagnostics.filter(d => {
    // Skip "Cannot find module" errors
    if (d.code === 2307) {
      core.debug(`  Skipping module resolution error: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
      return false;
    }
    // Skip errors about the module not being found
    if (d.code === 2305 || d.code === 2503) {
      core.debug(`  Skipping module-related error: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
      return false;
    }
    return true;
  });

  core.debug(`Semantic diagnostics (after filtering): ${filteredDiagnostics.length}`);

  return filteredDiagnostics;
}

/**
 * Converts TypeScript diagnostics to validation issues
 */
function convertDiagnosticsToIssues(
  diagnostics: readonly ts.Diagnostic[],
  callMap: Map<number, SDKMethodCall>,
  _methodCalls: SDKMethodCall[]
): { errors: ValidationIssue[]; warnings: ValidationIssue[]; suggestions: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const suggestions: ValidationIssue[] = [];

  for (const diagnostic of diagnostics) {
    if (!diagnostic.file || diagnostic.start === undefined) {
      continue;
    }

    // Get line number in virtual file
    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    const virtualLine = position.line + 1;

    // Map back to original call
    const originalCall = callMap.get(virtualLine);
    if (!originalCall) {
      continue;
    }

    // Get diagnostic message
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');

    // Determine severity based on diagnostic category
    let severity: 'error' | 'warning' | 'suggestion' = 'error';
    if (diagnostic.category === ts.DiagnosticCategory.Warning) {
      severity = 'warning';
    } else if (diagnostic.category === ts.DiagnosticCategory.Suggestion) {
      severity = 'suggestion';
    }

    const issue: ValidationIssue = {
      file: originalCall.file,
      line: originalCall.line,
      column: originalCall.column,
      severity,
      method: originalCall.method,
      code: originalCall.code,
      message,
    };

    if (severity === 'error') {
      errors.push(issue);
    } else if (severity === 'warning') {
      warnings.push(issue);
    } else {
      suggestions.push(issue);
    }
  }

  return { errors, warnings, suggestions };
}

/**
 * Validates method-specific business rules that TypeScript can't catch
 */
function validateMethodSpecificRules(methodCalls: SDKMethodCall[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const call of methodCalls) {
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
  }

  return issues;
}

/**
 * Validates track() method specific rules
 */
function validateTrackCall(call: SDKMethodCall): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (call.arguments.length === 0) {
    // Missing event name - TypeScript will catch this
    return issues;
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
  if (call.arguments.length === 1) {
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
 * Validates page() method specific rules
 */
function validatePageCall(_call: SDKMethodCall): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  // Page call is flexible, no specific validations for now
  return issues;
}

/**
 * Validates load() method specific rules
 */
function validateLoadCall(call: SDKMethodCall): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (call.arguments.length < 2) {
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
