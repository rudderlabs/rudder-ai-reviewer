/**
 * Detects RudderStack SDK installation type and version
 */

import * as fs from 'fs';
import * as path from 'path';

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
export async function detectSDKInstallation(repoPath: string): Promise<SDKDetectionResult> {
  const details: string[] = [];
  const locations: SDKLocation[] = [];
  let hasNPM = false;
  let hasCDN = false;
  let npmVersion: string | undefined;
  let cdnVersion: string | undefined;

  // Check for NPM installation
  const packageJsonPath = path.join(repoPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    // Check dependencies and devDependencies
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    if (allDeps['@rudderstack/analytics-js']) {
      hasNPM = true;
      npmVersion = allDeps['@rudderstack/analytics-js'].replace(/[\^~]/, '');
      details.push(`✅ NPM: Found @rudderstack/analytics-js@${npmVersion} in package.json`);

      // Try to get exact version from lock files
      const exactVersion = await getExactNPMVersion(repoPath);
      if (exactVersion) {
        npmVersion = exactVersion;
        details.push(`   Exact version from lock file: ${exactVersion}`);
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
 * Detect CDN usage by scanning common file patterns
 */
async function detectCDNUsage(
  repoPath: string
): Promise<{ found: boolean; version?: string; files: string[]; locations: SDKLocation[] }> {
  const files: string[] = [];
  const locations: SDKLocation[] = [];
  let version: string | undefined;

  // Patterns to search for (with identifiers)
  const cdnPatterns: Array<{ pattern: RegExp; type: 'url' | 'snippet' | 'buffer' }> = [
    { pattern: /cdn\.rudderlabs\.com\/v(\d+)(?:\.(\d+)\.(\d+))?\/(modern|legacy)\/rsa\.min\.js/, type: 'url' },
    { pattern: /window\.RudderSnippetVersion\s*=\s*["']([^"']+)["']/, type: 'snippet' },
    { pattern: /window\.rudderanalytics\s*=\s*\[\]/, type: 'buffer' },
  ];

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
        const lines = content.split('\n');

        // Check for CDN patterns line by line
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
          const line = lines[lineIndex];

          for (const { pattern, type } of cdnPatterns) {
            const match = line.match(pattern);
            if (match) {
              if (!files.includes(file)) {
                files.push(file);
              }

              // Store location
              locations.push({
                file,
                line: lineIndex + 1, // Line numbers are 1-indexed
                type: 'cdn',
                snippet: line.trim(),
              });

              // Extract version based on pattern type
              if (!version && match[1]) {
                if (type === 'url') {
                  // CDN URL: v3 or v3.0.0 format
                  if (match[2] && match[3]) {
                    version = `v${match[1]}.${match[2]}.${match[3]}`;
                  } else {
                    version = `v${match[1]}`;
                  }
                } else if (type === 'snippet') {
                  // Snippet version: use as-is (already includes 'v' or is semver)
                  version = match[1];
                }
              }
              break; // Move to next line
            }
          }
        }
      } catch {
        // Ignore read errors
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
