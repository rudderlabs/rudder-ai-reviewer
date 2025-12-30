import type { LockFileParser } from '@core/shared/npm';
import type { CDNScanner } from './cdn/file-scanner';
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

  async detect(repoPath: string, packageName: string): Promise<SDKDetectionResult | null> {
    const [npmResult, cdnResult] = await Promise.all([
      this.detectNPM(repoPath, packageName),
      this.detectCDN(repoPath),
    ]);

    return this.buildResult(npmResult, cdnResult);
  }

  private async detectNPM(repoPath: string, packageName: string): Promise<NPMDetectionResult> {
    const declaredVersion = this.packageReader.read(repoPath, packageName);
    if (!declaredVersion) {
      return { found: false };
    }

    const versions = await this.lockFileParser.getVersions(repoPath, [packageName]);
    const exactVersion = versions.get(packageName);

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
