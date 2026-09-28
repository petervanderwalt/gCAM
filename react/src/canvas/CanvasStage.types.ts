import type { DrawTool } from '../draw/geometry';
import type { TransformCommit, TransformMode } from '../lib/transform';
import type {
    LoopMeta,
    PreviewLoop,
    TabMarker,
    Tool,
    ViewBounds,
    ViewLoop,
} from './types';
import type { UnitSystem } from '../lib/units';

export type Point = { x: number; y: number };

export type CanvasStageProps = {
    activeTool: Tool;
    loops: ViewLoop[];
    bounds: ViewBounds | null;
    preview: PreviewLoop[];
    draftPreview: Point[][];
    inspectorPreview?: { id: string; points: Point[] } | null;
    draftProgress: { percent: number; label: string } | null;
    darkMode: boolean;
    selected: string[];
    hidden: string[];
    onSelect: (ids: string[]) => void;
    tabMode: boolean;
    tabMarkers: TabMarker[];
    onPlaceTab: (entryId: string, contourIndex: number, along: number) => void;
    onMoveTab: (entryId: string, tabIndex: number, along: number) => void;
    onDeleteTab: (entryId: string, tabIndex: number) => void;
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
    guidePlacement?: 'x' | 'y' | null;
    onPlaceGuide?: (axis: 'x' | 'y', position: number) => void;
    onCancelGuide?: () => void;
    bitmaps: {
        id: string;
        x: number;
        y: number;
        w: number;
        h: number;
        rotation?: number;
        img?: HTMLImageElement;
    }[];
    onCommitLoop: (points: Point[], meta?: LoopMeta) => void;
    onTrimAt?: (point: Point) => void;
    onTrimStroke?: (points: Point[]) => void;
    onCommitText: (at: Point) => void;
    transformMode: TransformMode | null;
    onTransformCommit: (t: TransformCommit | null) => void;
    cornerTool?: 'fillet' | 'dogbone' | null;
    cornerRadius?: number;
    onFilletCorner?: (loopId: string, cornerIndex: number) => void;
    preserveViewToken?: number;
    viewportCommand?: { type: 'fit' | 'zoomIn' | 'zoomOut'; token: number };
    units?: UnitSystem;
};
