# GitHub Actions and Trigger Design

## 1. Integration model

Recommended organization:

```text
application repo A ----\
application repo B -----+--> reusable workflow / action in review-orchestrator
application repo C ----/
```

Target repositories keep a thin caller workflow.

## 2. Automatic trigger

Example caller:

```yaml
name: AI Code Review

on:
  pull_request_target:
    types:
      - opened
      - synchronize
      - reopened
      - ready_for_review

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  review:
    uses: your-org/code-review-orchestrator/.github/workflows/review.yml@v1
    with:
      pr_number: ${{ github.event.pull_request.number }}
      full_review: false
    secrets: inherit
```

For production, pin trusted reusable workflows/actions appropriately.

## 3. Manual PR comment

```yaml
on:
  issue_comment:
    types: [created]
```

Recognize only comments on PRs.

Commands:

```text
/review
/review full
/review impact
```

Suggested semantics:

- `/review` — adaptive run;
- `/review full` — ignore checkpoint and review full PR range;
- `/review impact` — run impact analysis and summary even if deep review is disabled.

Do not support arbitrary shell-like command arguments.

## 4. workflow_dispatch

Inputs:

```yaml
on:
  workflow_dispatch:
    inputs:
      pr_number:
        description: Pull request number
        required: true
        type: number

      full_review:
        description: Force full PR review
        required: false
        type: boolean
        default: false
```

Use primarily for:
- debugging;
- operations;
- replay.

## 5. Central repo contents

Expose both:

```text
action.yml
.github/workflows/review.yml
```

Use:
- reusable workflow when a repository wants the whole standard pipeline;
- composite/custom action when a repository wants to embed the reviewer as one step of a larger job.

## 6. Event normalization

Never allow downstream logic to care whether the run came from:
- PR event;
- issue comment;
- workflow dispatch.

Normalize first:

```ts
interface ReviewTrigger {
  source: "PR_EVENT" | "COMMENT" | "MANUAL";
  prNumber: number;
  forceFullReview: boolean;
  requestedMode: "ADAPTIVE" | "FULL" | "IMPACT_ONLY";
  actor: string;
}
```

## 7. Checkpoint behavior

Suggested persistent checkpoint fields:

```text
pr number
base sha
merge base sha
reviewed head sha
pipeline config fingerprint
engine versions
review completed flag
```

Only use a checkpoint if:
- same PR;
- compatible base/merge-base;
- previous head is ancestor of current head;
- relevant pipeline config has not changed;
- previous run completed according to policy.

Otherwise fallback to full review.

## 8. Sticky summary

Maintain one summary comment per PR.

Suggested sections:

```markdown
## AI Review Summary

Reviewed: `<base>..<head>`

### Scope
- Changed files: 8
- Impact candidates: 24
- Deep reviewed: 11

### Findings
- High: 1
- Medium: 3
- Impact candidates: 2

### Review mode
Adaptive / full / incremental

### Degraded stages
None
```

Avoid dumping every internal low-confidence signal.

## 9. Inline comments

Inline comment only when:
- location can be attached to the current PR diff;
- finding is sufficiently confident;
- no equivalent comment already exists.

Untouched impacted files generally belong in summary unless GitHub's review API can validly attach the location.

## 10. Concurrency

Use a PR-specific concurrency key:

```yaml
concurrency:
  group: ai-review-${{ github.repository }}-${{ inputs.pr_number }}
  cancel-in-progress: true
```

When a new push arrives:
- cancel obsolete run;
- review newest head.

## 11. Minimal permissions

Start from:

```yaml
permissions:
  contents: read
  pull-requests: write
  issues: write
```

Add permissions only when needed.

## 12. Future GitHub App

When adoption expands, migrate publication/authentication to a GitHub App.

Keep application ports stable so only entrypoint/auth adapters change.
