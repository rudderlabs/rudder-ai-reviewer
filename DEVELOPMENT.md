# Development Guide - RudderStack PR Reviewer

This document contains technical details for developers working on the RudderStack PR Reviewer action.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Development Setup](#development-setup)
- [Implementation Details](#implementation-details)
- [Testing Strategy](#testing-strategy)
- [Build & Release](#build--release)
- [Design Decisions](#design-decisions)

## Architecture Overview

The PR Reviewer action uses a modular, feature-based architecture designed for extensibility across multiple SDK languages.

### High-Level Data Flow

```
PR Event Triggered
  ↓
1. Load Configuration (action inputs + config file)
  ↓
2. Retrieve Previous Artifact (for incremental analysis)
  ↓
3. Scan & Prioritize Files (detect RudderStack usage)
  ↓
4. Static Analysis (TypeScript + Babel AST parsing)
  ↓
5. Post Initial PR Comment (with static results)
  ↓
6. Async: Fetch Workspace Data (tracking plans + destinations)
  ↓
7. Async: AI Analysis (complex patterns, send metadata only)
  ↓
8. Update PR Comment (with workspace + AI results)
  ↓
9. Save Analysis Artifact (for next incremental run)
```

### Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      GitHub Action                           │
│                         (main.ts)                            │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┴────────────────────┐
        │      Core Orchestrator                 │
        │  - Config loading                      │
        │  - Workflow coordination               │
        │  - Error handling                      │
        └───────────────────┬────────────────────┘
                            │
        ┌───────────────────┴────────────────────┐
        │                                        │
┌───────▼─────────┐                  ┌──────────▼─────────┐
│   File Scanner  │                  │   Artifact Manager │
│  - Pattern match│                  │  - Load previous   │
│  - Prioritize   │                  │  - Save current    │
└────────┬────────┘                  └────────────────────┘
         │
         │
┌────────▼──────────────────────────────────────────────────┐
│              Language Analyzers (Pluggable)               │
│  ┌──────────────────┐    ┌─────────────┐                 │
│  │ JavaScript       │    │   Swift     │  (Future)       │
│  │ Analyzer         │    │   Analyzer  │                 │
│  │                  │    │             │                 │
│  │ - TS Parser      │    │             │                 │
│  │ - Babel Parser   │    │             │                 │
│  │ - SDK Detector   │    │             │                 │
│  │ - Framework Det. │    │             │                 │
│  │ - API Validator  │    │             │                 │
│  │ - Change Detect  │    │             │                 │
│  └──────────────────┘    └─────────────┘                 │
└───────────────────────────────────────────────────────────┘
         │                        │                  │
┌────────▼────────┐  ┌────────────▼──────┐  ┌──────▼──────────┐
│ RudderStack API │  │   AI Proxy        │  │ GitHub API      │
│                 │  │                   │  │                 │
│ - Workspace     │  │ - Batch requests  │  │ - PR comments   │
│ - Tracking Plan │  │ - Rate limiting   │  │ - Annotations   │
│ - Destinations  │  │ - Privacy layer   │  │ - Checks        │
└─────────────────┘  └───────────────────┘  └─────────────────┘
         │                        │                  │
         └────────────────────────┴──────────────────┘
                                  │
                       ┌──────────▼──────────┐
                       │   Report Generator  │
                       │                     │
                       │  - Comment format   │
                       │  - Annotations      │
                       │  - Collapsible UI   │
                       └─────────────────────┘
```

## Project Structure

```
pr-reviewer/
├── src/
│   ├── analyzers/
│   │   ├── base-analyzer.ts          # Abstract base class for all analyzers
│   │   ├── javascript/
│   │   │   ├── index.ts               # Main JavaScript analyzer
│   │   │   ├── parsers/
│   │   │   │   ├── typescript-parser.ts  # TS Compiler API wrapper
│   │   │   │   └── babel-parser.ts       # Babel parser wrapper
│   │   │   ├── detectors/
│   │   │   │   ├── framework-detector.ts # React, Next, Vue, Angular, etc.
│   │   │   │   ├── sdk-detector.ts       # Detect SDK usage & version
│   │   │   │   └── version-detector.ts   # NPM vs CDN version
│   │   │   ├── validators/
│   │   │   │   ├── api-validator.ts      # Validate SDK API calls
│   │   │   │   └── type-validator.ts     # Type checking for params
│   │   │   └── change-detector.ts        # Diff analysis
│   │   ├── swift/                     # Future: iOS SDK analysis
│   │   └── kotlin/                    # Future: Android SDK analysis
│   │
│   ├── integrations/
│   │   ├── rudderstack-api/
│   │   │   ├── client.ts              # RudderStack API client
│   │   │   ├── types.ts               # API response types
│   │   │   └── retry.ts               # Retry logic with backoff
│   │   ├── ai-proxy/
│   │   │   ├── client.ts              # AI proxy client
│   │   │   ├── payload-builder.ts     # Build privacy-safe payloads
│   │   │   └── types.ts               # Request/response types
│   │   └── github/
│   │       ├── pr-client.ts           # PR comments & annotations
│   │       ├── artifact-manager.ts    # Artifact save/load
│   │       └── types.ts               # GitHub API types
│   │
│   ├── reporters/
│   │   ├── comment-generator.ts       # Generate PR comment markdown
│   │   ├── annotation-generator.ts    # Generate inline annotations
│   │   └── formatter.ts               # Format issues & insights
│   │
│   ├── core/
│   │   ├── orchestrator.ts            # Main workflow orchestration
│   │   ├── file-scanner.ts            # Find & filter files
│   │   ├── file-prioritizer.ts        # Score & prioritize files
│   │   └── config-loader.ts           # Load & merge configs
│   │
│   ├── types/
│   │   └── common.ts                  # Shared type definitions
│   │
│   ├── utils/
│   │   └── helpers.ts                 # Common utilities
│   │
│   └── main.ts                        # Entry point
│
├── dist/                              # Build output (generated)
├── .github/
│   └── workflows/
│       └── test.yml                   # CI workflow
├── action.yml                         # GitHub Action metadata
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.mjs
├── .prettierrc.json
├── .gitignore
├── README.md                          # User documentation
├── CLAUDE.md                          # Design decisions & context
└── DEVELOPMENT.md                     # This file
```

## Development Setup

### Prerequisites

- Node.js 24.x or later
- npm or yarn
- Git

### Initial Setup

```bash
# Clone repository
git clone https://github.com/rudderlabs/pr-reviewer.git
cd pr-reviewer

# Install dependencies
npm install

# Run type checking
npm run typecheck

# Run tests
npm test

# Build action
npm run build
```

### Development Workflow

```bash
# Watch mode for TypeScript compilation
npm run dev

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Format code
npm run format

# Build for production
npm run build
```

## Implementation Details

### Static Analysis Engine

#### TypeScript Parser

Uses `@typescript-eslint/typescript-estree` for TypeScript/TSX files:
- Full type information available
- Tracks variable declarations and flow
- Infers types from usage when explicit types missing

#### Babel Parser

Uses `@babel/parser` for JavaScript/JSX files:
- Faster than TS parser
- Handles modern syntax (ES2022+)
- Sufficient for API validation without types

#### Hybrid Strategy

```typescript
if (file.endsWith('.ts') || file.endsWith('.tsx')) {
  // Use TypeScript Compiler API
  ast = parseWithTypeScript(content);
  types = extractTypes(ast);
} else {
  // Use Babel
  ast = parseWithBabel(content);
}
```

### SDK Detection

#### NPM Detection
1. Check for `@rudderstack/analytics-js` in lock files
2. Parse version from:
   - `package-lock.json` → `packages.@rudderstack/analytics-js.version`
   - `yarn.lock` → `@rudderstack/analytics-js@version`
   - `pnpm-lock.yaml` → `@rudderstack/analytics-js: version`

#### CDN Detection
1. Search for script tags or dynamic imports with CDN URLs
2. Parse version from URL path: `cdn.rudderlabs.com/v{X}/rudder-analytics.min.js`
3. Support custom CDN hosts (path structure remains same)

### Framework Detection

Priority order:
1. Explicit config (`framework` input)
2. package.json detection
3. File pattern heuristics
4. Fallback to framework-agnostic

```typescript
// package.json checks
if (hasPackage('next')) return 'nextjs';
if (hasPackage('react')) return 'react';
if (hasPackage('vue')) return 'vue';
if (hasPackage('@angular/core')) return 'angular';

// File pattern checks
if (hasFiles('next.config.*')) return 'nextjs';
if (hasFiles('**/*.vue')) return 'vue';
```

### Change Detection

Compare baseline vs current:
- **Events**: Track all `rudderanalytics.track()` calls
- **Properties**: Extract property objects, compare keys & types
- **Identify calls**: Detect changes to user traits
- **Page calls**: Track page view instrumentation changes

### Tracking Plan Validation

1. Fetch tracking plan from RudderStack API
2. For each detected event:
   - Check event name exists in plan
   - Validate naming convention (snake_case, camelCase, etc.)
   - Verify required properties present
   - Check property types match
   - Validate against business rules (conditional requirements, allowed values)

### Destination Impact Analysis

1. Fetch workspace destinations
2. For each destination, get field mappings
3. For each detected change:
   - Find affected mappings
   - Assess impact type (breaking, warning, info)
   - Generate destination-specific message

### AI Analysis Privacy Layer

**Never send:**
- Source code snippets
- Variable names
- String literals
- Property keys or values
- Function names
- Comments

**Safe to send:**
```typescript
{
  analysis_type: "dynamic_event_inference",
  ast_structure: {
    node_type: "CallExpression",
    callee: "rudderanalytics.track",
    arguments: [
      { type: "TemplateLiteral", has_expressions: true },
      { type: "ObjectExpression", property_count: 3 }
    ]
  },
  context: {
    in_loop: true,
    conditional: false
  }
}
```

### File Prioritization Algorithm

```typescript
score = (rudderStackChangeWeight * changeCount) +
        (fileStatusWeight * statusScore) +
        (sizeWeight * (1 / fileSize)) +
        (typeWeight * typeScore)

// Weights
rudderStackChangeWeight = 10  // Highest priority
fileStatusWeight = 5          // Changed > New > Unchanged
sizeWeight = 2                // Prefer smaller files
typeWeight = 1                // .tsx > .ts > .jsx > .js
```

### Incremental Analysis

Store in artifact:
```typescript
{
  version: "1.0",
  timestamp: "2025-10-06T10:00:00Z",
  prNumber: 123,
  commitSha: "abc123",
  analysisResult: {
    // Previous full analysis
  }
}
```

Compare against current:
- Only analyze changed files
- Delta detection for event/property changes
- Merge results for comprehensive view

## Testing Strategy

### Unit Tests

Test individual components in isolation:
- Parsers (TypeScript, Babel)
- Detectors (SDK, framework, version)
- Validators (API, types)
- Change detection logic
- File prioritization
- Privacy layer (ensure no leaks)

```typescript
// Example
describe('sdk-detector', () => {
  it('should detect NPM installation from package-lock.json', () => {
    const result = detectSDK(mockFiles);
    expect(result.type).toBe('npm');
    expect(result.version).toBe('3.0.0');
  });
});
```

### Integration Tests (Future)

Test component interactions:
- Mock RudderStack API responses
- Mock AI proxy responses
- Test full analysis flow
- Verify comment generation

### E2E Tests (Future)

Test in real GitHub environment:
- Create test repository
- Open PRs with known changes
- Verify action behavior
- Check comment accuracy

## Build & Release

### Build Process

```bash
# Build TypeScript
tsc

# Package with ncc (bundles into single file)
ncc build src/main.ts -o dist

# Creates dist/index.js with all dependencies
```

### Release Process

1. Update version in package.json
2. Update CHANGELOG.md
3. Commit changes
4. Create git tag: `git tag v1.0.0`
5. Push tag: `git push origin v1.0.0`
6. GitHub Actions builds and publishes
7. Update major version tag: `git tag -fa v1 -m "Update v1"`

### Versioning Strategy

- **Semantic versions**: `v1.2.3` (pinnable)
- **Major version tags**: `v1` (auto-updates to latest v1.x)

Users can choose:
```yaml
uses: rudderlabs/pr-reviewer@v1       # Auto-update
uses: rudderlabs/pr-reviewer@v1.2.3   # Pinned
```

## Design Decisions

For complete design decisions and brainstorming notes, see [CLAUDE.md](CLAUDE.md).

### Key Architectural Choices

**1. Hybrid AST Parsing**
- TypeScript for .ts/.tsx (full type info)
- Babel for .js/.jsx (faster, lighter)
- Rationale: Best tool for each job, extensible design

**2. Feature-Based Structure**
- Easy to add language analyzers (Swift, Kotlin)
- Clear module boundaries
- Plugin-like architecture

**3. Static + AI Hybrid**
- Static analysis primary (fast, private)
- AI for complex cases only (metadata only)
- Progressive results (static first, AI follows)

**4. Privacy-First AI Integration**
- Never send source code
- AST metadata only
- RudderStack proxy for control

**5. Graceful Degradation**
- Continue on API failures
- Partial analysis when limits hit
- Always provide value

### Performance Limits

| Limit | Value | Rationale |
|-------|-------|-----------|
| Max files | 100 | Balance coverage vs performance |
| Max file size | 2MB | Avoid parsing huge generated files |
| Max lines/file | 10,000 | Reasonable code file size |
| Max total lines | 100,000 | ~100-200 average files |
| Static timeout | 5 min | Fast feedback loop |
| AI timeout | 10 min | Longer for external calls |
| Total timeout | 20 min | GH Actions default limit |
| Max AI requests | 30 | Cost control |

### Error Taxonomy

| Type | Symbol | Use Case |
|------|--------|----------|
| Error ❌ | Must fix | API violations, type errors, tracking plan violations |
| Warning ⚠️ | Should fix | Deprecated APIs, naming conventions, destination impacts |
| Suggestion 💡 | Nice to have | Best practices, optimizations, tips |

## Contributing

### Code Style

- Use Prettier for formatting (runs on save)
- Follow ESLint rules
- Write JSDoc comments for public APIs
- Use TypeScript strict mode

### Commit Messages

Follow conventional commits:
```
feat: add framework detection
fix: handle missing tracking plan gracefully
docs: update API examples
refactor: extract retry logic
test: add parser unit tests
```

### Pull Request Process

1. Create feature branch
2. Implement changes with tests
3. Run `npm run format && npm run lint && npm test`
4. Open PR with clear description
5. Address review feedback
6. Squash and merge

## FAQ

**Q: Why not use a general-purpose linter?**
A: Need SDK-specific validation (tracking plans, destinations, RudderStack API specifics).

**Q: Why GitHub Actions vs standalone CLI?**
A: Actions integrate natively with PR workflow, provide PR comments/annotations automatically.

**Q: Can this run locally?**
A: Not currently, but could add CLI mode in future.

**Q: What about other RudderStack SDKs?**
A: Architecture designed for extension. Swift/Kotlin analyzers can be added following same pattern.

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
- [Babel Parser](https://babeljs.io/docs/en/babel-parser)
- [RudderStack JS SDK](https://github.com/rudderlabs/rudder-sdk-js)
- [Design Decisions (CLAUDE.md)](CLAUDE.md)
