import { createMockFileSystem } from '@tests/test.utils';
import { LockFileParser } from '../lock-file-parser';

describe('LockFileParser', () => {
  const config = {
    packageName: '@rudderstack/analytics-js',
    lockFiles: { npm: 'package-lock.json', yarn: 'yarn.lock', pnpm: 'pnpm-lock.yaml' },
  };

  describe('NPM lock file', () => {
    test('parses version from package-lock.json', () => {
      const fs = createMockFileSystem({
        '/repo/package-lock.json': JSON.stringify({
          packages: {
            'node_modules/@rudderstack/analytics-js': {
              version: '3.0.4',
            },
          },
        }),
      });
      const parser = new LockFileParser(fs, config);

      const version = parser.getVersion('/repo');

      expect(version).toBe('3.0.4');
    });

    test('returns null when package not found in package-lock.json', () => {
      const fs = createMockFileSystem({
        '/repo/package-lock.json': JSON.stringify({
          packages: {},
        }),
      });
      const parser = new LockFileParser(fs, config);

      const version = parser.getVersion('/repo');

      expect(version).toBeNull();
    });
  });

  describe('Yarn lock file', () => {
    test('parses version from yarn.lock', () => {
      const yarnLock = `
@rudderstack/analytics-js@^3.0.0:
  version "3.0.4"
  resolved "https://registry.yarnpkg.com/@rudderstack/analytics-js/-/analytics-js-3.0.4.tgz"
`;
      const fs = createMockFileSystem({
        '/repo/yarn.lock': yarnLock,
      });
      const parser = new LockFileParser(fs, config);

      const version = parser.getVersion('/repo');

      expect(version).toBe('3.0.4');
    });

    test('returns null when package not found in yarn.lock', () => {
      const fs = createMockFileSystem({
        '/repo/yarn.lock': 'react@^18.0.0:\n  version "18.2.0"',
      });
      const parser = new LockFileParser(fs, config);

      const version = parser.getVersion('/repo');

      expect(version).toBeNull();
    });
  });

  describe('PNPM lock file', () => {
    test('parses version from pnpm-lock.yaml', () => {
      const pnpmLock = `
lockfileVersion: 5.4

packages:
  /@rudderstack/analytics-js/3.0.4:
    resolution: {integrity: sha512-...}
    dev: false

@rudderstack/analytics-js: 3.0.4
`;
      const fs = createMockFileSystem({
        '/repo/pnpm-lock.yaml': pnpmLock,
      });
      const parser = new LockFileParser(fs, config);

      const version = parser.getVersion('/repo');

      expect(version).toBe('3.0.4');
    });

    test('returns null when no lock files exist', () => {
      const fs = createMockFileSystem({});
      const parser = new LockFileParser(fs, config);

      const version = parser.getVersion('/repo');

      expect(version).toBeNull();
    });
  });

  describe('Lock file priority', () => {
    test('prefers package-lock.json over yarn.lock', () => {
      const fs = createMockFileSystem({
        '/repo/package-lock.json': JSON.stringify({
          packages: {
            'node_modules/@rudderstack/analytics-js': { version: '3.0.4' },
          },
        }),
        '/repo/yarn.lock': '@rudderstack/analytics-js@^3.0.0:\n  version "3.0.5"',
      });
      const parser = new LockFileParser(fs, config);

      const version = parser.getVersion('/repo');

      expect(version).toBe('3.0.4');
    });
  });
});
