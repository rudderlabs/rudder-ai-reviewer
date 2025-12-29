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

  async detect(repoPath: string): Promise<SDKDetectionResult | null> {
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
  ): SDKDetectionResult | null {
    const hasNPM = npmResult.found;
    const hasCDN = cdnResult.found;

    let installationType: SDKInstallationType;
    let version: string | undefined;
    if (hasNPM) {
      installationType = 'npm';
      version = npmResult.exactVersion;
    } else if (hasCDN) {
      installationType = 'cdn';
      version = cdnResult.version;
    } else {
      return null;
    }

    return {
      installationType,
      version,
    };
  }
}
