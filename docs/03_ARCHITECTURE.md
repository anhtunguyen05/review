# Architecture

## 1. Architectural style

Use a lightweight **Hexagonal / Ports-and-Adapters** structure.

Reason:
- GitHub is an external system.
- OCR is an external engine.
- Jev is an external engine.
- Git CLI/LSP/AST/search are infrastructure.
- Review policy should remain testable without any of them.

## 2. High-level components

```text
                    +----------------------+
                    | GitHub Trigger       |
                    | PR / comment / manual|
                    +----------+-----------+
                               |
                               v
                    +----------------------+
                    | PR Context Resolver  |
                    +----------+-----------+
                               |
                               v
                    +----------------------+
                    | Intent Discovery     |
                    +----------+-----------+
                               |
                               v
                    +----------------------+
                    | Impact Discovery     |
                    +----------+-----------+
                               |
                               v
                    +----------------------+
                    | Scope Planner        |
                    +-----+-----------+----+
                          |           |
                    +-----v---+   +---v----------+
                    | Screener|   | Deep Reviewer|
                    |  Jev    |   | OCR          |
                    +-----+---+   +---+----------+
                          |           |
                          +-----+-----+
                                v
                    +----------------------+
                    | Finding Normalizer   |
                    +----------+-----------+
                               |
                               v
                    +----------------------+
                    | Dedupe + Policy      |
                    +----------+-----------+
                               |
                               v
                    +----------------------+
                    | GitHub Publisher     |
                    +----------------------+
```

## 3. Layers

### Domain
Contains:
- value objects;
- review finding model;
- impact graph model;
- policies that require no I/O.

Must not import:
- `@actions/*`;
- Octokit;
- OCR SDK/CLI types;
- TypeSafe/Jev SDK;
- filesystem/process APIs.

### Application
Contains use cases:
- `ReviewPullRequest`;
- `DiscoverImpact`;
- `PlanReviewScope`;
- `EvaluateCandidates`;
- `PublishReview`.

Depends only on domain + ports.

### Infrastructure
Contains:
- Git adapter;
- GitHub adapter;
- OCR adapter;
- Jev adapter;
- AST/LSP/reference search;
- filesystem;
- artifact storage;
- telemetry.

### Entrypoints
Contains:
- CLI;
- GitHub Action;
- reusable workflow wrapper;
- future HTTP/GitHub App entrypoint.

## 4. Core ports

```ts
export interface PullRequestProvider {
  getContext(input: { owner: string; repo: string; prNumber: number }): Promise<PullRequestContext>;
}

export interface RepositoryAnalyzer {
  discover(input: ImpactDiscoveryInput): Promise<ImpactGraph>;
}

export interface ScreeningEngine {
  screen(input: ScreeningInput): Promise<ScreeningDecision[]>;
}

export interface DeepReviewEngine {
  review(input: DeepReviewInput): Promise<RawEngineFinding[]>;
}

export interface ReviewPublisher {
  publish(input: PublicationPlan): Promise<PublicationResult>;
}

export interface ReviewArtifactStore {
  save(runId: string, artifacts: ReviewRunArtifacts): Promise<void>;
}
```

## 5. Dependency rule

```text
entrypoints
    |
    v
application
    |
    v
domain

infrastructure ---> implements ports defined inward
```

No import from:
- domain -> infrastructure;
- application -> concrete OCR/Jev/GitHub classes.

## 6. Composition root

Only `src/main.ts` or `src/composition/*` knows concrete implementations.

Example:

```ts
const git = new GitCliAdapter();
const github = new GitHubApiAdapter(octokit);
const impact = new CompositeImpactAnalyzer([
  new ImportGraphAnalyzer(),
  new TextReferenceAnalyzer(),
  new TestRelationAnalyzer(),
]);

const screener = new JevScreeningAdapter(...);
const deepReviewer = new OcrCliAdapter(...);
const publisher = new GitHubReviewPublisher(...);

const useCase = new ReviewPullRequest({
  github,
  git,
  impact,
  screener,
  deepReviewer,
  publisher,
});
```

## 7. Review run lifecycle

Use explicit run states:

```text
CREATED
  -> CONTEXT_RESOLVED
  -> INTENT_RESOLVED
  -> IMPACT_DISCOVERED
  -> SCREENED
  -> DEEP_REVIEWED
  -> POLICY_APPLIED
  -> PUBLISHED
  -> COMPLETED
```

Failure states:

```text
FAILED_CONTEXT
FAILED_DISCOVERY
FAILED_SCREENING
FAILED_DEEP_REVIEW
FAILED_PUBLICATION
PARTIAL
```

Do not infer completion merely because the process exited `0`.

## 8. Engine isolation

The application should see:

```ts
ScreeningDecision[]
RawEngineFinding[]
```

not upstream-specific Jev/OCR object shapes.

This prevents future lock-in.

## 9. Future multi-repository support

Do not implement yet, but design identifiers as:

```ts
type RepositoryId = {
  host: "github";
  owner: string;
  name: string;
};
```

and references as:

```ts
type CodeLocation = {
  repository: RepositoryId;
  commitSha: string;
  path: string;
  startLine?: number;
  endLine?: number;
};
```

This makes cross-repo edges possible later without breaking contracts.
