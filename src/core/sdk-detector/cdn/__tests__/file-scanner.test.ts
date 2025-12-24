import { createMockFileSystem } from '@tests/test.utils';
import { CDNScanner } from '../file-scanner';

describe('CDNScanner', () => {
  const config = {
    searchPaths: ['index.html', 'public/index.html', 'src/app/layout.tsx'],
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
  };

  describe('scan', () => {
    test('detects CDN usage in JavaScript file', async () => {
      const fs = createMockFileSystem({
        '/repo/src/app/layout.tsx': `
          const sdkBaseUrl = "https://cdn.rudderlabs.com";
          const sdkVersion = "v3";
          const sdkFileName = "rsa.min.js";
        `,
      });
      const scanner = new CDNScanner(fs, config);

      const result = await scanner.scan('/repo');

      expect(result.found).toBe(true);
      expect(result.version).toBe('3');
      expect(result.files).toContain('src/app/layout.tsx');
      expect(result.locations.length).toBeGreaterThan(0);
    });

    test('detects CDN usage in HTML file', async () => {
      const fs = createMockFileSystem({
        '/repo/index.html': `
          <html>
            <head>
              <script>
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
      expect(result.files).toContain('index.html');
    });

    test('returns not found when no CDN usage', async () => {
      const fs = createMockFileSystem({
        '/repo/index.html': `
          <html>
            <head>
              <script>
                console.log("No RudderStack here");
              </script>
            </head>
          </html>
        `,
      });
      const scanner = new CDNScanner(fs, config);

      const result = await scanner.scan('/repo');

      expect(result.found).toBe(false);
      expect(result.files).toEqual([]);
      expect(result.locations).toEqual([]);
    });

    test('returns not found when search files do not exist', async () => {
      const fs = createMockFileSystem({});
      const scanner = new CDNScanner(fs, config);

      const result = await scanner.scan('/repo');

      expect(result.found).toBe(false);
      expect(result.files).toEqual([]);
    });

    test('scans multiple files and finds first match', async () => {
      const fs = createMockFileSystem({
        '/repo/index.html': '<html><body>No SDK</body></html>',
        '/repo/public/index.html': `
          <script>
            const sdkBaseUrl = "https://cdn.rudderlabs.com";
            const sdkVersion = "v3";
            const sdkFileName = "rsa.min.js";
          </script>
        `,
      });
      const scanner = new CDNScanner(fs, config);

      const result = await scanner.scan('/repo');

      expect(result.found).toBe(true);
      expect(result.files).toContain('public/index.html');
      expect(result.files).not.toContain('index.html');
    });
  });
});
