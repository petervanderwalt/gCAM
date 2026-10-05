# CAM backlog

## First-use workflow audit

- [x] Ask for machine selection on first use; default to AltMill MK2 4x4 and seed the canvas/stock from its travel.
- [x] Keep job stock visible while geometry is selected and show an actionable warning when the job exceeds it.
- [x] Confirm missing DXF/SVG units with a size estimate; require explicit units for STL/OBJ and allow orientation setup.
- [x] Route SVGs as editable vectors even when the browser reports `image/svg+xml`.
- [x] Give first-time users a direct route from an empty tool library to tool setup.
- [x] Explain the next action after import, catalog-versus-custom tool setup, and common cut types.
- [x] Verify machine setup, DXF/SVG/STL import, stock warning, tool setup, a shallow pocket, and its simulation in a 1280 × 900 browser viewport.
- [x] Re-check the updated flow with John1970 and resolve any remaining novice blockers; simulation does not certify a real machine setup or cutter. Fresh-origin browser check confirms the AltMill MK2 4x4 default and the agent's review found no remaining flow blocker.

## Sidebar workflow cleanup

- [x] Keep job-level stock visible and editable while geometry is selected; hide the committed list while configuring a new toolpath.
- [x] After Add Toolpath, clear the selection so the sidebar returns to stock setup and the committed list.
- [x] Show the selected toolpath editor while editing; keep job stock accessible and hide the committed list.
- [x] Keep stock setup, toolpath list, and Add a Tab together when nothing is selected.
- [x] Add Export G-code to the list state, disabled when there is no program to export.
- [x] Compact operation selection into an icon-and-label grid; separate tool selection from operation settings.
- [x] Verify selection/list states in the running browser and add regression tests for list, setup, edit, and post-add selection behavior.

- [x] Helical contour-ramp entry for inside/outside profiles and pockets, limited to a 5-degree ramp angle and kept on the compensated toolpath
- [ ] Arc lead-ins and lead-outs for profile and pocket operations
- [x] Trochoidal pocket clearing with inward-adjusted pocket contours and configurable engagement
- [ ] Seeded circle pocket clearing for circular and round pocket regions

## 3D machining status

- [x] Import STL/OBJ, select setup orientation, preserve the mesh/transform, and show a transformable 2D heightmap on the canvas.
- [x] Generate 3-axis flat-endmill clearing, ball-endmill parallel finishing, and ball-endmill waterline paths; emit and validate GRBL moves against stock and machine travel.
- [x] Drape top-down paths over the upper envelope at overhangs; enforce cutter compensation, stock-to-leave, boundary overrun, and edge clearance.
- [x] Use WebGPU workers for mesh rasterization and cutter contact; use the deterministic CPU reference when WebGPU is unavailable, with workload bounds, progress, and cancellation.
- [x] Sample only required raster rows for clearing/parallel finishing on the GPU, retaining exact CPU fallback and the far-edge row.
- [x] Add a browser/WebGPU integration regression comparing mesh raster cells/elevations against the CPU reference; run it with `GCAM_SURFACE_STL_FIXTURE` on a WebGPU-capable browser.
- [x] Run generated 3D paths through stock-removal simulation and display 3D operation illustrations.
- [x] Offer STL Outside profile release by tracing its transparent XY footprint; normal profile depth, tabs, simulation, and stock-fit checks apply.
- [x] Add V-bit countersinking, helical contour-ramp entry, and trochoidal pocket clearing.
- [ ] Add an STL Outside integration regression covering footprint closure, profile-depth G-code, tabs, and stock-edge warnings. (Generic profile/tab coverage exists; STL footprint-to-toolpath integration is not demonstrated by those tests.)
- [ ] Audit 0.1 mm machining resolution on realistic STL sizes; estimate cell count, memory, and workload before generation and keep limits actionable.
- [ ] Reduce 3D preview jagged edges without slowing orbit/pan; keep display-mesh quality separate from machining resolution.
- [ ] Add a clear progress estimate for STL rasterization, GPU contact sampling, and path conversion on large models.
- [ ] Implement recursive V-carve for clearing broad regions with a V-bit, including depth/width limits and collision-safe sequencing. Existing V-carve is centerline engraving, not recursive area clearing.
- [ ] Add automatic rest machining from remaining stock with compatible library cutters
- [ ] Improve dogbone and T-bone relief placement, sizing, and inside-corner fit validation
- [ ] Add helical boring for circular holes with diameter, pitch, depth, and cutter-fit validation
- [ ] Add CAM planning and engagement-aware feedrate adaptation with conservative machine/tool/material limits
