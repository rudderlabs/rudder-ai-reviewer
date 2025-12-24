import { createMockFileSystem } from '@tests/test.utils';
import { CDNScanner } from '../cdn/file-scanner';
import { DEFAULT_JS_CONFIG } from '../config';
import { JavaScriptSDKDetector } from '../javascript-detector';
import { LockFileParser } from '../npm/lock-file-parser';
import { PackageReader } from '../npm/package-reader';

describe('JavaScriptSDKDetector', () => {
  describe('NPM only installation', () => {
    test('detects NPM installation with exact version from lock file', async () => {
      const fs = createMockFileSystem({
        '/repo/package.json': JSON.stringify({
          dependencies: {
            '@rudderstack/analytics-js': '^3.0.0',
          },
        }),
        '/repo/package-lock.json': JSON.stringify({
          packages: {
            'node_modules/@rudderstack/analytics-js': {
              version: '3.0.4',
            },
          },
        }),
      });

      const packageReader = new PackageReader(fs, DEFAULT_JS_CONFIG.npm);
      const lockFileParser = new LockFileParser(fs, DEFAULT_JS_CONFIG.npm);
      const cdnScanner = new CDNScanner(fs, DEFAULT_JS_CONFIG.cdn);
      const detector = new JavaScriptSDKDetector(packageReader, lockFileParser, cdnScanner);

      const result = await detector.detect('/repo');

      expect(result.installationType).toBe('npm');
      expect(result.version).toBe('3.0.4');
    });

    test('detects NPM installation without lock file', async () => {
      const fs = createMockFileSystem({
        '/repo/package.json': JSON.stringify({
          devDependencies: {
            '@rudderstack/analytics-js': '~2.5.0',
          },
        }),
      });

      const packageReader = new PackageReader(fs, DEFAULT_JS_CONFIG.npm);
      const lockFileParser = new LockFileParser(fs, DEFAULT_JS_CONFIG.npm);
      const cdnScanner = new CDNScanner(fs, DEFAULT_JS_CONFIG.cdn);
      const detector = new JavaScriptSDKDetector(packageReader, lockFileParser, cdnScanner);

      const result = await detector.detect('/repo');

      expect(result.installationType).toBe('npm');
      expect(result.version).toBe('2.5.0');
    });
  });

  describe('CDN only installation', () => {
    test('detects CDN installation in HTML file', async () => {
      const fs = createMockFileSystem({
        '/repo/index.html': `
          <html>
            <script>
              const sdkBaseUrl = "https://cdn.rudderlabs.com";
              const sdkVersion = "v3";
              const sdkFileName = "rsa.min.js";
            </script>
          </html>
        `,
      });

      const packageReader = new PackageReader(fs, DEFAULT_JS_CONFIG.npm);
      const lockFileParser = new LockFileParser(fs, DEFAULT_JS_CONFIG.npm);
      const cdnScanner = new CDNScanner(fs, DEFAULT_JS_CONFIG.cdn);
      const detector = new JavaScriptSDKDetector(packageReader, lockFileParser, cdnScanner);

      const result = await detector.detect('/repo');

      expect(result.installationType).toBe('cdn');
      expect(result.version).toBe('3');
    });
  });

  describe('Both NPM and CDN installation', () => {
    test('detects both installations', async () => {
      const fs = createMockFileSystem({
        '/repo/package.json': JSON.stringify({
          dependencies: {
            '@rudderstack/analytics-js': '^3.0.0',
          },
        }),
        '/repo/package-lock.json': JSON.stringify({
          packages: {
            'node_modules/@rudderstack/analytics-js': {
              version: '3.0.4',
            },
          },
        }),
        '/repo/index.html': `
          <script>
            const sdkBaseUrl = "https://cdn.rudderlabs.com";
            const sdkVersion = "v3";
            const sdkFileName = "rsa.min.js";
          </script>
        `,
      });

      const packageReader = new PackageReader(fs, DEFAULT_JS_CONFIG.npm);
      const lockFileParser = new LockFileParser(fs, DEFAULT_JS_CONFIG.npm);
      const cdnScanner = new CDNScanner(fs, DEFAULT_JS_CONFIG.cdn);
      const detector = new JavaScriptSDKDetector(packageReader, lockFileParser, cdnScanner);

      const result = await detector.detect('/repo');

      expect(result.installationType).toBe('both');
      expect(result.version).toBe('3.0.4'); // Prefer NPM version
    });
  });

  describe('No installation', () => {
    test('detects no SDK installation', async () => {
      const fs = createMockFileSystem({
        '/repo/package.json': JSON.stringify({
          dependencies: {
            react: '^18.0.0',
          },
        }),
        '/repo/index.html': '<html><body>No SDK</body></html>',
      });

      const packageReader = new PackageReader(fs, DEFAULT_JS_CONFIG.npm);
      const lockFileParser = new LockFileParser(fs, DEFAULT_JS_CONFIG.npm);
      const cdnScanner = new CDNScanner(fs, DEFAULT_JS_CONFIG.cdn);
      const detector = new JavaScriptSDKDetector(packageReader, lockFileParser, cdnScanner);

      const result = await detector.detect('/repo');

      expect(result.installationType).toBe('none');
      expect(result.version).toBeUndefined();
    });
  });
});
