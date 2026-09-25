// The lib is legacy UMD: under CommonJS (Jest) it assigns
// `module.exports`; in a real browser (Vite) `module` is undefined and it
// assigns `window.ClipperLib` when `document` exists. Resolve whichever the
// runtime provides so the engine works in both.
import * as importedClipperModule from './clipper_unminified.js';

const clipperModule = importedClipperModule;

const fromGlobal = globalThis.ClipperLib;

const ClipperLib =
    fromGlobal && fromGlobal.Clipper
        ? fromGlobal
        : clipperModule && clipperModule.Clipper
          ? clipperModule
          : null;

if (!ClipperLib) {
    throw new Error('ClipperLib failed to initialise');
}

globalThis.ClipperLib = ClipperLib;

export { ClipperLib };
export default ClipperLib;
