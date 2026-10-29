/** No-fit-polygon placement with an evolving population of part orders and angles. */
import {
    nestPlacements,
    type NestPlacement,
    type NestResult,
    type NestUnit,
} from './nest';
import {
    noFitPolygons,
    polygonVariant,
    nestDifference,
    nestUnion,
    translateNest,
    nestIntersects,
    NEST_SCALE as S,
    type IntPath,
    type PolygonVariant,
} from './nest-polygons';

export interface NestSearchRequest {
    units: NestUnit[];
    width: number;
    height: number;
    border: number;
    gap: number;
    rotationStep: number;
    origin?: 'front-left' | 'center';
}
interface Genome {
    order: number[];
    angles: number[];
    score: number;
    result: NestResult & { placedCount?: number };
}
interface Placed {
    variant: PolygonVariant;
    x: number;
    y: number;
    paths: IntPath[];
}

export class NestSearch {
    best: NestResult;
    lastAttempt: NestResult | null = null;
    lastAttemptIteration = 0;
    bestArea = Infinity;
    iterations = 0;
    private variants = new Map<string, PolygonVariant>();
    private nfps = new Map<string, IntPath[]>();
    private population: Genome[] = [];
    private pending: Genome[] = [];
    private seed = 123456789;
    constructor(private request: NestSearchRequest) {
        const r = request;
        if (
            ![r.width, r.height, r.border, r.gap].every(Number.isFinite) ||
            r.width <= 0 ||
            r.height <= 0 ||
            r.border < 0 ||
            r.gap < 0 ||
            ![0, 15, 90].includes(r.rotationStep)
        )
            throw Error('Invalid nesting dimensions or clearance.');
        if (
            !r.units.length ||
            r.units.some(
                (unit) =>
                    ![
                        unit.width,
                        unit.height,
                        unit.minX,
                        unit.minY,
                        unit.envelope ?? 0,
                    ].every(Number.isFinite) ||
                    (unit.envelope ?? 0) < 0 ||
                    unit.width <= 0 ||
                    unit.height <= 0 ||
                    !unit.loops.length ||
                    unit.loops.some(
                        (loop) =>
                            loop.points.length < 4 ||
                            loop.points.some(
                                (p) =>
                                    !Number.isFinite(p.x) ||
                                    !Number.isFinite(p.y),
                            ) ||
                            Math.hypot(
                                loop.points[0].x -
                                    loop.points[loop.points.length - 1].x,
                                loop.points[0].y -
                                    loop.points[loop.points.length - 1].y,
                            ) > 1e-6,
                    ),
            )
        )
            throw Error('Nesting requires closed shapes.');
        this.best = nestPlacements(
            r.units,
            r.width,
            r.height,
            r.border,
            r.gap,
            r.rotationStep,
        );
        if (this.best.failedIndex === null)
            this.bestArea = this.area(this.best.placements);
        const current = r.units.map((unit) => ({
            dx: unit.minX + (r.origin === 'center' ? r.width / 2 : 0),
            dy: unit.minY + (r.origin === 'center' ? r.height / 2 : 0),
            turns: 0,
        }));
        const currentPaths: IntPath[][] = [];
        const currentValid = current.every((p, i) => {
            const v = this.variant(i, 0),
                x = p.dx + v.offsetX,
                y = p.dy + v.offsetY;
            if (
                x < r.border + v.envelope - 1e-6 ||
                y < r.border + v.envelope - 1e-6 ||
                x + v.width > r.width - r.border - v.envelope + 1e-6 ||
                y + v.height > r.height - r.border - v.envelope + 1e-6
            )
                return false;
            const paths = translateNest(
                v.paths,
                Math.round(x * S),
                Math.round(y * S),
            );
            if (currentPaths.some((other) => nestIntersects(other, paths)))
                return false;
            currentPaths.push(paths);
            return true;
        });
        if (currentValid && this.area(current) < this.bestArea) {
            this.best = { placements: current, failedIndex: null };
            this.bestArea = this.area(current);
        }

        const order = r.units
            .map((_, i) => i)
            .sort(
                (a, b) =>
                    r.units[b].width * r.units[b].height -
                    r.units[a].width * r.units[a].height,
            );
        const angles = r.units.map(
            (_, i) => this.best.placements[i]?.turns ?? 0,
        );
        this.pending.push({
            order,
            angles,
            score: Infinity,
            result: { placements: [], failedIndex: 0 },
        });
        for (let i = 1; i < 8; i++)
            this.pending.push(this.mutate(this.pending[0], true));
    }
    private random() {
        this.seed ^= this.seed << 13;
        this.seed ^= this.seed >>> 17;
        this.seed ^= this.seed << 5;
        return (this.seed >>> 0) / 4294967296;
    }
    private variant(index: number, turns: number) {
        const key = `${index}:${turns}`;
        let variant = this.variants.get(key);
        if (!variant) {
            variant = polygonVariant(
                this.request.units[index],
                index,
                turns,
                this.request.gap,
            );
            this.variants.set(key, variant);
        }
        return variant;
    }
    get bestLength(): number | null {
        if (this.best.failedIndex !== null) return null;
        return Math.max(
            0,
            ...this.best.placements.map((p, i) => {
                const v = this.variant(i, p.turns);
                return (
                    p.dy +
                    v.offsetY +
                    v.height +
                    v.envelope -
                    this.request.border
                );
            }),
        );
    }
    private area(placements: NestPlacement[]) {
        let x = 0,
            y = 0;
        for (let i = 0; i < placements.length; i++) {
            const v = this.variant(i, placements[i].turns),
                p = placements[i];
            x = Math.max(
                x,
                p.dx + v.offsetX + v.width + v.envelope - this.request.border,
            );
            y = Math.max(
                y,
                p.dy + v.offsetY + v.height + v.envelope - this.request.border,
            );
        }
        return (this.request.width - 2 * this.request.border) * y + x * 0.0001;
    }
    private mutate(parent: Genome, shuffle = false): Genome {
        const order = parent.order.slice(),
            angles = parent.angles.slice();
        const count = this.request.rotationStep
            ? 360 / this.request.rotationStep
            : 1;
        for (let i = 0; i < order.length; i++) {
            if (shuffle || this.random() < 0.2) {
                const j = Math.floor(this.random() * order.length);
                [order[i], order[j]] = [order[j], order[i]];
            }
            if (this.random() < 0.1)
                angles[i] =
                    (Math.floor(this.random() * count) *
                        (this.request.rotationStep || 0)) /
                    90;
        }
        return {
            order,
            angles,
            score: Infinity,
            result: { placements: [], failedIndex: 0 },
        };
    }
    private nextGeneration() {
        this.population.sort((a, b) => a.score - b.score);
        const survivors = this.population.slice(0, 4);
        this.pending = survivors
            .slice(0, 2)
            .map((parent) => this.mutate(parent));
        while (this.pending.length < 8) {
            const a = survivors[Math.floor(this.random() * survivors.length)],
                b = survivors[Math.floor(this.random() * survivors.length)];
            const cut = Math.floor(this.random() * a.order.length),
                first = a.order.slice(0, cut),
                seen = new Set(first);
            const child = {
                ...a,
                order: [...first, ...b.order.filter((i) => !seen.has(i))],
                angles: a.angles.map((angle, i) =>
                    this.random() < 0.5 ? angle : b.angles[i],
                ),
            };
            this.pending.push(this.mutate(child));
        }
        this.population = survivors.slice(0, 2);
    }
    step(): boolean {
        if (!this.pending.length) this.nextGeneration();
        const genome = this.pending.shift();
        if (!genome) return false;
        genome.result = this.place(genome);
        this.iterations++;
        if (genome.result.failedIndex === null) {
            this.lastAttempt = genome.result;
            this.lastAttemptIteration = this.iterations;
        }
        genome.score =
            genome.result.failedIndex === null
                ? this.area(genome.result.placements)
                : 1e12 +
                  (this.request.units.length -
                      (genome.result.placedCount ?? 0)) *
                      1e9;
        this.population.push(genome);
        if (
            genome.result.failedIndex === null &&
            genome.score < this.bestArea - 1e-6
        ) {
            this.best = genome.result;
            this.bestArea = genome.score;
            return true;
        }
        return false;
    }
    private place(genome: Genome): NestResult & { placedCount?: number } {
        const placed: Placed[] = [],
            placements: NestPlacement[] = new Array(this.request.units.length);
        let usedX = this.request.border,
            usedY = this.request.border;
        for (const index of genome.order) {
            const v = this.variant(index, genome.angles[index]);
            const minX = Math.ceil((this.request.border + v.envelope) * S),
                minY = Math.ceil((this.request.border + v.envelope) * S);
            const maxX = Math.floor(
                    (this.request.width -
                        this.request.border -
                        v.width -
                        v.envelope) *
                        S,
                ),
                maxY = Math.floor(
                    (this.request.height -
                        this.request.border -
                        v.height -
                        v.envelope) *
                        S,
                );
            if (maxX < minX || maxY < minY)
                return {
                    placements: [],
                    failedIndex: index,
                    placedCount: placed.length,
                };
            const forbidden: IntPath[] = [];
            for (const other of placed) {
                const key = `${other.variant.key}|${v.key}`;
                let nfp = this.nfps.get(key);
                if (!nfp) {
                    const reverse = this.nfps.get(
                        `${v.key}|${other.variant.key}`,
                    );
                    nfp = reverse
                        ? reverse.map((path) =>
                              path.map((p) => ({ X: -p.X, Y: -p.Y })),
                          )
                        : noFitPolygons(other.variant, v);
                    if (this.nfps.size >= 2000) this.nfps.clear();
                    this.nfps.set(key, nfp);
                }
                forbidden.push(...translateNest(nfp, other.x, other.y));
            }
            const rectangle = [
                { X: minX, Y: minY },
                { X: maxX, Y: minY },
                { X: maxX, Y: maxY },
                { X: minX, Y: maxY },
            ];
            const blocked = forbidden.length ? nestUnion(forbidden) : [];
            const free =
                maxX > minX && maxY > minY
                    ? blocked.length
                        ? nestDifference([rectangle], blocked)
                        : [rectangle]
                    : [];
            const candidates = [
                ...rectangle,
                ...free.flat(),
                ...blocked.flat(),
            ].filter(
                (p) => p.X >= minX && p.X <= maxX && p.Y >= minY && p.Y <= maxY,
            );
            candidates.sort((a, b) => {
                // Fill across the sheet before increasing the occupied length.
                const height = (p: { X: number; Y: number }) =>
                    Math.max(usedY, p.Y / S + v.height + v.envelope);
                const width = (p: { X: number; Y: number }) =>
                    Math.max(usedX, p.X / S + v.width + v.envelope);
                return (
                    height(a) - height(b) ||
                    width(a) - width(b) ||
                    a.Y - b.Y ||
                    a.X - b.X
                );
            });
            let choice: Placed | null = null;
            const seen = new Set<string>();
            for (const p of candidates) {
                const key = `${p.X}:${p.Y}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const paths = translateNest(v.paths, p.X, p.Y);
                if (placed.some((other) => nestIntersects(other.paths, paths)))
                    continue;
                choice = { variant: v, x: p.X, y: p.Y, paths };
                break;
            }
            if (!choice)
                return {
                    placements: [],
                    failedIndex: index,
                    placedCount: placed.length,
                };
            placed.push(choice);
            placements[index] = {
                dx: choice.x / S - v.offsetX,
                dy: choice.y / S - v.offsetY,
                turns: v.turns,
            };
            usedX = Math.max(usedX, choice.x / S + v.width + v.envelope);
            usedY = Math.max(usedY, choice.y / S + v.height + v.envelope);
        }
        return { placements, failedIndex: null };
    }
}
