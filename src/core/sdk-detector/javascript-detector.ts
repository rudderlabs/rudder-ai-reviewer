import type { LockFileParser, PackageReader } from '@core/shared/npm';
import type { CDNScanner } from './cdn/file-scanner';
import type { SDKDetectionResult, SDKInstallationType } from './types';
import { logger } from '@core/logging/logger';

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

    return this.buildResult(npmResult, cdnResult, packageName);
  }

  private async detectNPM(repoPath: string, packageName: string): Promise<NPMDetectionResult> {
    const declaredVersions = this.packageReader.getVersions(repoPath, [packageName]);
    const declaredVersion = declaredVersions.get(packageName);

    if (!declaredVersion) {
      logger.debug('SDK NPM detection: not found');
      return { found: false };
    }

    const exactVersions = await this.lockFileParser.getVersions(repoPath, [packageName]);
    const exactVersion = exactVersions.get(packageName);

    const result = {
      found: true,
      declaredVersion,
      exactVersion: exactVersion || declaredVersion,
    };
    logger.debug(`SDK NPM detection: found version ${result.exactVersion}`);
    return result;
  }

  private async detectCDN(repoPath: string): Promise<CDNDetectionResult> {
    const result = await this.cdnScanner.scan(repoPath);
    logger.debug(
      `SDK CDN detection: ${result.found ? `found version ${result.version || 'unknown'}` : 'not found'}`
    );
    return result;
  }

  private buildResult(
    npmResult: NPMDetectionResult,
    cdnResult: CDNDetectionResult,
    packageName: string
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
      logger.debug('SDK detection: No SDK found (neither NPM nor CDN)');
      return null;
    }

    logger.debug(
      `SDK detection: Final result - ${installationType} installation, version ${version || 'unknown'}`
    );

    return {
      name: packageName,
      installationType,
      version,
    };
  }
}
