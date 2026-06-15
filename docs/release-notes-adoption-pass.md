# Adoption Pass Release Notes Draft

## Summary

This release improves package adoption without changing visualization semantics.
It adds explicit core and React subpath exports, makes the root export core-only,
documents the import paths, and adds package smoke checks that validate the
published shape.

## Changes

- Kept `@moritzbrantner/viz-engine/core` as an explicit core alias.
- Added `@moritzbrantner/viz-engine/react` for React provider and hooks.
- Made `@moritzbrantner/viz-engine` core-only.
- Marked React as an optional peer dependency.
- Added adoption docs for getting started, frame formats, backend selection,
  React usage, worker handoff, typed-frame migration, focused examples, and
  project positioning.
- Added focused source examples for Canvas, React, worker handoff, geo viewport
  rendering, and finance candles/returns.
- Added package smoke validation for generated subpath artifacts, package
  contents, core-without-React, React imports, and core-only root exports.
- Added optional packed-package consumer smoke via
  `VIZ_ENGINE_PACKAGE_SMOKE_CONSUMER=1 bun run package:smoke`.
- Added bundle-size reporting with `bun run bundle:size`.
- Added CI package validation, performance validation, and publish validation
  workflows.

## Migration Notes

New code should prefer the root import for synchronous core APIs:

```ts
import { createVizEngine } from "@moritzbrantner/viz-engine";
```

```tsx
import { VizEngineProvider, useVizFrame } from "@moritzbrantner/viz-engine/react";
```

Root imports expose core APIs only:

```ts
import { createVizEngine } from "@moritzbrantner/viz-engine";
```

`outputMode: "compact"`, `compact*` frame aliases, `VizCompact*` exported type
names, and public `getCompact*` index methods were removed. Use
`frameFormat: "typed"`, the corresponding `typed*` fields, `VizTyped*` types,
and public `getTyped*` index methods.

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
