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
      const detector = new JavaScriptSDKDetector(
        packageReader,
        lockFileParser,
        cdnScanner,
        DEFAULT_JS_CONFIG
      );

      const result = await detector.detect('/repo');

      expect(result.installationType).toBe('npm');
      expect(result.npmVersion).toBe('3.0.4');
      expect(result.cdnVersion).toBeUndefined();
      expect(result.details).toContain('✅ NPM: Found @rudderstack/analytics-js@3.0.0');
      expect(result.details).toContain('   Exact version from lock file: 3.0.4');
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
      const detector = new JavaScriptSDKDetector(
        packageReader,
        lockFileParser,
        cdnScanner,
        DEFAULT_JS_CONFIG
      );

      const result = await detector.detect('/repo');

      expect(result.installationType).toBe('npm');
      expect(result.npmVersion).toBe('2.5.0');
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
      const detector = new JavaScriptSDKDetector(
        packageReader,
        lockFileParser,
        cdnScanner,
        DEFAULT_JS_CONFIG
      );

      const result = await detector.detect('/repo');

      expect(result.installationType).toBe('cdn');
      expect(result.cdnVersion).toBe('3');
      expect(result.npmVersion).toBeUndefined();
      expect(result.details).toContain('✅ CDN: Found RudderStack CDN snippet');
      expect(result.details).toContain('   CDN version: 3');
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
      const detector = new JavaScriptSDKDetector(
        packageReader,
        lockFileParser,
        cdnScanner,
        DEFAULT_JS_CONFIG
      );

      const result = await detector.detect('/repo');

      expect(result.installationType).toBe('both');
      expect(result.npmVersion).toBe('3.0.4');
      expect(result.cdnVersion).toBe('3');
      expect(result.details).toContain('ℹ️  Both NPM and CDN installations detected');
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
      const detector = new JavaScriptSDKDetector(
        packageReader,
        lockFileParser,
        cdnScanner,
        DEFAULT_JS_CONFIG
      );

      const result = await detector.detect('/repo');

      expect(result.installationType).toBe('none');
      expect(result.npmVersion).toBeUndefined();
      expect(result.cdnVersion).toBeUndefined();
      expect(result.details).toContain('❌ No RudderStack SDK installation detected');
    });
  });
});
