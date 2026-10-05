/** Keep significant cutter positions while thinning ordinary preview samples. */
export function capPreviewSamples(samples, maximum) {
    if (samples.length <= maximum) return samples;
    const critical = [];
    const ordinary = [];
    for (const sample of samples) (sample.preserve ? critical : ordinary).push(sample);
    if (critical.length >= maximum) {
        const step = critical.length / maximum;
        return Array.from({ length: maximum }, (_, index) => critical[Math.floor(index * step)]);
    }
    const remaining = maximum - critical.length;
    const selectedOrdinary = [];
    if (remaining > 0 && ordinary.length) {
        const step = ordinary.length / remaining;
        for (let index = 0; index < remaining; index += 1)
            selectedOrdinary.push(ordinary[Math.floor(index * step)]);
    }
    const keep = new Set([...critical, ...selectedOrdinary]);
    return samples.filter((sample) => keep.has(sample));
}
