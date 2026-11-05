// Umgebung: Fahrzeugphysik, Sensoren, Zustandsdiskretisierung, Belohnung.
import { ROAD_W, STEP_LEN, tangent } from './track.js';
export const SPEED = 3; // konstante Vorwärtsgeschwindigkeit (px/Schritt)
export const STEER = [-0.14, -0.06, 0, 0.06, 0.14]; // Lenkwinkeländerung (rad/Schritt) je Aktion
export const SENSOR_ANGLES = [-90, -45, 0, 45, 90].map(d => (d * Math.PI) / 180);
export const RANGE = 120; // maximale Sensorreichweite
export class Env {
    constructor(mask, path) {
        this.car = { x: 0, y: 0, a: 0 };
        this.sense = { d: [], hits: [] };
        this.idx = 0;
        this.bestIdx = 0;
        this.steps = 0;
        this.sinceBest = 0;
        this.mask = mask;
        this.path = path;
        this.maxSteps = Math.ceil(path.length * 6) + 300;
        this.reset();
    }
    reset() {
        this.car = { x: this.path[0].x, y: this.path[0].y, a: tangent(this.path, 0) };
        this.idx = 0;
        this.bestIdx = 0;
        this.steps = 0;
        this.sinceBest = 0;
        this.sense = this.sensors(this.car);
        return this.stateKey();
    }
    /** Fünf Abstandssensoren bis zum nächsten Straßenrand. */
    sensors(p) {
        const d = [], hits = [];
        for (const off of SENSOR_ANGLES) {
            const ca = Math.cos(p.a + off), sa = Math.sin(p.a + off);
            let r = 0;
            while (r < RANGE && this.mask.isRoad(p.x + ca * (r + 3), p.y + sa * (r + 3)))
                r += 3;
            d.push(r);
            hits.push({ x: p.x + ca * r, y: p.y + sa * r });
        }
        return { d, hits };
    }
    /** Diskreter Zustand: 5 Sensoren x 3 Klassen, Winkelabweichung x 5 Klassen -> 1215 Zustände. */
    stateKey() {
        let key = 0;
        for (const dist of this.sense.d)
            key = key * 3 + (dist < 25 ? 0 : dist < 60 ? 1 : 2);
        let diff = this.car.a - tangent(this.path, this.idx);
        while (diff > Math.PI)
            diff -= 2 * Math.PI;
        while (diff < -Math.PI)
            diff += 2 * Math.PI;
        const ab = diff < -0.5 ? 0 : diff < -0.15 ? 1 : diff < 0.15 ? 2 : diff < 0.5 ? 3 : 4;
        return key * 5 + ab;
    }
    step(action) {
        const c = this.car, L = this.path.length, prev = this.idx;
        c.a += STEER[action];
        c.x += Math.cos(c.a) * SPEED;
        c.y += Math.sin(c.a) * SPEED;
        this.steps++;
        // Fortschritt entlang der Strecke (lokale Suche um den bisherigen Index)
        let best = this.idx, bd = Infinity;
        for (let i = Math.max(0, this.idx - 8); i <= Math.min(L - 1, this.idx + 30); i++) {
            const d = (this.path[i].x - c.x) ** 2 + (this.path[i].y - c.y) ** 2;
            if (d < bd) {
                bd = d;
                best = i;
            }
        }
        this.idx = best;
        this.sense = this.sensors(c);
        const progress = (this.idx - prev) * STEP_LEN; // negativ bei Rückwärtsfahrt
        const offCenter = Math.sqrt(bd) / (ROAD_W / 2);
        let reward = 0.5 * progress - 0.1 - 0.3 * Math.min(1, offCenter);
        if (!this.mask.isRoad(c.x, c.y))
            return { reward: -100, done: true, success: false };
        const goal = this.path[L - 1];
        if (this.idx >= L - 2 || Math.hypot(goal.x - c.x, goal.y - c.y) < 22)
            return { reward: 100, done: true, success: true };
        if (this.idx > this.bestIdx) {
            this.bestIdx = this.idx;
            this.sinceBest = 0;
        }
        else
            this.sinceBest++;
        if (this.sinceBest > 150 || this.steps >= this.maxSteps) {
            reward = -20;
            return { reward, done: true, success: false };
        }
        return { reward, done: false, success: false };
    }
}
