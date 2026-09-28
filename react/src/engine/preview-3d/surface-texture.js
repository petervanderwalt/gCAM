import { clamp } from './math.js';

// Creates and caches the capped shaded height-map texture for the preview.
export function getSurfaceTexture(
    owner,
    grid,
    columns,
    rows,
    maxDepth,
    revision,
) {
    // The simulation grid may be millions of cells. A capped texture is visually
    // indistinguishable at canvas scale, while avoiding a costly full-grid paint
    // on every playback refresh.
    const textureScale = Math.min(1, 800 / Math.max(columns, rows));
    const textureColumns = Math.max(1, Math.round(columns * textureScale));
    const textureRows = Math.max(1, Math.round(rows * textureScale));
    if (
        !owner.surfaceCanvas ||
        owner.surfaceCanvas.width !== textureColumns ||
        owner.surfaceCanvas.height !== textureRows
    ) {
        owner.surfaceCanvas = document.createElement('canvas');
        owner.surfaceCanvas.width = textureColumns;
        owner.surfaceCanvas.height = textureRows;
        owner.surfaceContext = owner.surfaceCanvas.getContext('2d', {
            alpha: false,
        });
    }
    if (
        !owner.edgeCanvas ||
        owner.edgeCanvas.width !== textureColumns ||
        owner.edgeCanvas.height !== textureRows
    ) {
        owner.edgeCanvas = document.createElement('canvas');
        owner.edgeCanvas.width = textureColumns;
        owner.edgeCanvas.height = textureRows;
        owner.edgeContext = owner.edgeCanvas.getContext('2d');
    }
    const signature = `${columns}x${rows}:${textureColumns}x${textureRows}:${revision}`;
    if (owner.surfaceRevision === signature) return owner.surfaceCanvas;
    const image = owner.surfaceContext.createImageData(
        textureColumns,
        textureRows,
    );
    const pixels = image.data;
    const edgeImage = owner.edgeContext.createImageData(
        textureColumns,
        textureRows,
    );
    const edgePixels = edgeImage.data;
    const sourceIndex = (row, column) => {
        const sourceRow = clamp(
            Math.round((row / Math.max(1, textureRows - 1)) * (rows - 1)),
            0,
            rows - 1,
        );
        const sourceColumn = clamp(
            Math.round(
                (column / Math.max(1, textureColumns - 1)) * (columns - 1),
            ),
            0,
            columns - 1,
        );
        return sourceRow * columns + sourceColumn;
    };
    for (let row = 0; row < textureRows; row += 1) {
        for (let column = 0; column < textureColumns; column += 1) {
            const index = sourceIndex(row, column);
            const center = grid[index];
            const left = grid[sourceIndex(row, Math.max(0, column - 1))];
            const right =
                grid[
                    sourceIndex(row, Math.min(textureColumns - 1, column + 1))
                ];
            const above = grid[sourceIndex(Math.max(0, row - 1), column)];
            const below =
                grid[sourceIndex(Math.min(textureRows - 1, row + 1), column)];
            const diagonalTopLeft =
                grid[
                    sourceIndex(Math.max(0, row - 1), Math.max(0, column - 1))
                ];
            const diagonalTopRight =
                grid[
                    sourceIndex(
                        Math.max(0, row - 1),
                        Math.min(textureColumns - 1, column + 1),
                    )
                ];
            const diagonalBottomLeft =
                grid[
                    sourceIndex(
                        Math.min(textureRows - 1, row + 1),
                        Math.max(0, column - 1),
                    )
                ];
            const diagonalBottomRight =
                grid[
                    sourceIndex(
                        Math.min(textureRows - 1, row + 1),
                        Math.min(textureColumns - 1, column + 1),
                    )
                ];
            // A weighted 3x3 filter gives continuous cutter edges while leaving
            // the underlying depth data untouched for playback.
            const softened =
                (center * 4 +
                    left * 2 +
                    right * 2 +
                    above * 2 +
                    below * 2 +
                    diagonalTopLeft +
                    diagonalTopRight +
                    diagonalBottomLeft +
                    diagonalBottomRight) /
                16;
            const depth = clamp(-softened / maxDepth, 0, 1);
            const slopeX = (right - left) / Math.max(maxDepth, 0.01);
            const slopeY = (below - above) / Math.max(maxDepth, 0.01);
            const slope = clamp(slopeX * 0.7 + slopeY * 0.45, -1, 1);
            const edgeShade = clamp(Math.hypot(slopeX, slopeY) * 0.42, 0, 0.2);
            const shade = clamp(
                1 - depth * 0.33 - slope * 0.12 - edgeShade,
                0.43,
                1,
            );
            const pixel = (row * textureColumns + column) * 4;
            // Retain a solid stock colour, then darken only removed areas.
            const base = 220;
            const depthFactor = Math.round(depth * 45);
            pixels[pixel] = Math.round((base - depthFactor) * shade);
            pixels[pixel + 1] = Math.round((base - depthFactor) * shade);
            pixels[pixel + 2] = Math.round((base - depthFactor) * shade);
            pixels[pixel + 3] = 255;
            // Edge overlay: raw (unsoftened) step between neighbours, so
            // cut walls stay crisp instead of inheriting the blur above.
            const step = Math.max(
                Math.abs(center - left),
                Math.abs(center - right),
                Math.abs(center - above),
                Math.abs(center - below),
            );
            const edgePixel = (row * textureColumns + column) * 4;
            if (step > Math.max(0.12, maxDepth * 0.03)) {
                edgePixels[edgePixel] = 35;
                edgePixels[edgePixel + 1] = 35;
                edgePixels[edgePixel + 2] = 35;
                edgePixels[edgePixel + 3] = 165;
            } else {
                edgePixels[edgePixel + 3] = 0;
            }
        }
    }
    owner.surfaceContext.putImageData(image, 0, 0);
    owner.edgeContext.putImageData(edgeImage, 0, 0);
    owner.surfaceRevision = signature;
    owner.edgeRevision = signature;
    return owner.surfaceCanvas;
}
