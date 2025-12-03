<div align="center">
  <img src="icon.png" alt="RudderStack" width="128" height="128">
  <h1>RudderStack PR Reviewer</h1>
  <p>Automatically review and validate RudderStack SDK instrumentation changes in your pull requests. Get instant feedback on API correctness, best practices, and potential issues.</p>
</div>

> **Status:** ✅ Active Development

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
ai:
  model: 'claude-sonnet-4-5'        # AI model to use
  max_tokens_per_request: 64000     # Token limit per request

annotation_mode: 'errors_warnings'  # What to annotate: 'errors_only' or 'errors_warnings'
```

> **Note:** Workflow inputs override config file values for maximum flexibility.

## What You Get

### PR Comments with Analysis

The action uses a **three-comment strategy** for optimal review experience:

#### 1. Global Summary Comment (High-Level)
- **Status Badge** - 🔴 Action Required / 🟡 Review Recommended / 🟢 All Clear
- **Metrics Table** - Error/warning/suggestion counts with trend indicators (↗️ ↘️ →)
- **Events Summary** - List of events found (names only)
- **Error Categories** - Issues grouped by type
- **Quick Navigation** - Links to detailed sections

#### 2. PR Review Body (Detailed Analysis)
- **❌ Errors** - Full descriptions with file grouping, impacts, and fixes
- **⚠️ Warnings** - Complete warning details with recommendations
- **💡 Suggestions** - Improvement opportunities with code examples
- **📝 Events** - Detailed event listings with properties and locations
- **🔄 Changes Detected** - Delta since last analysis (for incremental reviews)

#### 3. Inline Code Annotations
- Posted directly on changed lines in your PR
- Errors and warnings only (configurable)
- Clear problem description with suggested fixes
- Confidence indicators (🎯 High / 🔍 Medium / 💭 Low)

### Workflow Outputs

Use in subsequent steps:

```yaml
- uses: rudderlabs/pr-reviewer@v1
  id: review
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}

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
- ⚠️ Review [Anthropic's Privacy Policy](https://www.anthropic.com/legal/privacy) before use

**What gets sent where:**
- **To Anthropic:** Changed file contents from your PR (for AI analysis)
- **Stays private:** Everything runs in your GitHub Actions runner, no data stored by this action

**Future Enhancement:** RudderStack API integration for tracking plan validation and destination analysis (optional, coming soon)

## Troubleshooting

**Action not running?**
- Ensure you're using `pull_request` trigger
- Check that `ANTHROPIC_API_KEY` secret is set

**Files not being analyzed?**
- Check that files are JavaScript/TypeScript (.js, .jsx, .ts, .tsx, .mjs, .cjs)
- Action analyzes all changed JS/TS files, not just those with RudderStack code

**AI analysis errors?**
- Verify your Anthropic API key is valid
- Check for rate limiting or quota issues
- Review action logs for detailed error messages

## Support

- 📖 [Full Documentation](DEVELOPMENT.md)
- 🐛 [Report Issues](https://github.com/rudderlabs/pr-reviewer/issues)
- 💬 Contact RudderStack Support

## License

Proprietary - RudderStack, Inc.