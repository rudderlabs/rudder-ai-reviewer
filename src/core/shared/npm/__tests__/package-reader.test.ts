import { createMockFileSystem } from '@tests/test.utils';
import { PackageReader } from '../package-reader';

describe('PackageReader', () => {
  describe('getVersions', () => {
    test('returns versions from dependencies', () => {
      const fs = createMockFileSystem({
        '/repo/package.json': JSON.stringify({
          dependencies: {
            react: '^18.0.0',
            next: '^14.0.0',
          },
        }),
      });
      const reader = new PackageReader(fs);

      const versions = reader.getVersions('/repo', ['react', 'next']);

      expect(versions.get('react')).toBe('18.0.0');
      expect(versions.get('next')).toBe('14.0.0');
      expect(versions.size).toBe(2);
    });

    test('returns versions from devDependencies', () => {
      const fs = createMockFileSystem({
        '/repo/package.json': JSON.stringify({
          devDependencies: {
            '@rudderstack/analytics-js': '~3.5.0',
          },
        }),
      });
      const reader = new PackageReader(fs);

      const versions = reader.getVersions('/repo', ['@rudderstack/analytics-js']);

      expect(versions.get('@rudderstack/analytics-js')).toBe('3.5.0');
    });

    test('merges dependencies and devDependencies', () => {
      const fs = createMockFileSystem({
        '/repo/package.json': JSON.stringify({
          dependencies: {
            react: '^18.0.0',
          },
          devDependencies: {
            next: '^14.0.0',
          },
        }),
      });
      const reader = new PackageReader(fs);

      const versions = reader.getVersions('/repo', ['react', 'next']);

      expect(versions.get('react')).toBe('18.0.0');
      expect(versions.get('next')).toBe('14.0.0');
      expect(versions.size).toBe(2);
    });

    test('returns empty map when package.json does not exist', () => {
      const fs = createMockFileSystem({});
      const reader = new PackageReader(fs);

      const versions = reader.getVersions('/repo', ['react']);

      expect(versions.size).toBe(0);
    });

    test('returns empty map for packages not found', () => {
      const fs = createMockFileSystem({
        '/repo/package.json': JSON.stringify({
          dependencies: {
            react: '^18.0.0',
          },
        }),
      });
      const reader = new PackageReader(fs);

      const versions = reader.getVersions('/repo', ['vue', 'angular']);

      expect(versions.has('vue')).toBe(false);
      expect(versions.has('angular')).toBe(false);
      expect(versions.size).toBe(0);
    });

    test('filters only requested packages', () => {
      const fs = createMockFileSystem({
        '/repo/package.json': JSON.stringify({
          dependencies: {
            react: '^18.0.0',
            next: '^14.0.0',
            vue: '^3.0.0',
          },
        }),
      });
      const reader = new PackageReader(fs);

      const versions = reader.getVersions('/repo', ['react', 'vue']);

      expect(versions.has('react')).toBe(true);
      expect(versions.has('vue')).toBe(true);
      expect(versions.has('next')).toBe(false);
      expect(versions.size).toBe(2);
    });

    test('handles malformed package.json gracefully', () => {
      const fs = createMockFileSystem({
        '/repo/package.json': 'invalid json',
      });
      const reader = new PackageReader(fs);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const versions = reader.getVersions('/repo', ['react']);

      expect(versions.size).toBe(0);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    test('cleans semver prefixes from versions', () => {
      const fs = createMockFileSystem({
        '/repo/package.json': JSON.stringify({
          dependencies: {
            react: '^18.2.0',
            vue: '~3.4.0',
          },
        }),
      });
      const reader = new PackageReader(fs);

      const versions = reader.getVersions('/repo', ['react', 'vue']);

      expect(versions.get('react')).toBe('18.2.0');
      expect(versions.get('vue')).toBe('3.4.0');
    });

    test('handles single package lookup', () => {
      const fs = createMockFileSystem({
        '/repo/package.json': JSON.stringify({
          dependencies: {
            '@rudderstack/analytics-js': '^3.0.0',
          },
        }),
      });
      const reader = new PackageReader(fs);

      const versions = reader.getVersions('/repo', ['@rudderstack/analytics-js']);

      expect(versions.get('@rudderstack/analytics-js')).toBe('3.0.0');
      expect(versions.size).toBe(1);
    });
  });
});
