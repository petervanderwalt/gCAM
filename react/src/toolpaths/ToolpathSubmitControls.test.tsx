import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { ToolpathSubmitControls } from './ToolpathSubmitControls';

test('shows an explicit cancel action while a cancellable build is running', () => {
    const onCancelBuild = jest.fn();
    render(
        <ToolpathSubmitControls
            busy
            hasActiveGeometry
            editEntry={false}
            submitLabel="Add Toolpath"
            selectedCount={1}
            status="Rasterizing model…"
            onGenerate={() => {}}
            onCancelBuild={onCancelBuild}
        />,
    );

    fireEvent.click(
        screen.getByRole('button', { name: 'Cancel 3D CAM build' }),
    );
    expect(onCancelBuild).toHaveBeenCalledTimes(1);
});

test('does not show a cancellation action for normal toolpath builds', () => {
    render(
        <ToolpathSubmitControls
            busy
            hasActiveGeometry
            editEntry={false}
            submitLabel="Add Toolpath"
            selectedCount={1}
            status="Building…"
            onGenerate={() => {}}
        />,
    );
    expect(
        screen.queryByRole('button', { name: 'Cancel 3D CAM build' }),
    ).not.toBeInTheDocument();
});
