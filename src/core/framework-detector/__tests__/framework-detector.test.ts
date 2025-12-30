import { LockFileParser } from '@core/shared/npm';
import { createMockFileSystem } from '@tests/test.utils';
import { DEFAULT_FRAMEWORK_CONFIG } from '../config';
import { FrameworkDetector } from '../framework-detector';
import { PackageReader } from '../npm/package-reader';

describe('FrameworkDetector', () => {
  describe('detect', () => {
    test('returns all detected frameworks in config order', async () => {
      const fs = createMockFileSystem({
        '/repo/package.json': JSON.stringify({
          dependencies: {
            next: '^14.0.0',
            react: '^18.0.0',
          },
        }),
        '/repo/package-lock.json': JSON.stringify({
          packages: {
            'node_modules/next': { version: '14.1.0' },
            'node_modules/react': { version: '18.2.0' },
          },
        }),
      });

      const packageReader = new PackageReader(fs, DEFAULT_FRAMEWORK_CONFIG.frameworks);
      const lockFileParser = new LockFileParser(fs);
      const detector = new FrameworkDetector(packageReader, lockFileParser);

      const results = await detector.detect('/repo');

      expect(results).toEqual([
        {
          name: 'Next.js',
          version: '14.1.0',
          category: 'frontend',
        },
        {
          name: 'React',
          version: '18.2.0',
          category: 'frontend',
        },
      ]);
    });

    test('returns empty array when no frameworks detected', async () => {
      const fs = createMockFileSystem({
        '/repo/package.json': JSON.stringify({
          dependencies: {
            lodash: '^4.0.0',
          },
        }),
      });

      const packageReader = new PackageReader(fs, DEFAULT_FRAMEWORK_CONFIG.frameworks);
      const lockFileParser = new LockFileParser(fs);
      const detector = new FrameworkDetector(packageReader, lockFileParser);

      const results = await detector.detect('/repo');

      expect(results).toEqual([]);
    });

    test('returns frameworks in config order', async () => {
      const fs = createMockFileSystem({
        '/repo/package.json': JSON.stringify({
          dependencies: {
            vue: '^3.0.0',
            react: '^18.0.0',
            nuxt: '^3.0.0',
          },
        }),
        '/repo/package-lock.json': JSON.stringify({
          packages: {
            'node_modules/nuxt': { version: '3.10.0' },
            'node_modules/vue': { version: '3.4.0' },
            'node_modules/react': { version: '18.2.0' },
          },
        }),
      });

      const packageReader = new PackageReader(fs, DEFAULT_FRAMEWORK_CONFIG.frameworks);
      const lockFileParser = new LockFileParser(fs);
      const detector = new FrameworkDetector(packageReader, lockFileParser);

      const results = await detector.detect('/repo');

      // Should follow config order: Next.js, Nuxt, React, Vue, Angular
      expect(results).toHaveLength(3);
      expect(results[0].name).toBe('Nuxt');
      expect(results[1].name).toBe('React');
      expect(results[2].name).toBe('Vue');
    });
  });
});
