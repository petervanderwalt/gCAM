# gCAM

gCAM is a exploration of CAM workflows - to become a CAM app at some point

**Live app:** [petervanderwalt.github.io/gCAM](https://petervanderwalt.github.io/gCAM/)

## Development

Use Node 24, Node 22, or Node 20.19+.

```powershell
cd react
yarn
yarn dev
```

### Checks and tests

Run these commands from `react`:

| Tool | Purpose | Commands |
| --- | --- | --- |
| Biome | Linting and consistent code formatting | `yarn lint`, `yarn format:check` |
| Jest | Unit and component tests in adjacent `*.test.*` files | `yarn test --runInBand`, `yarn test:watch` |
| Cypress | Browser workflows using real UI interactions and imported fixtures | `yarn test:e2e`, `yarn cy:open` |
| TypeScript / Vite | Type checking and production build | `yarn check-types`, `yarn build` |

Use `yarn format` to apply formatting or `yarn lint:fix` to apply Biome's safe
lint fixes and formatting. Review the changes before committing. Rules and
exclusions live in `react/biome.json`; Jest configuration is in
`react/jest.config.cjs`.

Cypress starts an isolated server on port 5180 and stops it when the runner
exits. It covers image tracing and effects, STL/OBJ machining, vector operations,
drawing and snapping, editing, grouping/nesting, Config, and fresh tool-library
setup. Fixtures are included. Simulation is excluded. See the
[Cypress workflow guide](react/cypress/README.md) for details and individual-spec
commands.

GitHub Actions runs Jest, types, Biome and the build in
[Quality](.github/workflows/quality.yml), and Cypress in
[Browser tests](.github/workflows/browser-tests.yml), on pull requests and pushes
to `main`. Browser tests can also be started manually; failed runs upload
screenshots and any generated videos.

## Structure

`*.test.*` files are the tests for their adjacent feature. 

```text
gCAM/
├── .github/
│   └── workflows/
│       ├── quality.yml                 PR quality gate: test, types, lint, format, build
│       ├── browser-tests.yml           Cypress browser workflow tests
│       └── deploy-pages.yml            Builds and deploys the React app to GitHub Pages
├── .gitignore                          Ignores local/build files at repository level
├── README.md                           This repository map and development guide
└── react/                              The Vite + React application
    ├── .gitignore                      Ignores React build/cache/dependency output
    ├── babel.config.cjs                Babel configuration used by Jest
    ├── biome.json                      Formatting/lint rules and vendor exclusions
    ├── checkfile.js                    Small local file-check helper
    ├── index.html                      Vite HTML entry document
    ├── jest.config.cjs                 Jest test environment and transform setup
    ├── jest.setup.cjs                  Shared Jest DOM matchers/setup
    ├── package.json                    Scripts, runtime dependencies, and tool versions
    ├── yarn.lock                       Locked dependency graph
    ├── postcss.config.cjs              PostCSS/Tailwind processing configuration
    ├── tailwind.config.ts              Tailwind theme/content configuration
    ├── tsconfig.json                   Browser TypeScript compiler configuration
    ├── tsconfig.node.json              Node/Vite TypeScript compiler configuration
    ├── vite.config.ts                  Vite dev/build configuration and Pages base path
    ├── porting.md                      Historical porting/reference notes
    ├── assets/
    │   ├── logo.svg                    Source logo asset
    │   └── Toolpaths.svg               Source toolpath artwork asset
    ├── docs/
    │   ├── architecture.md             Boundary rules and architecture decisions
    │   └── adaptive-cutting-parameters.md Engineering proposal for simple, safe cutting recommendations
    ├── public/                         Files copied unchanged into the built site
    │   ├── assets/
    │   │   ├── fonts/                  Bundled text fonts and their OFL licence files
    │   │   └── operations/             PNG operation icons
    │   ├── library/
    │   │   └── tools/
    │   │       └── sienci/             Sienci tool catalogue JSON and product images
    │   ├── samples/
    │   │   └── Hockey Sticks Cut 1.dxf Sample DXF for import/testing
    │   └── vendor/
    │       └── cam-cpp/                Prebuilt CAM WebAssembly module and JavaScript loader
    └── src/                            Authored application source
        ├── main.tsx                    React bootstrap: mounts App into the Vite document
        ├── App.tsx                     Thin application controller and domain composition root
        ├── index.css                   Global styles, CSS variables, and Tailwind layers
        ├── vite-env.d.ts               Vite TypeScript declarations
        ├── engine.test.ts              End-to-end engine integration coverage
        ├── zzparse.test.tsx            Parsing/render regression coverage
        │
        ├── app/                        Application composition, lifecycle, and modal boundary
        │   ├── AppHeader.tsx           Header/menu presentation
        │   ├── AppModalLayer.tsx       Chooses application-level modal content
        │   ├── AppWorkspace.tsx        Places header, workspace, panels, and overlays
        │   ├── createToolbarProps.ts   Builds toolbar props from workspace state
        │   ├── createWorkspaceModel.ts Creates the typed model consumed by AppWorkspace
        │   ├── EditorWorkspace.tsx     Main editor layout and panel composition
        │   ├── ErrorBoundary.tsx       Recovers from a rendering exception
        │   ├── ModalLayer.tsx          Reusable modal shell/portal layer
        │   ├── useAppPreferences.ts    Persists UI preferences such as theme/units
        │   ├── useArrangeWorkspaceState.ts  Wires arrange commands into the workspace
        │   ├── useDocumentEditingCommands.ts Wires document edit commands into the workspace
        │   ├── useDrawingWorkspaceState.ts  Wires drawing commands and state into the workspace
        │   ├── useEditorLifecycle.ts   Coordinates startup, autosave, and cleanup
        │   ├── usePreviewState.ts      Owns G-code/cut-preview visibility and state
        │   └── useTransformWorkspaceState.ts Wires transform commands into the workspace
        │
        ├── document/                   Project state, files, import, history, and persistence
        │   ├── BitmapImportModal.tsx   Selects raster import mode: bitmap or trace
        │   ├── projectFile.ts          Versioned .gcam.json project serialization/migration
        │   ├── useBitmapCommands.ts    Bitmap placement, tracing, and asset commands
        │   ├── useDocumentPersistence.ts Handles local autosave and recovery
        │   ├── useDocumentState.ts     Canonical document/history React state
        │   ├── useDocumentWorkspace.ts Adapts document state for the editor workspace
        │   ├── useFileLoading.ts       Loads DXF/SVG/bitmap/project files
        │   ├── useNewCanvasCommand.ts  Creates/resets a new drawing document
        │   ├── useProjectFileCommands.ts Imports and exports project files
        │   └── useVectorImport.ts      Converts imported SVG/DXF into document geometry
        │
        ├── canvas/                     2D CAD scene, camera, painting, and pointer interactions
        │   ├── CanvasStage.tsx          Canvas host and scene lifecycle
        │   ├── CanvasStage.types.ts    CanvasStage public prop/type definitions
        │   ├── CanvasViewport.tsx      Scroll/zoom viewport and camera coordination
        │   ├── CanvasHud.tsx           Canvas-only heads-up UI
        │   ├── CanvasToolbar.tsx       Toolbar placement on the canvas
        │   ├── EmptyCanvasPrompt.tsx   Empty-document import/draw prompt
        │   ├── camera.ts                Coordinate conversion, zoom, pan, and fit helpers
        │   ├── primitives.ts            Canvas primitive drawing helpers
        │   ├── sceneRenderer.ts         Draws document geometry and toolpath previews
        │   ├── sceneRenderer.test.ts    Scene render regression coverage
        │   ├── selectionGeometry.ts     Selection bounds/handles geometry
        │   ├── selectionGeometry.test.ts Selection geometry coverage
        │   ├── stageViewState.ts        Derived viewport/view state
        │   ├── theme.ts                 Canvas colour/theme mapping
        │   ├── rulers.ts                Ruler tick/label calculation
        │   ├── pointerState.ts          Pointer gesture state machine
        │   ├── pointerState.test.ts     Pointer state coverage
        │   ├── tabInteraction.ts        Tab placement/removal interaction logic
        │   ├── tabInteraction.test.ts   Tab interaction coverage
        │   ├── transformInteraction.ts  Drag/resize/rotate interaction math
        │   ├── transformOverlay.ts      Renders transform handles and guides
        │   ├── paintInteractionOverlays.ts Paints transient selection/draw feedback
        │   ├── types.ts                 Shared canvas types
        │   ├── useCanvasViewportCommands.ts Exposes canvas viewport commands to React
        │   ├── pointer/                 Focused input-mode handlers
        │   │   ├── CanvasPointerController.tsx Routes pointer events to active handlers
        │   │   ├── draw.ts              Draw gesture handling
        │   │   ├── guides.ts            Guide drag/create handling
        │   │   ├── helpers.ts           Shared pointer coordinate/gesture helpers
        │   │   ├── keyboard.ts          Canvas keyboard shortcuts
        │   │   ├── selection.ts         Select/marquee handling
        │   │   ├── tabs.ts              Tab placement handling
        │   │   ├── transform.ts         Move/scale/rotate handling
        │   │   ├── trim.ts              Trim gesture handling
        │   │   └── types.ts             Pointer controller contracts
        │   └── toolbar/                 Canvas toolbar subcomponents
        │       ├── ToolbarCommands.tsx  Command buttons
        │       ├── ToolbarControls.tsx  Inline control widgets
        │       ├── ToolbarForms.tsx     Draw/transform input forms
        │       ├── ToolbarMenus.tsx     Toolbar menus
        │       ├── styles.ts            Shared toolbar class/style helpers
        │       └── types.ts             Toolbar contracts
        │
        ├── draw/                        New shape/text construction
        │   ├── geometry.ts              Creates rectangles, circles, polygons, and lines
        │   ├── geometry.test.ts         Shape geometry coverage
        │   ├── textGeometry.ts          Converts text into stroke/vector geometry
        │   ├── textGeometry.test.ts     Text geometry coverage
        │   ├── TextPlacementModal.tsx   Text entry and placement UI
        │   └── useDrawCommands.ts       React commands for all drawing tools
        │
        ├── interactions/                Selection, inspector, transform, trim, arrange commands
        │   ├── inspectorGeometry.ts     Inspector dimension/position calculations
        │   ├── inspectorGeometry.test.ts Inspector geometry coverage
        │   ├── useAppKeyboardShortcuts.ts Global editor key bindings
        │   ├── useArrangeCommands.ts    Align, distribute, order, and grouping commands
        │   ├── useCadInspector.ts       Inspector state and edit commands
        │   ├── useCornerCommands.ts     Corner rounding/chamfer commands
        │   ├── useGuideCommands.ts      Guide creation/edit commands
        │   ├── useInspectorCommands.ts  Object-property editing commands
        │   ├── useSelectionCommands.ts  Selection and deletion commands
        │   ├── useSelectionFrame.ts     Selection-frame state for the canvas
        │   ├── useTransformCommands.ts  Move/scale/rotate/flip commands
        │   ├── useTrimCommands.ts       Vector trimming commands
        │   └── useVisibleSelection.ts   Derived visible selection state
        │
        ├── toolpaths/                   Toolpath form state, operation picker, and output UI
        │   ├── ToolpathPanel.tsx        Main toolpath editor and preview coordinator
        │   ├── ToolpathRail.tsx         Existing-operation navigation rail
        │   ├── ToolpathOperationPicker.tsx Operation-type picker and icon grid
        │   ├── ToolpathEmptyState.tsx   No-operation guidance
        │   ├── ToolpathFormAlerts.tsx   Form validation/warnings
        │   ├── ToolpathSubmitControls.tsx Create/update/cancel controls
        │   ├── ToolSelectionFields.tsx  Tool picker and cutter details
        │   ├── ToolSlotSelector.tsx     Tool slot selection UI
        │   ├── CuttingFields.tsx        Common cutting depth/feed/plunge fields
        │   ├── RasterLaserFields.tsx    Laser-raster and halftone settings
        │   ├── VBitRasterFields.tsx     V-bit raster/heightmap settings
        │   ├── TextureFields.tsx        Voronoi/crosshatch texture settings
        │   ├── OutputWorkspace.tsx      G-code and 3D preview workspace
        │   ├── operationCatalog.ts      UI metadata for each toolpath operation
        │   ├── toolpathRequest.ts       Translates form data into CAM requests
        │   ├── toolpathRequest.test.ts  Toolpath request coverage
        │   ├── useToolpathPresentation.ts View/panel presentation state
        │   └── useToolpathStack.ts      Operation list, draft, create, and update state
        │
        ├── tools/                       Cutter library model and management UI
        │   ├── library.ts               Loads/normalises bundled and saved tool libraries
        │   ├── library.test.ts          Tool library coverage
        │   ├── toolCatalog.ts           Tool catalogue lookup/filter utilities
        │   ├── ToolCatalogSelect.tsx    Tool catalogue selection control
        │   ├── ToolLibraryModal.tsx     Add/edit/manage tool library modal
        │   └── ToolSlotRow.tsx          One selectable tool-slot row
        │
        ├── cam/                         CAM operation generation and G-code emission
        │   ├── cam-ops.js               CAM orchestration and public operation entry points
        │   ├── cam-ops.test.ts          CAM orchestration coverage
        │   ├── gcode-validation.js      Validates emitted G-code safety/structure
        │   ├── gcode-validation.test.js G-code validation coverage
        │   ├── tabs.js                  Adds/removes holding tabs from toolpaths
        │   ├── tabs.test.js             Tab geometry coverage
        │   ├── texture-fill.js          Voronoi/crosshatch texture path generation
        │   ├── texture-fill.test.js     Texture path regression coverage
        │   ├── texturePreview.js        Lightweight texture preview geometry
        │   ├── gcode/                   G-code program building blocks
        │   │   ├── contours.js          Contour-to-motion emission
        │   │   ├── format.js            Numeric/word formatting helpers
        │   │   └── program.js           Program headers, moves, and final assembly
        │   ├── geometry/
        │   │   └── polygons.js          CAM-specific polygon clipping/normalisation
        │   └── operations/              One module per supported operation type
        │       ├── contract.js          Shared operation input/output contract
        │       ├── registry.js          Operation dispatch registry
        │       ├── registry.test.js     Registry coverage
        │       ├── engrave.js           Centreline engraving paths
        │       ├── pocket.js            Interior clearing paths
        │       ├── profile.js           Inside/outside/contour cut paths
        │       ├── raster.js            Bitmap, laser, halftone, and V-bit raster paths
        │       ├── texture.js           Texture-fill operation paths
        │       └── vcarve.js            V-carve path generation
        │
        ├── geometry/                    Reusable, pure document geometry helpers
        │   ├── bounds.js                Bounds/intersection utilities
        │   ├── loops.js                 Closed-loop construction and traversal
        │   ├── matrix.js                2D matrix operations
        │   ├── primitives.js            Basic point/line/arc helpers
        │   ├── segments.js              Segment splitting/intersection helpers
        │   ├── splines.js               Spline evaluation/conversion helpers
        │   └── transforms.js            Geometry transform utilities
        │
        ├── engine/                      Workers, render integrations, parsing, and low-level adapters
        │   ├── constants.js             Engine-wide constants
        │   ├── paths.js                 Path conversion/normalisation helpers
        │   ├── svg.js                   SVG parsing/export helpers
        │   ├── dxf.js                   DXF parsing/import adapter
        │   ├── cad-font.js              CAD stroke-font loading adapter
        │   ├── google-font-catalog.js   Bundled font catalogue metadata
        │   ├── opentype.module.js       Vendored OpenType parser module
        │   ├── clipper_unminified.js    Vendored polygon clipping implementation
        │   ├── clipper-shim.js          Local compatibility wrapper for Clipper
        │   ├── vcarve.js                V-carve calculation adapter
        │   ├── vcarve-worker.js         Worker for V-carve calculation
        │   ├── cam-worker-protocol.ts   Typed request/response worker contract
        │   ├── cam-worker-client.ts     Main-thread CAM worker client
        │   ├── cam-worker.ts            Background CAM worker entry point
        │   ├── cut-preview-3d.js        Three.js cut preview controller
        │   ├── cut-preview-3d-worker.js Background cut-preview mesh calculation
        │   ├── gcode-viewer-3d.js       Three.js G-code viewer controller
        │   ├── gcode-viewer-worker.js   Background G-code viewer calculation
        │   ├── parse.test.ts            Import/parser integration coverage
        │   ├── fonts/
        │   │   └── stroke-glyphs.js     Stroke glyph data for CAD text
        │   ├── gcode-viewer-3d/
        │   │   └── sprites.js           G-code viewer sprite assets/helpers
        │   ├── potrace-js/              Vendored bitmap tracing implementation
        │   │   ├── Bitmap.js            Bitmap storage and pixel access
        │   │   ├── bitmapToPathList.js  Bitmap-to-contour extraction
        │   │   ├── Curve.js             Traced curve model
        │   │   ├── getPaths.js          Trace path conversion
        │   │   ├── getSVG.js            Trace SVG serialization
        │   │   ├── index.js             Potrace public entry point
        │   │   ├── Path.js              Trace path model
        │   │   ├── Point.js             Trace point model
        │   │   ├── processPath.js       Trace curve processing
        │   │   ├── Quad.js              Quadratic curve helper
        │   │   ├── Sum.js               Integral-image accumulator helper
        │   │   └── utils.js             Shared Potrace utilities
        │   └── preview-3d/              Internal pieces of the Three.js cut preview
        │           ├── camera-controls.js Camera interaction controls
        │           ├── math.js           Preview vector/math helpers
        │           ├── origin-overlay.js Work-origin overlay
        │           ├── playback-mesh.js  Animated toolpath mesh construction
        │           ├── scene-projection.js 2D/3D projection helpers
        │           ├── surface-texture.js  Cut-surface texture generation
        │           └── worker-input.js   Preview worker payload construction
        │
        ├── components/                  Reusable presentational UI, not domain implementation
        │   ├── AppToolbars.tsx          Application toolbar composition
        │   ├── CadInspector.tsx         Selected-object inspector UI
        │   ├── ConfigPanel.tsx          Job/machine configuration panel
        │   ├── ConfirmDialog.tsx        Reusable confirmation dialog
        │   ├── CutPreview3DView.tsx     React host for cut preview
        │   ├── EditMenu.tsx             Edit command menu
        │   ├── GcodePreview.tsx         G-code output panel
        │   ├── GcodeViewer3DView.tsx    React host for 3D toolpath viewer
        │   ├── ObjectTree.tsx           Document object tree
        │   ├── Sidebar.tsx              Shared sidebar layout
        │   ├── Toasts.tsx               Notification presentation
        │   ├── TraceModal.tsx           Bitmap trace settings and confirmation UI
        │   └── UnitInput.tsx            Unit-aware numeric input with editable drafts
        │
        ├── lib/                         Shared document utilities and pure feature algorithms
        │   ├── assets.ts                IndexedDB bitmap asset cache
        │   ├── autosave.ts              Local document autosave helpers
        │   ├── bitmap.ts                Bitmap decode, sampling, and placement helpers
        │   ├── bitmap.test.ts           Bitmap utility coverage
        │   ├── corners.ts               Corner round/chamfer algorithms
        │   ├── corners.test.ts          Corner algorithm coverage
        │   ├── engine.ts                Engine adapter facade
        │   ├── groups.ts                Group/ungroup operations
        │   ├── groups.test.ts           Group operations coverage
        │   ├── guides.ts                Construction guide model/helpers
        │   ├── guides.test.ts           Guide helper coverage
        │   ├── history.ts               Undo/redo history model
        │   ├── history.test.ts          History coverage
        │   ├── ids.ts                   Stable document ID generation
        │   ├── import.ts                Import normalisation helpers
        │   ├── import.test.ts           Import helper coverage
        │   ├── library.ts               Legacy/public library data adapter
        │   ├── library.test.ts          Library adapter coverage
        │   ├── nest.ts                  Part nesting algorithm
        │   ├── nest.test.ts             Nesting coverage
        │   ├── project.ts               Project domain types/defaults
        │   ├── project.test.ts          Project model coverage
        │   ├── rulers.ts                Shared ruler calculations
        │   ├── rulers.test.ts           Ruler coverage
        │   ├── tabs.ts                  Document-level tab helpers
        │   ├── tabs.test.ts             Tab helper coverage
        │   ├── trace.ts                 Bitmap-to-vector tracing facade
        │   ├── trace.test.ts            Trace coverage
        │   ├── transform.ts             Document geometry transformations
        │   ├── transform.test.ts        Transform coverage
        │   ├── trim.ts                  Vector trim/split algorithms
        │   ├── trim.test.ts             Trim coverage
        │   ├── units.ts                 Canonical mm conversion and display-unit helpers
        │   └── units.test.ts            Unit conversion coverage
        │
        ├── hooks/
        │   └── useDarkMode.ts           Theme preference React hook
        └── test-stubs/                  Browser/Three.js substitutions for Jest
            ├── file.ts                 File API stub
            └── orbit-controls.ts       Three.js OrbitControls stub
```

See [`react/docs/architecture.md`](react/docs/architecture.md) for the concise
boundary rules used during implementation and review.
See [`react/docs/adaptive-cutting-parameters.md`](react/docs/adaptive-cutting-parameters.md)
for the proposed machine, material, and cutter based cutting-parameter system.

## Test coverage

### Cypress browser workflows

The four specs contain 44 tests. Each starts with isolated browser storage and
uses UI controls, imported fixtures and downloaded project/G-code files to
check results. Unexpected application exceptions fail the tests.

#### Images and machining — `toolpaths.cy.js` (20 tests)

| Test | What it checks |
| --- | --- |
| Bitmap tracing | Imports the contrast PNG, converts it to vectors, checks that the bitmap is replaced and traced paths are selected, then generates an Engrave toolpath. |
| Laser Raster, Wavy, Halftone (one test each) | Retains the imported bitmap and generates and exports the chosen image operation. |
| Outside, Inside, Pocket, Engrave, Chamfer, V-Carve, V-Bit Countersink, Texture Fill, Laser Cut (one test each) | Selects fixture geometry, creates the operation and downloads G-code. |
| Crosshatch texture | Generates and exports the crosshatch variant of Texture Fill. |
| STL / OBJ → 3D Surface Clear (one test per format) | Confirms millimetre units and retained mesh data, uses a rectangular machining boundary with margin, then generates and exports clearing paths. |
| STL / OBJ → 3D Surface Finish (one test per format) | Fits a 10 mm relief into 5 mm stock using Z-only scaling; checks that XY size stays unchanged and Z scale becomes 0.5, then exports finishing paths. |
| STL / OBJ → 3D Waterline Finish (one test per format) | Fits the relief into 5 mm stock using uniform XYZ scaling; checks the reduced XY size, then exports waterline paths. |

Every machining test checks for a saved toolpath with a nonempty preview,
G-code motion commands and program termination, and no `NaN`, `Infinity` or
`undefined` values. Mesh tests also check cutting Z against the stock bottom
and the expected top/finishing-allowance limit.

#### Drawing and Config — `drawing-config.cy.js` (9 tests)

| Test | What it checks |
| --- | --- |
| Rectangle grid snapping | Clicks near grid intersections and checks the exported rectangle corners land on the grid. |
| Endpoint, midpoint and guide snapping | Adds a guide and draws lines near existing endpoints, edge midpoints and the guide; checks the resulting coordinates. |
| Circle, Polygon, Arc, Bezier, Polyline (one test each) | Draws each shape through the canvas and checks that exported geometry exists with finite coordinates. |
| Vector text | Places text through the drawing controls and checks that text geometry is present and selected. |
| Configuration | Changes units, grid style, machine profile and toast duration; checks the exported Config file, then reloads and checks units, grid and machine persistence. |

#### Editing and geometry — `editing.cy.js` (14 tests)

| Test | What it checks |
| --- | --- |
| Selection | Plain clicks replace selection, Ctrl-clicks toggle membership, and clicking empty space clears selection. |
| Group, ungroup and nest | Checks shared group identity and its removal, then nests selected parts within a 100 × 100 mm sheet without overlapping bounding boxes. |
| Zoom, fit and history | Checks zoom-in/out scale changes, invokes Fit View, then checks object counts after clone, confirmed delete, undo and redo. |
| Numeric position and size | Applies X, Y, width and height through shape properties and checks exported bounds. |
| Drag move and marquee | Checks the translated shape position and the number of objects selected by a drag box. |
| Union, difference, intersection, XOR (one test each) | Applies each Boolean to overlapping rectangles and checks the resulting total area. |
| Trim | Removes the segment between crossing vectors and checks that the remaining horizontal segments have the expected total length. |
| Offset | Applies a 2 mm outward offset and checks the resulting bounds. |
| Fillet | Rounds a clicked corner and checks object count, added curve points and the resulting area. |
| Chamfer | Applies a 2 mm chamfer and checks the rectangle's resulting area. |
| Dogbone | Adds relief at a clicked corner and checks the added object and its geometry. |

#### First-install tools — `tool-library.cy.js` (1 test)

Starts with no configured cutters, follows **Set up your tools**, and creates
flat, ball and 60-degree V-bit entries. Checks the saved tool types, reloads the
app, and verifies that all three cutters remain available in the tool selector.

Fixtures include a contrast PNG, SVG shapes/overlaps/crossing lines, and matching
closed 20 × 20 × 10 mm STL and OBJ pyramid reliefs. See the
[Cypress workflow guide](react/cypress/README.md) for fixture and runner details.
Simulation is excluded; these checks do not validate stock-removal rendering or
every machining parameter combination.

### Jest unit and component tests

Jest tests live beside the feature they check as `*.test.*` files. They provide
more focused coverage than the browser workflows:

| Area | Coverage |
| --- | --- |
| Imports and models | Vector/bitmap/model import helpers, parser behavior, tracing, units dialogs, surface-model placement and scaling. |
| Drawing and canvas | Drawing/text geometry, selection geometry and pointer behavior, guides, rulers, tabs, toolbar commands/menus and canvas rendering helpers. |
| Document editing | Transformations, trim, corners, grouping, nesting, undo/redo history, project defaults and unit conversion. |
| CAM and G-code | Operation registry and geometry, Boolean regressions, texture fill, tabs, surface strategies/runners and G-code generation/validation. |
| Job and tools | Job stock controls, tool-library data and selectors, operation availability, toolpath requests/stack/submission, and cutting recommendations based on cutter, material and machine. |
| Application UI | Config and inspector components, machine setup, bitmap/vector import choices, theme behavior and shared callback behavior. |

Use `yarn test --runInBand` for the suite, `yarn test:watch` during development,
or pass a file path to run a focused test, for example:

```sh
yarn test --runInBand src/lib/trim.test.ts
```

Biome checks code style and lint rules; TypeScript checks types. These complement
the behavioral tests above and run alongside them in the quality workflow.
