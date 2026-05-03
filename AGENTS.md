# AGENTS.md — Master Collection App

## Scope

This folder is the Master Collection Webflow Designer Extension.

It is a child of:

```text
C:\Users\maria\Desktop\pessoal\FLOW_PARTY\MASTER-COLLECTION
```

The app is not the website. It installs purchased packages inside the buyer's current Webflow project.

## Start Here

1. Read `../AI.md`.
2. Read `../AGENTS.md`.
3. Read `../docs/ARCHITECTURE.md`.
4. Read `../docs/plans/001-master-collection-extension-mvp.md`.

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

