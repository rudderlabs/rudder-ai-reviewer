# Stack

> Dependencies, frameworks, tooling.
> Append-only. Agent-authored sections may optionally carry an HTML-comment tag
> (e.g., `<!-- pr:<id> -->`) identifying the writer/PR/run; human-authored
> sections are conventionally left untouched by automated runs.

## Bootstrap baseline: language and runtime
<!-- linear:RUD-2769 -->

- TypeScript project targeting Node/CommonJS: `tsconfig.json:3-8` (`target: ES2022`, `module: commonjs`, `rootDir: ./src`, `outDir: ./dist`).
- GitHub Action runtime sets Node 24 in composite action setup (`action.yml:47-51`) and repository default Node is pinned via `.nvmrc` (`.nvmrc:1`).
- Strict compiler posture: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` enabled (`tsconfig.json:8,16-19`).

## Bootstrap baseline: production dependencies by purpose
<!-- linear:RUD-2769 -->

- GitHub Actions and SCM API: `@actions/core@^2.0.1`, `@actions/github@^6.0.1` (`package.json:26-27`).
- Source parsing/detection: `@babel/parser`, `@babel/traverse`, `@babel/types`, `micromatch` (`package.json:28-31`).
- Lockfile graph resolution for exact version detection: `snyk-nodejs-lockfile-parser@^2.4.4` (`package.json:32`, consumed in `src/core/shared/npm/lock-file-parser.ts:4-8`).
- Network retry behavior depends on native `fetch` plus local wrapper (`src/utils/fetch-with-retry.ts::fetchWithRetry:23-67`).

## Bootstrap baseline: build, test, and CI tooling
<!-- linear:RUD-2769 -->

- Build chain: `tsc && tsc-alias` (`package.json:scripts.build`) to compile TS and rewrite alias imports for runtime `dist` usage.
- Quality scripts: `format:check`, `lint`, `test`, `build` declared in `package.json:scripts` and enforced in CI pipeline `/.github/workflows/build.yml:36-47`.
- Test framework: Jest + ts-jest (`package.json:38,40`; `jest.config.js:1-5`) with global 70% coverage thresholds (`jest.config.js:19-26`).
- Release/PR hygiene automation: Release Please (`/.github/workflows/release-please.yml`), semantic PR title validation (`/.github/workflows/semantic-pr.yaml`).

## RUD-2769 — Action runtime build contract
<!-- linear:RUD-2769 -->

- The GitHub Action execution contract compiles TypeScript on each run before execution (`npm ci`, `npm run build`, then `node dist/index.js`), so runtime expectations depend on a fresh build rather than committed artifacts.
- Build/test guidance should remain aligned with this per-run compile model to avoid drift between local assumptions and action execution behavior.
