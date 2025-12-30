/**
 * Type definitions for SDK detection
 */

export type SDKInstallationType = 'npm' | 'cdn';

export interface SDKDetectionResult {
  installationType: SDKInstallationType;
  version?: string;
}

export interface VariableInfo {
  value: string;
  line: number;
  snippet: string;
}
