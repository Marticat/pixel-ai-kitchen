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

The interface, system prompts, status messages and exports are in English. Task deliverables can use another language when explicitly requested.

## Current scope

Chefs generate text and code. Reviews analyze their content; the app does **not** execute generated code or run generated tests. Provider-reported usage is used for cost calculations. An estimate is a scenario range, not a guaranteed invoice.

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
