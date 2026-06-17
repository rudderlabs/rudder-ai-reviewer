# Conventions

> Coding conventions and naming schemes - things a linter can't catch.
> Append-only. Agent-authored sections may optionally carry an HTML-comment tag
> (e.g., `<!-- pr:<id> -->`) identifying the writer/PR/run; human-authored
> sections are conventionally left untouched by automated runs.

## Bootstrap baseline: module and naming conventions
<!-- linear:RUD-2769 -->

- `src/core/*` hosts domain workflows while `src/clients/*` holds external-service adapters (`src/index.ts` import graph at `:2-8` demonstrates this split).
- Orchestration entry files prefer verb-style exported functions (`detectPRChanges`, `detectSDK`, `detectFrameworks`, `postAIReviewerComments`) while reusable logic lives in classes (`PRChangesDetector`, `ReviewPayloadBuilder`, `CommentSplitter`).
- Cross-module types are centralized under `src/types/*` and consumed via the `@custom-types/*` alias (`tsconfig.json:20-27`, `jest.config.js:6-12`).
- Providers use `*Context` and `*Metadata` naming for boundary payloads (`src/core/providers/types.ts:3-23`, `src/core/shared/github/pr-context.ts:3-7`).

## Bootstrap baseline: repository structure and test layout
<!-- linear:RUD-2769 -->

- Each core module keeps colocated tests in `__tests__` subfolders (examples: `src/core/pr-changes-detector/__tests__`, `src/core/sdk-detector/cdn/__tests__`).
- Action-level behavior is tested at the top-level `src/__tests__/index.test.ts`, while adapter-specific behavior is covered in module-level suites (`src/clients/__tests__/*.test.ts`).
- Path aliases are mandatory in runtime and test configs (`tsconfig.json:20-27`, `jest.config.js:6-12`), so new modules should update both when adding aliases.
- Constants used for integration idempotency (comment markers) are kept in `src/utils/constants.ts` instead of duplicated string literals.

## Bootstrap baseline: logging and observability style
<!-- linear:RUD-2769 -->

- Runtime logging standardizes on `@actions/core` levels (`core.info`, `core.warning`, `core.error`, `core.debug`) instead of `console.*` in production code (`src/index.ts:13-97`, `src/clients/pr-reviewer-service.client.ts:20-44`).
- Debug logging often includes structured payload snapshots (`src/index.ts:66-70`, `src/clients/pr-reviewer-service.client.ts:40`), while user-visible failures are emitted with concise messages.
- Public-facing PR comment formatting uses markdown conventions (details blocks, file-grouped headings, markdown tables) in `src/core/review-commenter/comment-formatter.ts:67-254`.

## RUD-2769 — Knowledge bootstrap and incident capture convention
<!-- linear:RUD-2769 -->

- The repository knowledge base is expected to maintain seven baseline scope files under `.agents/knowledge/` for stable distillation targets.
- `mistakes.md` is intentionally initialized empty and should be populated only with concrete post-mortem incidents, preserving append-only incident capture semantics.
