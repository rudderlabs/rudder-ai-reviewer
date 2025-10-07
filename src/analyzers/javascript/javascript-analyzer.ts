/**
 * JavaScript/TypeScript Analyzer for RudderStack SDK
 * Implements the BaseAnalyzer interface for JavaScript SDK analysis
 */

import { BaseAnalyzer } from '../base-analyzer';
import type {
  AnalysisResult,
  SDKUsage,
  FrameworkInfo,
  ChangesSummary,
  Issue,
  FileAnalysisInfo,
} from '../../types/common';
import { detectSDKInstallation } from '../../core/sdk-detector';
import { scanFilesForSDKUsage } from '../../core/file-scanner';
import { validateSDKMethodCalls } from '../../core/api-validator';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * JavaScript/TypeScript analyzer implementation
 */
export class JavaScriptAnalyzer extends BaseAnalyzer {
  /**
   * Detect if RudderStack JavaScript SDK is present
   */
  async detectSDK(files: string[], repoPath?: string): Promise<SDKUsage> {
    const rootPath = repoPath || process.cwd();
    // Pass files to help SDK detector find package.json in subdirectories
    const detection = await detectSDKInstallation(rootPath, files);

    // Convert detection result to SDKUsage interface
    const sdkType = detection.installationType === 'both' ? 'npm' : detection.installationType === 'none' ? 'npm' : detection.installationType;

    return {
      type: sdkType,
      version: detection.npmVersion || detection.cdnVersion,
      detected: detection.installationType !== 'none',
      locations: detection.locations.map((loc) => ({
        file: loc.file,
        line: loc.line,
        column: 0,
        method: 'load',
        callType: 'valid' as const,
      })),
    };
  }

  /**
   * Detect framework/platform being used
   */
  async detectFramework(files: string[]): Promise<FrameworkInfo> {
    const hasNext = files.some((f) => f.includes('next.config') || f.includes('.next'));
    const hasReact = files.some((f) => f.endsWith('.jsx') || f.endsWith('.tsx'));
    const hasVue = files.some((f) => f.endsWith('.vue'));
    const hasAngular = files.some((f) => f.includes('angular.json') || f.includes('@angular'));

    let framework: FrameworkInfo['framework'] = 'vanilla';
    let confidence: FrameworkInfo['confidence'] = 'low';
    let detectedFrom = 'file patterns';

    if (hasNext) {
      framework = 'nextjs';
      confidence = 'high';
      detectedFrom = 'next.config files';
    } else if (hasReact) {
      framework = 'react';
      confidence = 'medium';
      detectedFrom = '.jsx/.tsx files';
    } else if (hasVue) {
      framework = 'vue';
      confidence = 'medium';
      detectedFrom = '.vue files';
    } else if (hasAngular) {
      framework = 'angular';
      confidence = 'high';
      detectedFrom = 'angular.json';
    }

    return {
      framework,
      confidence,
      detectedFrom,
    };
  }

  /**
   * Analyze files for SDK usage and correctness
   */
  async analyze(files: string[], baselineSdk?: SDKUsage): Promise<AnalysisResult> {
    const repoPath = files.length > 0 ? path.dirname(files[0]) : process.cwd();

    const scanResult = await scanFilesForSDKUsage(repoPath);

    const sdkVersion = baselineSdk?.version;
    const validation = await validateSDKMethodCalls(scanResult.methodCalls, sdkVersion);

    const issues: Issue[] = [];

    validation.errors.forEach((error) => {
      issues.push({
        id: this.generateIssueId(error.file, error.line, error.message),
        severity: 'error',
        message: error.message,
        file: error.file,
        line: error.line,
        column: error.column,
        fix: error.fix,
        source: 'static',
      });
    });

    validation.warnings.forEach((warning) => {
      issues.push({
        id: this.generateIssueId(warning.file, warning.line, warning.message),
        severity: 'warning',
        message: warning.message,
        file: warning.file,
        line: warning.line,
        column: warning.column,
        fix: warning.fix,
        source: 'static',
      });
    });

    validation.suggestions.forEach((suggestion) => {
      issues.push({
        id: this.generateIssueId(suggestion.file, suggestion.line, suggestion.message),
        severity: 'suggestion',
        message: suggestion.message,
        file: suggestion.file,
        line: suggestion.line,
        column: suggestion.column,
        fix: suggestion.fix,
        source: 'static',
      });
    });

    const filesAnalyzed: FileAnalysisInfo[] = files.map((file) => ({
      path: file,
      analyzed: true,
      sdkDetected: scanResult.methodCalls.some((call) => call.file === file),
    }));

    return {
      status: validation.errors.length > 0 ? 'partial' : 'success',
      issues,
      changes: {
        eventsAdded: [],
        eventsModified: [],
        eventsRemoved: [],
        propertyChanges: [],
      },
      filesAnalyzed,
    };
  }

  /**
   * Detect changes between baseline and current SDK usage
   */
  async detectChanges(_baseline: SDKUsage, _current: SDKUsage): Promise<ChangesSummary> {
    return {
      eventsAdded: [],
      eventsModified: [],
      eventsRemoved: [],
      propertyChanges: [],
    };
  }

  /**
   * Validate SDK API calls
   */
  async validateAPI(files: string[], repoPath?: string): Promise<Issue[]> {
    const rootPath = repoPath || process.cwd();

    const scanResult = await scanFilesForSDKUsage(rootPath);
    const validation = await validateSDKMethodCalls(scanResult.methodCalls);

    const issues: Issue[] = [];

    [...validation.errors, ...validation.warnings, ...validation.suggestions].forEach((issue) => {
      issues.push({
        id: this.generateIssueId(issue.file, issue.line, issue.message),
        severity: issue.severity,
        message: issue.message,
        file: issue.file,
        line: issue.line,
        column: issue.column,
        fix: issue.fix,
        source: 'static',
      });
    });

    return issues;
  }

  /**
   * Get files with SDK usage (separate method to avoid breaking interface)
   */
  async getFilesWithSDK(repoPath: string): Promise<string[]> {
    const scanResult = await scanFilesForSDKUsage(repoPath);
    return [...new Set(scanResult.methodCalls.map(call => call.file))];
  }

  /**
   * Get supported file extensions
   */
  getSupportedExtensions(): string[] {
    return ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
  }

  /**
   * Get analyzer name
   */
  getName(): string {
    return 'javascript';
  }

  /**
   * Generate unique issue ID
   */
  private generateIssueId(file: string, line: number, message: string): string {
    const hash = crypto.createHash('md5');
    hash.update(`${file}:${line}:${message}`);
    return hash.digest('hex').substring(0, 8);
  }
}
