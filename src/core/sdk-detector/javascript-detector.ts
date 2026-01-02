import type { LockFileParser, PackageReader } from '@core/shared/npm';
import type { CDNScanner } from './cdn/file-scanner';
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
    const declaredVersions = this.packageReader.getVersions(repoPath, [packageName]);
    const declaredVersion = declaredVersions.get(packageName);

    if (!declaredVersion) {
      return { found: false };
    }

    const exactVersions = await this.lockFileParser.getVersions(repoPath, [packageName]);
    const exactVersion = exactVersions.get(packageName);

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
