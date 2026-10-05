import { act, renderHook } from '@testing-library/react';
import { useDarkMode } from './useDarkMode';

beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
});

test('defaults to light mode when there is no saved theme preference', () => {
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.enabled).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
});

test('respects a saved dark-mode preference', () => {
    localStorage.setItem('gcam.darkMode', 'true');
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.enabled).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    act(() => result.current.setEnabled(false));
    expect(localStorage.getItem('gcam.darkMode')).toBe('false');
});
