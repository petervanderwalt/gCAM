import { rasterizeTopSurface, type SurfaceMesh } from './surface-cam';

interface RasterRequest {
    id: string;
    mesh: SurfaceMesh;
    resolutionMm: number;
}

self.addEventListener('message', ({ data }: MessageEvent<RasterRequest>) => {
    try {
        const field = rasterizeTopSurface(data.mesh, data.resolutionMm);
        self.postMessage({ id: data.id, field }, [
            field.heights.buffer,
            field.covered.buffer,
        ]);
    } catch (error) {
        self.postMessage({
            id: data.id,
            error:
                error instanceof Error
                    ? error.message
                    : 'Surface rasterization failed.',
        });
    }
});
