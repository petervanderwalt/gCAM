/**
 * Purpose: Regression coverage for canvas toolbar command wiring.
 * Tests: Toolbar buttons call selection commands without forwarding React events.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { ToolbarCommands } from './ToolbarCommands';
import type { CanvasToolbarProps } from './types';

describe('ToolbarCommands', () => {
    it('calls delete without forwarding the click event as selected ids', () => {
        const calls: unknown[][] = [];
        const onDeleteSelected = (...args: unknown[]) => calls.push(args);
        const props = {
            activeTool: 'select',
            drawTool: 'line',
            transformMode: null,
            hasSelection: true,
            hasGeometry: true,
            onDeleteSelected,
        } as unknown as CanvasToolbarProps;

        render(<ToolbarCommands props={props} open={null} close={() => {}} />);

        fireEvent.click(
            screen.getByRole('button', { name: 'Delete selection' }),
        );

        expect(calls).toEqual([[]]);
    });
});
