<div align="center">
  <img src="icon.png" alt="RudderStack" width="128" height="128">
  <h1>RudderStack PR Reviewer</h1>
  <p>Automatically review and validate RudderStack SDK instrumentation changes in your pull requests. Get instant feedback on API correctness, tracking plan compliance, and downstream destination impacts.</p>
</div>

> **Status:** 🚧 In Development - Coming Soon!

## What It Does

This GitHub Action analyzes your pull requests whenever you modify RudderStack JavaScript SDK (v3) instrumentation code. It provides:

✅ **API Validation** - Ensures your SDK calls match the official RudderStack API
✅ **Event Detection** - Identifies all tracking events and their properties
✅ **Best Practices** - Validates naming conventions and SDK usage patterns
✅ **Property Analysis** - Detects property-level changes (added/removed/type changes)
✅ **AI-Powered Analysis** - Intelligent code analysis including custom abstractions and wrappers

## Why Use It?

- **Catch Errors Early** - Find instrumentation mistakes before they reach production
- **Ensure Consistency** - Automatically enforce your tracking standards
- **Save Time** - No more manual code reviews for tracking changes
- **Stay Confident** - Know exactly how changes impact your data pipeline

## Quick Start

### 1. Add to Your Workflow

Create `.github/workflows/rudderstack-review.yml`:

```yaml
name: RudderStack PR Review
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: rudderlabs/pr-reviewer@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### 2. Add Required Secret

Add this as a repository secret:

- **ANTHROPIC_API_KEY** - Get your API key from [Anthropic Console](https://console.anthropic.com/)

That's it! The action will run automatically on pull requests

## Configuration

### Basic Options

```yaml
- uses: rudderlabs/pr-reviewer@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    ai_model: 'claude-sonnet-4-5'          # Optional: AI model (default: claude-sonnet-4-5)
    max_tokens_per_request: '64000'        # Optional: Max tokens per request
```

### Advanced Configuration File

Create `.rudderstack-pr-reviewer.yml` in your repository root:

```yaml
file_patterns:
  include:
    - "src/**/*.{ts,tsx,js,jsx}"
    - "app/**/*.{ts,tsx,js,jsx}"
  exclude:
    - "**/*.test.ts"
    - "**/*.spec.ts"

output_format:
  verbosity: detailed

limits:
  max_files: 150              # Override default (100)
  max_file_size_mb: 3         # Override default (2MB)
```

## What You Get

### PR Comment with Analysis

The action posts a comment on your PR with:

- **📊 Summary** - Quick stats on errors, warnings, and suggestions
- **📁 Files Analyzed** - Which files were checked
- **❌ Errors** - Must-fix issues (always visible)
- **⚠️ Warnings** - Should-fix issues (collapsible)
- **💡 Suggestions** - Nice-to-have improvements (collapsible)
- **🎯 Destination Impacts** - How changes affect your destinations (collapsible)
- **🔄 Changes Detected** - Summary of tracking changes (collapsible)
- **🤖 AI Analysis** - Smart insights for complex patterns (collapsible)

### Inline Code Annotations

Issues are also annotated directly on the relevant lines in your PR with:
- Clear description of the problem
- Impact on downstream destinations (if applicable)
- Suggested fix with code example
- Confidence level

### Workflow Outputs

Use in subsequent steps:

```yaml
- uses: rudderlabs/pr-reviewer@v1
  id: review
  with:
    service_access_token: ${{ secrets.RUDDERSTACK_TOKEN }}

- name: Fail if errors found
  if: steps.review.outputs.error_count > 0
  run: exit 1
```

**Available outputs:**
- `analysis_status` - `success`, `partial`, or `failed`
- `error_count` - Number of errors found
- `warning_count` - Number of warnings found
- `suggestion_count` - Number of suggestions found

## Supported Frameworks

- ✅ React (Hooks, Class Components, Vite)
- ✅ Next.js (App Router, Pages Router)
- ✅ Angular (Services, Components)
- ✅ Vanilla JavaScript/TypeScript
- ✅ Gatsby (via React patterns)
- 🔄 Vue (Coming Soon - framework-agnostic detection will work)

## Privacy & Security

**Important Privacy Notice:**
- ✅ All analysis runs in your GitHub Actions runner (your infrastructure)
- ⚠️ **Source code is sent to Anthropic AI** for intelligent analysis via their API
- ✅ Tracking plan and destination data fetched from RudderStack (encrypted in transit)
- ✅ Authenticated via your RudderStack service token
- ⚠️ Review [Anthropic's Privacy Policy](https://www.anthropic.com/legal/privacy) before use

**What gets sent where:**
- **To Anthropic:** Changed file contents from your PR (for AI analysis)
- **Stays private:** Everything runs in your GitHub Actions runner, no data stored by this action

## Troubleshooting

**Action not running?**
- Ensure you're using `pull_request` trigger
- Check that `ANTHROPIC_API_KEY` secret is set

**Files not being analyzed?**
- Verify SDK is actually present in changed files
- Check that files are JavaScript/TypeScript (.js, .jsx, .ts, .tsx)

## Support

- 📖 [Full Documentation](DEVELOPMENT.md)
- 🐛 [Report Issues](https://github.com/rudderlabs/pr-reviewer/issues)
- 💬 Contact RudderStack Support

## License

Proprietary - RudderStack, Inc.