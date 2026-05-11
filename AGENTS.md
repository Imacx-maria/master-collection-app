# AGENTS.md — Master Collection App

## ⚠️ Universal — non-negotiable

This Webflow Designer Extension is **universal** across all Master Collection templates. **Never** hardcode template-specific names, slugs, CSS class patterns, brand strings, or fallbacks tuned to one template. Stress tests like *Sra Colombia (CNB)* and *MNZ* are inputs to verify universality, not the targets. If a fix only works for the stress test, it's wrong. Lane B's CMS step, font checklist, asset upload, and patch logic must all be template-agnostic.

## Scope

This folder is the Master Collection Webflow Designer Extension.

It is a child of:

```text
C:\Users\maria\Desktop\pessoal\FLOW_PARTY\MASTER-COLLECTION
```

The app is not the website. It installs purchased packages inside the buyer's current Webflow project.

This child project shares the parent Master Collection AI brain:

```text
C:\Users\maria\Desktop\pessoal\FLOW_PARTY\MASTER-COLLECTION\AI_OS
```

Do not create a local `app/AI_OS/` folder.

## Start Here

1. Read `../AI.md`.
2. Read `../AGENTS.md`.
3. Read `../docs/ARCHITECTURE.md`.
4. Read `../docs/plans/001-master-collection-extension-mvp.md`.
5. Read `../AI_OS/EXECUTION_CONTRACT.md` before substantial, regression-prone, package/install, browser/paste, generated-output, audit/report, or autonomous work.

## Execution Contracts

For substantial app changes, package/install behavior, browser/paste evidence, audits/reports, generated outputs, or autonomous work, create or resume exactly one active ExecPlan under:

```text
..\AI_OS\EXEC_PLANS\active\
```

Close that ExecPlan with validation evidence before claiming completion.

## Documentation

Do not duplicate parent docs here.

If a doc is about shared product architecture, package flow, auth/payment/account, or site/app boundary, write it under:

```text
..\docs
```

Only create local docs here for app-specific implementation details after the app is scaffolded.

## Current Scope

The app runtime is live. Current product truth lives in parent docs — do not duplicate it here. See:

- `../docs/ARCHITECTURE.md § Current Implementation Notes` — two-lane install model (Lane A custom-site, Lane B template).
- `../docs/knowledge/2026-05-03_lane-audit-findings.md § 1` — full lane definitions and the regression history.

## UI

Use the same shadcn/Flow-Goodies neutral light/dark baseline documented in `../AGENTS.md`.

## Commands

Run from this folder (`app/`):

```bash
npm install
npm run dev        # vite --host 0.0.0.0 --port 1337
npm run build      # tsc --noEmit (typecheck) + vite build
npm run test       # vitest run
npm run lint       # eslint src/**/*.{ts,tsx}
npm run bundle     # build + Webflow extension bundle
```

