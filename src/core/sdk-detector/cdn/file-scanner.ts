import { extractVersionNumber } from '@core/shared/npm/version-utils';
import type { FileSystem } from '@custom-types/file.type';
import * as path from 'path';
import type { CDNConfig } from '../config';
import { VariableExtractor } from './variable-extractor';
import { logger } from '@core/logging/logger';

export interface CDNResult {
  found: boolean;
  version?: string;
}

const HTML_SCRIPT_TAG_REGEX = /<\s*script[^>]*>([\s\S]*?)<\s*\/\s*script[^>]*>/gi;

export class CDNScanner {
  private readonly variableExtractor: VariableExtractor;

  constructor(
    private readonly fs: FileSystem,
    private readonly config: CDNConfig
  ) {
    this.variableExtractor = new VariableExtractor(config);
  }

  async scan(repoPath: string): Promise<CDNResult> {
    return this.scanDirectory(repoPath);
  }

  private async scanDirectory(dirPath: string): Promise<CDNResult> {
    if (!this.fs.exists(dirPath)) {
      return { found: false };
    }

    try {
      const entries = this.fs.readDir(dirPath);

      for (const entry of entries) {
        const fullPath = this.fs.join(dirPath, entry);
        const isDirectory = this.fs.isDirectory(fullPath);

        if (!isDirectory && this.shouldScanFile(entry)) {
          const result = await this.scanFile(fullPath, entry);
          if (result.found) {
            return result;
          }
        }
      }

      for (const entry of entries) {
        const fullPath = this.fs.join(dirPath, entry);
        const isDirectory = this.fs.isDirectory(fullPath);

        if (isDirectory && !this.shouldExcludeFolder(entry)) {
          const result = await this.scanDirectory(fullPath);
          if (result.found) {
            return result;
          }
        }
      }

      return { found: false };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to scan directory ${dirPath}: ${errorMessage}`);
      return { found: false };
    }
  }

  private shouldScanFile(filename: string): boolean {
    const ext = path.extname(filename);
    return (
      this.config.fileExtensions.javascript.includes(ext) || ext === this.config.fileExtensions.html
    );
  }

  private shouldExcludeFolder(folderName: string): boolean {
    return this.config.excludedFolders.includes(folderName);
  }

  private async scanFile(
    filePath: string,
    filename: string
  ): Promise<{ found: boolean; version?: string }> {
    if (!this.fs.exists(filePath)) {
      return { found: false };
    }

    try {
      const content = this.fs.read(filePath);
      if (!content.includes(this.config.markerString)) {
        return { found: false };
      }

      const jsCode = this.extractJavaScriptCode(content, filename);
      let version: string | undefined;

      if (jsCode) {
        const variables = this.variableExtractor.extract(jsCode);
        if (variables.has(this.config.variableNames.version)) {
          const sdkVersion = variables.get(this.config.variableNames.version)!.value;
          version = extractVersionNumber(sdkVersion);
        }
      }

      // Default to v3 if version not found but marker was detected
      if (!version) {
        version = '3';
      }

      return { found: true, version };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to scan file ${filename}: ${errorMessage}`);
      return { found: false };
    }
  }

  private extractJavaScriptCode(content: string, filename: string): string | null {
    const ext = path.extname(filename);

    if (this.config.fileExtensions.javascript.includes(ext)) {
      return content;
    }

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
