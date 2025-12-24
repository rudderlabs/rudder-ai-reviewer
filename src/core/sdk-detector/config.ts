/**
 * Configuration for SDK detection
 */

export interface NPMConfig {
  packageName: string;
  lockFiles: {
    npm: string;
    yarn: string;
    pnpm: string;
  };
}

export interface CDNConfig {
  searchPaths: string[];
  variableNames: {
    baseUrl: string;
    version: string;
    fileName: string;
  };
  fileName: string;
  fileExtensions: {
    javascript: readonly string[];
    html: string;
  };
}

export interface JSDetectorConfig {
  npm: NPMConfig;
  cdn: CDNConfig;
}

export const DEFAULT_JS_CONFIG: JSDetectorConfig = {
  npm: {
    packageName: '@rudderstack/analytics-js',
    lockFiles: {
      npm: 'package-lock.json',
      yarn: 'yarn.lock',
      pnpm: 'pnpm-lock.yaml',
    },
  },
  cdn: {
    searchPaths: [
      'index.html',
      'public/index.html',
      'src/index.html',
      'src/app/layout.tsx',
      'src/app/layout.jsx',
      'src/pages/_app.tsx',
      'src/pages/_app.jsx',
      'pages/_app.tsx',
      'pages/_app.jsx',
    ],
    variableNames: {
      baseUrl: 'sdkBaseUrl',
      version: 'sdkVersion',
      fileName: 'sdkFileName',
    },
    fileName: 'rsa.min.js',
    fileExtensions: {
      javascript: ['.tsx', '.jsx', '.ts', '.js'],
      html: '.html',
    },
  },
};
