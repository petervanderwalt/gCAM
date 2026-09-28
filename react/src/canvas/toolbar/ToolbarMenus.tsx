import { Eye, File, Group, Scissors } from 'lucide-react';
import {
    ToolbarMenu,
    ToolbarMenuItem,
    ToolbarSeparator,
} from './ToolbarControls';
import type { CanvasToolbarProps, ToolbarAction } from './types';

interface ToolbarMenusProps {
    props: CanvasToolbarProps;
    openAction: (action: Exclude<ToolbarAction, null>) => void;
    close: () => void;
}

/** Project, modification, grouping, and view menu groups for the canvas toolbar. */
export function ToolbarMenus({ props, openAction, close }: ToolbarMenusProps) {
    return (
        <>
            <ToolbarMenu label="File" icon={<File size={18} />} wide>
                <ToolbarMenuItem
                    label="New Project"
                    onClick={() => props.onNewCanvas?.()}
                />
                <ToolbarMenuItem
                    label="Import Project"
                    onClick={() => props.onImportProject?.()}
                />
                <ToolbarMenuItem
                    label="Export Project"
                    onClick={() => props.onExportProject?.()}
                />
                <ToolbarMenuItem
                    label="Import File"
                    onClick={() => props.onImportFile?.()}
                />
                <ToolbarMenuItem
                    label="Generate G-code"
                    onClick={() => props.onViewPreview?.()}
                />
            </ToolbarMenu>
            <ToolbarSeparator />
            <ToolbarMenu label="Modify" icon={<Scissors size={18} />} iconOnly>
                <ToolbarMenuItem
                    label="Fillet…"
                    onClick={() => openAction('fillet')}
                />
                <ToolbarMenuItem
                    label="Chamfer…"
                    onClick={() => openAction('chamfer')}
                />
                <ToolbarMenuItem
                    label="Dogbone"
                    onClick={() => {
                        props.onApplyDogbone();
                        close();
                    }}
                />
                <ToolbarMenuItem
                    label="Boolean…"
                    onClick={() => openAction('boolean')}
                />
                <ToolbarMenuItem
                    label="Offset…"
                    onClick={() => openAction('offset')}
                />
                <ToolbarMenuItem
                    label="Nest…"
                    onClick={() => openAction('nest')}
                />
            </ToolbarMenu>
            <ToolbarMenu label="Group" icon={<Group size={18} />} iconOnly>
                <ToolbarMenuItem
                    label="Group"
                    disabled={!props.canGroup}
                    onClick={() => props.onGroup?.()}
                />
                <ToolbarMenuItem
                    label="Ungroup"
                    disabled={!props.canUngroup}
                    onClick={() => props.onUngroup?.()}
                />
            </ToolbarMenu>
            <ToolbarMenu label="View" icon={<Eye size={18} />} iconOnly>
                <ToolbarMenuItem
                    label="Dark / Light Mode"
                    onClick={() => props.onToggleDarkMode?.()}
                />
                <ToolbarMenuItem
                    label={props.snapToGrid ? 'Snap to Grid ✓' : 'Snap to Grid'}
                    onClick={() => props.onToggleSnapToGrid?.()}
                />
                <ToolbarMenuItem
                    label="Fit View"
                    onClick={() => props.onFitView?.()}
                />
                <ToolbarMenuItem
                    label="Zoom In"
                    onClick={() => props.onZoomIn?.()}
                />
                <ToolbarMenuItem
                    label="Zoom Out"
                    onClick={() => props.onZoomOut?.()}
                />
                <ToolbarMenuItem
                    label="Object Browser"
                    onClick={() => props.onToggleObjects?.()}
                />
            </ToolbarMenu>
            <ToolbarSeparator />
        </>
    );
}
