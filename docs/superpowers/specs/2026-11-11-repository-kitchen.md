# Repository kitchen

The user selected GitHub Actions and asked to start implementing all five capabilities: repository edits, deterministic checks, free clarification, exact result reuse and transparent spending.

## Approach
Use the existing private Worker, encrypted per-user keys and budgeted single-chef executor. A fine-grained GitHub token connects selected repositories without local software. GitHub Actions runs checks on a dedicated branch. A separate hosted sandbox was considered but adds infrastructure; the user chose GitHub Actions.

## Contract
- English pixel UI; no simulation; no new local software or dependencies.
- First release supports root-level npm React/Vite projects with package-lock.json. User selects up to 12 relevant text files. Models may edit only selected files; no workflow, credential, binary or dependency lock changes.
- Collect desired behavior and acceptance checks for free; show the exact brief before estimation. All model calls use the existing budget/lease/usage machinery, including up to two quoted repairs.
- Store repository identity, immutable base commit, source files and generation settings. Reuse only matching successful patches owned by the same user; no paid model call or copied charges.
- Install an explicitly reviewed, fixed Actions workflow through a setup PR. Build/test run on GitHub-hosted ephemeral runners with read-only GitHub permissions and no model keys. Never auto-run foreign workflows or accept arbitrary workflow IDs.
- Publish validated cumulative file changes to a dedicated branch. Read checks for the exact branch SHA and fixed workflow. Only accept a successful exact version while the base branch has not changed. GitHub branch protections remain authoritative.
- Preview only supported self-contained Vite builds. Display untrusted HTML in an iframe with scripts allowed but without same-origin, forms, popups, navigation or network access. No fake preview on failure.
- Distinguish build success from missing tests. Repair uses bounded check logs plus selected source files, within the same budget.
- Receipts show actual reported model usage, reused work, Actions runtime and unknown Actions monetary cost. Model baseline is an estimate using the same token counts, not a claim of equivalent quality or a provider invoice.

## Operational boundary
No user GitHub token or model key is currently configured for a live run. Implement and test with offline HTTP contracts and local UI; live repository execution requires the user to connect their token and approve the setup PR. Do not migrate the developer's Git credentials into the hosted product.
