# Architecture Documentation - RudderStack PR Reviewer

**Last Updated:** December 2025
**Current Version:** 1.0.0
**Architecture:** AI-First Analysis

This document provides a high-level overview of the RudderStack PR Reviewer GitHub Action architecture for handoff to other teams.

---

## Table of Contents

- [Overview](#overview)
- [Core Architecture](#core-architecture)
- [Data Flow](#data-flow)
- [Key Components](#key-components)
- [Configuration](#configuration)
- [Extension Points](#extension-points)
- [Design Decisions](#design-decisions)

---

## Overview

The RudderStack PR Reviewer is a **GitHub Action** that analyzes pull requests for RudderStack JavaScript SDK v3 instrumentation changes using **AI-powered analysis** (Anthropic Claude).

### What It Does

- Analyzes changed JavaScript/TypeScript files in PRs
- Detects RudderStack SDK usage (direct calls and custom abstractions)
- Validates API correctness and best practices
- Identifies events, properties, and property-level changes
- Detects SDK version (NPM vs CDN)
- Infers potential destination impacts (without requiring RudderStack API)
- Posts analysis as PR comments with inline annotations
- Supports incremental analysis (tracks changes between runs)

---

## Core Architecture

### Philosophy: AI-First, Zero Dependencies

```
┌─────────────────────────────────────────────────┐
│           GitHub Actions Runner                  │
│  (Customer's Infrastructure)                     │
│                                                  │
│  ┌────────────────────────────────────────┐    │
│  │  RudderStack PR Reviewer Action        │    │
│  │                                          │    │
│  │  1. Reads changed files from PR         │    │
│  │  2. Sends to Anthropic API (AI)         │    │
│  │  3. Parses AI analysis results          │    │
│  │  4. Posts comments to GitHub PR         │    │
│  └────────────────────────────────────────┘    │
│                                                  │
└─────────────────────────────────────────────────┘
           │                         │
           │                         │
           ▼                         ▼
   Anthropic API                GitHub API
   (AI Analysis)               (PR Comments)
```

### Technology Stack

- **Runtime:** Node.js 24+ (GitHub Actions native)
- **Language:** TypeScript
- **AI Provider:** Anthropic (Claude Sonnet 4.5 default)
- **Build:** Vercel ncc (single bundle)
- **Distribution:** GitHub Marketplace

---

## Data Flow

### High-Level Flow

```
1. PR Event Trigger (opened/synchronize/reopened)
   ↓
2. Load Configuration (workflow inputs + optional config file)
   ↓
3. Get PR Context (owner, repo, PR number, changed files)
   ↓
4. Filter JavaScript/TypeScript Files (.js, .jsx, .ts, .tsx, .mjs, .cjs)
   ↓
5. Retrieve Previous Analysis Artifact (for incremental delta)
   ↓
6. Read File Contents from Disk
   ↓
7. Chunk Files (if total size exceeds token limit)
   ↓
8. Build AI Prompts (system + user prompts with file contents)
   ↓
9. Send to Anthropic API (streaming responses)
   ↓
10. Parse JSON Responses from AI
   ↓
11. Merge Results (if multiple chunks)
   ↓
12. Generate Three-Comment Strategy:
    - Global Summary Comment (cumulative state)
    - PR Review Body (incremental delta)
    - Inline Annotations (errors + warnings on changed lines)
   ↓
13. Store Analysis Artifact (for next run)
   ↓
14. Set GitHub Action Outputs (error_count, warning_count, etc.)
```

### Detailed Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│ main.ts                                                       │
│ • Entry point                                                 │
│ • Loads config                                                │
│ • Validates inputs                                            │
│ • Calls orchestrateAIBasedAnalysis()                         │
└───────────────────┬──────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────┐
│ ai-orchestrator.ts                                            │
│ • Main orchestration logic                                    │
│ • Gets PR context from GitHub                                 │
│ • Filters JS/TS files                                         │
│ • Retrieves previous artifact (incremental)                   │
│ • Calls AI analysis orchestrator                              │
│ • Generates three-comment strategy                            │
│ • Stores artifact for next run                                │
└───────────────────┬──────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────┐
│ anthropic/orchestrator.ts                                     │
│ • Reads file contents                                         │
│ • Creates chunks (if needed)                                  │
│ • Builds prompts for each chunk                               │
│ • Calls Anthropic API (streaming)                             │
│ • Parses JSON responses                                       │
│ • Merges results from multiple chunks                         │
└───────────────────┬──────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┬───────────────────┐
        │                       │                   │
        ▼                       ▼                   ▼
┌──────────────┐    ┌──────────────────┐    ┌─────────────┐
│ chunker.ts   │    │ prompt-builder.ts│    │ client.ts   │
│              │    │                  │    │             │
│ • Token est. │    │ • System prompt  │    │ • API calls │
│ • Smart      │    │ • User prompt    │    │ • Streaming │
│   grouping   │    │ • File contents  │    │ • Retries   │
│ • Fallbacks  │    │ • Requirements   │    │             │
└──────────────┘    └──────────────────┘    └─────────────┘
```

---

## Key Components

### 1. Configuration System

**Location:** `src/core/config-loader.ts`

**Inputs:**
- Workflow inputs (from `action.yml` `with:` block)
- Optional config file (`.rudderstack-pr-reviewer.yml`)

**Precedence:** Workflow inputs override config file

**Key Config:**
```typescript
interface ActionConfig {
  githubToken: string;          // Required
  anthropicApiKey: string;      // Required
  rootDirectory?: string;       // Optional (for testing)
  aiModel: string;              // Default: claude-sonnet-4-5
  maxTokensPerRequest: number;  // Default: 64000
  annotationMode: string;       // Default: errors_warnings
  reviewUnchangedFiles: boolean;// Default: false
  configPath: string;           // Default: .rudderstack-pr-reviewer.yml
}
```

---

### 2. AI Analysis Pipeline

**Location:** `src/integrations/anthropic/`

#### a. Orchestrator (`orchestrator.ts`)
- Coordinates entire AI analysis flow
- Reads file contents
- Creates chunks if needed
- Calls Anthropic API
- Parses and merges results

#### b. Chunker (`chunker.ts`)
- Handles token limit constraints
- Estimates token usage (1 token ≈ 4 chars)
- Strategy: Try to fit all files in one request
- Fallback: Split changed vs unchanged
- Ultimate fallback: Split by file

#### c. Prompt Builder (`prompt-builder.ts`)

**System Prompt (Role Definition):**
- Defines AI as RudderStack SDK v3 expert
- Complete API reference with TypeScript signatures for all methods
- Common abstraction patterns to recognize (hooks, utilities, services)
- Reference documentation links
- Severity classification guidelines (errors vs warnings vs suggestions)
- Confidence scoring criteria (high/medium/low)
- Change detection strategy
- Common issues checklist (API errors, type safety, best practices, framework-specific, abstractions)

**User Prompt (Task Execution):**
- Dynamically constructed based on available context
- RudderStack context (destinations) if provided
- Changed files (primary focus)
- Unchanged files (context only)
- 8-step analysis checklist:
  1. SDK Detection (version and installation type)
  2. Event Discovery (with property-level changes)
  3. SDK Validation (API correctness)
  4. Abstraction Analysis (custom wrappers)
  5. Naming Conventions
  6. Destination Impact (if destinations provided)
  7. Best Practices
  8. Issue Identification
- Concrete JSON output examples
- Clear output requirements (JSON-only, no markdown)

#### d. Client (`client.ts`)
- Anthropic API wrapper
- Streaming support
- Error handling
- Token usage tracking

**AI Response Format:**
```typescript
interface AIAnalysisResult {
  summary: {
    overallAssessment: string;
    sdkVersion?: string;              // Detected SDK version
    sdkInstallationType?: string;     // 'npm' | 'cdn' | 'unknown'
    filesAnalyzed: number;
    totalIssues: number;
    recommendations: string[];
  };
  events: Event[];                    // All events with properties
  issues: {
    errors: Issue[];                  // Critical issues (MUST fix)
    warnings: Issue[];                // Issues that SHOULD be fixed
    suggestions: Issue[];             // NICE to have improvements
  };
  destinationImpacts: DestinationImpact[];  // Impact on connected destinations
  unchangedFileIssues: Issue[];       // Issues in unchanged code
}

interface Event {
  name: string;
  file: string;
  line?: number;
  status: 'added' | 'modified' | 'removed' | 'existing';
  properties?: EventProperty[];       // Property details with types
  issues?: string[];                  // Event-specific issues
}

interface Issue {
  severity: 'error' | 'warning' | 'suggestion';
  message: string;
  file: string;
  line?: number;
  column?: number;
  impact?: string;                    // Explanation of impact
  fix?: string;                       // Code fix suggestion
  confidence: 'high' | 'medium' | 'low';
}
```

---

### 3. GitHub Integration

**Location:** `src/integrations/github/`

#### a. Three-Comment Strategy (`three-comment-strategy.ts`)

**Strategy Overview:**
1. **Global Summary Comment** (cumulative, high-level)
   - Single comment, updates in place with full replacement
   - Shows cumulative analysis state across all runs
   - **High-level only**: Status badges, metrics table, event lists (names only), error categorization
   - **Visual indicators**: 🔴 Action Required / 🟡 Review / 🟢 All Clear
   - **Trend tracking**: Shows delta from previous analysis (↗️ ↘️ →)
   - Collapsible sections for events and error breakdown
   - Resources & help links
   - Copy-friendly summary for team sharing

2. **PR Review Body** (incremental, detailed)
   - New review posted with each analysis run
   - Shows delta since last analysis at top
   - **Contains ALL detailed findings**:
     - Full error descriptions with file grouping, impacts, and fixes
     - Full warning descriptions with file grouping, impacts, and fixes
     - Full suggestion descriptions with fixes
     - Detailed event listings with properties and locations
     - Destination impact analysis with affected events
     - Issues found in unchanged code
   - Purpose: One-stop shop for all analysis details per run

3. **Inline Annotations**
   - Attached to PR review
   - Errors + warnings only (configurable)
   - Changed lines only (GitHub API limitation)
   - Enhanced format with location table and confidence indicators

#### b. Enhanced PR Client (`enhanced-pr-client.ts`)
- Gets PR context (owner, repo, number, SHAs)
- Fetches changed files list
- Posts comments and reviews
- Sets action outputs

#### c. Diff Parser (`diff-parser.ts`)
- Parses GitHub unified diff format
- Identifies changed line numbers
- Used for inline annotation placement

#### d. Artifact Manager (`artifact-manager.ts`)
- Stores analysis results as GitHub artifact
- 90-day retention
- Enables incremental analysis (delta detection)

---

### 4. Incremental Analysis

**How It Works:**

```
Run 1 (No previous artifact):
  ├─ Analyze all files
  ├─ Post "This is the first analysis"
  └─ Store artifact with results

Run 2 (Artifact exists):
  ├─ Retrieve previous artifact
  ├─ Analyze current files
  ├─ Calculate delta (new events, new issues)
  ├─ Post "Changes since last run"
  └─ Update artifact

Run 3+:
  └─ Same as Run 2
```

**Benefits:**
- Global summary shows cumulative state
- PR review shows what's new
- Reduces cognitive load for reviewers

---

## Configuration

### Required Secrets

```yaml
secrets:
  ANTHROPIC_API_KEY  # Get from console.anthropic.com
```

### Minimal Configuration

```yaml
- uses: rudderlabs/pr-reviewer@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Full Configuration

```yaml
- uses: rudderlabs/pr-reviewer@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    github_token: ${{ secrets.GITHUB_TOKEN }}  # Optional
    ai_model: 'claude-sonnet-4-5'              # Optional
    max_tokens_per_request: '64000'            # Optional
    annotation_mode: 'errors_warnings'         # Optional
    review_unchanged_files: false              # Optional (testing)
    root_directory: ''                         # Optional (testing)
```

### Config File (Optional)

`.rudderstack-pr-reviewer.yml`:
```yaml
ai:
  model: 'claude-sonnet-4-5'
  max_tokens_per_request: 64000
annotation_mode: 'errors_warnings'
```

---

## Extension Points

### 1. Add New AI Provider

**Current:** Anthropic only
**To Add:** Create new client in `src/integrations/[provider]/`

**Interface:**
```typescript
interface AIClient {
  testConnection(): Promise<boolean>;
  analyze(request: AnalyzeRequest): Promise<AnalyzeResponse>;
}
```

### 2. Add New Programming Language

**Current:** JavaScript/TypeScript only
**To Add:**
1. Update file filter in `ai-orchestrator.ts`
2. Update AI prompt to handle new language
3. Add language-specific validation rules

### 3. Add Custom Validation Rules

**Current:** AI determines all rules
**To Add:**
1. Add rules to `prompt-builder.ts` system prompt
2. Or create post-processing in `orchestrator.ts`

### 4. Add New Output Formats

**Current:** PR comments only
**To Add:** Create new reporter in `src/integrations/[platform]/`

---

## Design Decisions

### Why AI-First?

**Problem:** Traditional code analysis approaches struggle with:
- Custom abstractions (wrappers, utilities, hooks)
- Dynamic event names (template literals, computed values)
- Complex control flow across multiple files
- Framework-specific patterns (React hooks, Angular services, etc.)
- Understanding developer intent vs just syntax

**Solution:** AI-powered analysis can:
- Understand intent across abstraction layers
- Infer event names from context and variable flow
- Handle any framework without specific configuration
- Provide natural language explanations
- Recognize patterns that developers actually use in practice
- Suggest context-aware fixes with code examples

**Trade-off:** Requires external AI API (Anthropic), but significantly more accurate and flexible than rule-based approaches.

---

### Why Three-Comment Strategy?

**Problem:** How to show both cumulative state and incremental changes without overwhelming users?

**Solution:**
1. **Global Summary:** High-level cumulative view (status, metrics, trends)
2. **PR Review:** Detailed analysis results for each run (all errors, warnings, suggestions)
3. **Inline Annotations:** Specific line-level issues in code context

**Design Principle:** Summary vs Details Separation
- Global summary = "What's the overall status?" (scannable, at-a-glance)
- PR review = "What are the specific issues?" (detailed, actionable)
- Inline annotations = "What's wrong with this line?" (contextual, specific)

**Benefits:**
- Reviewers can quickly scan status without scrolling through details
- Details are available per-analysis in review comments
- History preserved in comment thread (each review is a snapshot)
- Professional UX matching tools like CodeRabbit, SonarCloud
- Inline annotations provide code context

---

### Why Chunking?

**Problem:** AI has token limits (Claude: ~200K context)

**Solution:** Smart chunking with fallback strategy
1. Try: All files in one request (best quality)
2. Fallback: Split changed vs unchanged
3. Ultimate: Split by individual files

**Trade-off:** Multiple requests cost more but handle large PRs

---

### Why Incremental Analysis?

**Problem:** Re-analyzing everything on every commit wastes tokens/cost

**Solution:** Store previous results, calculate delta

**Implementation:** GitHub Artifacts (90-day retention, free)

---

## Deployment

### Build

```bash
npm run build
# Output: dist/index.js (single 4.8MB file)
```

### Release

1. Update version in `package.json`
2. Build: `npm run build`
3. Commit dist/: `git add dist/index.js`
4. Tag: `git tag v1.0.0`
5. Push: `git push origin v1.0.0`
6. GitHub Marketplace: Auto-publishes on tag

### Versioning

- Major tag: `v1` (auto-updates to latest v1.x)
- Specific: `v1.0.0` (pinned)

Users choose:
```yaml
uses: rudderlabs/pr-reviewer@v1      # Auto-update
uses: rudderlabs/pr-reviewer@v1.0.0  # Pinned
```

---

## Troubleshooting

### Common Issues

**"No files to analyze"**
- PR has no JS/TS file changes
- Files filtered out by extension check

**"AI analysis failed"**
- Invalid Anthropic API key
- Rate limited
- Token limit exceeded (shouldn't happen with chunking)

**"Failed to parse AI response"**
- AI returned invalid JSON (rare with Claude)
- Check logs for raw response

**Artifact storage failed**
- Non-critical - incremental analysis won't work
- Action continues successfully

---

## Future Enhancements (Deferred)

- Security checks (credential exposure, PII detection, hardcoded secrets)
- Monorepo support (multiple projects in single repository)
- Multi-language support (Swift, Kotlin for mobile SDKs)
- RudderStack API integration for tracking plan validation (optional enhancement)
- Custom validation rules engine
- Local AI model support (offline analysis)
- Cost optimization (caching, smarter chunking)
- Progress indicators in PR comment
- Configurable severity thresholds
- SDK initialization ordering validation

---

**End of Architecture Documentation**
