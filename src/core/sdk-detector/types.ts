/**
 * Type definitions for SDK detection
 */

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

export interface VariableInfo {
  value: string;
  line: number;
  snippet: string;
}

export interface CDNDetectionInfo {
  found: boolean;
  version?: string;
  locations: SDKLocation[];
}

export interface CDNUsageResult {
  found: boolean;
  version?: string;
  files: string[];
  locations: SDKLocation[];
}
