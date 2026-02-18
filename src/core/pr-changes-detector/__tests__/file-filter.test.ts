import { shouldIncludeFile, SOURCE_FILE_PATTERNS, EXCLUDED_PATH_PATTERNS } from '../file-filter';

describe('file-filter', () => {
  describe('shouldIncludeFile', () => {
    describe('JavaScript/TypeScript files', () => {
      it('should include TypeScript source files', () => {
        expect(shouldIncludeFile('src/analytics.ts')).toBe(true);
        expect(shouldIncludeFile('lib/tracking.tsx')).toBe(true);
      });

      it('should include JavaScript source files', () => {
        expect(shouldIncludeFile('src/analytics.js')).toBe(true);
        expect(shouldIncludeFile('components/Track.jsx')).toBe(true);
      });

      it('should include modern JS module formats', () => {
        expect(shouldIncludeFile('utils/helper.mjs')).toBe(true);
        expect(shouldIncludeFile('config/loader.cjs')).toBe(true);
      });

      it('should exclude TypeScript test files', () => {
        expect(shouldIncludeFile('src/utils.test.ts')).toBe(false);
        expect(shouldIncludeFile('components/Button.spec.tsx')).toBe(false);
        expect(shouldIncludeFile('__tests__/analytics.ts')).toBe(false);
      });

      it('should exclude JavaScript test files', () => {
        expect(shouldIncludeFile('src/utils.test.js')).toBe(false);
        expect(shouldIncludeFile('components/Button.spec.jsx')).toBe(false);
        expect(shouldIncludeFile('test/analytics.js')).toBe(false);
        expect(shouldIncludeFile('tests/unit/helper.js')).toBe(false);
      });

      it('should exclude Storybook files', () => {
        expect(shouldIncludeFile('components/Button.stories.tsx')).toBe(false);
        expect(shouldIncludeFile('components/Card.stories.js')).toBe(false);
      });

      it('should exclude TypeScript declaration files', () => {
        expect(shouldIncludeFile('types/index.d.ts')).toBe(false);
        expect(shouldIncludeFile('lib/analytics.d.mts')).toBe(false);
      });

      it('should exclude minified files', () => {
        expect(shouldIncludeFile('dist/bundle.min.js')).toBe(false);
        expect(shouldIncludeFile('build/app.bundle.js')).toBe(false);
        expect(shouldIncludeFile('public/vendor.chunk.js')).toBe(false);
      });
    });

    describe('Framework-specific files', () => {
      it('should include Vue files', () => {
        expect(shouldIncludeFile('pages/index.vue')).toBe(true);
        expect(shouldIncludeFile('components/Analytics.vue')).toBe(true);
      });

      it('should include Svelte files', () => {
        expect(shouldIncludeFile('routes/+page.svelte')).toBe(true);
        expect(shouldIncludeFile('components/Track.svelte')).toBe(true);
      });

      it('should include Astro files', () => {
        expect(shouldIncludeFile('pages/index.astro')).toBe(true);
      });
    });

    describe('HTML files', () => {
      it('should include HTML files (CDN snippet integration)', () => {
        expect(shouldIncludeFile('index.html')).toBe(true);
        expect(shouldIncludeFile('public/landing.htm')).toBe(true);
      });
    });

    describe('Server-side SDK languages', () => {
      it('should include Python files', () => {
        expect(shouldIncludeFile('server/app.py')).toBe(true);
        expect(shouldIncludeFile('analytics/tracker.py')).toBe(true);
      });

      it('should include Ruby files', () => {
        expect(shouldIncludeFile('app/controllers/analytics_controller.rb')).toBe(true);
      });

      it('should include Go files', () => {
        expect(shouldIncludeFile('main.go')).toBe(true);
        expect(shouldIncludeFile('analytics/tracker.go')).toBe(true);
      });

      it('should include Java files', () => {
        expect(shouldIncludeFile('src/main/java/Analytics.java')).toBe(true);
      });

      it('should include Kotlin files', () => {
        expect(shouldIncludeFile('app/src/main/kotlin/Analytics.kt')).toBe(true);
      });

      it('should include Swift files', () => {
        expect(shouldIncludeFile('mobile/App.swift')).toBe(true);
        expect(shouldIncludeFile('ios/Analytics.swift')).toBe(true);
      });

      it('should include Objective-C files', () => {
        expect(shouldIncludeFile('ios/AppDelegate.m')).toBe(true);
      });
    });

    describe('Package manifest', () => {
      it('should include package.json', () => {
        expect(shouldIncludeFile('package.json')).toBe(true);
        expect(shouldIncludeFile('packages/foo/package.json')).toBe(true);
        expect(shouldIncludeFile('apps/web/package.json')).toBe(true);
      });

      it('should include deno.json', () => {
        expect(shouldIncludeFile('deno.json')).toBe(true);
        expect(shouldIncludeFile('packages/foo/deno.json')).toBe(true);
        expect(shouldIncludeFile('apps/web/deno.json')).toBe(true);
      });
      it('should exclude lock files', () => {
        expect(shouldIncludeFile('package-lock.json')).toBe(false);
        expect(shouldIncludeFile('yarn.lock')).toBe(false);
        expect(shouldIncludeFile('pnpm-lock.yaml')).toBe(false);
        expect(shouldIncludeFile('bun.lockb')).toBe(false);
        expect(shouldIncludeFile('Gemfile.lock')).toBe(false);
        expect(shouldIncludeFile('Cargo.lock')).toBe(false);
        expect(shouldIncludeFile('poetry.lock')).toBe(false);
        expect(shouldIncludeFile('composer.lock')).toBe(false);
        expect(shouldIncludeFile('go.sum')).toBe(false);
        expect(shouldIncludeFile('Pipfile.lock')).toBe(false);
      });
    });

    describe('Documentation files', () => {
      it('should exclude markdown files', () => {
        expect(shouldIncludeFile('README.md')).toBe(false);
        expect(shouldIncludeFile('CHANGELOG.md')).toBe(false);
        expect(shouldIncludeFile('docs/api.mdx')).toBe(false);
      });

      it('should exclude other documentation formats', () => {
        expect(shouldIncludeFile('README.rst')).toBe(false);
        expect(shouldIncludeFile('CONTRIBUTING.txt')).toBe(false);
        expect(shouldIncludeFile('LICENSE')).toBe(false);
      });

      it('should exclude documentation directories', () => {
        expect(shouldIncludeFile('docs/guide.js')).toBe(false);
        expect(shouldIncludeFile('documentation/api.ts')).toBe(false);
      });
    });

    describe('Config files', () => {
      it('should exclude YAML/TOML config files', () => {
        expect(shouldIncludeFile('.github/workflows/ci.yml')).toBe(false);
        expect(shouldIncludeFile('docker-compose.yaml')).toBe(false);
        expect(shouldIncludeFile('config.toml')).toBe(false);
      });

      it('should exclude TypeScript config files', () => {
        expect(shouldIncludeFile('tsconfig.json')).toBe(false);
        expect(shouldIncludeFile('tsconfig.base.json')).toBe(false);
        expect(shouldIncludeFile('jsconfig.json')).toBe(false);
      });

      it('should exclude build tool configs', () => {
        expect(shouldIncludeFile('webpack.config.js')).toBe(false);
        expect(shouldIncludeFile('vite.config.ts')).toBe(false);
        expect(shouldIncludeFile('rollup.config.js')).toBe(false);
        expect(shouldIncludeFile('next.config.js')).toBe(false);
        expect(shouldIncludeFile('nuxt.config.ts')).toBe(false);
      });

      it('should exclude linter/formatter configs', () => {
        expect(shouldIncludeFile('.eslintrc.js')).toBe(false);
        expect(shouldIncludeFile('.prettierrc')).toBe(false);
        expect(shouldIncludeFile('babel.config.json')).toBe(false);
      });

      it('should exclude test tool configs', () => {
        expect(shouldIncludeFile('jest.config.js')).toBe(false);
        expect(shouldIncludeFile('vitest.config.ts')).toBe(false);
        expect(shouldIncludeFile('playwright.config.ts')).toBe(false);
      });

      it('should exclude generic JSON files', () => {
        expect(shouldIncludeFile('data/config.json')).toBe(false);
        expect(shouldIncludeFile('settings.json')).toBe(false);
      });
    });

    describe('Stylesheets', () => {
      it('should exclude CSS files', () => {
        expect(shouldIncludeFile('styles/main.css')).toBe(false);
        expect(shouldIncludeFile('app.scss')).toBe(false);
        expect(shouldIncludeFile('theme.sass')).toBe(false);
        expect(shouldIncludeFile('styles.less')).toBe(false);
        expect(shouldIncludeFile('global.styl')).toBe(false);
      });

      it('should exclude minified CSS', () => {
        expect(shouldIncludeFile('dist/bundle.min.css')).toBe(false);
      });
    });

    describe('Binary/media files', () => {
      it('should exclude image files', () => {
        expect(shouldIncludeFile('public/logo.png')).toBe(false);
        expect(shouldIncludeFile('assets/hero.jpg')).toBe(false);
        expect(shouldIncludeFile('images/icon.svg')).toBe(false);
        expect(shouldIncludeFile('img/photo.webp')).toBe(false);
      });

      it('should exclude font files', () => {
        expect(shouldIncludeFile('fonts/roboto.woff2')).toBe(false);
        expect(shouldIncludeFile('assets/font.ttf')).toBe(false);
      });

      it('should exclude media files', () => {
        expect(shouldIncludeFile('videos/demo.mp4')).toBe(false);
        expect(shouldIncludeFile('audio/notification.mp3')).toBe(false);
      });

      it('should exclude archive files', () => {
        expect(shouldIncludeFile('dist.zip')).toBe(false);
        expect(shouldIncludeFile('backup.tar.gz')).toBe(false);
      });

      it('should exclude PDF files', () => {
        expect(shouldIncludeFile('docs/manual.pdf')).toBe(false);
      });
    });

    describe('Build outputs', () => {
      it('should exclude dist directory', () => {
        expect(shouldIncludeFile('dist/bundle.js')).toBe(false);
        expect(shouldIncludeFile('dist/index.html')).toBe(false);
      });

      it('should exclude build directory', () => {
        expect(shouldIncludeFile('build/app.js')).toBe(false);
      });

      it('should exclude framework build outputs', () => {
        expect(shouldIncludeFile('.next/server.js')).toBe(false);
        expect(shouldIncludeFile('.nuxt/client.js')).toBe(false);
        expect(shouldIncludeFile('.svelte-kit/output.js')).toBe(false);
      });

      it('should exclude coverage reports', () => {
        expect(shouldIncludeFile('coverage/lcov.info')).toBe(false);
      });

      it('should exclude source maps', () => {
        expect(shouldIncludeFile('dist/app.js.map')).toBe(false);
      });
    });

    describe('Dependencies', () => {
      it('should exclude node_modules', () => {
        expect(shouldIncludeFile('node_modules/react/index.js')).toBe(false);
      });

      it('should exclude vendor directory', () => {
        expect(shouldIncludeFile('vendor/package/file.rb')).toBe(false);
      });
    });

    describe('IDE/Editor files', () => {
      it('should exclude IDE config directories', () => {
        expect(shouldIncludeFile('.vscode/settings.json')).toBe(false);
        expect(shouldIncludeFile('.idea/workspace.xml')).toBe(false);
      });

      it('should exclude workspace files', () => {
        expect(shouldIncludeFile('project.code-workspace')).toBe(false);
      });
    });

    describe('CI/CD files', () => {
      it('should exclude GitHub Actions workflows', () => {
        expect(shouldIncludeFile('.github/workflows/test.yml')).toBe(false);
      });

      it('should exclude other CI configs', () => {
        expect(shouldIncludeFile('.gitlab-ci.yml')).toBe(false);
        expect(shouldIncludeFile('.circleci/config.yml')).toBe(false);
        expect(shouldIncludeFile('Jenkinsfile')).toBe(false);
      });
    });

    describe('Infrastructure files', () => {
      it('should exclude Docker files', () => {
        expect(shouldIncludeFile('Dockerfile')).toBe(false);
        expect(shouldIncludeFile('docker-compose.yml')).toBe(false);
      });

      it('should exclude Terraform files', () => {
        expect(shouldIncludeFile('main.tf')).toBe(false);
        expect(shouldIncludeFile('terraform/variables.tfvars')).toBe(false);
      });

      it('should exclude Kubernetes files', () => {
        expect(shouldIncludeFile('k8s/deployment.yaml')).toBe(false);
      });
    });

    describe('OS/system files', () => {
      it('should exclude OS metadata files', () => {
        expect(shouldIncludeFile('.DS_Store')).toBe(false);
        expect(shouldIncludeFile('Thumbs.db')).toBe(false);
      });

      it('should exclude git files', () => {
        expect(shouldIncludeFile('.gitignore')).toBe(false);
        expect(shouldIncludeFile('.gitattributes')).toBe(false);
      });

      it('should exclude editor config', () => {
        expect(shouldIncludeFile('.editorconfig')).toBe(false);
      });
    });

    describe('Environment/secrets', () => {
      it('should exclude env files', () => {
        expect(shouldIncludeFile('.env')).toBe(false);
        expect(shouldIncludeFile('.env.local')).toBe(false);
      });

      it('should exclude certificate files', () => {
        expect(shouldIncludeFile('cert.pem')).toBe(false);
        expect(shouldIncludeFile('private.key')).toBe(false);
      });
    });

    describe('Data files', () => {
      it('should exclude data files', () => {
        expect(shouldIncludeFile('data.xml')).toBe(false);
        expect(shouldIncludeFile('export.csv')).toBe(false);
        expect(shouldIncludeFile('schema.sql')).toBe(false);
      });
    });
  });

  describe('SOURCE_FILE_PATTERNS', () => {
    it('should be an array of glob patterns', () => {
      expect(Array.isArray(SOURCE_FILE_PATTERNS)).toBe(true);
      expect(SOURCE_FILE_PATTERNS.length).toBeGreaterThan(0);
    });

    it('should contain JS/TS patterns', () => {
      expect(SOURCE_FILE_PATTERNS).toContain('**/*.js');
      expect(SOURCE_FILE_PATTERNS).toContain('**/*.ts');
    });
  });

  describe('EXCLUDED_PATH_PATTERNS', () => {
    it('should be an array of glob patterns', () => {
      expect(Array.isArray(EXCLUDED_PATH_PATTERNS)).toBe(true);
      expect(EXCLUDED_PATH_PATTERNS.length).toBeGreaterThan(0);
    });

    it('should contain test file patterns', () => {
      expect(EXCLUDED_PATH_PATTERNS).toContain('**/*.test.js');
      expect(EXCLUDED_PATH_PATTERNS).toContain('**/__tests__/**');
    });
  });
});
