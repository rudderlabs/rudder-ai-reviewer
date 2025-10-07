/**
 * Analyzer Factory
 * Creates appropriate analyzer based on language/file types
 */

import { BaseAnalyzer } from './base-analyzer';
import { JavaScriptAnalyzer } from './javascript/javascript-analyzer';
import * as path from 'path';

export type SupportedLanguage = 'javascript' | 'swift' | 'kotlin';

/**
 * Creates an analyzer for the given language
 */
export function createAnalyzer(language: SupportedLanguage): BaseAnalyzer {
  switch (language) {
    case 'javascript':
      return new JavaScriptAnalyzer();
    case 'swift':
      throw new Error('Swift analyzer not yet implemented');
    case 'kotlin':
      throw new Error('Kotlin analyzer not yet implemented');
    default:
      throw new Error(`Unsupported language: ${language}`);
  }
}

/**
 * Detects language from file extensions
 */
export function detectLanguage(files: string[]): SupportedLanguage {
  const extensions = files.map((f) => path.extname(f).toLowerCase());

  // JavaScript/TypeScript detection
  const jsExtensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
  if (extensions.some((ext) => jsExtensions.includes(ext))) {
    return 'javascript';
  }

  // Swift detection
  if (extensions.some((ext) => ext === '.swift')) {
    return 'swift';
  }

  // Kotlin detection
  if (extensions.some((ext) => ext === '.kt' || ext === '.kts')) {
    return 'kotlin';
  }

  // Default to JavaScript
  return 'javascript';
}

/**
 * Gets all available analyzers
 */
export function getAvailableAnalyzers(): SupportedLanguage[] {
  return ['javascript']; // Swift and Kotlin will be added in future
}

/**
 * Checks if a language analyzer is available
 */
export function isAnalyzerAvailable(language: SupportedLanguage): boolean {
  return getAvailableAnalyzers().includes(language);
}
