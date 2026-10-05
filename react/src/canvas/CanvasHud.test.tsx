import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { jest } from '@jest/globals';
import { CanvasHud } from './CanvasHud';

test('offers a direct route to job stock when geometry exceeds it', () => {
    const onAdjustStock = jest.fn();
    render(
        <CanvasHud
            loopCount={1}
            darkMode={false}
            cursorRef={createRef<{ x: number; y: number } | null>()}
            guidePlacement={null}
            guideDraft={null}
            camera={{ scale: 1, tx: 0, ty: 0 }}
            onGuideOffsetChange={jest.fn()}
            onCancelGuide={jest.fn()}
            units="metric"
            draftProgress={null}
            progressPosition={null}
            draftDimension={null}
            onDraftDimensionChange={jest.fn()}
            onDraftDimensionCommit={jest.fn()}
            onDraftDimensionCancel={jest.fn()}
            onPolygonSidesChange={jest.fn()}
            onPolygonModeChange={jest.fn()}
            jobExceedsStock
            onAdjustStock={onAdjustStock}
            onZoom={() => {}}
            onFit={() => {}}
        />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
        /exceeds the configured stock/i,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit job stock' }));
    expect(onAdjustStock).toHaveBeenCalledTimes(1);
});

test('edits guide offset in the selected units and waits for the placement click', () => {
    const onGuideOffsetChange = jest.fn();
    render(
        <CanvasHud
            loopCount={1}
            darkMode={false}
            cursorRef={createRef<{ x: number; y: number } | null>()}
            guidePlacement="edge"
            guideDraft={{
                source: { x: 10, y: 10 },
                direction: { x: 1, y: 0 },
                sourceLabel: 'Edge',
                offset: 25.4,
            }}
            camera={{ scale: 2, tx: 100, ty: 100 }}
            onGuideOffsetChange={onGuideOffsetChange}
            onCancelGuide={jest.fn()}
            units="imperial"
            draftProgress={null}
            progressPosition={null}
            draftDimension={null}
            onDraftDimensionChange={jest.fn()}
            onDraftDimensionCommit={jest.fn()}
            onDraftDimensionCancel={jest.fn()}
            onPolygonSidesChange={jest.fn()}
            onPolygonModeChange={jest.fn()}
            jobExceedsStock={false}
            onZoom={() => {}}
            onFit={() => {}}
        />,
    );
    const input = screen.getByRole('spinbutton', {
        name: 'Guide offset distance',
    });
    expect(input).toHaveValue(1);
    expect(screen.getByText('in')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '2' } });
    expect(onGuideOffsetChange).toHaveBeenCalledWith(50.8);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onGuideOffsetChange).toHaveBeenCalledTimes(1);
});

test('renders editable shape dimensions in the selected units', () => {
    const onDraftDimensionChange = jest.fn();
    const onDraftDimensionCommit = jest.fn();
    render(
        <CanvasHud
            loopCount={0}
            darkMode={false}
            cursorRef={createRef<{ x: number; y: number } | null>()}
            guidePlacement={null}
            guideDraft={null}
            camera={{ scale: 1, tx: 0, ty: 0 }}
            onGuideOffsetChange={jest.fn()}
            onCancelGuide={jest.fn()}
            units="imperial"
            draftProgress={null}
            progressPosition={null}
            draftDimension={{
                x: 20,
                y: 30,
                fields: [
                    { key: 'width', label: 'Width', value: 2, unit: 'length' },
                    {
                        key: 'height',
                        label: 'Height',
                        value: 3,
                        unit: 'length',
                    },
                ],
            }}
            onDraftDimensionChange={onDraftDimensionChange}
            onDraftDimensionCommit={onDraftDimensionCommit}
            onDraftDimensionCancel={jest.fn()}
            onPolygonSidesChange={jest.fn()}
            onPolygonModeChange={jest.fn()}
            jobExceedsStock={false}
            onZoom={() => {}}
            onFit={() => {}}
        />,
    );
    const width = screen.getByRole('spinbutton', { name: 'Shape width' });
    expect(width).toHaveValue(2);
    expect(screen.getAllByText('in')).toHaveLength(2);
    fireEvent.change(width, { target: { value: '2.5' } });
    expect(onDraftDimensionChange).toHaveBeenCalledWith('width', 2.5);
    fireEvent.keyDown(width, { key: 'Enter' });
    expect(onDraftDimensionCommit).toHaveBeenCalledTimes(1);
});

test('keeps polyline angle readable at one decimal place', () => {
    render(
        <CanvasHud
            loopCount={0}
            darkMode={false}
            cursorRef={createRef<{ x: number; y: number } | null>()}
            guidePlacement={null}
            guideDraft={null}
            camera={{ scale: 1, tx: 0, ty: 0 }}
            onGuideOffsetChange={jest.fn()}
            onCancelGuide={jest.fn()}
            units="metric"
            draftProgress={null}
            progressPosition={null}
            draftDimension={{
                x: 20,
                y: 30,
                fields: [
                    {
                        key: 'length',
                        label: 'Length',
                        value: 222.036,
                        unit: 'length',
                    },
                    {
                        key: 'angle',
                        label: 'Angle',
                        value: -7.765,
                        unit: 'angle',
                    },
                ],
            }}
            onDraftDimensionChange={jest.fn()}
            onDraftDimensionCommit={jest.fn()}
            onDraftDimensionCancel={jest.fn()}
            onPolygonSidesChange={jest.fn()}
            onPolygonModeChange={jest.fn()}
            jobExceedsStock={false}
            onZoom={() => {}}
            onFit={() => {}}
        />,
    );
    expect(
        screen.getByRole('spinbutton', { name: 'Shape length' }),
    ).toHaveValue(222.04);
    expect(screen.getByRole('spinbutton', { name: 'Shape angle' })).toHaveValue(
        -7.8,
    );
    expect(screen.getByText('deg')).toBeInTheDocument();
});

test('exposes polygon sides and radius mode in the floating draft controls', () => {
    const onPolygonSidesChange = jest.fn();
    const onPolygonModeChange = jest.fn();
    render(
        <CanvasHud
            loopCount={0}
            darkMode={false}
            cursorRef={createRef<{ x: number; y: number } | null>()}
            guidePlacement={null}
            guideDraft={null}
            camera={{ scale: 1, tx: 0, ty: 0 }}
            onGuideOffsetChange={jest.fn()}
            onCancelGuide={jest.fn()}
            units="metric"
            draftProgress={null}
            progressPosition={null}
            draftDimension={{
                x: 20,
                y: 30,
                fields: [
                    {
                        key: 'radius',
                        label: 'Radius',
                        value: 40,
                        unit: 'length',
                    },
                ],
                polygon: { sides: 6, mode: 'inscribed' },
            }}
            onDraftDimensionChange={jest.fn()}
            onDraftDimensionCommit={jest.fn()}
            onDraftDimensionCancel={jest.fn()}
            onPolygonSidesChange={onPolygonSidesChange}
            onPolygonModeChange={onPolygonModeChange}
            jobExceedsStock={false}
            onZoom={() => {}}
            onFit={() => {}}
        />,
    );
    fireEvent.change(
        screen.getByRole('spinbutton', { name: 'Polygon sides' }),
        {
            target: { value: '8' },
        },
    );
    expect(onPolygonSidesChange).toHaveBeenCalledWith(8);
    const circumscribed = screen.getByRole('button', { name: 'circumscribed' });
    expect(circumscribed).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(circumscribed);
    expect(onPolygonModeChange).toHaveBeenCalledWith('circumscribed');
});
