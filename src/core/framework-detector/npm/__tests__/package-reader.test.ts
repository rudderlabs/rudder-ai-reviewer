import { createMockFileSystem } from '@tests/test.utils';
import { DEFAULT_FRAMEWORK_CONFIG } from '../../config';
import { PackageReader } from '../package-reader';

describe('PackageReader', () => {
  test('reads all frameworks from package.json sorted by priority', () => {
    const fs = createMockFileSystem({
      '/repo/package.json': JSON.stringify({
        dependencies: {
          next: '^14.0.0',
          react: '^18.0.0',
        },
      }),
    });
    const reader = new PackageReader(fs, DEFAULT_FRAMEWORK_CONFIG.frameworks);

    const result = reader.readAll('/repo');

    expect(result).toHaveLength(2);
    expect(result[0].framework.name).toBe('Next.js');
    expect(result[0].version).toBe('14.0.0');
    expect(result[1].framework.name).toBe('React');
    expect(result[1].version).toBe('18.0.0');
  });

  test('returns empty array when package.json not found', () => {
    const fs = createMockFileSystem({});
    const reader = new PackageReader(fs, DEFAULT_FRAMEWORK_CONFIG.frameworks);

    const result = reader.readAll('/repo');

    expect(result).toEqual([]);
  });

  test('returns empty array when no frameworks found', () => {
    const fs = createMockFileSystem({
      '/repo/package.json': JSON.stringify({
        dependencies: { lodash: '^4.0.0' },
      }),
    });
    const reader = new PackageReader(fs, DEFAULT_FRAMEWORK_CONFIG.frameworks);

    const result = reader.readAll('/repo');

    expect(result).toEqual([]);
  });
});
