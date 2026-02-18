import micromatch from 'micromatch';

/**
 * File extensions that CAN contain RudderStack SDK instrumentation.
 * These are the only file types we'll review for SDK changes.
 */
export const SOURCE_FILE_PATTERNS = [
  // JavaScript/TypeScript (primary SDK usage)
  '**/*.js',
  '**/*.jsx',
  '**/*.ts',
  '**/*.tsx',
  '**/*.mjs',
  '**/*.cjs',

  // Framework-specific (can contain SDK calls in script sections)
  '**/*.vue',
  '**/*.svelte',
  '**/*.astro',

  // HTML (CDN snippet integration)
  '**/*.html',
  '**/*.htm',

  // Server-side SDKs
  '**/*.py', // Python SDK
  '**/*.rb', // Ruby SDK
  '**/*.go', // Go SDK
  '**/*.java', // Java/Android SDK
  '**/*.kt', // Kotlin/Android SDK
  '**/*.swift', // iOS SDK
  '**/*.m', // Objective-C iOS SDK

  // Package manifest (shows SDK dependency changes)
  '**/package.json',
  '**/deno.json',
];

/**
 * Paths to always exclude (even if extension matches source patterns).
 * These files cannot contain meaningful SDK instrumentation code.
 */
export const EXCLUDED_PATH_PATTERNS = [
  // Lock files (auto-generated)
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'Gemfile.lock',
  'Cargo.lock',
  'poetry.lock',
  'composer.lock',
  'go.sum',
  'Pipfile.lock',

  // Test files (mock SDK, don't show real instrumentation)
  '**/*.test.js',
  '**/*.test.ts',
  '**/*.test.jsx',
  '**/*.test.tsx',
  '**/*.spec.js',
  '**/*.spec.ts',
  '**/*.spec.jsx',
  '**/*.spec.tsx',
  '**/__tests__/**',
  '**/__mocks__/**',
  '**/__snapshots__/**',
  '**/test/**',
  '**/tests/**',
  '**/spec/**',
  '**/*.stories.js',
  '**/*.stories.ts',
  '**/*.stories.jsx',
  '**/*.stories.tsx',

  // Generated/build outputs
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/output/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.svelte-kit/**',
  '**/.astro/**',
  '**/coverage/**',
  '**/.turbo/**',
  '**/.cache/**',
  '**/*.min.js',
  '**/*.min.css',
  '**/*.bundle.js',
  '**/*.chunk.js',
  '**/*.map',
  '**/*.d.ts',
  '**/*.d.mts',

  // Dependencies
  '**/node_modules/**',
  '**/vendor/**',
  '**/bower_components/**',
  '**/.pnp.*',
  '**/.yarn/**',

  // IDE/Editor
  '**/.vscode/**',
  '**/.idea/**',
  '**/*.code-workspace',
  '**/.fleet/**',

  // CI/CD configs
  '**/.github/**',
  '**/.gitlab/**',
  '**/.circleci/**',
  '**/Jenkinsfile',
  '**/.travis.yml',
  '**/azure-pipelines.yml',

  // Config files (build/lint, not runtime code)
  '**/tsconfig*.json',
  '**/jsconfig*.json',
  '**/.eslintrc*',
  '**/.prettierrc*',
  '**/webpack.config.*',
  '**/vite.config.*',
  '**/rollup.config.*',
  '**/jest.config.*',
  '**/vitest.config.*',
  '**/playwright.config.*',
  '**/babel.config.*',
  '**/.babelrc*',
  '**/postcss.config.*',
  '**/tailwind.config.*',
  '**/next.config.*',
  '**/nuxt.config.*',

  // Documentation
  '**/*.md',
  '**/*.mdx',
  '**/*.rst',
  '**/*.txt',
  '**/README*',
  '**/CHANGELOG*',
  '**/LICENSE*',
  '**/CONTRIBUTING*',
  '**/docs/**',
  '**/documentation/**',

  // Data/config files
  '**/*.yaml',
  '**/*.yml',
  '**/*.toml',
  '**/*.ini',
  '**/*.conf',
  '**/*.json', // Generic JSON (package.json is explicitly included in SOURCE_FILE_PATTERNS)
  '**/*.xml',
  '**/*.csv',
  '**/*.sql',

  // Stylesheets (cannot contain JS)
  '**/*.css',
  '**/*.scss',
  '**/*.sass',
  '**/*.less',
  '**/*.styl',

  // Binary/media files
  '**/*.png',
  '**/*.jpg',
  '**/*.jpeg',
  '**/*.gif',
  '**/*.ico',
  '**/*.svg',
  '**/*.webp',
  '**/*.avif',
  '**/*.bmp',
  '**/*.tiff',
  '**/*.mp4',
  '**/*.webm',
  '**/*.mov',
  '**/*.avi',
  '**/*.mp3',
  '**/*.wav',
  '**/*.woff',
  '**/*.woff2',
  '**/*.ttf',
  '**/*.eot',
  '**/*.otf',
  '**/*.pdf',
  '**/*.zip',
  '**/*.tar.gz',
  '**/*.rar',
  '**/*.7z',
  '**/*.exe',
  '**/*.dll',
  '**/*.so',
  '**/*.dylib',

  // OS/system files
  '**/.DS_Store',
  '**/Thumbs.db',
  '**/desktop.ini',

  // Environment/secrets (should never be in PRs)
  '**/.env*',
  '**/*.pem',
  '**/*.key',
  '**/*.cert',
  '**/*.crt',

  // Docker/Infrastructure
  '**/Dockerfile*',
  '**/docker-compose*.yml',
  '**/docker-compose*.yaml',
  '**/*.tf',
  '**/*.tfvars',
  '**/terraform/**',
  '**/k8s/**',
  '**/kubernetes/**',
  '**/helm/**',

  // Misc
  '**/.git/**',
  '**/.gitignore',
  '**/.gitattributes',
  '**/.editorconfig',
  '**/.nvmrc',
  '**/.node-version',
  '**/Makefile',
  '**/CMakeLists.txt',
];

/**
 * Determines if a file should be included in the PR review.
 *
 * Uses a two-step filtering approach:
 * 1. Check if the file extension can contain SDK code (SOURCE_FILE_PATTERNS)
 * 2. Check if the file path is explicitly excluded (EXCLUDED_PATH_PATTERNS)
 *
 * Special handling: package.json is always included if it matches source patterns,
 * even though *.json files are generally excluded.
 *
 * @param filename - The file path to check
 * @returns true if the file should be included in the review
 */
export function shouldIncludeFile(filename: string): boolean {
  // Step 1: Is it a source file type?
  const isSourceFile = micromatch.isMatch(filename, SOURCE_FILE_PATTERNS);
  if (!isSourceFile) {
    return false;
  }

  // Special case: package.json is explicitly included in SOURCE_FILE_PATTERNS
  // and should not be excluded by the generic *.json pattern
  const basename = filename.split('/').pop() || '';
  if (basename === 'package.json' || basename === 'deno.json') {
    return true;
  }

  // Step 2: Is it in an excluded path?
  const isExcluded = micromatch.isMatch(filename, EXCLUDED_PATH_PATTERNS);
  return !isExcluded;
}
