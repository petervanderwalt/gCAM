/**
 * Purpose: React hook that owns the AppPreferences workflow.
 */
import { useEffect, useState } from 'react';
import type { ConfigActions } from '../components/ConfigPanel';
import type { PreviewControls } from '../components/CutPreview3DView';
import { loadGrid, saveGrid } from '../components/ConfigPanel';
import type { SideTab } from '../components/Sidebar';
import { useDarkMode } from '../hooks/useDarkMode';
import type { UnitSystem } from '../lib/units';

/** Persistent application-wide display and output preferences. */
export function useAppPreferences() {
    const [grid, setGrid] = useState(loadGrid);
    const [sideTab, setSideTab] = useState<SideTab>('toolpaths');
    const [previewControls, setPreviewControls] =
        useState<PreviewControls | null>(null);
    const [configActions, setConfigActions] = useState<ConfigActions | null>(
        null,
    );
    const { enabled: darkMode, setEnabled: setDarkMode } = useDarkMode();
    const [emitArcs, setEmitArcs] = useState(() => {
        if (typeof window === 'undefined') return true;
        return JSON.parse(localStorage.getItem('gcam.emitArcs') ?? 'true');
    });
    const [units, setUnits] = useState<UnitSystem>(() => {
        if (typeof window === 'undefined') return 'metric';
        return localStorage.getItem('gcam.units') === 'imperial'
            ? 'imperial'
            : 'metric';
    });
    const [machineProfileId, setMachineProfileId] = useState(() => {
        if (typeof window === 'undefined') return 'longmill-router';
        return (
            localStorage.getItem('gcam.machineProfileId') ?? 'longmill-router'
        );
    });

    useEffect(() => saveGrid(grid), [grid]);
    useEffect(
        () => localStorage.setItem('gcam.emitArcs', JSON.stringify(emitArcs)),
        [emitArcs],
    );
    useEffect(() => localStorage.setItem('gcam.units', units), [units]);
    useEffect(
        () => localStorage.setItem('gcam.machineProfileId', machineProfileId),
        [machineProfileId],
    );

    return {
        grid,
        setGrid,
        sideTab,
        setSideTab,
        previewControls,
        setPreviewControls,
        configActions,
        setConfigActions,
        darkMode,
        setDarkMode,
        emitArcs,
        setEmitArcs,
        units,
        setUnits,
        machineProfileId,
        setMachineProfileId,
    };
}
