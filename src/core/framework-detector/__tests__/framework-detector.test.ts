import { LockFileParser } from '@core/shared/npm/lock-file-parser';
import { createMockFileSystem } from '@tests/test.utils';
import { DEFAULT_FRAMEWORK_CONFIG } from '../config';
import { FrameworkDetector } from '../framework-detector';
import { PackageReader } from '../npm/package-reader';

describe('FrameworkDetector', () => {
  test('detects Next.js with exact version from lock file', async () => {
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
    const lockFileParser = new LockFileParser(fs, DEFAULT_FRAMEWORK_CONFIG.npm);
    const detector = new FrameworkDetector(packageReader, lockFileParser);

    const result = await detector.detect('/repo');

    expect(result).toEqual({
      name: 'Next.js',
      version: '14.1.0',
      category: 'frontend',
    });
  });

  test('returns null when no framework detected', async () => {
    const fs = createMockFileSystem({
      '/repo/package.json': JSON.stringify({
        dependencies: {
          lodash: '^4.0.0',
        },
      }),
    });

    const packageReader = new PackageReader(fs, DEFAULT_FRAMEWORK_CONFIG.frameworks);
    const lockFileParser = new LockFileParser(fs, DEFAULT_FRAMEWORK_CONFIG.npm);
    const detector = new FrameworkDetector(packageReader, lockFileParser);

    const result = await detector.detect('/repo');

    expect(result).toBeNull();
  });

  test('selects meta-framework over base framework', async () => {
    const fs = createMockFileSystem({
      '/repo/package.json': JSON.stringify({
        dependencies: {
          nuxt: '^3.0.0',
          vue: '^3.0.0',
        },
      }),
      '/repo/package-lock.json': JSON.stringify({
        packages: {
          'node_modules/nuxt': { version: '3.10.0' },
          'node_modules/vue': { version: '3.4.0' },
        },
      }),
    });

    const packageReader = new PackageReader(fs, DEFAULT_FRAMEWORK_CONFIG.frameworks);
    const lockFileParser = new LockFileParser(fs, DEFAULT_FRAMEWORK_CONFIG.npm);
    const detector = new FrameworkDetector(packageReader, lockFileParser);

    const result = await detector.detect('/repo');

    expect(result).toEqual({
      name: 'Nuxt',
      version: '3.10.0',
      category: 'frontend',
    });
  });
});
