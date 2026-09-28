# gCAM architecture


## Boundaries

- `App.tsx` is the application controller: it wires typed domain hooks and
  passes a finished workspace model to `app/AppWorkspace.tsx`. It must not own
  drawing, import, persistence, geometry, or CAM implementation.
- `app/` contains application composition, lifecycle, preference, and modal
  boundaries.
- `document/` owns project state, history, import/export, bitmap placement,
  and persistence.
- `canvas/` owns the 2D scene, viewport interaction, camera, rulers, and
  canvas-only feedback painters.
- `draw/` owns shape/text construction; `interactions/` owns selection,
  transforms, trimming, guide, and arrange commands.
- `toolpaths/` owns CAM form/UI state. `tools/` owns the cutter library UI.
- `cam/` owns operation contracts, operation modules, toolpath generation,
  texture geometry, tabs, and G-code emission.
- `geometry/` owns reusable pure geometry primitives. `engine/` owns workers,
  rendering integrations, font loading, and low-level calculation adapters.
- `components/` holds reusable presentational controls only; they request
  commands and do not implement geometry or emit G-code.
- `engine/cam-worker-protocol.ts` is the single browser-worker contract.
  Requests and responses are discriminated and stale responses are ignored.

## Persistence

Portable `.gcam.json` exports use project envelope v2. Version 1 and legacy
CamCanvas envelopes remain importable. Bitmap source files are cached locally
in IndexedDB by asset ID; exports retain their data URL so they remain portable.

## Quality gate

Every pull request runs Jest, TypeScript, Biome lint/format checks, and the
production Vite build. Third-party CAM/vendor code is explicitly excluded from
authored-source formatting and lint checks.

## Navigation rule

Place new behavior in the narrowest domain above. A file may coordinate its
domain, but reusable calculation, painting, worker, and command behavior must
be extracted into a named sibling module before it becomes a second concern.
