import * as core from '@actions/core';
import { createMockFileSystem } from '@tests/test.utils';
import { CDNScanner } from '../file-scanner';

jest.mock('@actions/core');

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
      expect(result.version).toBeUndefined();
    });

    test('returns not found when search files do not exist', async () => {
      const fs = createMockFileSystem({});
      const scanner = new CDNScanner(fs, config);

      const result = await scanner.scan('/repo');

      expect(result.found).toBe(false);
      expect(result.version).toBeUndefined();
    });

    test('scans multiple files and returns on first match', async () => {
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
      expect(result.version).toBe('3');
    });

    test('handles file read errors gracefully', async () => {
      const fs = createMockFileSystem({});
      fs.exists = jest.fn().mockReturnValue(true);
      fs.read = jest.fn().mockImplementation(() => {
        throw new Error('File read error');
      });

      const scanner = new CDNScanner(fs, config);
      const coreErrorSpy = jest.spyOn(core, 'error').mockImplementation();

      const result = await scanner.scan('/repo');

      expect(result.found).toBe(false);
      expect(coreErrorSpy).toHaveBeenCalled();

      coreErrorSpy.mockRestore();
    });
  });
});
