import type { CDNConfig } from '../config';

export interface VariableInfo {
  value: string;
  line: number;
  snippet: string;
}

export class VariableExtractor {
  constructor(private readonly config: CDNConfig) {}

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
   * Escape special regex characters in variable names
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
