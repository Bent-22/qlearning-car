export const W = 1200; // logische Zeichenfläche
export const H = 720;
export const ROAD_W = 60; // einheitliche Straßenbreite
export const STEP_LEN = 6; // Abstand der Mittellinienpunkte
/** Gleichmäßiges Neu-Abtasten einer Polylinie. */
export function resample(raw, step) {
    const out = [raw[0]];
    let acc = 0;
    let prev = raw[0];
    for (let i = 1; i < raw.length; i++) {
        const cur = raw[i];
        let d = Math.hypot(cur.x - prev.x, cur.y - prev.y);
        while (d > 0 && acc + d >= step) {
            const t = (step - acc) / d;
            const p = { x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t };
            out.push(p);
            prev = p;
            d = Math.hypot(cur.x - prev.x, cur.y - prev.y);
            acc = 0;
        }
        acc += d;
        prev = cur;
    }
    return out;
}
function smooth(p, iterations) {
    let a = p;
    for (let k = 0; k < iterations; k++) {
        const src = a;
        a = src.map((q, i) => {
            if (i < 2 || i > src.length - 3)
                return q;
            let x = 0, y = 0;
            for (let j = -2; j <= 2; j++) {
                x += src[i + j].x;
                y += src[i + j].y;
            }
            return { x: x / 5, y: y / 5 };
        });
    }
    return a;
}
/** Gezeichnete Rohlinie -> geglättete, gleichmäßige Mittellinie. */
export function buildCenterline(raw) {
    if (raw.length < 3)
        return null;
    const r = resample(raw, STEP_LEN);
    if (r.length < 5)
        return null;
    const s = smooth(r, 12).map(p => ({
        x: Math.min(W - 8, Math.max(8, p.x)),
        y: Math.min(H - 8, Math.max(8, p.y)),
    }));
    return resample(s, STEP_LEN);
}
/** Rasterisierte Straße: Grundlage für Kollision und Sensoren. */
export class RoadMask {
    constructor(center) {
        this.data = new Uint8Array(W * H);
        const r = ROAD_W / 2;
        for (const p of center) {
            const x0 = Math.max(0, Math.floor(p.x - r)), x1 = Math.min(W - 1, Math.ceil(p.x + r));
            const y0 = Math.max(0, Math.floor(p.y - r)), y1 = Math.min(H - 1, Math.ceil(p.y + r));
            for (let y = y0; y <= y1; y++)
                for (let x = x0; x <= x1; x++)
                    if ((x - p.x) ** 2 + (y - p.y) ** 2 <= r * r)
                        this.data[y * W + x] = 1;
        }
    }
    isRoad(x, y) {
        if (x < 0 || y < 0 || x >= W || y >= H)
            return false;
        return this.data[(y | 0) * W + (x | 0)] === 1;
    }
}
/** Fahrstrecke von Start- nach Zielindex (Richtung ergibt sich aus der Reihenfolge). */
export function buildPath(center, si, gi) {
    const dir = gi >= si ? 1 : -1;
    const out = [];
    for (let i = si; i !== gi + dir; i += dir)
        out.push(center[i]);
    return out;
}
export function tangent(path, i) {
    const a = path[Math.max(0, i - 2)], b = path[Math.min(path.length - 1, i + 2)];
    return Math.atan2(b.y - a.y, b.x - a.x);
}
export function nearestIndex(center, x, y) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < center.length; i++) {
        const d = (center[i].x - x) ** 2 + (center[i].y - y) ** 2;
        if (d < bd) {
            bd = d;
            best = i;
        }
    }
    return { idx: best, dist: Math.sqrt(bd) };
}
/** Liefert eine Fehlermeldung oder null, wenn die Strecke trainierbar ist. */
export function validate(center, si, gi) {
    if (!center || center.length < 3)
        return 'Es ist noch keine gültige Strecke vorhanden.';
    if (center.length < 40)
        return 'Die Strecke ist zu kurz (mindestens ca. 240 Pixel).';
    if (si < 0 || gi < 0 || si >= center.length || gi >= center.length)
        return 'Start oder Ziel liegt nicht auf der Straße.';
    if (Math.abs(gi - si) < 20)
        return 'Start und Ziel liegen zu nah beieinander – keine eindeutige Fahrtrichtung.';
    const gap = Math.ceil((ROAD_W * 1.5) / STEP_LEN);
    for (let i = 0; i < center.length; i++)
        for (let j = i + gap; j < center.length; j++)
            if ((center[i].x - center[j].x) ** 2 + (center[i].y - center[j].y) ** 2 < (ROAD_W * 0.9) ** 2)
                return 'Die Strecke überschneidet oder berührt sich selbst. Bitte zeichne sie ohne Überschneidungen neu.';
    return null;
}
