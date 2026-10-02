export function getSurfaceDispatchShape(count: number, maxWorkgroupsPerDimension: number, workgroupSize = 128) {
    if (!Number.isInteger(count) || count <= 0 || !Number.isInteger(maxWorkgroupsPerDimension) || maxWorkgroupsPerDimension <= 0)
        throw new Error('WebGPU dispatch requires positive cell and device workgroup limits.');
    const workgroupsX = Math.min(maxWorkgroupsPerDimension, Math.ceil(count / workgroupSize));
    const dispatchWidth = workgroupsX * workgroupSize;
    const workgroupsY = Math.ceil(count / dispatchWidth);
    if (workgroupsY > maxWorkgroupsPerDimension)
        throw new Error('CPU_FALLBACK: The requested height field exceeds this GPU’s compute dispatch limits. Increase machining grid size.');
    return { workgroupsX, workgroupsY, dispatchWidth };
}
