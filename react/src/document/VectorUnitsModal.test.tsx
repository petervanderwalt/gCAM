import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { VectorUnitsModal } from './VectorUnitsModal';

test('explains and lets the user size an SVG without physical dimensions', () => {
    const onApply = jest.fn();
    render(
        <VectorUnitsModal
            fileName="outline.svg"
            fileType="SVG"
            width={1091}
            height={786}
            onApply={onApply}
            onCancel={() => {}}
        />,
    );

    expect(screen.getByText(/this svg has no physical size/i)).toBeInTheDocument();
    expect(screen.getByText(/1091\.0 × 786\.0 mm/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Drawing units'), { target: { value: '3' } });
    expect(screen.getByText(/27711\.4 × 19964\.4 mm/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import drawing' }));

    expect(onApply).toHaveBeenCalledWith(25.4);
});
