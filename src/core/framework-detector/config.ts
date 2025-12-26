/**
 * Configuration for framework detection
 */

import type { FrameworkInfo } from './types';

export interface NPMConfig {
  lockFiles: {
    npm: string;
    yarn: string;
    pnpm: string;
  };
}

export interface FrameworkDetectorConfig {
  npm: NPMConfig;
  frameworks: FrameworkInfo[];
}

/**
 * Default framework detection configuration
 *
 * Framework priority hierarchy:
 * - Meta-frameworks (Next.js, Nuxt, etc.) have higher priority (100+) - frameworks that are built on top of other frameworks
 * - Base frameworks (React, Vue, Angular) have lower priority (50-99)
 * - When multiple frameworks are detected, highest priority wins
 *
 */
export const DEFAULT_FRAMEWORK_CONFIG: FrameworkDetectorConfig = {
  npm: {
    lockFiles: {
      npm: 'package-lock.json',
      yarn: 'yarn.lock',
      pnpm: 'pnpm-lock.yaml',
    },
  },
  frameworks: [
    // Frontend Meta-Frameworks (Priority: 100+)
    {
      name: 'Next.js',
      packageName: 'next',
      category: 'frontend',
      priority: 100,
      isMetaFramework: true,
    },
    {
      name: 'Nuxt',
      packageName: 'nuxt',
      category: 'frontend',
      priority: 100,
      isMetaFramework: true,
    },

    // Frontend Base Frameworks (Priority: 50-99)
    {
      name: 'React',
      packageName: 'react',
      category: 'frontend',
      priority: 50,
      isMetaFramework: false,
    },
    {
      name: 'Vue',
      packageName: 'vue',
      category: 'frontend',
      priority: 50,
      isMetaFramework: false,
    },
    {
      name: 'Angular',
      packageName: '@angular/core',
      category: 'frontend',
      priority: 50,
      isMetaFramework: false,
    },
  ],
};
