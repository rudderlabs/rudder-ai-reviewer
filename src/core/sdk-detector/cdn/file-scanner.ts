/**
 * Scan files for RudderStack CDN usage
 */

import type { FileSystem } from '@custom-types/file.type';
import * as path from 'path';
import type { CDNConfig } from '../config';
import { extractVersionNumber } from '@core/shared/npm/version-utils';
import { VariableExtractor } from './variable-extractor';

export interface CDNResult {
  found: boolean;
  version?: string;
}

const HTML_SCRIPT_TAG_REGEX = /<script[^>]*>([\s\S]*?)<\/script>/gi;

export class CDNScanner {
  private variableExtractor: VariableExtractor;

  constructor(
    private fs: FileSystem,
    private config: CDNConfig
  ) {
    this.variableExtractor = new VariableExtractor(config);
  }

  /**
   * Scan common file paths for CDN usage
   */
  async scan(repoPath: string): Promise<CDNResult> {
    let version: string | undefined;

    for (const file of this.config.searchPaths) {
      const filePath = this.fs.join(repoPath, file);
      const result = await this.scanFile(filePath, file);

      if (result.found) {
        if (result.version && !version) {
          version = result.version;
        }
        // Found CDN usage, we can return early
        return { found: true, version };
      }
    }

    return { found: false };
  }

  /**
   * Scan a single file for CDN usage
   */
  private async scanFile(
    filePath: string,
    filename: string
  ): Promise<{ found: boolean; version?: string }> {
    if (!this.fs.exists(filePath)) {
      return { found: false };
    }

    try {
      const content = this.fs.read(filePath);
      const jsCode = this.extractJavaScriptCode(content, filename);

      if (!jsCode) {
        return { found: false };
      }

      const variables = this.variableExtractor.extract(jsCode);
      if (!variables) {
        return { found: false };
      }

      const found = this.variableExtractor.isCDNDetected(variables);
      if (!found) {
        return { found: false };
      }

      // Extract version
      let version: string | undefined;
      if (variables.has(this.config.variableNames.version)) {
        const sdkVersion = variables.get(this.config.variableNames.version)!.value;
        version = extractVersionNumber(sdkVersion);
      }

      return { found, version };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to scan file ${filename}: ${errorMessage}`);
      return { found: false };
    }
  }

  /**
   * Extract JavaScript code from various file types
   */
  private extractJavaScriptCode(content: string, filename: string): string | null {
    const ext = path.extname(filename);

    // For .tsx/.jsx/.ts/.js files, return as-is
    if (this.config.fileExtensions.javascript.includes(ext)) {
      return content;
    }

    // For HTML files, extract script tags
    if (ext === this.config.fileExtensions.html) {
      const scriptMatches = content.matchAll(HTML_SCRIPT_TAG_REGEX);
      const scripts: string[] = [];

      for (const match of scriptMatches) {
        scripts.push(match[1]);
      }

      return scripts.length > 0 ? scripts.join('\n\n') : null;
    }

    return null;
  }
}
