import { render } from '@testing-library/react';
import { jest } from '@jest/globals';
import { CadInspector } from './CadInspector';

test('selecting a polygon does not create a changed-geometry preview', () => {
    const onPreview = jest.fn();
    render(
        <CadInspector
            loop={{
                id: 'polygon',
                sourceType: 'polygon',
                radius: 10,
                sides: 6,
                polygonMode: 'circumscribed',
                points: [
                    { x: 0, y: 5.7735 },
                    { x: 5, y: 2.88675 },
                    { x: 5, y: -2.88675 },
                    { x: 0, y: -5.7735 },
                    { x: -5, y: -2.88675 },
                    { x: -5, y: 2.88675 },
                    { x: 0, y: 5.7735 },
                ],
            }}
            angle={0}
            onApply={jest.fn()}
            onPreview={onPreview}
            onClose={jest.fn()}
            units="metric"
        />,
    );

    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview).toHaveBeenLastCalledWith(null);
});
