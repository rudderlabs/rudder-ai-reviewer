<div align="center">
  <img src="icon.png" alt="RudderStack" width="128" height="128">
  <h1>RudderStack PR Reviewer</h1>
  <p>Automatically review and validate RudderStack SDK instrumentation changes in your pull requests. Get instant feedback on API correctness, tracking plan compliance, and downstream destination impacts.</p>
</div>

> **Status:** 🚧 In Development - Coming Soon!

## What It Does

This GitHub Action analyzes your pull requests whenever you modify RudderStack JavaScript SDK (v3) instrumentation code. It provides:

✅ **API Validation** - Ensures your SDK calls match the official RudderStack API
✅ **Tracking Plan Compliance** - Validates events and properties against your defined tracking plan
✅ **Destination Impact Analysis** - Shows how your changes affect connected destinations
✅ **Data Type Checking** - Catches property type changes that might break integrations
✅ **AI-Powered Insights** - Get intelligent suggestions for complex tracking scenarios

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
          service_access_token: ${{ secrets.RUDDERSTACK_TOKEN }}
```

### 2. Add Your RudderStack Token

1. Get your service access token from RudderStack dashboard
2. Add it as a repository secret named `RUDDERSTACK_TOKEN`
3. That's it! The action will run automatically on pull requests

## Configuration

### Basic Options

```yaml
- uses: rudderlabs/pr-reviewer@v1
  with:
    service_access_token: ${{ secrets.RUDDERSTACK_TOKEN }}
    source_id: 'my-source-id'              # Optional: for multi-source workspaces
    file_patterns: 'src/**/*.{ts,tsx}'      # Optional: custom file patterns
    exclude_patterns: '**/*.test.ts'        # Optional: exclude patterns
    output_verbosity: 'detailed'            # Optional: minimal | standard | detailed
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

Your code stays private:
- ✅ All analysis runs in your GitHub Actions runner
- ✅ No source code sent to external services
- ✅ AI analysis uses only AST metadata (no actual code)
- ✅ Authenticated via your RudderStack service token

## Troubleshooting

**Action not running?**
- Ensure you're using `pull_request` trigger
- Check that `RUDDERSTACK_TOKEN` secret is set

**No tracking plan validation?**
- Verify your `service_access_token` is valid
- Ensure you have a tracking plan defined in RudderStack

**Files not being analyzed?**
- Check your `file_patterns` configuration
- Verify SDK is actually present in changed files

## Support

- 📖 [Full Documentation](DEVELOPMENT.md)
- 🐛 [Report Issues](https://github.com/rudderlabs/pr-reviewer/issues)
- 💬 Contact RudderStack Support

## License

Proprietary - RudderStack, Inc.