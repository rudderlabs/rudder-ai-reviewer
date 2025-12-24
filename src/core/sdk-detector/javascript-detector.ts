/**
 * JavaScript SDK detector - main implementation for detecting RudderStack JS SDK
 */

import type { CDNScanner } from './cdn/file-scanner';
import type { JSDetectorConfig } from './config';
import type { LockFileParser } from './npm/lock-file-parser';
import type { PackageReader } from './npm/package-reader';
import type { SDKDetectionResult, SDKInstallationType } from './types';

interface NPMDetectionResult {
  found: boolean;
  declaredVersion?: string;
  exactVersion?: string;
  locations: any[];
}

interface CDNDetectionResult {
  found: boolean;
  version?: string;
  files: string[];
  locations: any[];
}

export class JavaScriptSDKDetector {
  constructor(
    private readonly packageReader: PackageReader,
    private readonly lockFileParser: LockFileParser,
    private readonly cdnScanner: CDNScanner,
    private readonly config: JSDetectorConfig
  ) {}

  async detect(repoPath: string): Promise<SDKDetectionResult> {
    const [npmResult, cdnResult] = await Promise.all([
      this.detectNPM(repoPath),
      this.detectCDN(repoPath),
    ]);

    return this.buildResult(npmResult, cdnResult);
  }

  private async detectNPM(repoPath: string): Promise<NPMDetectionResult> {
    const packageInfo = this.packageReader.read(repoPath);
    if (!packageInfo) {
      return { found: false, locations: [] };
    }

    const declaredVersion = packageInfo.version;
    const exactVersion = this.lockFileParser.getVersion(repoPath);

    return {
      found: true,
      declaredVersion,
      exactVersion: exactVersion || declaredVersion,
      locations: packageInfo.locations,
    };
  }

  private async detectCDN(repoPath: string): Promise<CDNDetectionResult> {
    return this.cdnScanner.scan(repoPath);
  }

  private buildResult(
    npmResult: NPMDetectionResult,
    cdnResult: CDNDetectionResult
  ): SDKDetectionResult {
    const hasNPM = npmResult.found;
    const hasCDN = cdnResult.found;

    let installationType: SDKInstallationType;
    if (hasNPM && hasCDN) {
      installationType = 'both';
    } else if (hasNPM) {
      installationType = 'npm';
    } else if (hasCDN) {
      installationType = 'cdn';
    } else {
      installationType = 'none';
    }

    return {
      installationType,
      npmVersion: npmResult.exactVersion,
      cdnVersion: cdnResult.version,
      details: this.buildDetails(npmResult, cdnResult, installationType),
      locations: [...npmResult.locations, ...cdnResult.locations],
    };
  }

  private buildDetails(
    npmResult: NPMDetectionResult,
    cdnResult: CDNDetectionResult,
    type: SDKInstallationType
  ): string[] {
    const details: string[] = [];

    if (npmResult.found) {
      details.push(`✅ NPM: Found ${this.config.npm.packageName}@${npmResult.declaredVersion}`);
      if (npmResult.exactVersion && npmResult.exactVersion !== npmResult.declaredVersion) {
        details.push(`   Exact version from lock file: ${npmResult.exactVersion}`);
      }
    }

    if (cdnResult.found) {
      details.push('✅ CDN: Found RudderStack CDN snippet');
      if (cdnResult.version) {
        details.push(`   CDN version: ${cdnResult.version}`);
      }
      if (cdnResult.files?.length) {
        details.push(`   Files with CDN usage: ${cdnResult.files.join(', ')}`);
      }
    }

    if (type === 'both') {
      details.push('ℹ️  Both NPM and CDN installations detected');
    } else if (type === 'none') {
      details.push('❌ No RudderStack SDK installation detected');
    }

    return details;
  }
}
