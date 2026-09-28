/** Stable GRBL number formatting shared by every G-code emission family. */
export function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';
    return Number(number.toFixed(4)).toString();
}
