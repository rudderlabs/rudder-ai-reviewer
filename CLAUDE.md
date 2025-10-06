# RudderStack PR Reviewer - Brainstorming & Design Decisions

This document captures the detailed requirements, decisions, and context from the initial brainstorming sessions.

## Project Goal

Build a GitHub Action that analyzes PRs for RudderStack JavaScript SDK v3 instrumentation changes, providing automated validation and actionable feedback to customers.

## Target Users

RudderStack customers who instrument tracking code in their repositories (private repos with various frameworks).

## Core Problems to Solve

1. **Syntax/API Correctness** (RudderStack's responsibility)
   - Validate SDK usage matches official documentation and NPM package types
   - Ensure proper method signatures and required parameters

2. **Semantic Validation** (Customer's responsibility)
   - Validate against customer-defined tracking plans/schemas
   - Fetched from RudderStack backend using workspace credentials

## High-Level Goals

- Evaluate JS SDK instrumentation correctness (CDN and NPM)
- Understand impact of changes on downstream destinations
- Detect data type changes in event properties
- Report findings as PR comment with actionable recommendations

## Key Requirements

### Privacy & Security
- **CRITICAL**: No export of sensitive data, secrets, or customer code outside their infrastructure
- All analysis runs within GitHub Actions runner
- AI calls routed through RudderStack proxy service
- Security checks to detect hardcoded credentials

### SDK Support
- **Target Version**: RudderStack JavaScript SDK v3 only (latest)
- **Installation Methods**:
  - NPM: Validate against customer's installed version (from package.json)
  - CDN: Validate against latest v3 version from NPM

### Framework Support
- Must support various frameworks (React, Vue, Angular, Next.js, Svelte, vanilla JS, etc.)
- Auto-detect framework → Framework-agnostic fallback → Respect explicit config
- Reference examples: https://github.com/rudderlabs/rudder-sdk-js/tree/develop/examples

## Design Decisions

### 1. Analysis Approach

**Static Analysis (Primary)**
- Hybrid AST parser:
  - **TypeScript Compiler API** for `.ts/.tsx` files (access to type information)
  - **Babel** for `.js/.jsx` files (faster, lighter)
- Deep parsing with variable tracking and control flow analysis
- Extract maximum context before involving AI

**AI-Enhanced Analysis (Secondary)**
- Use when static analysis reaches limits (dynamic event names, complex logic)
- Feed AST context to AI for intent inference
- RudderStack proxy service handles AI provider calls
- Abstracted layer for easy provider swapping

### 2. Authentication & Integration

**RudderStack Workspace Credentials**
- Required for:
  - Fetching tracking plans (optional but recommended)
  - Fetching configured destinations
  - Authenticating AI proxy service calls
- Single credential setup for customers

**AI Provider**
- Start with external AI API calls (OpenAI/Anthropic)
- Route through RudderStack proxy service
- Abstract communication layer for future migration to RudderStack-hosted AI

### 3. Validation Modes

**First-Time Instrumentation** (no RudderStack code in base branch)
- API correctness validation
- Tracking plan validation (if credentials provided)
- Comprehensive review:
  - Destination compatibility check
  - Event volume/coverage analysis
  - Framework-specific recommendations
  - Security checks
- Future: Onboarding guidance (best practices, setup verification)

**Incremental Changes** (existing RudderStack code)
- Compare against base branch
- Detect changes: added/removed/modified events, property changes, type changes
- Destination impact analysis (destination-specific)
- Inline annotations on changed lines (configurable to include existing code)
- High-level summary

### 4. Change Detection & Data Types

Detect and flag:
- Property type changes (string → number, etc.)
- Property additions/removals
- Nested object structure changes
- Array vs scalar changes
- Compare against tracking plan (if available) AND base branch

### 5. File Analysis

**Default Behavior**: Auto-detect files containing RudderStack code
**Configurable**:
- Custom include patterns
- Exclude patterns (e.g., test files, generated code)

**Annotation Scope**:
- Default: Only annotate changed lines in PR
- Configurable: Annotate existing code with issues

### 6. Output Format

**Single PR Comment with Progressive Updates**
- Start with static analysis results
- Update same comment with AI insights when ready
- Use collapsible sections for organization

**High-Level Summary**:
- Statistics (X issues found, Y warnings, Z suggestions)
- Grouped by severity (errors, warnings, suggestions)
- Grouped by type (syntax errors, API misuse, semantic violations, destination impacts)

**Inline Annotations**:
- Actionable recommendations on specific lines
- Confidence scores for AI-generated insights

### 7. Destination Impact Analysis

- Fetch configured destinations from RudderStack workspace
- Provide destination-specific warnings (e.g., "This property change may affect Google Analytics mapping")
- Analyze field mappings when possible

### 8. Dynamic/Complex Code Handling

For dynamic patterns (template literals, computed properties, loops):
1. Deep AST parsing with variable tracking
2. Apply heuristics and pattern detection
3. Use AI only when static analysis insufficient
4. Flag as "unable to analyze" with low confidence if both fail

### 9. Error Handling & Fallback

**AI Proxy/RudderStack API Unavailable**:
1. Retry with backoff (couple of retries)
2. Graceful degradation to static analysis only
3. Post comment noting advanced features unavailable
4. PR still gets value from basic validation

**Progressive Results**:
- Post static analysis results immediately
- AI results follow later
- No need to wait for everything to complete

### 10. Performance & Limits

**Initial Limits**:
- Max files to analyze: **100 files**
- Max file size: **2MB per file**
- Static analysis timeout: **5 minutes**
- AI analysis timeout: **10 minutes**
- Total action timeout: **20 minutes**
- Max lines per file: **10,000 lines**
- Max total lines analyzed: **100,000 lines**
- Max AI requests per PR: **30 requests** (cost control)

**Behavior when exceeded**: **Graceful degradation**
- Continue with partial analysis
- Clearly indicate in PR comment which files/sections were analyzed
- Explain what was skipped and why
- Provide value from analyzed portion

### 11. Incremental Analysis

**Smart Incremental Approach**:
- Only re-analyze on new commits to PR
- Store previous analysis state in **GitHub Actions artifacts**
- Compare against stored state for delta changes
- Artifacts survive 90 days (sufficient for PR lifecycle)

### 12. Monorepo Support

**Status**: Deferred for later
- Start with single-repo assumption
- Core analysis engine is repo-structure agnostic
- Can add monorepo detection as enhancement without breaking changes

## Configuration Options

### Required
- `rudderstack_workspace_credentials`: RudderStack workspace credentials

### Optional (Initial Release)
- `file_patterns`: Custom paths/patterns to include
- `exclude_patterns`: Patterns to exclude
- `annotate_existing_code`: Boolean, default false
- `output_format`: Verbosity/style options
- `framework`: Explicit framework hint

### Future Features (Deferred)
- Custom validation rules
- Ignore patterns for specific warnings
- Performance tuning (max files, timeouts)
- Severity thresholds (fail PR on errors)
- Onboarding guidance mode

## Technical Architecture

### Components

1. **File Scanner**
   - Auto-detect RudderStack instrumentation
   - Apply include/exclude patterns
   - Framework detection

2. **AST Parser Layer**
   - TypeScript Compiler API for TS files
   - Babel for JS files
   - Unified interface for both

3. **Static Analyzer**
   - Variable tracking
   - Control flow analysis
   - Pattern detection (dynamic events, computed properties)
   - SDK version detection (NPM vs CDN)

4. **Validator**
   - Syntax/API correctness against SDK types
   - Tracking plan validation (via RudderStack API)
   - Security checks

5. **Change Detector**
   - Diff analysis (PR head vs base)
   - Property/type change tracking
   - Event lifecycle (added/removed/modified)

6. **Destination Impact Analyzer**
   - Fetch destinations from RudderStack workspace
   - Analyze field mappings
   - Generate destination-specific warnings

7. **AI Analysis Layer**
   - Abstracted provider interface
   - RudderStack proxy client
   - Retry logic with backoff
   - Context preparation (AST + intent)

8. **Report Generator**
   - Summary aggregation
   - Inline annotation formatting
   - Collapsible sections
   - Progressive updates

9. **GitHub Integration**
   - PR comment management
   - Inline file annotations
   - Artifact storage/retrieval
   - Workflow triggers

### Data Flow

1. PR opened/updated → Action triggered
2. Download previous artifact (if incremental)
3. Scan files → Detect RudderStack usage
4. Parse with appropriate AST parser
5. Static analysis → Post initial results
6. Fetch tracking plan + destinations (async)
7. AI analysis for complex cases → Update comment
8. Store analysis state as artifact
9. Final comment update with all results

## Additional Design Decisions

### 13. GitHub Action Triggers
- User-configurable in their workflow file
- No prescribed trigger pattern - maximum flexibility
- Examples: PR events, manual commands, labels, scheduled

### 14. File Prioritization (When Limits Exceeded)
**Hybrid Scoring System**:
- Number of RudderStack changes (weight: high)
- File status: changed > new > unchanged (weight: medium)
- File size: prefer smaller for better coverage (weight: low)
- File type likelihood (weight: low)
- Analyze highest-scored files first

### 15. PR Comment Structure
**Template**:
```markdown
## 🔍 RudderStack Instrumentation Review

### 📊 Summary
- Statistics with counts by severity

### 📁 Files Analyzed
- Coverage information

### ❌ Errors (if any)
- Always expanded

### ⚠️ Warnings (if any)
- Collapsible

### 💡 Suggestions (if any)
- Collapsible

### 🎯 Destination Impacts (if any)
- Collapsible

### 🔄 Changes Detected (if any)
- Collapsible

### 🤖 AI Analysis
- Initially "⏳ Analyzing...", updates when ready
- Collapsible
```

**Rules**:
- Skip sections with no content
- Keep comment clean and relevant

### 16. Inline Annotation Format
**Contextual approach** with:
- Clear issue description
- Impact explanation (destination-specific when applicable)
- Actionable fix with code example
- Confidence level (no source attribution)

Example:
```
❌ Invalid SDK method signature

Issue: Missing required properties parameter
Impact: Event will be tracked without context, affecting downstream destinations:
  • Google Analytics: Will not receive event properties
  • Amplitude: User properties will be incomplete

Fix: rudderanalytics.track('button_clicked', { button_id: 'signup' })

Confidence: High
```

### 17. Tracking Plan Validation Scope
**Comprehensive validation** including:
- Schema mismatches (unknown events, missing required properties, type mismatches)
- Naming convention violations (event and property naming formats)
- Business rules (conditional requirements, value constraints)
- Unknown properties not in tracking plan

### 18. SDK Version Detection

**NPM Installations:**
- Parse lock files (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`) for exact version
- Package: `@rudderstack/analytics-js` only
- Ignore legacy `rudder-sdk-js` package

**CDN Installations:**
- Version always specified in URL path
- Parse path structure regardless of CDN host (path remains consistent)
- Example: `https://custom-cdn.com/v3/rudder-analytics.min.js` → v3

### 19. RudderStack API Integration Error Handling

**Invalid/Expired Credentials:**
- Show error in PR comment that tracking plan/destination analysis couldn't be performed
- Continue with static analysis only

**No Tracking Plan Defined:**
- Skip semantic validation silently
- No warning to user

**No Destinations Configured:**
- Skip destination impact analysis silently
- No warning to user

### 20. Framework Detection (Initial Release)

**Tier 1 Support** (covers majority of use cases):
- React (CRA, Vite, custom setups)
- Next.js
- Vue
- Angular
- Vanilla JS

**Future Tiers:**
- Svelte, Nuxt, Remix, Gatsby, Astro (Tier 2)
- SolidJS, Qwik, Preact, Ember (Tier 3)

Design architecture to easily add more frameworks

### 21. SDK Initialization Validation

**Initial Release:**
- Basic detection (SDK is loaded somewhere in codebase)
- Architecture designed for extensibility

**Future Enhancements:**
- Call ordering constraints (e.g., `consent()` must be called after `load()`)
- Flow analysis to ensure proper initialization sequence
- Parameter validation (write key, data plane URL presence)

### 22. AI Proxy Privacy Requirements

**CRITICAL: Never send actual source code to AI**

**What CAN be sent:**
- AST structure and node types
- Analysis type and issue description
- Inferred types and patterns
- Framework/file type metadata
- Property counts and structure (not names/values)

**What MUST NOT be sent:**
- Source code snippets
- Variable names
- String literals
- Property keys/values
- Any business logic identifiers

**Example payload:**
```json
{
  "analysis_type": "dynamic_event_inference",
  "issue": "Event name uses template literal with variable",
  "ast_structure": {
    "node_type": "CallExpression",
    "callee": "rudderanalytics.track",
    "arguments": [
      {
        "type": "TemplateLiteral",
        "has_expressions": true,
        "static_parts_count": 2
      },
      {
        "type": "ObjectExpression",
        "property_count": 3
      }
    ]
  },
  "variable_context": {
    "template_var_type": "string",
    "deterministic": false
  },
  "framework": "react",
  "file_type": "tsx"
}
```

### 23. Security Checks

**Status:** Deferred for future releases
- Credentials exposure detection
- Configuration security issues
- PII/sensitive data patterns

### 24. Multiple SDK Instances

**Status:** Not supported (SDK doesn't support multiple instances yet)
- Focus on single instance pattern for initial release
- Can be added when SDK supports it

### 25. Confidence Scores

**Scale:** Simple 3-level system
- **High**: Strong confidence in the finding
- **Medium**: Likely correct, review recommended
- **Low**: Uncertain, manual verification needed

### 26. Changes Detected Detail Level

**Default:** Event-level detail
```
Added Events:
- user_signed_up
- purchase_completed

Modified Events:
- page_viewed (2 property changes)
```

**Configurable:** Property-level detail option
```
Modified Events:
- page_viewed
  • Added: referrer (string)
  • Changed: timestamp (number → string)
```

### 27. Implementation & Architecture

**Language:** TypeScript (Node.js)

**Architecture:** Modular design for multi-language support
```
GitHub Action (TypeScript)
├── Core Orchestrator
├── JavaScript Analyzer (TypeScript - native)
├── Swift Analyzer (future - subprocess/service)
├── Kotlin Analyzer (future - subprocess/service)
└── Report Generator
```

**Rationale:**
- Native access to TypeScript Compiler API and Babel
- Best-in-class JavaScript/TypeScript analysis
- Clean extension path for other SDK languages (Swift, Kotlin, etc.)
- Each analyzer implements common interface

**Distribution:**
- JavaScript action (fast startup)
- GitHub Marketplace release
- Format: `uses: rudderlabs/pr-reviewer@v1`

### 28. Testing Strategy

**Initial Release:** Minimal testing
- Unit tests for core logic (parsers, validators, change detectors)

**Future Expansion:**
- Integration tests (mock APIs, sample repos)
- E2E tests (real PR scenarios)

### 29. Configuration

**Workflow Inputs (for secrets & dynamic values):**
```yaml
- uses: rudderlabs/pr-reviewer@v1
  with:
    rudderstack_credentials: ${{ secrets.RUDDERSTACK_CREDS }}
```

**Config File + Workflow Inputs (for everything else):**
- Support `.rudderstack-pr-reviewer.yml` in repository
- Workflow inputs override config file values
- Config file for static/complex configuration

Example config file:
```yaml
file_patterns:
  include: ["src/**/*.{ts,tsx,js,jsx}"]
  exclude: ["**/*.test.ts"]
annotate_existing_code: false
output_format:
  verbosity: detailed
  show_property_details: true
limits:
  max_files: 150
```

### 30. Error Taxonomy

**Errors (❌) - Must fix:**
- Invalid SDK method signatures
- Missing required parameters
- Type mismatches (when types are known)
- Tracking plan violations (unknown events, wrong types)
- Breaking API usage

**Warnings (⚠️) - Should fix:**
- Deprecated API usage
- Missing recommended properties
- Naming convention violations
- Potential destination impact issues
- Property type changes that might break integrations

**Suggestions (💡) - Nice to have:**
- Best practice recommendations
- Code optimization opportunities
- Alternative approaches
- Framework-specific tips
- Performance improvements

### 31. AI Proxy API Contract

**Request Format:**
```typescript
POST /analyze
Headers:
  Authorization: Basic <service_access_token>
  Content-Type: application/json

Body:
{
  "analysis_requests": [
    {
      "id": "req_1",
      "analysis_type": "dynamic_event_inference",
      "issue": "Event name uses template literal with variable",
      "ast_structure": {...},
      "context": {...}
    }
  ]
}
```

**Response Format:**
```typescript
{
  "results": [
    {
      "id": "req_1",
      "status": "success",
      "confidence": "medium",
      "findings": {...}
    }
  ],
  "rate_limit": {
    "remaining": 20,
    "reset_at": "2025-10-06T10:30:00Z"
  }
}
```

**Strategy:**
- Batch requests in single API call
- Accept partial results if rate limited
- Retry throttled items in next batch attempt
- Future: Migrate to SSE for progressive updates

### 32. RudderStack Workspace API Integration

**Required Inputs:**
- `service_access_token`: Basic auth credentials
- `source_id`: Optional, for multi-source workspaces

**API Endpoints:**
```
GET /workspace-config?source_id=xyz
Authorization: Basic <token>
Response: JSON with destinations and configuration

GET /tracking-plans?source_id=xyz
Authorization: Basic <token>
Response: JSON with tracking plan schemas
```

**Field Mapping Support:**
- API provides detailed field mapping per destination
- Enables destination-specific impact warnings

**Error Handling:**
- Retry with backoff (multiple attempts)
- Show user that workspace-level analysis couldn't be completed if all retries fail

### 33. Project Structure

**Feature-based architecture** for extensibility:
```
src/
├── analyzers/
│   ├── javascript/
│   │   ├── parsers/
│   │   │   ├── typescript-parser.ts
│   │   │   └── babel-parser.ts
│   │   ├── detectors/
│   │   │   ├── framework-detector.ts
│   │   │   ├── sdk-detector.ts
│   │   │   └── version-detector.ts
│   │   ├── validators/
│   │   │   ├── api-validator.ts
│   │   │   └── type-validator.ts
│   │   ├── change-detector.ts
│   │   └── index.ts
│   ├── swift/ (future)
│   ├── kotlin/ (future)
│   └── base-analyzer.ts (interface)
├── integrations/
│   ├── rudderstack-api/
│   │   ├── client.ts
│   │   ├── types.ts
│   │   └── retry.ts
│   ├── ai-proxy/
│   │   ├── client.ts
│   │   ├── payload-builder.ts
│   │   └── types.ts
│   └── github/
│       ├── pr-client.ts
│       ├── artifact-manager.ts
│       └── types.ts
├── reporters/
│   ├── comment-generator.ts
│   ├── annotation-generator.ts
│   └── formatter.ts
├── core/
│   ├── orchestrator.ts
│   ├── file-scanner.ts
│   ├── file-prioritizer.ts
│   └── config-loader.ts
├── types/
│   └── common.ts
├── utils/
│   └── helpers.ts
└── main.ts
```

**Benefits:**
- Easy to add new language analyzers
- Clear module boundaries
- Plugin-like architecture
- Independently testable

### 34. Versioning & Release Strategy

**Dual versioning approach:**
- Semantic versioning: `v1.0.0`, `v1.1.0`, `v2.0.0`
- Major version tags: `v1`, `v2` (auto-update to latest)

**Customer options:**
```yaml
uses: rudderlabs/pr-reviewer@v1        # Auto-updates to latest v1.x
uses: rudderlabs/pr-reviewer@v1.2.3    # Pinned to specific version
```

### 35. Action Configuration (action.yml)

```yaml
name: 'RudderStack PR Reviewer'
description: 'Analyzes RudderStack SDK instrumentation changes in pull requests'
author: 'RudderStack'

branding:
  icon: 'check-circle'
  color: 'blue'

inputs:
  service_access_token:
    description: 'RudderStack service access token for API access'
    required: true
  source_id:
    description: 'Optional source ID for multi-source workspaces'
    required: false
  github_token:
    description: 'GitHub token for PR comments and annotations'
    required: true
    default: ${{ github.token }}
  config_path:
    description: 'Path to config file'
    required: false
    default: '.rudderstack-pr-reviewer.yml'
  file_patterns:
    description: 'File patterns to include (comma-separated)'
    required: false
  exclude_patterns:
    description: 'File patterns to exclude (comma-separated)'
    required: false
  annotate_existing_code:
    description: 'Annotate existing code or only changed lines'
    required: false
    default: 'false'
  output_verbosity:
    description: 'Output verbosity level: minimal, standard, detailed'
    required: false
    default: 'standard'

outputs:
  analysis_status:
    description: 'Status of the analysis: success, partial, failed'
  error_count:
    description: 'Number of errors found'
  warning_count:
    description: 'Number of warnings found'
  suggestion_count:
    description: 'Number of suggestions found'

runs:
  using: 'node24'
  main: 'dist/index.js'
```

### 36. MVP Scope

**Included in MVP:**
- Static analysis (TypeScript Compiler API + Babel)
- SDK syntax/API validation
- Framework detection (React, Next.js, Vue, Angular, Vanilla JS)
- Tracking plan validation (optional, via workspace API)
- Destination impact analysis (optional, via workspace API)
- PR comment with summary + inline annotations
- AI-enhanced analysis (via proxy, batch requests)
- Incremental analysis with GitHub artifacts
- NPM + CDN version detection (lock files for NPM, URL parsing for CDN)
- Change detection (events + properties, event-level detail by default)
- Error taxonomy (Errors, Warnings, Suggestions)
- Config file support + workflow inputs

**Deferred to Future:**
- Security checks
- Onboarding guidance mode
- Monorepo support
- SDK initialization ordering validation
- Multi-instance support
- Additional framework support (Tier 2+)
- Multi-language support (Swift, Kotlin)
- Property-level change details (configurable)

## Open Questions

### For Future Discussion
- AI prompt engineering strategies
- Monitoring/telemetry for action usage
- Specific business rules format in tracking plans

## References

- RudderStack JS SDK Examples: https://github.com/rudderlabs/rudder-sdk-js/tree/develop/examples
- Target SDK: RudderStack JavaScript SDK v3
