# Adaptive cutting parameters

## Status and decision

**Proposal only — no runtime behaviour changes are included in this document.**

gCAM should replace the beginner-facing collection of feed, plunge, spindle
speed, and pass-depth fields with a small, understandable choice set:

1. the configured CNC machine and spindle/router;
2. the cutter selected from the tool rack; and
3. the material being cut.

The application then creates a **recommended starting recipe** for that exact
machine, cutter, material, and operation. The recommendation must be
deterministic, explainable, conservative where data is incomplete, and saved
with the toolpath. It must not claim to find a universally “optimal” value:
real cutting conditions depend on workholding, tool stick-out, tool condition,
chip evacuation, stock quality, cooling, and the actual machine.

Experienced users retain an Advanced override. Beginner-facing screens should
not require them to understand feeds, speeds, chip load, or depth of cut.

## Product outcome

Today a configured tool slot contains a diameter plus a user-entered feed,
plunge, RPM, and pass depth. A new toolpath copies those figures into the
toolpath request. This makes a cutter misleadingly look like it has one correct
set of cutting values, even though the correct values change materially with
material, cutter engagement, machine stiffness, spindle, and operation.

The proposed workflow is:

```text
Machine profile + spindle setup       (configured once)
Tool rack cutter                       (selected for the toolpath)
Material                               (selected for the toolpath)
Operation and geometry                 (already selected for the toolpath)
                         ↓
Versioned cutting-parameter engine
                         ↓
Recommended cut depth, cut speed, plunge/entry, RPM, and stepover
                         ↓
Reviewable snapshot stored in the toolpath and emitted into G-code
```

The normal toolpath screen can therefore say:

> **Recommended for birch plywood**<br>
> 3 mm per pass · 1,800 mm/min cut speed · 18,000 RPM<br>
> Based on: LongMill MK2, 6.35 mm two-flute flat end mill, pocket cut.

The label is deliberately plain language. “Cut depth each pass” and “cut
speed” are more useful to a new user than “axial DOC” and “feed rate.” A
“Why these settings?” link can reveal the engineering reasoning, constraints,
and raw values.

## What the engine can calculate, and what must be curated

| Output | Main calculation | Curated evidence it needs |
| --- | --- | --- |
| Spindle RPM | Surface-speed target divided by cutter circumference, then clamped to spindle capability | Material/cutter surface-speed range; spindle min, max, and available speed steps |
| XY feed | `chip load × flute count × RPM` | Chip-load range by material, cutter material/type/diameter, and engagement |
| Plunge / entry feed | Conservative fraction of XY feed, limited by the Z axis and entry type | Material/tool entry factors and machine Z limit |
| Pass depth (DOC) | Diameter/cutting-length limit adjusted for material, engagement, machine envelope, and stock | Tested material/tool/machine axial-depth ranges |
| Stepover / WOC | Operation-specific radial engagement | Tested material/tool/machine radial-depth ranges |
| Safety warnings | Input compatibility and the most restrictive machine/tool/recipe limit | Tool/material compatibility, spindle range, operation limitations |

Formulae keep relationships internally consistent. They do **not** create
trustworthy cutting data from nothing. The chip-load, surface-speed, depth,
and engagement limits must live in reviewed, versioned recipe data with a
source and test history.

## Engineering basis

### Chip load determines XY feed

A spinning multi-flute cutter advances a small distance per cutting edge. That
distance is chip load:

```text
chip load (mm/tooth) = XY feed (mm/min) / (RPM × flute count)
XY feed (mm/min)     = chip load × RPM × flute count
```

For a given material and cutter, too little chip load can rub instead of cut,
creating heat and prematurely dulling the tool. Too much can overload or break
the cutter, deflect the machine, or produce a poor finish. Therefore the
engine chooses a target within a tested chip-load range and derives feed from
the actual RPM and flute count, rather than allowing unrelated numbers to be
entered independently.

The bundled Sienci catalogue already provides `flutes` for catalogue cutters;
the normalized `LibraryTool` model currently does not retain it. A custom tool
without a flute count is not ready for automatic recommendations. The UI must
ask for it, or remain in manual/advanced mode.

### Cutter diameter and surface speed determine a sensible RPM range

The cutting edge’s surface speed is:

```text
surface speed (m/min) = π × cutter diameter (mm) × RPM / 1,000
RPM                   = 1,000 × target surface speed / (π × diameter)
```

The material recipe supplies a target range, not a single magic number. The
engine selects an RPM within that range, then clamps it to the installed
spindle/router’s actual lower and upper limits. A trim router with a small set
of dial positions is modelled as discrete available RPM values, so the output
is an achievable setting rather than an imaginary 17,350 RPM.

If clamping RPM changes the result, the engine recalculates XY feed from the
chosen RPM to preserve the target chip load. It never silently preserves feed
and changes RPM, because that would change the cutting condition.

### Depth and stepover are a load problem, not a diameter rule

“Half the cutter diameter per pass” is sometimes a useful rule of thumb, but
it is not an algorithm. Cutting load depends on both:

```text
material removal rate = axial depth (DOC) × radial engagement (WOC) × XY feed
```

It also depends on cutter geometry, flute length, stick-out, flute count,
helix, material, chip evacuation, spindle power/torque, and machine deflection.
A full-width slot has radically different loading from a 15% radial-engagement
pocket pass at the same DOC.

The engine therefore starts with a tested material/tool/machine envelope and
applies the most restrictive limit:

```text
recommended DOC = min(
  recipe axial limit,
  cutter diameter × operation/material ratio,
  safe usable cutting length,
  machine-operation limit,
  remaining stock depth
)
```

`safe usable cutting length` must be below the cutter’s advertised cutting
length and account for the configured stick-out. The first release can use a
conservative default stick-out assumption and prompt the user only when a
proposed DOC is impossible; a later release may include it in machine/setup
configuration.

Likewise, the engine chooses WOC by operation:

| Operation | Engagement model | Recommendation behaviour |
| --- | --- | --- |
| Outside / inside profile | Near-slotting at entry and narrow cut thereafter | Use conservative profile/slot recipe, especially for through cuts |
| Pocket | Continuous clearing with chosen radial engagement | Choose a material/tool-specific stepover; reduce DOC for high WOC |
| Adaptive/trochoidal, if added | Low controlled engagement | A separate recipe family; do not reuse pocket values |
| Engrave / V-carve | Geometry determines engaged width/depth | Recommend feed/RPM only; the design controls visible depth |
| Texture fill | Aesthetic single-pass V-bit engraving | The user selects texture depth; engine sets a safe ceiling and feed/RPM |
| Surfacing | Wide cutter, low axial depth, broad WOC | Separate recipe family and warnings for spindle load |
| Laser operations | No rotating cutter | Entirely separate laser-material profiles; never use spindle formulas |

### Entry is different from cutting across the surface

Vertical plunging often traps chips and has a much smaller safe load than an
open lateral cut. The engine should prefer a ramp or helical entry where the
operation geometry permits it. Where a true plunge is required, it recommends
a conservative fraction of XY feed and clamps it to the configured Z-axis
limit. This must be represented as an entry strategy, not merely as a percentage
hidden behind a number field.

### Machine capability is not a single “rigidity multiplier”

An AltMill is not just a LongMill with the feed rate multiplied. The machine,
motion system, spindle/router, tooling, and operation determine the limiting
factor. Sienci describes AltMill testing as approximately eight times more
rigid than LongMill in the cited comparison, but that figure is not a safe
general-purpose multiplier for DOC or feed. The documented axis-speed limits
also differ by machine size and axis.

Each supported machine needs a measured, versioned operating envelope:

```ts
type MachineProfile = {
  id: string;
  displayName: string;
  revision: string;
  axes: {
    maxXYFeedMmMin: number;
    maxZFeedMmMin: number;
    maxXYAccelerationMmSec2?: number;
  };
  spindle: {
    kind: 'router' | 'vfd-spindle' | 'manual';
    minRpm: number;
    maxRpm: number;
    availableRpm?: number[];
    ratedPowerW?: number;
  };
  cuttingEnvelopeId: string;
};
```

The `cuttingEnvelopeId` resolves to empirically tested limits rather than an
opaque `rigidityFactor`. It allows an AltMill with a particular spindle to be
different from the same frame with another spindle, and allows LongMill models
or firmware configurations to be treated accurately.

## Required data model changes

### Preserve catalogue cutter data

The Sienci JSON catalogue already includes, where available:

- cutter material;
- flute count and flute type;
- cutting diameter and cutting length;
- total length and shank diameter;
- flute/helix angle, coating, tip shape; and
- a declared maximum material cutting hardness.

`src/lib/library.ts` should normalize and retain these facts in a typed
`ToolCuttingGeometry`. `src/tools/library.ts` should retain the catalogue ID
and a compact immutable geometry snapshot in the rack slot. The snapshot keeps
old projects reproducible if a vendor catalogue later changes.

Do not infer flute count, coating, cutter material, or usable flute length from
a product name. For manual cutters, make the minimum automatic-recipe fields
explicit: type, cutting diameter, flute count, cutter material, and cutting
length (if depth is to be calculated). If any are absent, show a clear
“automatic recommendation unavailable” state rather than guessing.

### Machine and spindle configuration

Machine setup belongs in a new, focused configuration feature, not in
`ConfigPanel.tsx` as another unrelated block of state. It should have:

1. supported presets: initially specific, tested LongMill and AltMill
   configurations;
2. a custom profile for machines outside that list;
3. a selected spindle/router, including actual RPM range and discrete speeds;
4. safe machine feed limits, imported from the verified profile or deliberately
   entered by advanced users; and
5. a visible profile revision/source date.

Machine selection is global user preference, while an optional project-level
override is useful when the same user prepares jobs for more than one CNC. The
toolpath records the profile actually used for its recommendation.

### Material recipes

Material is not a loose text field. Use a curated hierarchy:

```text
Wood
├── softwood
├── hardwood
├── plywood
└── MDF / sheet goods
Plastics
├── acrylic
├── HDPE
└── other machinable plastic
Metals
├── aluminium
├── brass
└── other non-ferrous metal
Other
├── foam
└── custom / unknown
```

Each recipe identifies the compatible cutter families and supplies ranges for
surface speed, chip load, axial/radial engagement, plunge/entry, and the
conditions that reduce confidence. “Plywood” is deliberately not treated as a
single universal material: glue, veneer, voids, and species can change the
result. The first UI may offer a conservative `Plywood / unknown sheet goods`
recipe and later expose more specific choices without changing the engine.

Recipe data needs provenance such as source document, source revision, test
fixture, tool, spindle, stock, and confidence. Values from an uncontrolled
forum post must not become default production recipes.

### Recommendation snapshot

Never regenerate an existing toolpath silently because a user changes their
global machine, a library catalog, or a recipe update. A toolpath persists:

```ts
type CuttingRecommendation = {
  engineVersion: string;
  source: 'automatic' | 'advanced-manual';
  machineProfile: { id: string; revision: string };
  materialRecipe: { id: string; revision: string };
  tool: { libraryToolId?: string; geometryRevision: string };
  operation: string;
  values: {
    rpm: number;
    feedMmMin: number;
    plungeMmMin: number;
    passDepthMm: number;
    stepoverPercent?: number;
    entry: 'plunge' | 'ramp' | 'helical';
  };
  constraints: string[];
  confidence: 'high' | 'medium' | 'low' | 'manual';
};
```

Changing an input marks the recommendation stale and offers **Update
recommendation**. The user can compare old and new values before applying it.
Generated G-code therefore remains traceable to the machine, recipe, and
engine that produced it.

## Recommendation algorithm

The calculator should be a pure TypeScript domain module, for example
`src/cutting-parameters/`, with no React, canvas, worker, or G-code imports.
`toolpaths/` asks it for a recommendation; `cam/` receives the already-resolved
parameters and remains responsible only for generating paths and G-code.

The first implementation sequence is:

1. Validate that machine/spindle, cutter geometry, material, and operation are
   supported. Return structured blocking reasons instead of fabricated values.
2. Resolve a material/tool/operation recipe with an evidence revision and
   confidence level.
3. Choose target RPM from the surface-speed range and cutter diameter; snap to
   an available spindle speed and clamp to the spindle limits.
4. Select a target chip load within the recipe range, adjusted down for
   conservative mode, difficult engagement, insufficient cutter data, or low
   confidence.
5. Derive XY feed from chip load, RPM, and actual flute count. Clamp to machine
   XY capability. If the feed limit is hit, recompute and report the achieved
   chip load rather than hiding the compromise.
6. Select WOC and DOC from operation-specific recipe bounds. Limit them by
   cutter geometry, cutting length, stock depth, and the machine/cutter
   envelope. Re-check the material-removal-rate guard.
7. Choose a ramp/helical entry where legal. Otherwise select a plunge rate and
   clamp it to both recipe and Z-axis limits.
8. Round values to stable, human-friendly increments. Store exact units
   internally in mm and mm/min; display conversions at the UI boundary.
9. Return the values, constraints applied, source IDs, confidence, and a plain
   language explanation.

The engine must have a strict safety property: an unknown or more restrictive
input cannot result in a more aggressive automatic recipe. Any unsupported
combination either chooses a documented conservative fallback or requires an
advanced manual choice.

## User interface proposal

### Global setup

Add a dedicated **Machine & spindle** setup screen, accessible from
Configuration. It asks once:

- Which machine are you using? (e.g. a specific LongMill or AltMill preset.)
- Which spindle/router is installed?
- Are the listed safe axis limits correct for this machine configuration?

The default is a conservative preset, never an unlabelled generic machine.
Custom machine configuration belongs behind an advanced disclosure and shows
that it reduces recommendation confidence.

### Tool rack

The rack remains the home for tool identity: image, name, diameter, flutes,
cutter material, cutting length, and V angle. It no longer stores a permanent
feed, plunge, RPM, or pass depth as if these were intrinsic tool properties.
Existing rack data migrates as **legacy manual defaults** so no user loses a
working setup. It is never promoted to a trusted automatic recipe without the
required geometry and selected material/machine.

### Toolpath editor

For a rotary cutting operation, show in this order:

1. **Tool** — rack slot picker.
2. **Material** — material-family picker, with a conservative default if the
   project has none.
3. **Cutting recommendation** — one compact, visible summary with source,
   confidence, and “Why?” explanation.
4. Operation-specific controls — total cut depth, tabs, texture aesthetic
   depth, overlap, and so on.
5. **Advanced cutting controls** — collapsed by default. An explicit “Use
   manual settings” action gives access to numeric feed, plunge, spindle,
   DOC, WOC, and entry settings for that toolpath only. “Use recommendation”
   restores automatic control.

The basic UI shows a `Safer ←→ Faster` intent selector only if it maps to
bounded, named recipe variants. It must not be a hidden multiplier with no
limits. A clear note such as “Conservative: lower cutter load and better first
cut confidence” is more honest.

Laser raster, laser cut, halftone, and other non-rotary bitmap modes keep
their separate laser/material settings. Texture fill with a V-bit treats depth
as an intentional visual choice, subject to a safe warning/limit, rather than
silently calculating away the user’s design intent.

### Warnings and blocking states

Examples:

- “This tool has no flute count; automatic cut speed cannot be calculated.”
- “Acrylic needs a known spindle speed and compatible single-/two-flute cutter
  data to avoid melting. Choose a supported cutter or enter advanced values.”
- “Requested 8 mm pass is longer than the safe usable cutting length for this
  cutter. Maximum recommendation: 3 mm.”
- “This recipe is limited by the configured LongMill XY feed limit.”
- “This is a low-confidence custom machine/material combination. Make a test
  cut before running the job.”

Warnings must name the limiting factor and the action the user can take. They
must not merely colour a field red.

## Calibration and evidence policy

The initial recipe database should be deliberately small. It is better to
support a handful of common Sienci machine/spindle/tool/material combinations
well than to present a confident answer for every catalog cutter and material.

1. Convert the official LongMill feeds-and-speeds guide and its metric tables
   into source-linked candidate recipe cases. These are calibration references,
   not arbitrary constants copied into UI code.
2. Build controlled test matrices: machine/profile revision, spindle, cutter,
   material batch, operation, engagement, DOC/WOC, feed, RPM, tool wear,
   workholding, result, and failure observations.
3. Establish separate LongMill and AltMill envelopes from actual test cuts.
   Do not multiply LongMill figures by the published rigidity comparison.
4. Add a recipe only after its source and test conditions are recorded. Publish
   recipe revision notes with the application.
5. Make low-confidence and untested combinations conservative or manual-only.

Sienci’s own material guide explicitly describes feeds as depending on the
material, tool, router RPM, rigidity, and model geometry. That supports this
multi-input model, rather than a static number attached to an end mill.

## Quality and test plan

The calculation domain needs stronger tests than a form-default change.

### Unit and golden tests

- chip-load/feed and surface-speed/RPM formulae, including unit conversion;
- RPM snapping and recomputed feed for discrete router speeds;
- per-axis feed and spindle clamps;
- DOC never exceeding stock, safe cutting length, or recipe envelope;
- operation-specific WOC/DOC choices, including slot, pocket, V-carve,
  texture, surfacing, and non-rotary exclusions;
- manual tool missing-data failures; and
- golden test cases traceable to a particular recipe source and test revision.

### Property and regression tests

- Lowering a machine limit, reducing cutting length, or selecting a more
  conservative intent must never increase automatic load.
- Unknown inputs never produce a high-confidence aggressive result.
- Existing saved toolpaths reproduce the same G-code after a recipe or profile
  update unless the user explicitly updates their recommendation.
- Legacy tool racks and project files migrate without data loss.

### UI and integration tests

- The normal path can create a supported toolpath with machine + tool +
  material and no raw feed/speed knowledge.
- Advanced override is scoped to one toolpath and can be reset to automatic.
- Rejected combinations explain what is missing.
- Recommendation source, confidence, and stale state are visible.
- G-code receives the resolved snapshot values and existing CAM operation
  tests continue to verify the generated motion.

## Delivery plan

### Phase 0 — data audit and fixture

- Add typed tests around catalog normalization and preserve the existing cutter
  facts from `public/library/tools/sienci/tools.json`.
- Define source-backed data schemas and a small initial material/machine
  fixture set. No UI behaviour change.

### Phase 1 — pure calculator

- Create `src/cutting-parameters/` with models, recipe lookup, calculation,
  explanation builder, and focused tests.
- Add versioning and persistence migration for recommendation snapshots.
- Validate against selected official-reference golden cases and a controlled
  Sienci test matrix.

### Phase 2 — setup and review UI

- Add the dedicated machine/spindle setup feature and tool-rack geometry
  fields.
- Add material picker and recommendation card to rotary toolpaths while
  retaining the current numeric values as Advanced controls.
- Mark legacy settings as manual rather than changing existing jobs.

### Phase 3 — controlled rollout

- Enable automatic recommendations only for supported combinations.
- Run physical validation on documented LongMill and AltMill configurations.
- Promote more profiles/materials only with versioned evidence and regression
  cases.

## Architectural placement

The refactored structure should stay intact:

```text
src/cutting-parameters/      Pure recommendation domain: types, recipes,
                              calculator, constraints, explanations, tests.
src/tools/                   Cutter-rack UI and stored cutter identity/geometry.
src/toolpaths/               Material/recommendation UI and toolpath form state.
src/document/                Versioned project migration and recommendation snapshots.
src/components/              Presentation-only cards/controls where reusable.
src/cam/                     Existing path generation and G-code emission only;
                              it receives resolved values and does not decide feeds.
```

Do not place recipe tables or calculation logic in `ToolpathPanel.tsx`,
`ToolLibraryModal.tsx`, `ConfigPanel.tsx`, or CAM operation modules. That
would recreate the cross-domain coupling the current modularisation removed.

## Explicit non-goals for the first release

- claiming a physically optimal cut for every material and setup;
- automatic adaptation from sound, current, vibration, or spindle-load sensing;
- closed-loop machine control;
- guessing tool geometry from an image/name;
- applying router spindle recipes to laser operations; and
- automatically rewriting a saved job after a library/profile/recipe update.

## Sources used for initial calibration research

- [Sienci LongMill feeds and speeds guide](https://resources.sienci.com/view/lm-feeds-and-speeds/)
- [Sienci LongMill metric feeds and speeds tables](https://resources.sienci.com/wp-content/uploads/2022/10/FeedsSpeedsMetric.pdf)
- [Sienci LongMill EEPROM settings](https://resources.sienci.com/view/lm-eeprom-settings/)
- [Sienci AltMill specifications](https://sienci.com/altmill/)
- [Sienci AltMill rigidity comparison](https://sienci.com/2024/03/20/everything-you-need-to-know-about-the-altmill/)
- [Sienci LongMill MK3 rigidity testing](https://sienci.com/2026/03/30/rigidity-testing-on-the-longmill-mk3/)

These sources establish calibration starting points and machine context. They
do not replace controlled validation for a specific machine, spindle, cutter,
material batch, workholding arrangement, or operation.
