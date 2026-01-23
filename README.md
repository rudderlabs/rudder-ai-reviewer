# Rudder AI Reviewer

A GitHub Action to automatically review pull requests for RudderStack SDK instrumentation changes.

## Usage

```yaml
name: PR Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Review PR
        uses: rudderlabs/pr-reviewer@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          source-id: ${{ secrets.RUDDERSTACK_SOURCE_ID }}
          service-access-token: ${{ secrets.RUDDERSTACK_SERVICE_ACCESS_TOKEN }}
          root-directory: '.'
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | GitHub token for API access | Yes | - |
| `source-id` | ID of the RudderStack source | Yes | - |
| `service-access-token` | Service access token for the RudderStack workspace | Yes | - |
| `root-directory` | Root directory of the project | No | `.` |

## Outputs

| Output | Description |
|--------|-------------|
| `status` | Status of the review (success, failed, warning) |
| `message` | Summary message from the review |

## License

Elastic-2.0