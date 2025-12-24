import { VariableExtractor } from '../variable-extractor';

describe('VariableExtractor', () => {
  const config = {
    searchPaths: [],
    variableNames: {
      baseUrl: 'sdkBaseUrl',
      version: 'sdkVersion',
      fileName: 'sdkFileName',
    },
    fileName: 'rsa.min.js',
    fileExtensions: {
      javascript: ['.tsx', '.jsx', '.ts', '.js'],
      html: '.html',
    },
  };

  const extractor = new VariableExtractor(config);

  describe('extract', () => {
    test('extracts string variables with const keyword', () => {
      const code = `
        const sdkBaseUrl = "https://cdn.rudderlabs.com";
        const sdkVersion = "v3";
        const sdkFileName = "rsa.min.js";
      `;

      const variables = extractor.extract(code);

      expect(variables.size).toBe(3);
      expect(variables.get('sdkBaseUrl')?.value).toBe('https://cdn.rudderlabs.com');
      expect(variables.get('sdkVersion')?.value).toBe('v3');
      expect(variables.get('sdkFileName')?.value).toBe('rsa.min.js');
    });

    test('extracts variables with single quotes', () => {
      const code = `const sdkBaseUrl = 'https://cdn.rudderlabs.com';`;

      const variables = extractor.extract(code);

      expect(variables.get('sdkBaseUrl')?.value).toBe('https://cdn.rudderlabs.com');
    });

    test('extracts variables with let keyword', () => {
      const code = `let sdkVersion = "v3";`;

      const variables = extractor.extract(code);

      expect(variables.get('sdkVersion')?.value).toBe('v3');
    });

    test('extracts variables with var keyword', () => {
      const code = `var sdkFileName = "rsa.min.js";`;

      const variables = extractor.extract(code);

      expect(variables.get('sdkFileName')?.value).toBe('rsa.min.js');
    });

    test('handles multiple spaces in declaration', () => {
      const code = `const    sdkBaseUrl   =    "https://cdn.rudderlabs.com"   ;`;

      const variables = extractor.extract(code);

      expect(variables.get('sdkBaseUrl')?.value).toBe('https://cdn.rudderlabs.com');
    });

    test('returns line number and snippet', () => {
      const code = `
        const foo = "bar";
        const sdkVersion = "v3";
        const baz = "qux";
      `;

      const variables = extractor.extract(code);

      expect(variables.get('sdkVersion')?.line).toBe(3);
      expect(variables.get('sdkVersion')?.snippet).toContain('sdkVersion');
    });

    test('returns empty map when no variables found', () => {
      const code = `
        const otherVar = "value";
        console.log("hello");
      `;

      const variables = extractor.extract(code);

      expect(variables.size).toBe(0);
    });
  });

  describe('isCDNDetected', () => {
    test('returns true when all required variables present', () => {
      const variables = new Map([
        ['sdkBaseUrl', { value: 'https://cdn.rudderlabs.com', line: 1, snippet: '' }],
        ['sdkVersion', { value: 'v3', line: 2, snippet: '' }],
        ['sdkFileName', { value: 'rsa.min.js', line: 3, snippet: '' }],
      ]);

      const result = extractor.isCDNDetected(variables);

      expect(result).toBe(true);
    });

    test('returns false when baseUrl missing', () => {
      const variables = new Map([
        ['sdkVersion', { value: 'v3', line: 2, snippet: '' }],
        ['sdkFileName', { value: 'rsa.min.js', line: 3, snippet: '' }],
      ]);

      const result = extractor.isCDNDetected(variables);

      expect(result).toBe(false);
    });

    test('returns false when version missing', () => {
      const variables = new Map([
        ['sdkBaseUrl', { value: 'https://cdn.rudderlabs.com', line: 1, snippet: '' }],
        ['sdkFileName', { value: 'rsa.min.js', line: 3, snippet: '' }],
      ]);

      const result = extractor.isCDNDetected(variables);

      expect(result).toBe(false);
    });

    test('returns false when fileName incorrect', () => {
      const variables = new Map([
        ['sdkBaseUrl', { value: 'https://cdn.rudderlabs.com', line: 1, snippet: '' }],
        ['sdkVersion', { value: 'v3', line: 2, snippet: '' }],
        ['sdkFileName', { value: 'other.js', line: 3, snippet: '' }],
      ]);

      const result = extractor.isCDNDetected(variables);

      expect(result).toBe(false);
    });
  });
});
