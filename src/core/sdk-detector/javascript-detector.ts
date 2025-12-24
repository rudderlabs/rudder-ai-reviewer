/**
 * JavaScript SDK detector - main implementation for detecting RudderStack JS SDK
 */

import type { CDNScanner } from './cdn/file-scanner';
import type { LockFileParser } from './npm/lock-file-parser';
import type { PackageReader } from './npm/package-reader';
import type { SDKDetectionResult, SDKInstallationType } from './types';

interface NPMDetectionResult {
  found: boolean;
  declaredVersion?: string;
  exactVersion?: string;
}

interface CDNDetectionResult {
  found: boolean;
  version?: string;
}

export class JavaScriptSDKDetector {
  constructor(
    private readonly packageReader: PackageReader,
    private readonly lockFileParser: LockFileParser,
    private readonly cdnScanner: CDNScanner
  ) {}

  async detect(repoPath: string): Promise<SDKDetectionResult> {
    const [npmResult, cdnResult] = await Promise.all([
      this.detectNPM(repoPath),
      this.detectCDN(repoPath),
    ]);

    return this.buildResult(npmResult, cdnResult);
  }

  private async detectNPM(repoPath: string): Promise<NPMDetectionResult> {
    const declaredVersion = this.packageReader.read(repoPath);
    if (!declaredVersion) {
      return { found: false };
    }

    const exactVersion = this.lockFileParser.getVersion(repoPath);

    return {
      found: true,
      declaredVersion,
      exactVersion: exactVersion || declaredVersion,
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

    // Prefer NPM exact version, fallback to CDN version
    const version = npmResult.exactVersion || cdnResult.version;

    return {
      installationType,
      version,
    };
  }
}
