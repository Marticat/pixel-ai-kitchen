# Pixel AI Kitchen

A pixel-art workspace where AI chefs plan projects, handle individual tasks and track the cost of their work. Built to help creators control API spending when coding with OpenAI and Anthropic models.

## Features

- **Estimate before launch:** preview a USD cost range and set a total order budget.
- **Budget-aware execution:** count input tokens, reserve each call, and stop when funds are insufficient or costs are unknown.
- **Flexible team size:** let the head chef assemble a team or use one chef without a planning call.
- **Targeted revisions:** revise one task while preserving other outputs, previous versions and their costs. A task allows up to two revisions.
- **Explicit model escalation:** review a result, see the proposed cost of a stronger model, and confirm before spending.
- **Focused context:** send task requirements, relevant dependencies and the previous version rather than the entire project history.
- **Itemized receipts:** inspect planning, creation, review, revision and escalation costs; export a CSV receipt or Markdown project.
- **Encrypted API keys:** keys remain on the server and are encrypted at rest. They are not stored in browser storage or source control.
- **Repository kitchen:** connect selected GitHub repositories, confirm a brief for free, select relevant files and generate concrete changes in a dedicated branch.
- **GitHub Actions checks:** build and run the project's test script before acceptance. Failed logs can be used for a quoted repair within the same budget and two-revision limit.
- **Exact reuse:** offer a saved result only when owner, repository commit, selected files, brief and generation settings match. Reuse makes no new model call.
- **Honest comparison:** show a labeled same-token pricing scenario beside actual model costs. GitHub runtime is separate; unknown Actions monetary costs are never displayed as zero.

The interface, system prompts, status messages and exports are in English. Task deliverables can use another language when explicitly requested.

## Current scope

Idea kitchen generates text and code and provides static reviews. Repository kitchen executes build/test commands through the repository owner's GitHub Actions account. Provider-reported usage is used for model cost calculations. An estimate is a scenario range, not a guaranteed invoice.

Repository support is limited to root-level React/Vite npm projects with `index.html`, `package-lock.json` and a build script. Select 1–12 existing text files (80 KB total). New/deleted files, binary assets, package manifest changes and dependency changes are not supported. A missing test script is explicitly reported as not run; build success alone does not verify behavior.

### Connect a repository

1. In **Connections**, save a fine-grained GitHub token restricted to selected repositories. The first release needs Contents, Actions, Pull requests and Workflows read/write permissions for setup and operation. Tokens are encrypted in the same per-owner vault as model keys and are never sent to a model.
2. Open **Repository kitchen**, load repositories, select one and load files. Create the checks setup PR; review and merge it on GitHub, then reload files. The fixed workflow uses read-only job permissions, no persistent checkout credentials and no model keys.
3. Review any other repository workflows. Branch publication and acceptance may trigger existing automation with its own permissions, secrets and costs. Such repositories require explicit acknowledgement before estimation. Kitchen does not claim to disable that automation.
4. Select source files, describe the change, acceptance checks and constraints, and confirm the brief. Estimate, then generate or reuse a matching result.
5. Review before/after files. **Publish branch & run checks** creates a `kitchen/<order-id>` branch. Refresh checks, inspect logs and optionally run the frontend preview. **Accept changes** fast-forwards the unchanged base to the exact checked commit. Branch protections remain authoritative; protected repositories may require their normal GitHub review flow.

The preview bundles a supported Vite build into HTML and executes it in an iframe without same-origin permission. It cannot access kitchen credentials or storage. API requests and forms are blocked, but the frame can still navigate itself to external sites; do not enter secrets. External services, public-folder assets and some custom Vite configurations may not preview correctly. Missing/expired/oversized artifacts are reported rather than simulated.

GitHub checks have a ten-minute job limit and three-day artifact retention. Actions compute, artifact storage and other workflows are billed by GitHub separately from the model budget; this application does not know the account's included allowance or final bill. Completed job runtime is recorded when checks are refreshed. Reruns not observed by the kitchen may be absent from that runtime total. A repository operation interrupted by worker termination can be recovered after six minutes; model calls with unknown cost are never retried automatically.

The integration has offline REST-contract, source-validation, budget and real local Vite-bundling tests. Live paid generation and a full GitHub Actions run require the user's own connections and are not simulated.

The provider model catalog is fetched using your keys. Only model families with verified prices in `lib/kitchen-money.mjs` can be assigned. Pricing is a dated snapshot: new paid calls stop when that snapshot is more than seven days old. Verify and update rates before using an older checkout. Taxes, account top-ups and spending outside the order are excluded.

The current launch flow requires both OpenAI and Anthropic connections. API usage is billed by those providers. No generation calls are made while calculating the initial estimate.

## Stack

- React 19, TypeScript and Vinext/Vite
- Cloudflare Workers and D1
- OpenAI Responses API and Anthropic Messages API
- Node.js built-in test runner

## Local development

Requires Node.js **22.13.0 or later** and npm. The repository includes a lockfile.

```sh
npm ci
npm run dev
```

Open the loopback URL printed by the development server. On the portable development profile, `/signin-with-chatgpt?return_to=/` signs in using a local test identity. This development-only identity is not part of production authentication.

The application needs a D1 binding named `DB`. Apply `drizzle/0000_gray_young_avengers.sql` to the local D1 database used by the development server before creating orders. The database binding and local development setup are described in [Sites development](docs/SITES_DEVELOPMENT.md).

Configure a strong, private `KITCHEN_VAULT_KEY` in the server runtime to enable encrypted API-key storage. Add your provider keys through **Connections**. Optional server environment variables are `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`. Keep all secrets out of Git; local `.env*` and `.dev.vars*` files are ignored.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

Tests cover budget limits, cache-aware billing, unknown costs, single-chef work, revision history, reviews, escalation, stale dependencies, re-estimation and safe user-facing errors. They do not require API keys and do not call paid models.

## Project structure

| Path | Purpose |
| --- | --- |
| `app/` | Pixel kitchen UI, estimates, task controls, receipts and API routes |
| `lib/kitchen-core.mjs` | Planning and provider request/response handling |
| `lib/kitchen-workflow.mjs` | Context selection, targeted revisions and escalation |
| `lib/kitchen-engine.mjs` | Leased execution and per-call budget checks |
| `lib/kitchen-money.mjs` | Verified price snapshot, estimates and receipts |
| `lib/kitchen-server.ts` | Authentication, encrypted keys, D1 persistence and API orchestration |
| `tests/` | Offline behavior and regression tests |
| `drizzle/` | Database migration and schema metadata |
| `.openai/hosting.json` | Existing Sites project and storage bindings |

## Hosting

This checkout is associated with an existing private Sites project. The GitHub repository stores the source; pushing to GitHub alone does not redeploy the site. The supported Sites workflow builds and publishes the matching source commit separately.

If you deploy an independent copy, configure your own project identity, storage, secrets and trusted authentication layer. The application expects identity headers supplied by the hosting layer; do not expose it behind a proxy that accepts caller-supplied identity headers.

The original framework and hosting notes are preserved in [docs/SITES_DEVELOPMENT.md](docs/SITES_DEVELOPMENT.md). Third-party license notices remain in their original locations.
