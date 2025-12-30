import { createMockFileSystem } from '@tests/test.utils';
import { PackageReader } from '../package-reader';

describe('PackageReader', () => {
  const packageName = '@rudderstack/analytics-js';

  test('reads package with SDK in dependencies', () => {
    const fs = createMockFileSystem({
      '/repo/package.json': JSON.stringify({
        dependencies: {
          '@rudderstack/analytics-js': '^3.0.0',
        },
      }),
    });
    const reader = new PackageReader(fs);

    const result = reader.read('/repo', packageName);

    expect(result).toBe('3.0.0');
  });

  test('reads package with SDK in devDependencies', () => {
    const fs = createMockFileSystem({
      '/repo/package.json': JSON.stringify({
        devDependencies: {
          '@rudderstack/analytics-js': '~2.5.0',
        },
      }),
    });
    const reader = new PackageReader(fs);

    const result = reader.read('/repo', packageName);

    expect(result).toBe('2.5.0');
  });

  test('returns null when package.json does not exist', () => {
    const fs = createMockFileSystem({});
    const reader = new PackageReader(fs);

    const result = reader.read('/repo', packageName);

    expect(result).toBeNull();
  });

  test('returns null when SDK not found in dependencies', () => {
    const fs = createMockFileSystem({
      '/repo/package.json': JSON.stringify({
        dependencies: {
          react: '^18.0.0',
        },
      }),
    });
    const reader = new PackageReader(fs);

    const result = reader.read('/repo', packageName);

    expect(result).toBeNull();
  });
});
