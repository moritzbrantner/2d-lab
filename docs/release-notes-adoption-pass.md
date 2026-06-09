# Adoption Pass Release Notes Draft

## Summary

This release improves package adoption without changing visualization semantics.
It adds explicit core and React subpath exports, keeps the root export
backward-compatible, documents the new import paths, and adds package smoke
checks that validate the published shape.

## Changes

- Added `@moritzbrantner/viz-engine/core` for non-React engine APIs.
- Added `@moritzbrantner/viz-engine/react` for React provider and hooks.
- Kept `@moritzbrantner/viz-engine` backward-compatible.
- Marked React as an optional peer dependency.
- Added adoption docs for getting started, frame formats, backend selection,
  React usage, worker handoff, typed-frame migration, focused examples, and
  project positioning.
- Added focused source examples for Canvas, React, worker handoff, geo viewport
  rendering, and finance candles/returns.
- Added package smoke validation for generated subpath artifacts, package
  contents, core-without-React, React imports, and root compatibility.
- Added optional packed-package consumer smoke via
  `VIZ_ENGINE_PACKAGE_SMOKE_CONSUMER=1 bun run package:smoke`.
- Added bundle-size reporting with `bun run bundle:size`.
- Added CI package validation, performance validation, and publish validation
  workflows.

## Migration Notes

New code should prefer explicit imports:

```ts
import { createVizEngine } from "@moritzbrantner/viz-engine/core";
```

```tsx
import { VizEngineProvider, useVizFrame } from "@moritzbrantner/viz-engine/react";
```

Existing root imports continue to work:

```ts
import { createVizEngine, VizEngineProvider } from "@moritzbrantner/viz-engine";
```

No breaking runtime behavior is intended. The deprecated
`outputMode: "compact"` option and `compact*` aliases remain supported during
the pre-1.0 migration period.

## Verification

Run these before publishing or merging the release candidate:

```sh
bun install --frozen-lockfile
bun run check-types
bun run build
bun run package:smoke
VIZ_ENGINE_PACKAGE_SMOKE_CONSUMER=1 bun run package:smoke
bun run bundle:size
bun run test
bun run test:rust
bun run format:check
```

## Versioning

If this change is published, use a pre-1.0 minor feature release such as
`0.3.0`. Do not tag or publish until CI has passed.
