# Concerns

> Technical debt, TODOs, FIXMEs, security concerns, architectural issues.
> Append-only. Agent-authored sections may optionally carry an HTML-comment tag
> (e.g., `<!-- pr:<id> -->`) identifying the writer/PR/run; human-authored
> sections are conventionally left untouched by automated runs.
> Top-5-8 highest-signal items per category, not exhaustive.

## Bootstrap baseline: TODO/FIXME/XXX/HACK density and clusters
<!-- linear:RUD-2769 -->

- Production tree has low explicit TODO/FIXME density; the notable TODO hit is in test fixture content, not runtime code (`fixtures/js/CDN/index.html:187`).
- Comments labeled as future placeholders are sparse, so maintenance risk is more implicit (boundary assumptions and fallback defaults) than explicit TODO debt.
- Actionable follow-up: enforce concern tracking in code-review policy since current markers do not reflect likely future debt hotspots (module boundaries in `src/core/*` and `src/clients/*`).

## Bootstrap baseline: security concerns
<!-- linear:RUD-2769 -->

- Upstream error body is surfaced directly in thrown errors (`src/clients/pr-reviewer-service.client.ts::PRReviewerServiceClient.postReview:32-36`), which can leak server-provided detail into action logs when bubbled to `core.error` in `src/index.ts:89`.
- Debug logging includes full payload/response snapshots (`src/index.ts:66-70`), increasing accidental sensitive-data exposure risk if debug logging is enabled in CI.
- Action accepts unvalidated `INPUT_REVIEW_SERVICE_BASE_URL` (`src/clients/pr-reviewer-service.client.ts:6-7`), creating an outbound destination override that should be constrained in hardened deployments.
- Provider token guard only checks presence (`src/core/providers/factory.ts:13-16`) and does not validate token scope early; failures are deferred to API calls.

## Bootstrap baseline: architectural smells and coupling
<!-- linear:RUD-2769 -->

- `src/index.ts::run` is a long orchestration method handling env parsing, control flow, logging, payload/response debugging, and output mapping; this is a high-change hotspot.
- `src/clients/github.client.ts::GitHubClient` mixes API adapter concerns with local patch range parsing (`parsePatchLineRanges:366-392`), increasing class breadth.
- Provider abstraction advertises `gitlab` in `ProviderId` (`src/core/providers/types.ts:1`) but runtime factory is GitHub-only (`src/core/providers/factory.ts:12-19`), which can mislead extension planning.
- File filtering rules are extensive in a single constant block (`src/core/pr-changes-detector/file-filter.ts:43-232`), making policy drift hard to reason about without segmentation/tests per category.

## Bootstrap baseline: stale dependency or dead-code signals
<!-- linear:RUD-2769 -->

- Repository/package naming drift (`README` says "Rudder AI Reviewer", package name is `rudderstack-pr-reviewer`, repo metadata URL references `pr-reviewer`) suggests historical rename residue (`package.json:2,21`, `README.md:14`).
- `ProviderId` includes `gitlab` without corresponding implementation wiring (`src/core/providers/types.ts:1`, `src/core/providers/factory.ts:12-19`), indicating partially-implemented portability.
- `formatIssueDetails` path for `suggestion` code fences is active, but many higher-level formatter behaviors are complex and may carry unreachable variants without targeted contract tests (`src/core/review-commenter/comment-formatter.ts:316-335`).
