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

## MVP Boundary

First app MVP:

- Webflow Designer Extension only
- no Hybrid App/OAuth
- no CMS automation
- no custom-code installation
- install code or mock code
- package fetch/mock package
- site/page detection with Designer API
- font checklist
- asset upload inside Webflow
- XscpData patching
- clipboard paste

## UI

Use the same shadcn/Flow-Goodies neutral light/dark baseline documented in `../AGENTS.md`.

## Commands

No app runtime has been scaffolded yet.

Expected future commands:

```bash
npm run dev
npm run build
npm run test
npm run lint
```

