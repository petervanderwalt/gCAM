# Browser workflows

Run from `react` with Node 20.19+, 22, or 24 and Yarn 1:

```sh
yarn install --frozen-lockfile
yarn test:e2e
yarn cy:open
```

Both commands start a separate Vite server at `http://127.0.0.1:5180` and stop it when Cypress exits. The runner rejects an occupied port. Run one suite at a time. To run one spec:

```sh
node scripts/e2e.mjs cypress/e2e/editing.cy.js
```

Tests clear browser storage on their own origin before each workflow. They never use the working project at port 5176. Machining workflows seed a flat end mill, ball end mill and 60-degree V-bit into the test browser's tool library. The fresh-library workflow starts without cutters, configures all three through the UI, and verifies persistence after reload.

| Workflow | Checks |
| --- | --- |
| Image → trace → vectors | Import, replacement of the bitmap, selected traced paths, machining and G-code download |
| Image effects | Laser raster, Wavy and Halftone with retained bitmap, nonempty paths and G-code |
| STL / OBJ | Units confirmation, retained mesh, clearing, surface finishing and waterline finishing |
| Vectors | Outside, Inside, Pocket, Engrave, Chamfer, V-Carve, Countersink, Texture Fill and Laser Cut |
| Drawing | Grid, endpoints, midpoints, guide placement and snapping, circle, polygon, arc, Bezier, polyline and text |
| Editing | Plain/Ctrl selection, empty click, marquee, move drag, dimensions, zoom, fit, clone, delete, undo and redo |
| Grouping / nesting | Shared group identity, ungrouping, sheet bounds and nonoverlapping placements |
| Modify | Union, difference, intersection and XOR areas, segment trim, offset bounds, fillet, chamfer and dogbone |
| Config | Units, machine, grid style, toast duration, exported settings and persistence |

Geometry assertions read actual exported `.gcam.json` files. Machining workflows also download `.nc` files and check motion commands, program termination and invalid numeric values. Canvas actions use pointer events mapped through the canvas's rendered `data-camera` transform; they do not call application handlers or manipulate React state. Application exceptions fail tests.

Fixtures are committed and need no user files: a 32 × 32 pixel black-and-white PNG, millimetre SVG shapes and crossing segments, and matching closed 20 × 20 × 10 mm pyramid STL/OBJ reliefs. The relief's sloped faces exercise all three surface strategies. Downloads and failure screenshots are ignored by Git; CI uploads failure screenshots.

Simulation is excluded. The suite does not invoke simulation controls or validate stock-removal rendering. This is a regression suite for the listed workflows, not exhaustive coverage of every parameter combination or machine controller.
