import { createMockFileSystem } from '@tests/test.utils';
import { NodeFileSystem } from '@utils/file-system';
import { detectFrameworks } from '../index';

jest.mock('@utils/file-system');

describe('detectFrameworks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  test('returns all detected frameworks', async () => {
    const mockFs = createMockFileSystem({
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

    (NodeFileSystem as jest.Mock).mockImplementation(() => mockFs);

    const results = await detectFrameworks('/repo');

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
    const mockFs = createMockFileSystem({
      '/repo/package.json': JSON.stringify({
        dependencies: {
          lodash: '^4.0.0',
        },
      }),
    });

    (NodeFileSystem as jest.Mock).mockImplementation(() => mockFs);

    const results = await detectFrameworks('/repo');

    expect(results).toEqual([]);
  });

  test('returns frameworks sorted by priority', async () => {
    const mockFs = createMockFileSystem({
      '/repo/package.json': JSON.stringify({
        dependencies: {
          nuxt: '^3.0.0',
          vue: '^3.0.0',
          react: '^18.0.0',
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

    (NodeFileSystem as jest.Mock).mockImplementation(() => mockFs);

    const results = await detectFrameworks('/repo');

    expect(results).toHaveLength(3);
    expect(results[0].name).toBe('Nuxt');
    expect(results[1].name).toBe('React');
    expect(results[2].name).toBe('Vue');
  });
});
