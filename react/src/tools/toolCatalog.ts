import type { LibraryTool } from '../lib/library';
import type { ToolSlot, ToolType } from './library';

export const REQUIRED_TOOL_FIELDS: Record<string, string> = {
    name: 'Tool name',
    cuttingDiameterMm: 'Diameter',
    feedRate: 'Feed Rate',
    plungeRate: 'Plunge Rate',
    spindle: 'Spindle RPM',
    passDepthMm: 'Pass Depth',
    fluteAngleDeg: 'V Angle',
};

export const TOOL_TYPE_GROUPS: { value: ToolType; label: string }[] = [
    { value: 'flat', label: 'Flat End Mills' },
    { value: 'ball', label: 'Ball End Mills' },
    { value: 'ballnose', label: 'Ball Nose Bits' },
    { value: 'surfacing', label: 'Surfacing Bits' },
    { value: 'drill', label: 'Drill Bits' },
    { value: 'v-bit', label: 'V-Bits' },
    { value: 'specialty', label: 'Specialty Bits' },
];

export function toolTypeLabel(toolType: ToolType): string {
    return (
        TOOL_TYPE_GROUPS.find((group) => group.value === toolType)?.label ??
        'Specialty Bits'
    );
}

export function catalogGroups(catalog: LibraryTool[]) {
    return TOOL_TYPE_GROUPS.map((group) => ({
        ...group,
        tools: catalog
            .filter((tool) => tool.toolType === group.value)
            .sort((a, b) => {
                if (a.cuttingDiameterMm == null && b.cuttingDiameterMm == null)
                    return a.name.localeCompare(b.name);
                if (a.cuttingDiameterMm == null) return 1;
                if (b.cuttingDiameterMm == null) return -1;
                return (
                    a.cuttingDiameterMm - b.cuttingDiameterMm ||
                    a.name.localeCompare(b.name)
                );
            }),
    })).filter((group) => group.tools.length > 0);
}

export function slotIssues(slot: ToolSlot): string[] {
    const missing: string[] = [];
    const need = (value: unknown) =>
        value === null || value === undefined || value === '';
    if (!slot.name.trim()) missing.push(REQUIRED_TOOL_FIELDS.name);
    if (need(slot.cuttingDiameterMm))
        missing.push(REQUIRED_TOOL_FIELDS.cuttingDiameterMm);
    if (need(slot.feedRate)) missing.push(REQUIRED_TOOL_FIELDS.feedRate);
    if (need(slot.plungeRate)) missing.push(REQUIRED_TOOL_FIELDS.plungeRate);
    if (need(slot.spindle)) missing.push(REQUIRED_TOOL_FIELDS.spindle);
    if (need(slot.passDepthMm)) missing.push(REQUIRED_TOOL_FIELDS.passDepthMm);
    if (slot.toolType === 'v-bit' && need(slot.fluteAngleDeg))
        missing.push(REQUIRED_TOOL_FIELDS.fluteAngleDeg);
    return missing;
}

export function rowHasAnyData(slot: ToolSlot): boolean {
    return Boolean(
        slot.libraryToolId ||
            slot.name.trim() ||
            slot.cuttingDiameterMm ||
            slot.fluteAngleDeg ||
            slot.feedRate ||
            slot.plungeRate ||
            slot.spindle ||
            slot.passDepthMm,
    );
}
