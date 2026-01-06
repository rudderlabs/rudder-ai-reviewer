export type SDKInstallationType = 'npm' | 'cdn';

export interface SDKDetectionResult {
  name: string;
  installationType: SDKInstallationType;
  version?: string;
}

export interface VariableInfo {
  value: string;
  line: number;
  snippet: string;
}
