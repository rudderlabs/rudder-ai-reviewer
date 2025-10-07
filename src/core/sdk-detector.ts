/**
 * Detects RudderStack SDK installation type and version
 */

import * as fs from 'fs';
import * as path from 'path';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

export type SDKInstallationType = 'npm' | 'cdn' | 'both' | 'none';

export interface SDKLocation {
  file: string;
  line: number;
  type: 'npm' | 'cdn';
  snippet: string;
}

export interface SDKDetectionResult {
  installationType: SDKInstallationType;
  npmVersion?: string;
  cdnVersion?: string;
  details: string[];
  locations: SDKLocation[];
}

/**
 * Detect SDK installation in the repository
 */
export async function detectSDKInstallation(repoPath: string, searchPaths?: string[]): Promise<SDKDetectionResult> {
  const details: string[] = [];
  const locations: SDKLocation[] = [];
  let hasNPM = false;
  let hasCDN = false;
  let npmVersion: string | undefined;
  let cdnVersion: string | undefined;

  // Determine paths to search for package.json
  const pathsToCheck = [repoPath];

  // If searchPaths provided, also check subdirectories from those paths
  if (searchPaths && searchPaths.length > 0) {
    const subdirs = new Set<string>();
    console.log(`[SDK Detector] Received ${searchPaths.length} search paths`);
    searchPaths.slice(0, 3).forEach(fp => console.log(`  - ${fp}`));

    searchPaths.forEach(filePath => {
      const dir = path.dirname(filePath);
      const parts = dir.split(path.sep).filter(p => p && p !== '.');

      // Check each level of directory (e.g., if file is "a/b/c/file.js", check "a", "a/b", "a/b/c")
      for (let i = 1; i <= parts.length; i++) {
        const subdir = parts.slice(0, i).join(path.sep);
        if (subdir) {
          const fullPath = path.join(repoPath, subdir);
          subdirs.add(fullPath);
        }
      }
    });
    pathsToCheck.push(...subdirs);
    console.log(`[SDK Detector] Generated ${subdirs.size} subdirectories to check`);
    [...subdirs].slice(0, 5).forEach(dir => console.log(`  - ${dir}`));
  }

  console.log(`[SDK Detector] Total paths to check: ${pathsToCheck.length}`);

  // Check for NPM installation in all paths
  for (const checkPath of pathsToCheck) {
    const packageJsonPath = path.join(checkPath, 'package.json');
    console.log(`[SDK Detector] Checking: ${packageJsonPath} (exists: ${fs.existsSync(packageJsonPath)})`);
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

        // Check dependencies and devDependencies
        const allDeps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };

        if (allDeps['@rudderstack/analytics-js']) {
          hasNPM = true;
          npmVersion = allDeps['@rudderstack/analytics-js'].replace(/[\^~]/, '');
          const relPath = path.relative(repoPath, packageJsonPath);
          details.push(`✅ NPM: Found @rudderstack/analytics-js@${npmVersion} in ${relPath}`);

          // Try to get exact version from lock files
          const exactVersion = await getExactNPMVersion(checkPath);
          if (exactVersion) {
            npmVersion = exactVersion;
            details.push(`   Exact version from lock file: ${exactVersion}`);
          }
          break; // Found SDK, stop searching
        }
      } catch (error) {
        // Ignore parsing errors for invalid package.json files
      }
    }
  }

  // Check for CDN installation by scanning files
  const cdnDetection = await detectCDNUsage(repoPath);
  if (cdnDetection.found) {
    hasCDN = true;
    cdnVersion = cdnDetection.version;
    details.push(`✅ CDN: Found RudderStack CDN snippet`);
    if (cdnVersion) {
      details.push(`   CDN version: ${cdnVersion}`);
    }
    details.push(`   Files with CDN usage: ${cdnDetection.files.join(', ')}`);
    locations.push(...cdnDetection.locations);
  }

  // Determine installation type
  let installationType: SDKInstallationType;
  if (hasNPM && hasCDN) {
    installationType = 'both';
    details.push('ℹ️  Both NPM and CDN installations detected (common for SSR/buffering)');
  } else if (hasNPM) {
    installationType = 'npm';
  } else if (hasCDN) {
    installationType = 'cdn';
  } else {
    installationType = 'none';
    details.push('❌ No RudderStack SDK installation detected');
  }

  return {
    installationType,
    npmVersion,
    cdnVersion,
    details,
    locations,
  };
}

/**
 * Get exact NPM version from lock files
 */
async function getExactNPMVersion(repoPath: string): Promise<string | undefined> {
  // Try package-lock.json
  const packageLockPath = path.join(repoPath, 'package-lock.json');
  if (fs.existsSync(packageLockPath)) {
    try {
      const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf-8'));
      const pkg = packageLock.packages?.['node_modules/@rudderstack/analytics-js'];
      if (pkg?.version) {
        return pkg.version;
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Try yarn.lock
  const yarnLockPath = path.join(repoPath, 'yarn.lock');
  if (fs.existsSync(yarnLockPath)) {
    try {
      const yarnLock = fs.readFileSync(yarnLockPath, 'utf-8');
      const match = yarnLock.match(/@rudderstack\/analytics-js@.*:\s+version\s+"([^"]+)"/);
      if (match?.[1]) {
        return match[1];
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Try pnpm-lock.yaml
  const pnpmLockPath = path.join(repoPath, 'pnpm-lock.yaml');
  if (fs.existsSync(pnpmLockPath)) {
    try {
      const pnpmLock = fs.readFileSync(pnpmLockPath, 'utf-8');
      const match = pnpmLock.match(/@rudderstack\/analytics-js:\s+(\d+\.\d+\.\d+)/);
      if (match?.[1]) {
        return match[1];
      }
    } catch {
      // Ignore parse errors
    }
  }

  return undefined;
}

/**
 * Detect CDN usage by parsing JavaScript code with AST
 */
async function detectCDNUsage(
  repoPath: string
): Promise<{ found: boolean; version?: string; files: string[]; locations: SDKLocation[] }> {
  const files: string[] = [];
  const locations: SDKLocation[] = [];
  let version: string | undefined;

  // Files to check (limit to common patterns for now)
  const filesToCheck = [
    'index.html',
    'public/index.html',
    'src/index.html',
    'src/app/layout.tsx',
    'src/app/layout.jsx',
    'src/pages/_app.tsx',
    'src/pages/_app.jsx',
    'pages/_app.tsx',
    'pages/_app.jsx',
  ];

  for (const file of filesToCheck) {
    const filePath = path.join(repoPath, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');

        // Extract JavaScript code from the file
        const jsCode = extractJavaScriptCode(content, file);

        if (jsCode) {
          // Parse the JavaScript and look for RudderStack CDN variables
          const cdnInfo = parseRudderStackCDN(jsCode, file);

          if (cdnInfo.found) {
            if (!files.includes(file)) {
              files.push(file);
            }

            if (cdnInfo.version && !version) {
              version = cdnInfo.version;
            }

            locations.push(...cdnInfo.locations);
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  return {
    found: files.length > 0,
    version,
    files,
    locations,
  };
}

/**
 * Extract JavaScript code from various file types
 */
function extractJavaScriptCode(content: string, filename: string): string | null {
  const ext = path.extname(filename);

  // For .tsx/.jsx/.ts/.js files, return as-is
  if (['.tsx', '.jsx', '.ts', '.js'].includes(ext)) {
    return content;
  }

  // For HTML files, extract script tags
  if (ext === '.html') {
    const scriptMatches = content.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    const scripts: string[] = [];

    for (const match of scriptMatches) {
      scripts.push(match[1]);
    }

    return scripts.length > 0 ? scripts.join('\n\n') : null;
  }

  return null;
}

/**
 * Parse JavaScript code to find RudderStack CDN configuration
 */
function parseRudderStackCDN(
  code: string,
  filename: string
): { found: boolean; version?: string; locations: SDKLocation[] } {
  const locations: SDKLocation[] = [];
  let sdkVersion: string | undefined;

  try {
    // Parse with Babel
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true,
    });

    // Track variable declarations and JSX template literals
    const variables: Map<string, { value: string; line: number; snippet: string }> = new Map();
    const jsxScriptContents: string[] = [];

    traverse(ast, {
      VariableDeclarator(path) {
        const { node } = path;

        // Check if it's an identifier with string literal
        if (t.isIdentifier(node.id) && t.isStringLiteral(node.init)) {
          const varName = node.id.name;
          const value = node.init.value;

          variables.set(varName, {
            value,
            line: node.loc?.start.line || 0,
            snippet: code.split('\n')[node.loc?.start.line ? node.loc.start.line - 1 : 0]?.trim() || '',
          });
        }
      },
      JSXElement(path) {
        const { node } = path;

        // Check if it's a Script or script element
        const openingElement = node.openingElement;
        if (
          t.isJSXIdentifier(openingElement.name) &&
          (openingElement.name.name === 'Script' || openingElement.name.name === 'script')
        ) {
          // Look for template literal children
          for (const child of node.children) {
            if (t.isJSXExpressionContainer(child) && t.isTemplateLiteral(child.expression)) {
              // Extract the template literal content
              const quasis = child.expression.quasis;
              const content = quasis.map((q) => q.value.cooked || q.value.raw).join('');
              jsxScriptContents.push(content);
            }
          }
        }
      },
    });

    // If we found JSX script content, parse it recursively
    if (jsxScriptContents.length > 0) {
      for (const scriptContent of jsxScriptContents) {
        try {
          const scriptAst = parser.parse(scriptContent, {
            sourceType: 'script',
            errorRecovery: true,
          });

          traverse(scriptAst, {
            VariableDeclarator(path) {
              const { node } = path;

              if (t.isIdentifier(node.id) && t.isStringLiteral(node.init)) {
                const varName = node.id.name;
                const value = node.init.value;

                variables.set(varName, {
                  value,
                  line: node.loc?.start.line || 0,
                  snippet: code.split('\n')[node.loc?.start.line ? node.loc.start.line - 1 : 0]?.trim() || '',
                });
              }
            },
          });
        } catch {
          // Ignore parse errors in JSX script content
        }
      }
    }

    // Look for RudderStack CDN indicators
    // Note: We don't rely on sdkBaseUrl domain since customers may proxy it

    // Check for sdkBaseUrl (any domain)
    if (variables.has('sdkBaseUrl')) {
      const info = variables.get('sdkBaseUrl')!;
      locations.push({
        file: filename,
        line: info.line,
        type: 'cdn',
        snippet: info.snippet,
      });
    }

    // Check for sdkVersion (most reliable CDN indicator)
    if (variables.has('sdkVersion')) {
      const info = variables.get('sdkVersion')!;
      sdkVersion = info.value;

      // If we didn't find sdkBaseUrl location yet, use sdkVersion location
      if (locations.length === 0) {
        locations.push({
          file: filename,
          line: info.line,
          type: 'cdn',
          snippet: info.snippet,
        });
      }
    }

    // Check for sdkFileName
    const hasSdkFileName = variables.has('sdkFileName') &&
                          variables.get('sdkFileName')?.value.includes('rsa.min.js');

    // CDN is detected only if we have ALL required variables:
    // - sdkBaseUrl (any domain)
    // - sdkVersion (RudderStack CDN pattern)
    // - sdkFileName containing rsa.min.js
    const isCDN = variables.has('sdkBaseUrl') &&
                  sdkVersion !== undefined &&
                  hasSdkFileName === true;

    // Extract version from sdkVersion variable
    let version: string | undefined;
    if (sdkVersion) {
      // Extract the major version number (remove custom prefixes and 'v')
      // Examples: "v3" -> "3", "v3.0.0" -> "3.0.0", "/custom/path/v3" -> "3"
      const versionMatch = sdkVersion.match(/v?(\d+(?:\.\d+\.\d+)?)/);
      version = versionMatch ? versionMatch[1] : undefined;
    }

    return {
      found: isCDN,
      version,
      locations,
    };
  } catch {
    // If parsing fails, return not found
    return { found: false, locations: [] };
  }
}
