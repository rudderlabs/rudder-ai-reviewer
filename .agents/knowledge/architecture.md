# Architecture

> Component layout, internal relationships, data flow.
> Append-only. Agent-authored sections may optionally carry an HTML-comment tag
> (e.g., `<!-- pr:<id> -->`) identifying the writer/PR/run; human-authored
> sections are conventionally left untouched by automated runs.

## Bootstrap baseline: request-to-review pipeline
<!-- linear:RUD-2769 -->

- `src/index.ts::run:11-100` orchestrates a strict pipeline: provider/context setup -> PR diff filtering -> SDK detection -> framework detection -> payload build -> remote review call -> PR comment posting.
- `src/index.ts::run:28-33` and `src/index.ts::run:43-47` enforce early exits when no relevant diffs or no SDK is detected, so downstream network calls are skipped.
- `src/core/review-payload-builder/payload-builder.ts::ReviewPayloadBuilder.buildPayload:24-73` is the single composition point that joins repository metadata, PR diff context, detector outputs, and existing inline comments.
- `src/clients/pr-reviewer-service.client.ts::PRReviewerServiceClient.postReview:18-47` isolates outbound API interaction (`/v2/ai/pr-review`) from orchestration logic.
- `src/core/review-commenter/index.ts::postAIReviewerComments:19-55` owns write-back to GitHub and delegates split/format behavior to dedicated modules.

## Bootstrap baseline: provider and boundary layering
<!-- linear:RUD-2769 -->

- `src/core/providers/types.ts::SCMProvider:47-74` defines the boundary for SCM operations (metadata, changed files, comment CRUD, line URL generation).
- `src/core/providers/factory.ts::createProviderRuntime:11-30` is the runtime binding point from environment/context to concrete provider (`GitHubClient`).
- `src/clients/github.client.ts::GitHubClient:15-393` adapts Octokit primitives into provider operations, keeping GitHub-specific pagination and patch parsing out of core modules.
- `src/core/pr-changes-detector/pr-changes-detector.ts::PRChangesDetector:8-95` and `src/core/review-commenter/comment-splitter.ts::CommentSplitter:4-50` depend only on the provider contract, preserving portability for future provider additions.
- `src/core/shared/github/pr-context.ts::extractGitHubPRContext:19-31` centralizes action-context extraction so PR-context assumptions are not duplicated.

## Bootstrap baseline: detection and normalization subgraph
<!-- linear:RUD-2769 -->

- `src/core/sdk-detector/index.ts::detectSDK:15-26` composes `PackageReader`, `LockFileParser`, and `CDNScanner` behind `JavaScriptSDKDetector` to support npm/CDN discovery without exposing scanning details to callers.
- `src/core/sdk-detector/javascript-detector.ts::JavaScriptSDKDetector.detect:24-31` runs npm and CDN detection concurrently (`Promise.all`) before selecting the canonical installation mode in `buildResult`.
- `src/core/framework-detector/framework-detector.ts::FrameworkDetector.detect:10-36` mirrors the package+lockfile lookup pattern used in SDK detection, producing ordered framework results.
- `src/core/pr-changes-detector/file-filter.ts::shouldIncludeFile:246-263` normalizes diff scope with allowlist+denylist matching, including explicit exceptions for `package.json` and `deno.json`.
- `src/core/pr-changes-detector/patch-parser.ts::countPatchHunks:6-16` and `src/clients/github.client.ts::GitHubClient.parsePatchLineRanges:366-392` convert patch text into metrics/line windows consumed by reviewer/comment modules.

## Cross-cutting
<!-- linear:RUD-2769 -->

- Early-exit control flow in `src/index.ts::run:28-47` and comment upsert semantics in `src/core/review-commenter/index.ts::postSummaryComment:75-81` both optimize for idempotent CI reruns rather than maximum output volume.
- The same provider boundary (`src/core/providers/types.ts::SCMProvider:47-74`) drives both diff intelligence (`src/core/pr-changes-detector/pr-changes-detector.ts::PRChangesDetector.detect`) and review publishing (`src/core/review-commenter/index.ts::postAIReviewerComments`), so provider contract changes are architecture-critical across ingestion and emission paths.
- Detector modules share a package+lockfile strategy (`src/core/shared/npm/package-reader.ts::PackageReader.getVersions`, `src/core/shared/npm/lock-file-parser.ts::LockFileParser.getVersions`) that directly influences payload fidelity in `src/core/review-payload-builder/payload-builder.ts::ReviewPayloadBuilder.buildPayload`.
- Retry/jitter behavior in `src/utils/fetch-with-retry.ts::fetchWithRetry` limits transient service failures, but debug/error logging paths (`src/index.ts:66-70,89`) can amplify data-exposure concerns called out in `concerns.md`.
- Naming drift signals (`package.json:2,21`, `README.md:14`) and provider roadmap drift (`src/core/providers/types.ts:1` vs `src/core/providers/factory.ts:12-19`) are not isolated docs issues; they affect integration assumptions, contributor orientation, and future abstraction work.

## RUD-2769 — Preserve core/client boundaries in operational docs
<!-- linear:RUD-2769 -->

- Operational guidance that bootstraps or documents reviewer behavior should preserve the existing boundary model between `src/core` (domain workflows) and `src/clients` (external adapters).
- Knowledge updates that imply refactors across these boundaries should be treated as architecture-affecting changes, not documentation-only edits.
