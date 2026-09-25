import { useEffect, useState } from 'react';

const DARK_MODE_KEY = 'gcam.darkMode';

export function useDarkMode() {
    const [enabled, setEnabled] = useState<boolean>(() => {
        if (typeof window === 'undefined') return true;
        const stored = localStorage.getItem(DARK_MODE_KEY);
        // gCAM ships a dark theme (gSender default); fall back to dark.
        if (stored !== null) return JSON.parse(stored);
        return true;
    });

    useEffect(() => {
        localStorage.setItem(DARK_MODE_KEY, JSON.stringify(enabled));
        if (enabled) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [enabled]);

    return { enabled, setEnabled };
}
