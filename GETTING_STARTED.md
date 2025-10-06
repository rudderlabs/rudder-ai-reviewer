# Getting Started with Development

Welcome! This guide will help you continue development of the RudderStack PR Reviewer action.

## Current Status

✅ **Completed:**
- Project architecture designed
- TypeScript project scaffolded
- Core type definitions created
- Base analyzer interface defined
- Configuration files set up
- Documentation structure in place

🚧 **Next Steps:**
- Implement core components
- Add tests
- Build MVP features

## Quick Orientation

### Key Files to Understand First

1. **[CLAUDE.md](CLAUDE.md)** - READ THIS FIRST!
   - Contains ALL design decisions from brainstorming session
   - Explains why choices were made
   - Reference for implementation questions

2. **[DEVELOPMENT.md](DEVELOPMENT.md)** - Technical reference
   - Architecture diagrams
   - Implementation details
   - Development workflows

3. **[src/types/common.ts](src/types/common.ts)** - Type definitions
   - Core data structures
   - Interfaces for all components

4. **[src/analyzers/base-analyzer.ts](src/analyzers/base-analyzer.ts)** - Analyzer interface
   - Contract for language analyzers
   - Extensibility pattern

## Implementation Roadmap

### Phase 1: Core Infrastructure (Weeks 1-2)

#### Week 1: File Scanning & Configuration
- [ ] Implement `core/config-loader.ts`
  - Parse action.yml inputs
  - Load .rudderstack-pr-reviewer.yml
  - Merge configs with precedence
- [ ] Implement `core/file-scanner.ts`
  - Glob pattern matching
  - Filter by include/exclude
  - Detect changed files from PR
- [ ] Implement `core/file-prioritizer.ts`
  - Hybrid scoring algorithm
  - Sort files by priority

**Tests:** Config loading, file scanning, prioritization logic

#### Week 2: GitHub Integration
- [ ] Implement `integrations/github/pr-client.ts`
  - Create/update PR comments
  - Post inline annotations
  - Handle rate limiting
- [ ] Implement `integrations/github/artifact-manager.ts`
  - Save analysis results
  - Load previous results
  - Handle artifact expiration

**Tests:** Mock GitHub API calls, artifact serialization

### Phase 2: JavaScript Analyzer (Weeks 3-5)

#### Week 3: Parsing & Detection
- [ ] Implement `analyzers/javascript/parsers/typescript-parser.ts`
  - Wrap TypeScript Compiler API
  - Extract AST and type info
  - Handle parse errors gracefully
- [ ] Implement `analyzers/javascript/parsers/babel-parser.ts`
  - Wrap Babel parser
  - Support modern JS syntax
  - Error handling
- [ ] Implement `analyzers/javascript/detectors/sdk-detector.ts`
  - Find RudderStack SDK calls
  - Detect NPM vs CDN
  - Extract call locations

**Tests:** Parse various code samples, detect SDK usage patterns

#### Week 4: Validation & Framework Detection
- [ ] Implement `analyzers/javascript/detectors/version-detector.ts`
  - Parse lock files (npm, yarn, pnpm)
  - Extract CDN version from URLs
- [ ] Implement `analyzers/javascript/detectors/framework-detector.ts`
  - React, Next.js, Vue, Angular, Vanilla JS
  - Package.json + file pattern heuristics
- [ ] Implement `analyzers/javascript/validators/api-validator.ts`
  - Validate method signatures
  - Check required parameters
  - Type checking for properties

**Tests:** Version detection, framework detection, API validation rules

#### Week 5: Change Detection
- [ ] Implement `analyzers/javascript/change-detector.ts`
  - Compare baseline vs current
  - Detect added/removed/modified events
  - Track property changes and types
- [ ] Implement `analyzers/javascript/index.ts`
  - Main analyzer orchestration
  - Implement BaseAnalyzer interface
  - Coordinate parsers, detectors, validators

**Tests:** Change detection scenarios, end-to-end analyzer flow

### Phase 3: External Integrations (Weeks 6-7)

#### Week 6: RudderStack API Integration
- [ ] Implement `integrations/rudderstack-api/client.ts`
  - Basic auth with service token
  - GET workspace config
  - GET tracking plans
- [ ] Implement `integrations/rudderstack-api/retry.ts`
  - Exponential backoff
  - Handle rate limits
  - Error categorization
- [ ] Add tracking plan validation to analyzer
  - Schema validation
  - Naming conventions
  - Business rules

**Tests:** Mock API responses, retry logic, tracking plan validation

#### Week 7: AI Proxy Integration
- [ ] Implement `integrations/ai-proxy/payload-builder.ts`
  - Extract AST metadata (NO source code!)
  - Build safe request payloads
  - Privacy validation
- [ ] Implement `integrations/ai-proxy/client.ts`
  - Batch requests
  - Handle throttling
  - Parse responses
- [ ] Add AI analysis to analyzer
  - Detect complex patterns
  - Request AI insights
  - Merge with static results

**Tests:** Payload privacy (ensure no leaks!), batch handling, throttling

### Phase 4: Reporting & Orchestration (Weeks 8-9)

#### Week 8: Report Generation
- [ ] Implement `reporters/comment-generator.ts`
  - Generate markdown sections
  - Collapsible UI
  - Skip empty sections
- [ ] Implement `reporters/annotation-generator.ts`
  - Format inline annotations
  - Include impact, fix, confidence
- [ ] Implement `reporters/formatter.ts`
  - Format issues consistently
  - Group by severity

**Tests:** Markdown generation, annotation formatting

#### Week 9: Core Orchestration
- [ ] Implement `core/orchestrator.ts`
  - Coordinate all components
  - Async workflow management
  - Progressive updates
  - Error handling
- [ ] Update `main.ts`
  - Wire up orchestrator
  - Set outputs
  - Handle errors

**Tests:** Integration tests with mocked components

### Phase 5: Polish & Testing (Week 10)

- [ ] Add comprehensive unit tests (target 80%+ coverage)
- [ ] Create example test repository
- [ ] Manual testing with real PRs
- [ ] Performance optimization
- [ ] Documentation updates
- [ ] Prepare for beta release

## Development Tips

### Testing Locally

Since this is a GitHub Action, you can't run it directly locally. Options:

1. **Unit tests** - Test individual components (preferred for development)
2. **Act** - Run GitHub Actions locally: https://github.com/nektos/act
3. **Test repo** - Create a test repository and install the action

### Debugging

Add debug logging:
```typescript
import * as core from '@actions/core';

core.debug('Detailed debug info');
core.info('Standard info');
core.warning('Warning message');
core.error('Error message');
```

Enable step debugging in workflows:
```yaml
- uses: rudderlabs/pr-reviewer@v1
  env:
    ACTIONS_STEP_DEBUG: true
```

### Common Pitfalls

1. **Never export source code** - Always validate privacy in AI payloads
2. **Handle large files gracefully** - Check limits before processing
3. **Parse errors are common** - Malformed code should not crash action
4. **Rate limits** - GitHub and RudderStack APIs have limits
5. **Async timing** - Comment may post before AI results ready (by design)

## Resources

### Documentation
- [README.md](README.md) - User-facing docs
- [DEVELOPMENT.md](DEVELOPMENT.md) - Technical details
- [CLAUDE.md](CLAUDE.md) - Design decisions

### External References
- [GitHub Actions Toolkit](https://github.com/actions/toolkit)
- [Octokit (GitHub API)](https://octokit.github.io/rest.js/)
- [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
- [Babel Parser](https://babeljs.io/docs/en/babel-parser)
- [RudderStack JS SDK Repo](https://github.com/rudderlabs/rudder-sdk-js)

### Example Codebases
Look at similar GitHub Actions for inspiration:
- [Danger JS](https://github.com/danger/danger-js) - PR automation
- [CodeQL Action](https://github.com/github/codeql-action) - Static analysis
- [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) - Performance analysis

## Getting Help

- Check [CLAUDE.md](CLAUDE.md) for design context
- Review [DEVELOPMENT.md](DEVELOPMENT.md) for implementation details
- Look at example repositories in RudderStack SDK
- Contact RudderStack team for questions

## First Task Recommendation

Start with **Phase 1, Week 1** - implement configuration loading and file scanning. This provides the foundation for everything else and is relatively straightforward.

```bash
# Create your first file
touch src/core/config-loader.ts

# Write basic implementation
# Add tests
# Get it working

# Then move to file-scanner.ts
```

Good luck! 🚀
