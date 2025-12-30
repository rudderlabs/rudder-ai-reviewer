import { createMockFileSystem } from '@tests/test.utils';
import { LockFileParser } from '../lock-file-parser';

const TEST_CONFIG = {
  lockFiles: {
    npm: 'package-lock.json',
    yarn: 'yarn.lock',
    pnpm: 'pnpm-lock.yaml',
  },
};

describe('LockFileParser', () => {
  describe('npm lock file', () => {
    test('extracts version from package-lock.json', async () => {
      const fs = createMockFileSystem({
        '/repo/package.json': JSON.stringify({
          name: 'test-app',
          version: '1.0.0',
          dependencies: {
            '@rudderstack/analytics-js': '^3.0.0',
          },
        }),
        '/repo/package-lock.json': JSON.stringify({
          packages: {
            'node_modules/@rudderstack/analytics-js': { version: '3.0.0' },
          },
        }),
      });
      const parser = new LockFileParser(fs, TEST_CONFIG);

      const result = await parser.getVersion('/repo', '@rudderstack/analytics-js');

      expect(result).toBe('3.0.0');
    });

    test('returns null when package not found in lock file', async () => {
      const fs = createMockFileSystem({
        '/repo/package.json': JSON.stringify({
          name: 'test-app',
          version: '1.0.0',
        }),
        '/repo/package-lock.json': JSON.stringify({
          packages: {
            'node_modules/other-package': { version: '1.0.0' },
          },
        }),
      });
      const parser = new LockFileParser(fs, TEST_CONFIG);

      const result = await parser.getVersion('/repo', '@rudderstack/analytics-js');

      expect(result).toBeNull();
    });
  });

  describe('yarn lock file', () => {
    test('extracts version from yarn.lock', async () => {
      const fs = createMockFileSystem({
        '/repo/package.json': JSON.stringify({
          name: 'test-app',
          version: '1.0.0',
          dependencies: {
            '@rudderstack/analytics-js': '^3.0.0',
          },
        }),
        '/repo/yarn.lock': `
"@rudderstack/analytics-js@^3.0.0":
  version "3.0.0"
  resolved "https://registry.yarnpkg.com/@rudderstack/analytics-js/-/analytics-js-3.0.0.tgz"
`,
      });
      const parser = new LockFileParser(fs, TEST_CONFIG);

      const result = await parser.getVersion('/repo', '@rudderstack/analytics-js');

      expect(result).toBe('3.0.0');
    });
  });

  describe('pnpm lock file', () => {
    test('extracts version from pnpm-lock.yaml', async () => {
      const pnpmLock = `lockfileVersion: '6.0'

dependencies:
  '@rudderstack/analytics-js':
    specifier: ^3.0.0
    version: 3.0.0

packages:

  /@rudderstack/analytics-js@3.0.0:
    resolution: {integrity: sha512-abc123}
    dev: false
`;
      const fs = createMockFileSystem({
        '/repo/package.json': JSON.stringify({
          name: 'test-app',
          version: '1.0.0',
          dependencies: {
            '@rudderstack/analytics-js': '^3.0.0',
          },
        }),
        '/repo/pnpm-lock.yaml': pnpmLock,
      });
      const parser = new LockFileParser(fs, TEST_CONFIG);

      const result = await parser.getVersion('/repo', '@rudderstack/analytics-js');

      expect(result).toBe('3.0.0');
    });
  });

  describe('fallback behavior', () => {
    test('returns null when no lock files exist', async () => {
      const fs = createMockFileSystem({});
      const parser = new LockFileParser(fs, TEST_CONFIG);

      const result = await parser.getVersion('/repo', '@rudderstack/analytics-js');

      expect(result).toBeNull();
    });

    test('tries yarn.lock when package-lock.json is missing', async () => {
      const fs = createMockFileSystem({
        '/repo/package.json': JSON.stringify({
          name: 'test-app',
          version: '1.0.0',
          dependencies: {
            '@rudderstack/analytics-js': '^3.0.0',
          },
        }),
        '/repo/yarn.lock': `
"@rudderstack/analytics-js@^3.0.0":
  version "3.0.0"
`,
      });
      const parser = new LockFileParser(fs, TEST_CONFIG);

      const result = await parser.getVersion('/repo', '@rudderstack/analytics-js');

      expect(result).toBe('3.0.0');
    });
  });
});
