# Development Guide - RudderStack PR Reviewer

This document contains technical details for developers working on the RudderStack PR Reviewer action.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Development Setup](#development-setup)
- [Implementation Details](#implementation-details)
- [Testing Strategy](#testing-strategy)
- [Build & Release](#build--release)
- [Extending the Action](#extending-the-action)

## Architecture Overview

For a comprehensive high-level overview, see [ARCHITECTURE.md](ARCHITECTURE.md).

The PR Reviewer uses an **AI-first architecture** powered by Anthropic's Claude models. It analyzes RudderStack SDK instrumentation by sending source code directly to the AI model for analysis.

### Core Philosophy

- **AI-First**: No static AST parsing, no complex regex patterns
- **Zero External Dependencies**: No RudderStack API integration required
- **Direct Analysis**: Source code → AI model → PR comments
- **Simple & Maintainable**: Minimal abstraction layers

### High-Level Data Flow

```
PR Event Triggered
  ↓
1. Load Configuration (action inputs + config file)
  ↓
2. Retrieve Previous Artifact (for incremental analysis)
  ↓
3. Identify Changed Files (via GitHub API)
  ↓
4. Read File Contents (all changed files)
  ↓
5. Smart Chunking (if token limit exceeded)
  ↓
6. Send to Anthropic API (batched analysis)
  ↓
7. Parse AI Response (structured JSON + markdown)
  ↓
8. Generate Three-Comment Output:
   - Global Summary (cumulative state)
   - PR Review Body (incremental delta)
   - Inline Annotations (errors + warnings)
  ↓
9. Save Analysis Artifact (for next incremental run)
```

### Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Action (main.ts)                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┴────────────────────┐
        │      AI Orchestrator                   │
        │  - Workflow coordination               │
        │  - Artifact management                 │
        │  - Error handling                      │
        └───────────────────┬────────────────────┘
                            │
        ┌───────────────────┴────────────────────┐
        │                                        │
┌───────▼─────────┐                  ┌──────────▼─────────┐
│   GitHub Client │                  │  Anthropic Client  │
│  - PR context   │                  │  - Chunking        │
│  - Comments     │                  │  - Prompts         │
│  - Annotations  │                  │  - Streaming       │
│  - Artifacts    │                  │  - Parsing         │
└─────────────────┘                  └────────────────────┘
```

## Project Structure

```
pr-reviewer/
├── src/
│   ├── core/
│   │   ├── ai-orchestrator.ts       # Main workflow orchestration
│   │   └── config-loader.ts         # Load & merge configs
│   │
│   ├── integrations/
│   │   ├── anthropic/
│   │   │   ├── client.ts            # Anthropic API client
│   │   │   ├── orchestrator.ts      # AI analysis coordination
│   │   │   ├── chunker.ts           # Token-based chunking
│   │   │   ├── prompt-builder.ts    # System + user prompts
│   │   │   ├── response-parser.ts   # Parse AI responses
│   │   │   └── types.ts             # Anthropic types
│   │   └── github/
│   │       ├── context.ts           # PR context extraction
│   │       ├── comments.ts          # Three-comment strategy
│   │       ├── annotations.ts       # Inline annotations
│   │       ├── artifact-manager.ts  # Artifact save/load
│   │       └── types.ts             # GitHub API types
│   │
│   ├── types/
│   │   └── common.ts                # Shared type definitions
│   │
│   └── main.ts                      # Entry point
│
├── testApps/                        # Test applications
│   ├── npm-valid/                   # Valid NPM SDK usage
│   ├── npm-invalid/                 # Invalid NPM SDK usage
│   ├── cdn-valid/                   # Valid CDN SDK usage
│   └── cdn-invalid/                 # Invalid CDN SDK usage
│
├── dist/                            # Build output (generated)
├── .github/
│   └── workflows/
│       ├── test.yml                 # CI workflow
│       └── example.yml              # Example workflow
├── action.yml                       # GitHub Action metadata
├── package.json
├── tsconfig.json
├── eslint.config.mjs
├── .prettierrc.json
├── .gitignore
├── README.md                        # User documentation
├── ARCHITECTURE.md                  # High-level architecture
├── CLAUDE.md                        # Design decisions & context
└── DEVELOPMENT.md                   # This file
```

## Development Setup

### Prerequisites

- Node.js 24.x or later
- npm
- Git
- Anthropic API key (for testing)

### Initial Setup

```bash
# Clone repository
git clone https://github.com/rudderlabs/pr-reviewer.git
cd pr-reviewer

# Install dependencies
npm install

# Run type checking
npm run typecheck

# Build action
npm run build
```

### Development Workflow

```bash
# Type check (recommended during development)
npm run typecheck

# Build for production
npm run build

# Lint code
npm run lint

# Format code
npm run format
```

### Testing Locally

The action is designed to run in GitHub Actions environment. To test locally:

1. Create a test repository with RudderStack instrumentation
2. Open a PR with changes
3. Manually run the action workflow

**Note**: There are currently no unit/integration tests. Testing is manual via `testApps/` directories.

## Implementation Details

### Configuration System

Configuration is loaded from two sources (workflow inputs override config file):

1. **Workflow Inputs** (`action.yml` → `config-loader.ts`)
   - `github_token` (required)
   - `anthropic_api_key` (required)
   - `root_directory` (optional)
   - `config_path` (optional)
   - `review_unchanged_files` (optional)
   - `ai_model` (optional)
   - `max_tokens_per_request` (optional)
   - `annotation_mode` (optional)

2. **Config File** (`.rudderstack-pr-reviewer.yml`)
   - Currently minimal (mostly placeholders)
   - Future: Custom rules, ignore patterns, etc.

### AI Analysis Flow

#### 1. Prompt Engineering (`prompt-builder.ts`)

**System Prompt** (role definition):

Provides comprehensive context for the AI including:
- **Expertise definition**: RudderStack SDK v3 expert with knowledge of frameworks and analytics platforms
- **SDK API Reference**: Complete method signatures with TypeScript types for all core methods (load, identify, track, page, group, alias, ready, reset)
- **Common patterns**: Custom abstractions users create (hooks, utilities, service classes, event builders)
- **Reference docs**: Links to official docs, GitHub repo, NPM package, migration guide, and framework examples
- **Severity classification**: Clear guidelines for errors (MUST fix), warnings (SHOULD fix), and suggestions (NICE to have)
- **Confidence scoring**: High (strong evidence), medium (likely correct), low (uncertain)
- **Change detection strategy**: How to determine if events are added/modified/removed/existing
- **Common issues checklist**: API usage errors, type safety issues, best practice violations, framework-specific problems, abstraction problems

**User Prompt** (task execution):

Dynamically constructed based on context:
```typescript
# Analysis Task: Pull Request Instrumentation Review

[Context explanation of changed vs unchanged files]

## RudderStack Context: Connected Destinations (optional)
[JSON of destinations if available]

## Changed Files (PRIMARY FOCUS)
[File contents with syntax highlighting]

## Unchanged Files (CONTEXT ONLY)
[File contents for reference]

## Analysis Checklist:
1. SDK Detection
2. Event Discovery (with property-level changes)
3. SDK Validation
4. Abstraction Analysis
5. Naming Conventions
6. Destination Impact (if destinations provided)
7. Best Practices
8. Issue Identification
```

Key features:
- **Conditional sections**: RudderStack context only included if destinations are configured
- **Visual hierarchy**: Emoji indicators, clear section headers
- **Concrete examples**: JSON structure with actual values, not just schema
- **Step-by-step checklist**: 8 specific analysis steps the AI should perform
- **Clear output requirements**: JSON-only response without markdown formatting

#### 2. Chunking Strategy (`chunker.ts`)

Token budget calculation accounts for:
- System prompt tokens
- RudderStack context tokens (destinations JSON if provided)
- Available tokens for code = `max_tokens_per_request` - context tokens

If total code tokens exceed available tokens, apply hybrid fallback strategy:

1. **Strategy 1: Smart Grouping** - Group files by directory/feature
   - Keeps related files together for better context
   - Fails if any group is too large

2. **Strategy 2: Changed vs Unchanged Split**
   - Prioritize changed files in separate chunks
   - Add unchanged files if space permits
   - Fails if changed files alone exceed limit

3. **Strategy 3: File-Based Chunking** (ultimate fallback)
   - Split files individually across multiple chunks
   - Truncate oversized files with warning
   - Always succeeds

Token estimation: **1 token ≈ 4 characters**

#### 3. API Communication (`client.ts`)

- Uses Anthropic SDK (`@anthropic-ai/sdk`)
- Streaming API with message handling
- Error handling with clear messages (no retries)
- Configurable model (default: `claude-sonnet-4-5`)

#### 4. Response Parsing (`response-parser.ts`)

AI returns structured JSON:
```typescript
{
  summary: {
    overallAssessment: string;
    sdkVersion: string;
    sdkInstallationType: "npm" | "cdn" | "unknown";
    filesAnalyzed: number;
    totalIssues: number;
    recommendations: string[];
  };
  events: Array<{
    eventName: string;
    location: { file: string; line: number };
    properties: Array<{ key: string; type: string; required: boolean }>;
  }>;
  issues: {
    errors: Issue[];
    warnings: Issue[];
    suggestions: Issue[];
  };
  destination_impacts: Array<{
    destination: string;
    impact: string;
    description: string;
  }>;
  unchanged_file_issues: Issue[];
}
```

### Three-Comment Strategy

#### 1. Global Summary Comment (`comments.ts`)

- **Behavior**: Single comment, updated in place (full replacement)
- **Content**: Cumulative analysis of entire PR
  - High-level summary
  - All events found
  - Total issue counts
  - Suggestions
  - Destination impacts
- **Sections**: Collapsible markdown for organization

#### 2. PR Review Body (`comments.ts`)

- **Behavior**: New review posted with each analysis run
- **Content**: Incremental changes since last analysis
  - Delta changes only
  - New events found
  - New issues identified
- **Attachment**: Includes inline annotations

#### 3. Inline Annotations (`annotations.ts`)

- **Scope**: Errors + Warnings only (not suggestions)
- **Location**: Changed lines only (GitHub API limitation)
- **Format**: Actionable recommendations with confidence levels

Example annotation:
```
❌ Invalid SDK method signature

Issue: Missing required properties parameter
Impact: Event will be tracked without context

Fix: rudderanalytics.track('button_clicked', { button_id: 'signup' })

Confidence: High
```

### Incremental Analysis

Uses GitHub Actions Artifacts (90-day retention):

```typescript
// Store analysis
{
  version: "1.0",
  timestamp: "2025-12-03T10:00:00Z",
  prNumber: 123,
  commitSha: "abc123",
  analysisResult: { /* full AI response */ }
}

// On next run:
// 1. Retrieve previous artifact
// 2. Compare events/issues
// 3. Calculate delta
// 4. Update global summary (cumulative)
// 5. Post review body (delta only)
```

### Error Handling

**Strategy**: Fail fast with clear error messages

- No retries on AI API failures
- Post comment explaining what failed and why
- Set action outputs to 'failed' status
- Exit with error code

Example error comment:
```markdown
## ❌ Analysis Failed

The RudderStack PR Reviewer encountered an error:

**Error**: Anthropic API request failed (401 Unauthorized)

**Possible causes**:
- Invalid or expired ANTHROPIC_API_KEY
- API key lacks necessary permissions

**Next steps**:
1. Verify your API key in repository secrets
2. Check Anthropic dashboard for key status
```

### SDK Version Detection

**AI-powered detection** from code:

1. **NPM installations**: Parse `package.json` or import statements
2. **CDN installations**: Extract version from script URLs

AI includes in response:
```typescript
{
  sdkVersion: "3.24.2",           // Exact version (NPM) or major version (CDN)
  sdkInstallationType: "npm"      // "npm" | "cdn" | "unknown"
}
```

### Property-Level Analysis

AI identifies specific property changes:

```typescript
{
  eventName: "page_viewed",
  changeType: "modified",
  propertyChanges: [
    {
      property: "referrer",
      changeType: "added",
      type: "string"
    },
    {
      property: "timestamp",
      changeType: "type_changed",
      oldType: "number",
      newType: "string"
    }
  ]
}
```

## Testing Strategy

### Current State

**No automated tests** - Testing is manual via:
- `testApps/` sample applications
- Real PR workflows
- Manual verification of comments/annotations

### Future Testing

**Phase 1: Unit Tests**
- Prompt builder (ensure prompts are correct)
- Response parser (validate JSON parsing)
- Chunker (verify token estimation and splitting)
- Configuration loader (test input merging)

**Phase 2: Integration Tests**
- Mock Anthropic API responses
- Mock GitHub API interactions
- Test full orchestration flow
- Verify comment generation

**Phase 3: E2E Tests**
- Create test repository
- Open PRs with known changes
- Run action workflow
- Verify output accuracy

### Manual Testing Workflow

```bash
# 1. Make changes to testApps/npm-valid/index.js
# 2. Commit and push to feature branch
# 3. Open PR on GitHub
# 4. Trigger action workflow
# 5. Verify:
#    - Global summary comment
#    - PR review body
#    - Inline annotations
#    - Action outputs
```

## Build & Release

### Build Process

```bash
# Type check
npm run typecheck

# Build with ncc (bundles into single file)
npm run build

# Creates dist/index.js (~4.8MB with all dependencies)
```

The build uses `@vercel/ncc` to bundle TypeScript source and all dependencies into a single `dist/index.js` file. This makes the action fast to load in GitHub Actions.

### Release Process

1. **Update version** in `package.json`
   ```bash
   npm version patch  # or minor, major
   ```

2. **Update CHANGELOG.md** (if exists)
   ```markdown
   ## [1.2.3] - 2025-12-03
   ### Added
   - New feature X
   ### Fixed
   - Bug Y
   ```

3. **Commit changes**
   ```bash
   git add package.json CHANGELOG.md
   git commit -m "chore: bump version to 1.2.3"
   ```

4. **Create and push tag**
   ```bash
   git tag v1.2.3
   git push origin v1.2.3
   ```

5. **Update major version tag** (for auto-update users)
   ```bash
   git tag -fa v1 -m "Update v1 to v1.2.3"
   git push origin v1 --force
   ```

### Versioning Strategy

- **Semantic versions**: `v1.2.3` (pinnable, recommended for production)
- **Major version tags**: `v1` (auto-updates to latest v1.x, useful for testing)

Users choose update strategy:
```yaml
# Auto-update to latest v1.x
uses: rudderlabs/pr-reviewer@v1

# Pinned to specific version
uses: rudderlabs/pr-reviewer@v1.2.3
```

## Extending the Action

### Adding New AI Models

To support additional Anthropic models:

1. Update `action.yml` input description:
   ```yaml
   ai_model:
     description: 'AI model: claude-sonnet-4-5, claude-opus-4, claude-sonnet-3-5, etc.'
   ```

2. Update `types/common.ts` (if needed):
   ```typescript
   export interface ActionConfig {
     aiModel: string;  // Already flexible - any model name works
   }
   ```

3. Test with new model:
   ```yaml
   - uses: rudderlabs/pr-reviewer@v1
     with:
       ai_model: 'claude-opus-4'
   ```

### Adding New Configuration Options

1. **Add to `action.yml`**:
   ```yaml
   inputs:
     my_new_option:
       description: 'Description here'
       required: false
       default: 'default_value'
   ```

2. **Update `types/common.ts`**:
   ```typescript
   export interface ActionConfig {
     // ... existing fields
     myNewOption: string;
   }
   ```

3. **Load in `config-loader.ts`**:
   ```typescript
   function loadWorkflowInputs(): ActionConfig {
     return {
       // ... existing fields
       myNewOption: core.getInput('my_new_option') || 'default_value',
     };
   }
   ```

4. **Use in `ai-orchestrator.ts`** or other components

### Customizing AI Prompts

Edit `prompt-builder.ts`:

```typescript
// System prompt (role definition)
export function buildSystemPrompt(): string {
  return `You are an expert at analyzing RudderStack JavaScript SDK v3 instrumentation.

# Your Expertise
- [Add new expertise area]

# RudderStack SDK v3 API Reference
[Update method signatures if SDK changes]

## Common Issues to Check For
[Add new issue categories or specific checks]
...`;
}

// User prompt (task execution)
export function buildUserPrompt(
  changedFiles: FileContent[],
  unchangedFiles: FileContent[],
  rsContext?: RudderStackContext
): string {
  let prompt = `# Analysis Task: Pull Request Instrumentation Review\n\n`;

  // Add RudderStack context if available
  if (rsContext?.destinations && rsContext.destinations.length > 0) {
    prompt += `## RudderStack Context: Connected Destinations\n\n`;
    prompt += JSON.stringify(rsContext.destinations, null, 2);
  }

  // Add files...
  // Add analysis checklist with new requirements
  prompt += `## X. New Analysis Step\n`;
  prompt += `Description of what to check...\n`;

  return prompt;
}
```

**Key considerations when modifying prompts:**
- System prompt sets the AI's expertise and guidelines (stable)
- User prompt provides task-specific context (dynamic per PR)
- Include concrete examples in JSON output structure
- Use conditional sections based on available context
- Keep instructions clear and actionable
- Test changes with real PR scenarios

### Changing Comment Format

Edit `comments.ts`:

```typescript
// Global summary comment
function buildGlobalSummary(result: AIAnalysisResult): string {
  let comment = `## 🔍 RudderStack Instrumentation Review\n\n`;

  // Add new sections
  comment += `### 🆕 New Section\n`;
  comment += `Content here...\n\n`;

  return comment;
}
```

### Adding Support for Other Languages

While current implementation focuses on JavaScript, the architecture can be extended:

1. **Create language-specific subdirectory**:
   ```
   src/integrations/anthropic/
   ├── languages/
   │   ├── javascript.ts  (current logic)
   │   ├── swift.ts       (new)
   │   └── kotlin.ts      (new)
   ```

2. **Implement language-specific prompt builder**:
   ```typescript
   export function buildSwiftAnalysisPrompt(...): string {
     // Swift-specific analysis requirements
   }
   ```

3. **Update orchestrator** to detect language and route appropriately

### Modifying Chunking Strategy

Edit `chunker.ts`:

```typescript
export function createChunks(...): AnalysisChunk[] {
  // Current strategy:
  // 1. Try all files
  // 2. Fallback: changed vs unchanged
  // 3. Fallback: file-based

  // Add new strategy (e.g., context-aware):
  if (totalTokens > maxTokens) {
    return createContextAwareChunks(changedFiles, unchangedFiles);
  }

  // ...existing logic
}
```

## Performance Characteristics

| Metric | Typical Value | Notes |
|--------|---------------|-------|
| **Cold start** | 10-15s | Action initialization |
| **File reading** | 1-3s | For 10-20 files |
| **AI analysis** | 30-90s | Depends on file count and complexity |
| **Comment posting** | 2-5s | GitHub API calls |
| **Total runtime** | 1-2 min | For typical PR (10-20 changed files) |

### Token Usage

- **Typical PR**: 10,000-30,000 tokens
- **Large PR**: 50,000-100,000 tokens (may chunk)
- **Cost per analysis**: $0.10-$0.50 (Claude Sonnet 4.5 pricing)

### GitHub API Rate Limits

- **Comments**: 100/hour per repository
- **Annotations**: 50 per check run
- **Artifacts**: 500MB storage, 90-day retention

## Contributing

### Code Style

- Use Prettier for formatting
- Follow ESLint rules
- Write clear, descriptive comments
- Use TypeScript strict mode

### Commit Messages

Follow conventional commits:
```
feat: add property-level analysis
fix: handle missing file gracefully
docs: update API examples
refactor: simplify chunking logic
chore: bump dependencies
```

### Pull Request Process

1. Create feature branch from `develop`
2. Implement changes
3. Run `npm run typecheck && npm run lint && npm run format`
4. Test manually with test apps
5. Open PR with clear description
6. Address review feedback
7. Squash and merge to `develop`

## FAQ

**Q: Why AI-first instead of static analysis?**
A: AI handles complex patterns (custom wrappers, abstractions, dynamic events) that would require massive rule sets with static analysis.

**Q: Can this run locally?**
A: Not currently - requires GitHub Actions environment for PR context and comments. Could add CLI mode in future.

**Q: What about other RudderStack SDKs?**
A: Architecture can be extended to support Swift/Kotlin/Python SDKs by updating prompts and file detection.

**Q: How much does it cost?**
A: Depends on PR size. Typical cost: $0.10-$0.50 per analysis with Claude Sonnet 4.5.

**Q: Why no automated tests?**
A: MVP focused on core functionality. Testing infrastructure is planned for future phases.

## Troubleshooting

### Common Issues

**Issue**: Action fails with "Invalid API key"
- **Solution**: Verify `ANTHROPIC_API_KEY` is set in repository secrets

**Issue**: AI analysis times out
- **Solution**: Reduce `max_tokens_per_request` to force more aggressive chunking

**Issue**: Annotations not appearing on changed lines
- **Solution**: GitHub API limitation - annotations only work on lines changed in PR diff

**Issue**: Global summary comment not updating
- **Solution**: Check action permissions - needs `pull-requests: write` permission

### Debug Mode

Enable verbose logging:
```yaml
- uses: rudderlabs/pr-reviewer@v1
  env:
    ACTIONS_STEP_DEBUG: true
```

## References

- [High-Level Architecture](ARCHITECTURE.md)
- [Design Decisions](CLAUDE.md)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Anthropic API Documentation](https://docs.anthropic.com/)
- [RudderStack JS SDK](https://github.com/rudderlabs/rudder-sdk-js)
