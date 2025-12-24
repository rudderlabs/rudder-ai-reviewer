/**
 * Simple regex-based variable extraction for CDN detection
 * Alternative to AST-based approach - lighter and faster for simple pattern matching
 */

import type { CDNConfig } from '../config';

export interface VariableInfo {
  value: string;
  line: number;
  snippet: string;
}

export class VariableExtractor {
  constructor(private config: CDNConfig) {}

  /**
   * Extract CDN configuration variables from JavaScript code using regex
   * Matches patterns like: const varName = "value"
   */
  extract(code: string): Map<string, VariableInfo> {
    const variables = new Map<string, VariableInfo>();
    const lines = code.split('\n');

    const varNames = [
      this.config.variableNames.baseUrl,
      this.config.variableNames.version,
      this.config.variableNames.fileName,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const varName of varNames) {
        if (variables.has(varName)) continue;

        const regex = new RegExp(
          `(?:const|let|var)\\s+${this.escapeRegex(varName)}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`
        );
        const match = line.match(regex);

        if (match) {
          variables.set(varName, {
            value: match[1],
            line: i + 1,
            snippet: line.trim(),
          });
        }
      }
    }

    return variables;
  }

  /**
   * Check if all required CDN variables are present
   */
  isCDNDetected(variables: Map<string, VariableInfo>): boolean {
    const hasBaseUrl = variables.has(this.config.variableNames.baseUrl);
    const hasVersion = variables.has(this.config.variableNames.version);
    const hasFileName =
      variables.has(this.config.variableNames.fileName) &&
      variables.get(this.config.variableNames.fileName)?.value.includes(this.config.fileName);

    return hasBaseUrl && hasVersion && hasFileName === true;
  }

  /**
   * Escape special regex characters in variable names
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
