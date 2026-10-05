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
            units="metric"
            draftProgress={null}
            progressPosition={null}
            draftDimension={null}
            jobExceedsStock
            onAdjustStock={onAdjustStock}
            onZoom={() => {}}
            onFit={() => {}}
        />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/exceeds the configured stock/i);
    fireEvent.click(screen.getByRole('button', { name: 'Edit job stock' }));
    expect(onAdjustStock).toHaveBeenCalledTimes(1);
});
