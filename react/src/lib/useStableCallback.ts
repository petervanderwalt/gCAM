import { useCallback, useRef } from 'react';

/** Keep event props stable while always calling the latest committed handler. */
export function useStableCallback<Args extends unknown[], Result>(
    callback: (...args: Args) => Result,
) {
    const ref = useRef(callback);
    ref.current = callback;
    return useCallback((...args: Args) => ref.current(...args), []);
}
