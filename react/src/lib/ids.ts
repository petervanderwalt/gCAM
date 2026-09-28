/** Creates portable entity IDs without relying on module-level counters. */
export function createDocumentId(prefix: string): string {
    const random = globalThis.crypto?.randomUUID?.();
    if (random) return `${prefix}-${random}`;
    const entropy = Math.random().toString(36).slice(2, 12);
    return `${prefix}-${Date.now().toString(36)}-${entropy}`;
}
