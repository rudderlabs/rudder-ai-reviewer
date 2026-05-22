# Patterns

> Recurring idioms specific to this repo (error handling, state management,
> retries, logging, DI, request lifecycle).
> Append-only. Agent-authored sections may optionally carry an HTML-comment tag
> (e.g., `<!-- pr:<id> -->`) identifying the writer/PR/run; human-authored
> sections are conventionally left untouched by automated runs.
> Every observed idiom includes a `file:line` reference.

## Bootstrap baseline: control flow and failure handling
<!-- linear:RUD-2769 -->

- Fail-fast orchestration with output signaling: `src/index.ts::run:28-33` and `src/index.ts::run:43-47` short-circuit with explicit `status/message` outputs before expensive work.
- Context-specific error downgrade: `src/index.ts::run:79-84` treats `NotPullRequestContextError` as warning output, while other failures call `core.setFailed` in `src/index.ts::run:86-97`.
- Error wrapping at module boundaries: network and provider adapters catch unknown errors and rethrow contextual errors (`src/clients/pr-reviewer-service.client.ts::PRReviewerServiceClient.postReview:42-45`, `src/clients/github.client.ts::GitHubClient.findComment:170-185`).
- Non-blocking partial failure pattern: inline comment failures degrade to warning while preserving summary comment success in `src/core/review-commenter/index.ts::postInlineComments:94-104`.

## Bootstrap baseline: adapter and composition idioms
<!-- linear:RUD-2769 -->

- Provider adapter pattern: `src/core/providers/types.ts::SCMProvider:47-74` + `src/clients/github.client.ts::GitHubClient` separate domain flow from GitHub API details.
- Thin façade exports around stateful classes: `src/core/pr-changes-detector/index.ts::detectPRChanges:12-20`, `src/core/review-payload-builder/index.ts::buildReviewPayload`, and `src/core/framework-detector/index.ts::detectFrameworks:17-27` expose simple entry functions while preserving testable class internals.
- Dependency injection through constructors: detectors and splitters accept collaborators (`src/core/sdk-detector/javascript-detector.ts::JavaScriptSDKDetector:17-22`, `src/core/review-commenter/comment-splitter.ts::CommentSplitter:4-5`) enabling mocked tests.
- Deterministic transformation pipeline: PR changes are filtered, mapped, and aggregated in one pass (`src/core/pr-changes-detector/pr-changes-detector.ts::detect:22-42` and helper reducers at `:84-94`).

## Bootstrap baseline: retry and idempotent-comment behavior
<!-- linear:RUD-2769 -->

- Retry with jitter for transient upstream failures is centralized in `src/utils/fetch-with-retry.ts::fetchWithRetry:23-67`, classifying retryable statuses in `isRetryableStatus:7-9`.
- Idempotent summary comment upsert pattern uses magic markers + find/update-or-create flow in `src/core/review-commenter/index.ts::postSummaryComment:75-81` with markers from `src/utils/constants.ts:1-2`.
- Inline comment eligibility is bounded to changed-line windows (`src/core/review-commenter/comment-splitter.ts::filterInlineEligibleIssues:20-49`) to avoid invalid review comment positions.
