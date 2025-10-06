/**
 * Base analyzer interface for language-specific analyzers
 * Provides common contract for analyzing different SDK implementations
 */

import {
  AnalysisResult,
  SDKUsage,
  FrameworkInfo,
  ChangesSummary,
  Issue,
} from '../types/common';

/**
 * Abstract base class for SDK analyzers
 * Implement this for each language (JavaScript, Swift, Kotlin, etc.)
 */
export abstract class BaseAnalyzer {
  /**
   * Detect if SDK is present in the given files
   */
  abstract detectSDK(files: string[]): Promise<SDKUsage>;

  /**
   * Detect framework/platform being used
   */
  abstract detectFramework(files: string[]): Promise<FrameworkInfo>;

  /**
   * Analyze files for SDK usage and correctness
   */
  abstract analyze(
    files: string[],
    baselineSdk?: SDKUsage
  ): Promise<AnalysisResult>;

  /**
   * Detect changes between baseline and current
   */
  abstract detectChanges(
    baseline: SDKUsage,
    current: SDKUsage
  ): Promise<ChangesSummary>;

  /**
   * Validate SDK calls against API specification
   */
  abstract validateAPI(files: string[]): Promise<Issue[]>;

  /**
   * Get supported file extensions
   */
  abstract getSupportedExtensions(): string[];

  /**
   * Get analyzer name/identifier
   */
  abstract getName(): string;
}

/**
 * Interface for file content with metadata
 */
export interface FileContent {
  path: string;
  content: string;
  hash?: string;
  size: number;
}

/**
 * Interface for parsing results
 */
export interface ParseResult {
  success: boolean;
  ast?: unknown;
  error?: string;
}
