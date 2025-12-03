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
- [Directory Structure](#directory-structure)
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

## Directory Structure

```
/Volumes/Workspace/Repositories/pr-reviewer/
├── src/
│   ├── main.ts                          # Entry point
│   │
│   ├── core/
│   │   ├── ai-orchestrator.ts           # Main orchestration
│   │   └── config-loader.ts             # Config loading + merging
│   │
│   ├── integrations/
│   │   ├── anthropic/                   # AI Analysis
│   │   │   ├── orchestrator.ts          # AI orchestration
│   │   │   ├── client.ts                # Anthropic API client
│   │   │   ├── prompt-builder.ts        # Prompt engineering
│   │   │   ├── chunker.ts               # Token limit handling
│   │   │   ├── types.ts                 # AI-specific types
│   │   │   └── index.ts                 # Exports
│   │   │
│   │   └── github/                      # GitHub Integration
│   │       ├── enhanced-pr-client.ts    # PR context + operations
│   │       ├── three-comment-strategy.ts# Comment posting logic
│   │       ├── diff-parser.ts           # Parse GitHub diffs
│   │       ├── artifact-manager.ts      # Incremental analysis
│   │       └── index.ts                 # Exports
│   │
│   └── types/
│       └── common.ts                    # Shared type definitions
│
├── action.yml                           # GitHub Action metadata
├── package.json                         # Dependencies
├── tsconfig.json                        # TypeScript config
├── README.md                            # User documentation
├── ARCHITECTURE.md                      # This file
├── DEVELOPMENT.md                       # Developer guide
└── dist/
    └── index.js                         # Compiled bundle (5MB)
```

**Total Files:** 15 TypeScript files
**Bundle Size:** ~4.8MB (single file)

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
- **System Prompt:** Defines AI role and capabilities
- **User Prompt:** Provides files and analysis requirements
- Includes:
  - Changed files (primary focus)
  - Unchanged files (context)
  - Analysis requirements (9 steps)
  - JSON output schema

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
    sdkVersion: string;
    sdkInstallationType: 'npm' | 'cdn' | 'unknown';
    filesAnalyzed: number;
    totalIssues: number;
    recommendations: string[];
  };
  events: Event[];
  issues: {
    errors: Issue[];
    warnings: Issue[];
    suggestions: Issue[];
  };
  destinationImpacts: DestinationImpact[];
  unchangedFileIssues: Issue[];
}
```

---

### 3. GitHub Integration

**Location:** `src/integrations/github/`

#### a. Three-Comment Strategy (`three-comment-strategy.ts`)

**Strategy Overview:**
1. **Global Summary Comment** (cumulative)
   - Single comment, updates in place
   - Shows complete analysis state
   - Collapsible sections
   - Includes previous results for comparison

2. **PR Review Body** (incremental delta)
   - New review on each run
   - Shows changes since last analysis
   - Summary of new events/issues

3. **Inline Annotations**
   - Attached to PR review
   - Errors + warnings only
   - Changed lines only (GitHub API limitation)

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

**Problem:** Static analysis couldn't handle:
- Custom abstractions (wrappers, utilities, hooks)
- Dynamic event names
- Complex control flow
- Framework-specific patterns

**Solution:** AI can:
- Understand intent across abstraction layers
- Infer event names from context
- Handle any framework
- Provide natural language explanations

**Trade-off:** Requires external API (Anthropic), but much more accurate.

---

### Why Three-Comment Strategy?

**Problem:** How to show both cumulative state and incremental changes?

**Solution:**
1. **Global Summary:** Full picture of current state
2. **PR Review:** What changed this commit
3. **Inline Annotations:** Specific line-level issues

**Benefits:**
- Reviewers see both "what's new" and "what's the full state"
- History preserved in comment thread
- Inline annotations provide context

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

## Performance Characteristics

### Token Usage

**Average PR:**
- 5 changed files
- ~500 lines per file
- ~15K tokens input
- ~5K tokens output
- **Cost:** ~$0.15 per analysis

**Large PR:**
- 20 changed files
- ~10K lines total
- ~60K tokens input (might chunk)
- ~15K tokens output
- **Cost:** ~$0.50 per analysis

### Timing

**Typical:**
- File reading: <1s
- AI analysis: 10-30s
- Comment posting: <2s
- **Total:** 15-35 seconds

**Large PR (chunked):**
- 2-3 chunks × 20s each
- **Total:** 40-60 seconds

### Limits

- Max files: Unlimited (chunks automatically)
- Max file size: No hard limit (but affects tokens)
- Max PR size: Unlimited (chunks automatically)
- Max tokens per request: Configurable (default 64K)

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
