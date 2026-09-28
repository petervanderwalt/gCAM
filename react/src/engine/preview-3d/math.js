export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const distance2d = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
