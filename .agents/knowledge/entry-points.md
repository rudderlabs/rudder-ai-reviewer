# Entry points

> Key entry-point files: read these first to orient in this repo.
> Append-only. Agent-authored sections may optionally carry an HTML-comment tag
> (e.g., `<!-- pr:<id> -->`) identifying the writer/PR/run; human-authored
> sections are conventionally left untouched by automated runs.

## Bootstrap baseline: first-read map
<!-- linear:RUD-2769 -->

- `README.md` - product intent, required inputs/secrets, and expected review behavior for users of the action.
- `action.yml` - executable contract for the composite GitHub Action (inputs/outputs, Node setup, build/run commands, env wiring).
- `src/index.ts::run` - top-level orchestration flow and failure semantics for the entire action lifecycle.
- `src/core/providers/factory.ts::createProviderRuntime` - where GitHub context/token are bound into a provider implementation.
- `src/core/review-payload-builder/payload-builder.ts::ReviewPayloadBuilder.buildPayload` - canonical schema assembly for upstream AI review service requests.
- `src/core/review-commenter/index.ts::postAIReviewerComments` - final output stage deciding summary vs inline comments and update/create behavior.

## Bootstrap baseline: deep-dive entry points by concern
<!-- linear:RUD-2769 -->

- Diff scoping and source-file inclusion: `src/core/pr-changes-detector/pr-changes-detector.ts::PRChangesDetector.detect` and `src/core/pr-changes-detector/file-filter.ts::shouldIncludeFile`.
- SDK/framework discovery behavior: `src/core/sdk-detector/javascript-detector.ts::JavaScriptSDKDetector.detect` and `src/core/framework-detector/framework-detector.ts::FrameworkDetector.detect`.
- External API and retry semantics: `src/clients/pr-reviewer-service.client.ts::PRReviewerServiceClient.postReview` and `src/utils/fetch-with-retry.ts::fetchWithRetry`.
- GitHub review write-path details: `src/clients/github.client.ts::GitHubClient.createReview` and `src/core/review-commenter/comment-splitter.ts::filterInlineEligibleIssues`.
