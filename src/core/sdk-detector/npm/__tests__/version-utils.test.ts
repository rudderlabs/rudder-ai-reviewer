import { cleanSemverPrefix, extractVersionNumber } from '../version-utils';

describe('cleanSemverPrefix', () => {
  test('removes caret prefix from version string', () => {
    const result = cleanSemverPrefix('^3.0.0');

    expect(result).toBe('3.0.0');
  });

  test('removes tilde prefix from version string', () => {
    const result = cleanSemverPrefix('~2.5.1');

    expect(result).toBe('2.5.1');
  });

  test('returns unchanged version without prefix', () => {
    const result = cleanSemverPrefix('1.2.3');

    expect(result).toBe('1.2.3');
  });
});

describe('extractVersionNumber', () => {
  test('extracts version from v-prefixed string', () => {
    const result = extractVersionNumber('v3.0.0');

    expect(result).toBe('3.0.0');
  });

  test('extracts major version from v-prefixed string', () => {
    const result = extractVersionNumber('v3');

    expect(result).toBe('3');
  });

  test('extracts version from path string', () => {
    const result = extractVersionNumber('/custom/path/v3.0.0');

    expect(result).toBe('3.0.0');
  });

  test('returns undefined for invalid version string', () => {
    const result = extractVersionNumber('invalid');

    expect(result).toBeUndefined();
  });
});
