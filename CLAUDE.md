⚠️ STOP — Read these 3 rules before every action:
1. **Universal App.** This Webflow Designer Extension is universal — it must work for any Master Collection template. Never hardcode template-specific names, slugs, class patterns, or fallbacks. Stress tests like *Sra Colombia (CNB)* and *MNZ* are inputs to verify universality, not the targets. **If a fix only works for the stress test, it's wrong.** CMS is in scope for Lane B templates that carry CMS data.
2. This folder is only the Webflow Designer Extension. Shared docs and AI_OS live in the parent folder.
3. Do not add Hybrid/custom-code scope to the MVP unless Maria asks.

# Master Collection App — CLAUDE.md

Read:

- `../AI.md`
- `../AGENTS.md`
- `AGENTS.md`
- `../docs/plans/001-master-collection-extension-mvp.md`

The app installs packages inside Webflow. The site sells and serves access.

No local AI_OS belongs here.

## Architectural notes (updated 2026-05-04)

### patch.ts — patchAttrRecord
Creates `node.data.img = { id: assetId }` when the img binding is absent. This handles
the ~17 images that escape CDN relink in the converter and therefore never had their
`node.data.img` initialized by `applyCdnAssetRelinks`.

### App.tsx — canCopy (Lane B)
`canCopy = isSinglePageXscpData(patchedXscpData)` — nothing else.
Fonts are informational warnings displayed in FontStatusPanel. They do NOT gate copy.
`patchedXscpData` being null IS the correct hard blocker (it stays null if
`preparePackageForWebflow` threw — e.g. because a required asset failed to upload).

### App.tsx — setExtensionSize
`adapter.setExtensionSize?.({ width: 750, height: 700 })` called on mount via useEffect.

### preparePackageForWebflow.ts
`assertWebflowPasteSafe` must NOT be called here. It throws before `setFontChecking(false)`
runs, which freezes the font panel at "Checking fonts..." forever.
Call `assertWebflowPasteSafe` in the UI layer (`handleCopy`) only.

⚠️ FINAL CHECK — These rules are non-negotiable:
1. **Universal App.** No template-specific code. Sra Colombia (CNB) and MNZ are stress tests, not targets.
2. This folder is only the Webflow Designer Extension. Shared docs and AI_OS live in the parent folder.
3. Do not add Hybrid/custom-code scope to the MVP unless Maria asks.

