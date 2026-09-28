import type { DrawTool } from '../draw/geometry';
import type { TransformMode } from '../lib/transform';
import type { UnitSystem } from '../lib/units';
import type {
    PreviewLoop,
    TabHoverCandidate,
    TabMarker,
    Tool,
    ViewBounds,
    ViewLoop,
} from './types';

// Mutable render snapshot consumed by the imperative canvas painter.
export interface CanvasViewState {
    loops: ViewLoop[];
    bounds: ViewBounds | null;
    preview: PreviewLoop[];
    draftPreview: { x: number; y: number }[][];
    inspectorPreview: {
        id: string;
        points: { x: number; y: number }[];
    } | null;
    darkMode: boolean;
    activeTool: Tool;
    selected: string[];
    hidden: string[];
    tabMode: boolean;
    tabMarkers: TabMarker[];
    tabHover: TabHoverCandidate | null;
    drawTool: DrawTool;
    drawSides: number;
    polygonMode: 'inscribed' | 'circumscribed';
    grid: {
        visible: boolean;
        spacingMm: number;
        snap: boolean;
        style: 'lines' | 'dots';
    };
    guides: { id: string; axis: 'x' | 'y'; pos: number }[];
    guidePlacement: 'x' | 'y' | null;
    transformMode: TransformMode | null;
    cornerTool: 'fillet' | 'dogbone' | null;
    cornerRadius: number;
    units: UnitSystem;
    bitmaps: {
        id: string;
        x: number;
        y: number;
        w: number;
        h: number;
        rotation?: number;
        img?: HTMLImageElement;
    }[];
}
