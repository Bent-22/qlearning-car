// Trainingssteuerung: Episoden, Statistik, beste Fahrt.
import { Env } from './env.js';
import { QAgent } from './qlearning.js';
export const EPS_MIN = 0.05;
export class Trainer {
    constructor(mask, path, settings, snap) {
        this.status = 'idle';
        this.episode = 0;
        this.successes = 0;
        this.failures = 0;
        this.outcomes = [];
        this.bestRun = null; // flache Liste x,y,winkel je Schritt
        this.bestProgress = 0;
        this.lastReward = 0;
        this.needsSave = false;
        this.s = 0;
        this.rec = [];
        this.epReward = 0;
        this.lastHint = 0;
        this.settings = { ...settings };
        this.env = new Env(mask, path);
        this.agent = new QAgent(settings.alpha, settings.gamma);
        this.epsilon = settings.epsilon;
        if (snap) {
            this.episode = snap.episode;
            this.epsilon = snap.epsilon;
            this.successes = snap.successes;
            this.failures = snap.failures;
            this.outcomes = snap.outcomes.slice();
            this.bestRun = snap.bestRun ? snap.bestRun.slice() : null;
            this.bestProgress = snap.bestProgress;
            this.lastReward = snap.lastReward;
            for (const k of Object.keys(snap.q))
                this.agent.q.set(Number(k), snap.q[k].slice());
        }
        this.begin();
    }
    begin() {
        this.s = this.env.reset();
        this.rec = [this.env.car.x, this.env.car.y, this.env.car.a];
        this.epReward = 0;
    }
    stepOnce() {
        const a = this.agent.act(this.s, this.epsilon);
        const r = this.env.step(a);
        const s2 = this.env.stateKey();
        this.agent.update(this.s, a, r.reward, s2, r.done);
        this.rec.push(this.env.car.x, this.env.car.y, this.env.car.a);
        this.epReward += r.reward;
        this.s = s2;
        if (r.done)
            this.endEpisode(r.success);
    }
    endEpisode(ok) {
        this.episode++;
        this.outcomes.push(ok ? 1 : 0);
        if (ok)
            this.successes++;
        else
            this.failures++;
        this.epsilon = Math.max(EPS_MIN, this.epsilon * this.settings.decay);
        this.bestProgress = Math.max(this.bestProgress, this.env.bestIdx / (this.env.path.length - 1));
        this.lastReward = this.epReward;
        if (ok && (!this.bestRun || this.rec.length < this.bestRun.length))
            this.bestRun = this.rec.slice();
        const now = Date.now();
        if (this.episode % 25 === 0 || (ok && now - this.lastHint > 5000)) {
            this.needsSave = true;
            this.lastHint = now;
        }
        if (this.episode >= this.settings.episodes)
            this.finish();
        else
            this.begin();
    }
    /** Führt bis zu maxSteps Lernschritte aus (begrenzt durch ein Zeitbudget, damit die UI flüssig bleibt). */
    tick(maxSteps, budgetMs) {
        const t0 = performance.now();
        for (let n = 0; n < maxSteps && this.status === 'running'; n++) {
            this.stepOnce();
            if ((n & 63) === 63 && performance.now() - t0 > budgetMs)
                break;
        }
    }
    pause() { if (this.status === 'running') {
        this.status = 'paused';
        this.needsSave = true;
    } }
    resume() { if (this.status === 'paused')
        this.status = 'running'; }
    finish() { this.status = 'finished'; this.needsSave = true; }
    getStats() {
        const last = this.outcomes.slice(-100);
        return {
            status: this.status, episode: this.episode, total: this.settings.episodes,
            successes: this.successes, failures: this.failures,
            rate100: last.length ? last.reduce((a, b) => a + b, 0) / last.length : 0,
            epsilon: this.epsilon, bestProgress: this.bestProgress, lastReward: this.lastReward,
            states: this.agent.q.size, bestSteps: this.bestRun ? this.bestRun.length / 3 - 1 : 0,
            outcomes: this.outcomes,
        };
    }
}
