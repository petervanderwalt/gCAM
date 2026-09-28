/**
 * Purpose: Implementation module for theme in the canvas domain.
 */
import type { CanvasSceneTheme } from './sceneRenderer';

export interface CanvasTheme extends CanvasSceneTheme {
    bg: string;
    grid: string;
    rulerBg: string;
    rulerTick: string;
    rulerTickMinor: string;
    rulerLabel: string;
    rulerEdge: string;
    vector: string;
    selected: string;
    preview: string;
    draft: string;
    chain: string;
    tab: string;
    marqueeFill: string;
    marqueeStroke: string;
    originX: string;
    originY: string;
    originDot: string;
    originLabel: string;
    emptyText: string;
}

export const DARK_CANVAS_THEME: CanvasTheme = {
    bg: '#0b1220',
    grid: 'rgba(104,154,201,0.18)',
    rulerBg: 'rgba(11,18,32,0.9)',
    rulerTick: 'rgba(148,163,184,0.76)',
    rulerTickMinor: 'rgba(148,163,184,0.4)',
    rulerLabel: 'rgba(148,163,184,0.9)',
    rulerEdge: 'rgba(148,163,184,0.25)',
    vector: '#f8fafc',
    selected: '#60a5fa',
    preview: '#f5b942',
    draft: '#dc3545',
    chain: '#ffffff',
    tab: '#f5b942',
    marqueeFill: 'rgba(96,165,250,0.12)',
    marqueeStroke: 'rgba(96,165,250,0.9)',
    originX: '#bf605a',
    originY: '#3a8872',
    originDot: '#315d73',
    originLabel: '#9fb3c8',
    emptyText: 'rgba(148,163,184,0.9)',
};

export const LIGHT_CANVAS_THEME: CanvasTheme = {
    bg: '#f8fafc',
    grid: 'rgba(100,116,139,0.28)',
    rulerBg: 'rgba(241,245,249,0.95)',
    rulerTick: 'rgba(100,116,139,0.8)',
    rulerTickMinor: 'rgba(100,116,139,0.45)',
    rulerLabel: 'rgba(71,85,105,0.95)',
    rulerEdge: 'rgba(100,116,139,0.35)',
    vector: '#111827',
    selected: '#2563eb',
    preview: '#d97706',
    draft: '#dc2626',
    chain: '#0f172a',
    tab: '#d97706',
    marqueeFill: 'rgba(37,99,235,0.12)',
    marqueeStroke: 'rgba(37,99,235,0.9)',
    originX: '#bf605a',
    originY: '#3a8872',
    originDot: '#315d73',
    originLabel: '#475569',
    emptyText: 'rgba(100,116,139,0.9)',
};
