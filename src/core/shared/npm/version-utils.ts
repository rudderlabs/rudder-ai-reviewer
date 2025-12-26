/**
 * Version parsing utility functions
 */

const NPM_SEMVER_REGEX = /[\^~]/;
const SDK_VERSION_EXTRACT_REGEX = /v?(\d+(?:\.\d+\.\d+)?)/;

/**
 * Remove semver prefix characters from version string
 */
export function cleanSemverPrefix(version: string): string {
  return version.replace(NPM_SEMVER_REGEX, '');
}

/**
 * Extract version number from SDK version string
 * Examples: "v3" -> "3", "v3.0.0" -> "3.0.0", "/custom/path/v3" -> "3"
 */
export function extractVersionNumber(sdkVersion: string): string | undefined {
  const match = sdkVersion.match(SDK_VERSION_EXTRACT_REGEX);
  return match ? match[1] : undefined;
}
