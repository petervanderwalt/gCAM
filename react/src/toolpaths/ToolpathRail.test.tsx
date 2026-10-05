import type { ComponentProps } from 'react';
import { jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import type { ToolpathStackEntry } from './useToolpathStack';

await jest.unstable_mockModule('./ToolpathPanel', () => ({
    ToolpathPanel: () => <div>Toolpath editor</div>,
}));

await jest.unstable_mockModule('../job/JobStockSetup', () => ({
    JobStockSetup: () => <div>Stock setup</div>,
}));

const { ToolpathRail } = await import('./ToolpathRail');

function makeProps(
    overrides: Partial<ComponentProps<typeof ToolpathRail>> = {},
) {
    return {
        loops: [],
        selected: [],
        bitmaps: [],
        stack: [],
        gcode: 'G90\n',
        fileName: 'job.nc',
        units: 'metric',
        emitArcs: true,
        machineProfileId: 'longmill-router',
        machineTravelLimits: {
            maxXTravelMm: null,
            maxYTravelMm: null,
            minZTravelMm: null,
            maxZTravelMm: null,
        },
        stock: {
            widthMm: 100,
            heightMm: 100,
            thicknessMm: 18,
            material: 'softwood',
        },
        setStock: jest.fn(),
        editingId: null,
        editingEntry: null,
        tabMode: false,
        setTabMode: jest.fn(),
        setEditingId: jest.fn(),
        setStack: jest.fn(),
        setSideTab: jest.fn(),
        setStatus: jest.fn(),
        setDraftPreview: jest.fn(),
        setDraftProgress: jest.fn(),
        onResult: jest.fn(),
        onUpdate: jest.fn(),
        rebuildEntryTabs: jest.fn(),
        confirm: jest.fn(async () => true),
        showToast: jest.fn(),
        ...overrides,
    } as ComponentProps<typeof ToolpathRail>;
}

test('shows stock, the committed list, tabs and G-code export when nothing is selected', () => {
    render(<ToolpathRail {...makeProps()} />);

    expect(screen.getByText('Job Setup & Toolpaths')).toBeInTheDocument();
    expect(screen.getByText('Stock setup')).toBeInTheDocument();
    expect(
        screen.getByRole('heading', { name: 'Job toolpaths (0)' }),
    ).toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Add a Tab' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export G-code' })).toBeEnabled();
    expect(
        screen.getByText('Ready to make your first toolpath?'),
    ).toBeInTheDocument();
    expect(
        screen.getByText(
            /Click a shape on the canvas, or drag a box around several shapes/,
        ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Toolpath editor')).not.toBeInTheDocument();
});

test('keeps job stock accessible alongside toolpath setup for selected geometry', () => {
    render(<ToolpathRail {...makeProps({ selected: ['vector-1'] })} />);

    expect(screen.getByText('Toolpath Setup')).toBeInTheDocument();
    expect(screen.getByText('Toolpath editor')).toBeInTheDocument();
    expect(screen.getByText('Stock setup')).toBeInTheDocument();
    expect(
        screen.queryByRole('heading', { name: /Job toolpaths/ }),
    ).not.toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: 'Export G-code' }),
    ).not.toBeInTheDocument();
});

test('shows only the edited toolpath and hides the created list while editing', () => {
    const entry: ToolpathStackEntry = {
        id: 'path-1',
        label: 'Outside Profile',
        args: {
            loops: [],
            operation: 'profile-outside',
            toolDiameter: 6,
            cutDepth: 3,
        },
        preview: [],
        toolpath: {},
    };
    render(
        <ToolpathRail
            {...makeProps({ editingId: entry.id, editingEntry: entry })}
        />,
    );

    expect(screen.getByText('Edit Outside Profile')).toBeInTheDocument();
    expect(screen.getByText('Toolpath editor')).toBeInTheDocument();
    expect(screen.getByText('Stock setup')).toBeInTheDocument();
    expect(
        screen.queryByRole('heading', { name: /Job toolpaths/ }),
    ).not.toBeInTheDocument();
});
