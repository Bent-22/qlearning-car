import { jsx as _jsx } from "react/jsx-runtime";
// Zeichenfläche: Streckeneditor (Zeichnen, Start-/Zielblock) und Simulationsdarstellung.
import { useEffect, useRef } from 'react';
import { H, ROAD_W, W, nearestIndex } from '../core/track.js';
const SENSOR_COLORS = ['#ff6b6b', '#ffa94d', '#69db7c', '#4dabf7', '#da77f2'];
function roadPath(ctx, c) {
    ctx.beginPath();
    c.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
}
function render(ctx, sim) {
    ctx.fillStyle = '#0f1218';
    ctx.fillRect(0, 0, W, H);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (!sim.center) {
        if (sim.raw.length > 1) {
            roadPath(ctx, sim.raw);
            ctx.strokeStyle = '#5ee1c8';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        return;
    }
    const c = sim.center;
    roadPath(ctx, c);
    ctx.strokeStyle = '#6b7a90';
    ctx.lineWidth = ROAD_W + 6;
    ctx.stroke();
    roadPath(ctx, c);
    ctx.strokeStyle = '#262c36';
    ctx.lineWidth = ROAD_W;
    ctx.stroke();
    roadPath(ctx, c);
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 14]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (sim.mode !== 'work')
        return;
    // Start- und Zielblock
    const block = (p, color, label, invalid) => {
        ctx.fillStyle = color;
        ctx.strokeStyle = invalid ? '#ff3b3b' : '#fff';
        ctx.lineWidth = invalid ? 4 : 2;
        ctx.fillRect(p.x - 14, p.y - 14, 28, 28);
        ctx.strokeRect(p.x - 14, p.y - 14, 28, 28);
        ctx.fillStyle = '#fff';
        ctx.font = '12px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(label, p.x, p.y - 20);
    };
    const d = sim.drag;
    block(d && d.which === 's' ? (d.valid ? c[sim.si] : d) : c[sim.si], '#2fbf71', 'Start', !!d && d.which === 's' && !d.valid);
    block(d && d.which === 'g' ? (d.valid ? c[sim.gi] : d) : c[sim.gi], '#e5484d', 'Ziel', !!d && d.which === 'g' && !d.valid);
    // Auto + Sensoren
    const tr = sim.trainer;
    let pose = null, sense = null;
    if (tr && sim.replay) {
        const f = sim.replay.frames, k = Math.min(sim.replay.i, f.length / 3 - 1) * 3;
        pose = { x: f[k], y: f[k + 1], a: f[k + 2] };
        sense = tr.env.sensors(pose);
    }
    else if (tr) {
        pose = tr.env.car;
        sense = tr.env.sense;
    }
    if (!pose || !sense)
        return;
    sense.hits.forEach((h, i) => {
        ctx.strokeStyle = SENSOR_COLORS[i];
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pose.x, pose.y);
        ctx.lineTo(h.x, h.y);
        ctx.stroke();
        ctx.fillStyle = SENSOR_COLORS[i];
        ctx.beginPath();
        ctx.arc(h.x, h.y, 3.5, 0, 7);
        ctx.fill();
    });
    ctx.save();
    ctx.translate(pose.x, pose.y);
    ctx.rotate(pose.a);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(-10, -6, 20, 12);
    ctx.fillStyle = '#1b1f27';
    ctx.fillRect(1, -4, 6, 8);
    ctx.restore();
}
export function Stage({ sim, onStroke }) {
    const ref = useRef(null);
    useEffect(() => {
        const ctx = ref.current.getContext('2d');
        let raf = 0, last = 0;
        const loop = (t) => {
            const tr = sim.trainer;
            if (sim.replay) {
                sim.replay.i += 2;
                if (sim.replay.i * 3 >= sim.replay.frames.length)
                    sim.replay = null;
            }
            else if (tr && tr.status === 'running')
                tr.tick(tr.settings.speed, 14);
            if (t - last > 100) {
                last = t;
                sim.onTick();
            }
            render(ctx, sim);
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [sim]);
    const xy = (e) => {
        const r = ref.current.getBoundingClientRect();
        return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
    };
    const down = (e) => {
        if (e.button !== 0)
            return;
        const p = xy(e);
        if (sim.mode === 'draw') {
            sim.center = null;
            sim.raw = [p];
            ref.current.setPointerCapture(e.pointerId);
        }
        else if (sim.center && !sim.trainer) { // Blöcke nur vor Trainingsbeginn verschiebbar
            const hit = (i) => Math.hypot(sim.center[i].x - p.x, sim.center[i].y - p.y) < 22;
            const which = hit(sim.si) ? 's' : hit(sim.gi) ? 'g' : null;
            if (which) {
                sim.drag = { which, x: p.x, y: p.y, valid: true };
                ref.current.setPointerCapture(e.pointerId);
            }
        }
    };
    const move = (e) => {
        const p = xy(e);
        if (sim.mode === 'draw' && sim.raw.length && !sim.center && e.buttons) {
            const l = sim.raw[sim.raw.length - 1];
            if (Math.hypot(l.x - p.x, l.y - p.y) > 2)
                sim.raw.push(p);
        }
        else if (sim.drag && sim.center) {
            const n = nearestIndex(sim.center, p.x, p.y);
            const valid = n.dist <= ROAD_W / 2;
            sim.drag = { ...sim.drag, x: p.x, y: p.y, valid };
            if (valid) {
                if (sim.drag.which === 's')
                    sim.si = n.idx;
                else
                    sim.gi = n.idx;
            }
        }
    };
    const up = () => {
        if (sim.mode === 'draw' && sim.raw.length > 1 && !sim.center)
            onStroke(sim.raw);
        sim.drag = null;
    };
    return _jsx("canvas", { ref: ref, width: W, height: H, onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up });
}
