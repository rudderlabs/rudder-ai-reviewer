import { createMockFileSystem } from '@tests/test.utils';
import { CDNScanner } from '../file-scanner';
import { logger } from '@core/logging/logger';

jest.mock('@core/logging/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  },
}));

const mockLogger = logger as jest.Mocked<typeof logger>;

describe('CDNScanner', () => {
  const config = {
    markerString: 'RudderSnippetVersion',
    excludedFolders: ['node_modules', 'dist', 'build', 'coverage', '.git', '.next', '.nuxt'],
    variableNames: {
      baseUrl: 'sdkBaseUrl',
      version: 'sdkVersion',
      fileName: 'sdkFileName',
    },
    fileName: 'rsa.min.js',
    fileExtensions: {
      javascript: ['.tsx', '.jsx', '.ts', '.js', '.vue', '.svelte', '.astro'],
      html: '.html',
    },
  };

  describe('scan', () => {
    test('detects CDN usage with RudderSnippetVersion marker in JavaScript file', async () => {
      const fs = createMockFileSystem({
        '/repo/src/app/layout.tsx': `
          window.RudderSnippetVersion = "3.2.0";
          const sdkBaseUrl = "https://cdn.rudderlabs.com";
          const sdkVersion = "v3";
          const sdkFileName = "rsa.min.js";
        `,
      });
      const scanner = new CDNScanner(fs, config);

      const result = await scanner.scan('/repo');

      expect(result.found).toBe(true);
      expect(result.version).toBe('3');
    });

    test('detects CDN usage with RudderSnippetVersion marker in HTML file', async () => {
      const fs = createMockFileSystem({
        '/repo/index.html': `
          <html>
            <head>
              <script>
                window.RudderSnippetVersion = "3.2.0";
                const sdkBaseUrl = "https://cdn.rudderlabs.com";
                const sdkVersion = "v3.0.0";
                const sdkFileName = "rsa.min.js";
              </script>
            </head>
          </html>
        `,
      });
      const scanner = new CDNScanner(fs, config);

      const result = await scanner.scan('/repo');

      expect(result.found).toBe(true);
      expect(result.version).toBe('3.0.0');
    });

    test('detects CDN usage with marker even without version variable', async () => {
      const fs = createMockFileSystem({
        '/repo/index.html': `
          <html>
            <head>
              <script>
                window.RudderSnippetVersion = "3.2.0";
                // No sdkVersion variable here
              </script>
            </head>
          </html>
        `,
      });
      const scanner = new CDNScanner(fs, config);

      const result = await scanner.scan('/repo');

      expect(result.found).toBe(true);
      expect(result.version).toBe('3'); // Defaults to v3
    });

    test('returns not found when no RudderSnippetVersion marker', async () => {
      const fs = createMockFileSystem({
        '/repo/index.html': `
          <html>
            <head>
              <script>
                const sdkBaseUrl = "https://cdn.rudderlabs.com";
                const sdkVersion = "v3";
                const sdkFileName = "rsa.min.js";
              </script>
            </head>
          </html>
        `,
      });
      const scanner = new CDNScanner(fs, config);

      const result = await scanner.scan('/repo');

      expect(result.found).toBe(false);
      expect(result.version).toBeUndefined();
    });

    test('returns not found when directory does not exist', async () => {
      const fs = createMockFileSystem({});
      const scanner = new CDNScanner(fs, config);

      const result = await scanner.scan('/repo');

      expect(result.found).toBe(false);
      expect(result.version).toBeUndefined();
    });

    test('recursively scans subdirectories', async () => {
      const fs = createMockFileSystem({
        '/repo/src/utils/helper.js': 'console.log("no SDK")',
        '/repo/src/components/deep/nested/Analytics.tsx': `
          window.RudderSnippetVersion = "3.2.0";
          const sdkVersion = "v3.5.0";
        `,
      });
      const scanner = new CDNScanner(fs, config);

      const result = await scanner.scan('/repo');

      expect(result.found).toBe(true);
      expect(result.version).toBe('3.5.0');
    });

    test('excludes folders from scanning', async () => {
      const fs = createMockFileSystem({
        '/repo/node_modules/package/index.js': 'window.RudderSnippetVersion = "3.2.0";',
        '/repo/dist/bundle.js': 'window.RudderSnippetVersion = "3.2.0";',
        '/repo/src/app.js': 'console.log("no SDK")',
      });
      const scanner = new CDNScanner(fs, config);

      const result = await scanner.scan('/repo');

      expect(result.found).toBe(false);
    });

    test('only scans files with allowed extensions', async () => {
      const fs = createMockFileSystem({
        '/repo/README.md': 'window.RudderSnippetVersion = "3.2.0";',
        '/repo/data.json': '{"version": "window.RudderSnippetVersion"}',
        '/repo/script.js': 'window.RudderSnippetVersion = "3.2.0";',
      });
      const scanner = new CDNScanner(fs, config);

      const result = await scanner.scan('/repo');

      expect(result.found).toBe(true);
    });

    test('scans Vue, Svelte, and Astro files', async () => {
      const fs = createMockFileSystem({
        '/repo/src/App.vue': `
          <script>
            window.RudderSnippetVersion = "3.2.0";
            const sdkVersion = "v3.1.0";
          </script>
        `,
      });
      const scanner = new CDNScanner(fs, config);

      const result = await scanner.scan('/repo');

      expect(result.found).toBe(true);
      expect(result.version).toBe('3.1.0');
    });

    test('returns on first match for performance', async () => {
      const fs = createMockFileSystem({
        '/repo/first.js': 'window.RudderSnippetVersion = "3.2.0"; const sdkVersion = "v1.0.0";',
        '/repo/second.js': 'window.RudderSnippetVersion = "3.2.0"; const sdkVersion = "v2.0.0";',
      });
      const scanner = new CDNScanner(fs, config);

      const result = await scanner.scan('/repo');

      expect(result.found).toBe(true);
      // Should find first.js first
      expect(result.version).toBe('1.0.0');
    });

    test('handles file read errors gracefully', async () => {
      const fs = createMockFileSystem({
        '/repo/error.js': 'some content',
      });
      fs.read = jest.fn().mockImplementation(() => {
        throw new Error('File read error');
      });

      const scanner = new CDNScanner(fs, config);

      const result = await scanner.scan('/repo');

      expect(result.found).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
