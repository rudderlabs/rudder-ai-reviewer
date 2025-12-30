/**
 * Type definitions for framework detection
 */

export type FrameworkCategory = 'frontend' | 'backend';

export interface FrameworkDetectionResult {
  name: string;
  version?: string;
  category?: FrameworkCategory;
}

export interface FrameworkInfo {
  name: string;
  packageName: string;
  category: FrameworkCategory;
}
