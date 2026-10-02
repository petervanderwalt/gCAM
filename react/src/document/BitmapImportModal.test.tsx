import { act, fireEvent, render, screen } from '@testing-library/react';
import { BitmapImportModal } from './BitmapImportModal';

test('applies an explicit setup direction from the STL import modal', async () => {
    let applied: [number, number, number] | null = null;
    const onSetupOrientation = async (machineUp: [number, number, number]) => {
        applied = machineUp;
    };
    render(
        <BitmapImportModal
            choice={{
                fileName: 'part.stl',
                isSurfaceModel: true,
                surfaceMachinableTopDown: true,
                machineUp: [0, 0, 1],
                surfacePreviewUrl: 'data:image/png;base64,preview',
            }}
            onUseBitmap={() => {}}
            onTrace={() => {}}
            onSetupOrientation={onSetupOrientation}
            onCancel={() => {}}
        />,
    );

    fireEvent.change(screen.getByLabelText('Setup azimuth'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Setup elevation'), { target: { value: '0' } });
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Apply setup direction' }));
    });

    expect(applied?.[0]).toBeCloseTo(1);
    expect(applied?.[1]).toBeCloseTo(0);
    expect(applied?.[2]).toBeCloseTo(0);
    expect(screen.getByRole('button', { name: /Place 3D model/ })).toBeInTheDocument();
});

test('blocks placement while the current model setup has no top-down surface', () => {
    render(
        <BitmapImportModal
            choice={{
                fileName: 'vertical.stl',
                isSurfaceModel: true,
                surfaceMachinableTopDown: false,
                machineUp: [0, 0, 1],
                surfacePreviewUrl: 'data:image/svg+xml,preview',
            }}
            onUseBitmap={() => {}}
            onTrace={() => {}}
            onSetupOrientation={async () => {}}
            onCancel={() => {}}
        />,
    );

    expect(screen.getByText(/current setup is edge-on/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose setup direction first/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Apply setup direction' })).toBeEnabled();
});
