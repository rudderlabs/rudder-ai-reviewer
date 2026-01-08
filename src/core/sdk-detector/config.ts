export interface NPMConfig {
  packageName: string;
  lockFiles: {
    npm: string;
    yarn: string;
    pnpm: string;
  };
}

export interface CDNConfig {
  markerString: string;
  excludedFolders: string[];
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
    markerString: 'RudderSnippetVersion',
    excludedFolders: ['node_modules', 'dist', 'build', 'coverage', '.git', '.next', '.nuxt'],
    variableNames: {
      baseUrl: 'sdkBaseUrl',
      version: 'sdkVersion',
      fileName: 'sdkFileName',
    },
    fileName: 'rsa.min.js',
    fileExtensions: {
      javascript: ['.tsx', '.jsx', '.ts', '.js', '.vue'],
      html: '.html',
    },
  },
};
