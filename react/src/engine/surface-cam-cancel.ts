export function surfaceCamAbortError(): Error {
    const error = new Error('3D CAM generation was cancelled.');
    error.name = 'AbortError';
    return error;
}

export function throwIfSurfaceCamAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw surfaceCamAbortError();
}

export function isSurfaceGpuFallbackError(message: string): boolean {
    return /webgpu is unavailable|no webgpu adapter|cpu_fallback|webgpu device lost/i.test(message);
}

export function raceSurfaceGpuWork<T>(
    work: Promise<T>,
    deviceLost: Promise<{ reason: string; message: string }>,
): Promise<T> {
    const lost = deviceLost.then((info) => {
        const detail = [info.reason, info.message].filter(Boolean).join(': ');
        throw new Error(`CPU_FALLBACK: WebGPU device lost${detail ? ` (${detail})` : ''}.`);
    });
    return Promise.race([work, lost]);
}
