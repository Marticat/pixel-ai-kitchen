# Repository Kitchen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship repository changes with GitHub Actions verification, free brief confirmation, exact reuse and honest costs.
**Architecture:** Pure repository contracts and a bounded GitHub REST adapter feed the existing Run executor. Per-user credentials stay in the existing encrypted store. A RepositoryPanel orchestrates estimate, generate, publish, checks, preview and accept.
**Tech Stack:** Existing React/TypeScript/Workers/D1, native fetch/crypto/zlib and GitHub Actions; no new dependencies.
**Spec:** ../specs/2026-11-11-repository-kitchen.md

## Global Constraints
English UI; private site; no simulation; no new local dependencies. Root npm React/Vite only. Up to 12 files, 80 KB source context, two repairs. Exact SHA checks, owner isolation and no auto-retry of uncertain paid operations.

## Review Focus
- Base or proposal moves during checks/accept: block rather than merge untested code.
- Secret paths, symlinks, oversized blobs and malformed model changes: reject before writes.
- Other user's cache or different model/requirements/source: never reuse.
- Missing tests, failed steps, stale workflows and untrusted artifacts: never describe as verified success.
- Concurrent requests or network loss: leases and expected-state writes prevent duplicate calls; uncertain operations reconcile before retry.

### Task 1: Repository contracts and Actions adapter
Files: lib/kitchen-repo.mjs, lib/kitchen-github.mjs, lib/kitchen-checks.mjs, tests/repository.test.mjs, tests/github.test.mjs.
Interfaces: validateFiles, parseChanges, reuseKey, repoPrompt, comparison; GitHub class snapshot/publish/checks/accept/setup; fixed workflow generator and bounded artifact extractor.
- [x] Write and run failing tests for paths, exact edits/reuse, workflow/SHA gates, archive limits and REST behavior.
- [x] Implement contracts and GitHub adapter with injectable fetch for offline tests.
- [x] Run node --test tests/repository.test.mjs tests/github.test.mjs; expected all pass.

### Task 2: Persistent authenticated orchestration
Files: lib/kitchen-repository-server.ts, lib/kitchen-server.ts, lib/kitchen-types.ts, lib/kitchen-workflow.mjs, app/api/kitchen/[...path]/route.ts.
Interfaces: repositoryApi(user, parts, method, body), Run.repo; reuses encrypted keys, database and generation engine.
- [x] Add regression tests for repository generation context and quoted repairs using existing engine fixtures.
- [x] Implement encrypted GitHub connection, snapshot/quote/reuse, lock-protected publish/check/accept and bounded artifact retrieval.
- [x] Run full npm test and npm run typecheck; expected no failures.

### Task 3: English UI, preview and receipts
Files: app/RepositoryPanel.tsx, app/GitHubConnection.tsx, app/Connections.tsx, app/Kitchen.tsx, app/Receipt.tsx, app/live.css, README.md.
Interfaces: panel callbacks openRun and run state; existing api/money/receipt functions.
- [x] Build complete user flow and explicit pending/unavailable states; no fake data.
- [x] Verify local Connections, repository navigation and missing connection message; validate the actual Vite preview bundling script offline.
- [x] Request independent review, fix material findings and pass full checks.
- [ ] Package production build, deploy exact source and push GitHub (performed by the Sites publication workflow after this source snapshot).

## Progress
Baseline: 45 tests passed. Implementation began on the task-specific feature branch while native worktree creation was pending, then moved to the managed worktree.

Implementation: 64 tests and typecheck pass. Native worktree became available; work continued there. Reviewer findings fixed: accepted-order repair guard, credential basenames, late preview response binding, lease recovery and same-commit publication retry. Other repository workflows require explicit review; preview isolation does not promise to prevent self-navigation. Browser verified new navigation, missing connection state and GitHub instructions. Live GitHub/model execution remains unverified without user connections.
