import type { FrameworkInfo } from './types';

export interface FrameworkDetectorConfig {
  frameworks: FrameworkInfo[];
}

/**
 * Default framework detection configuration
 */
export const DEFAULT_FRAMEWORK_CONFIG: FrameworkDetectorConfig = {
  frameworks: [
    { name: 'Next.js', packageName: 'next', category: 'frontend' },
    { name: 'Nuxt', packageName: 'nuxt', category: 'frontend' },
    { name: 'React', packageName: 'react', category: 'frontend' },
    { name: 'Vue', packageName: 'vue', category: 'frontend' },
    { name: 'Angular', packageName: '@angular/core', category: 'frontend' },
  ],
};
