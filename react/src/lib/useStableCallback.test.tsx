import { renderHook } from '@testing-library/react';
import { useStableCallback } from './useStableCallback';

test('keeps event identity stable while using the latest handler', () => {
    const { result, rerender } = renderHook(
        ({ offset }) => useStableCallback((value: number) => value + offset),
        { initialProps: { offset: 1 } },
    );
    const event = result.current;
    expect(event(3)).toBe(4);
    rerender({ offset: 10 });
    expect(result.current).toBe(event);
    expect(event(3)).toBe(13);
});
