/**
 * Scan files for RudderStack CDN usage
 */

import type { FileSystem } from '@custom-types/file.type';
import * as path from 'path';
import type { CDNConfig } from '../config';
import { extractVersionNumber } from '../npm/version-utils';
import type { SDKLocation } from '../types';
import { VariableExtractor, type VariableInfo } from './variable-extractor';

export interface CDNResult {
  found: boolean;
  version?: string;
  files: string[];
  locations: SDKLocation[];
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
    const files: string[] = [];
    const locations: SDKLocation[] = [];
    let version: string | undefined;

    for (const file of this.config.searchPaths) {
      const filePath = this.fs.join(repoPath, file);
      const result = await this.scanFile(filePath, file);

      if (result.found) {
        files.push(file);

        if (result.version && !version) {
          version = result.version;
        }

        locations.push(...result.locations);
      }
    }

    return {
      found: files.length > 0,
      version,
      files,
      locations,
    };
  }

  /**
   * Scan a single file for CDN usage
   */
  private async scanFile(
    filePath: string,
    filename: string
  ): Promise<{ found: boolean; version?: string; locations: SDKLocation[] }> {
    if (!this.fs.exists(filePath)) {
      return { found: false, locations: [] };
    }

    try {
      const content = this.fs.read(filePath);
      const jsCode = this.extractJavaScriptCode(content, filename);

      if (!jsCode) {
        return { found: false, locations: [] };
      }

      const variables = this.variableExtractor.extract(jsCode);
      if (!variables) {
        return { found: false, locations: [] };
      }

      const found = this.variableExtractor.isCDNDetected(variables);
      if (!found) {
        return { found: false, locations: [] };
      }

      // Extract version
      let version: string | undefined;
      if (variables.has(this.config.variableNames.version)) {
        const sdkVersion = variables.get(this.config.variableNames.version)!.value;
        version = extractVersionNumber(sdkVersion);
      }

      // Build locations
      const locations = this.buildLocations(variables, filename);

      return { found, version, locations };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to scan file ${filename}: ${errorMessage}`);
      return { found: false, locations: [] };
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

  /**
   * Build SDK locations from variable info
   */
  private buildLocations(variables: Map<string, VariableInfo>, filename: string): SDKLocation[] {
    const locations: SDKLocation[] = [];

    if (variables.has(this.config.variableNames.baseUrl)) {
      const info = variables.get(this.config.variableNames.baseUrl)!;
      locations.push({ file: filename, line: info.line, type: 'cdn', snippet: info.snippet });
    } else if (variables.has(this.config.variableNames.version)) {
      const info = variables.get(this.config.variableNames.version)!;
      locations.push({ file: filename, line: info.line, type: 'cdn', snippet: info.snippet });
    }

    return locations;
  }
}
