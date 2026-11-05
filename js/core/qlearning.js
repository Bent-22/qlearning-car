// Tabellarisches Q-Learning mit dynamisch wachsender Q-Tabelle.
export class QAgent {
    constructor(alpha, gamma) {
        this.q = new Map();
        this.alpha = alpha;
        this.gamma = gamma;
    }
    row(s) {
        let r = this.q.get(s);
        if (!r) {
            r = [0, 0, 0, 0, 0];
            this.q.set(s, r);
        }
        return r;
    }
    /** Beste bekannte Aktion; bei Gleichstand zufällig. */
    best(s) {
        const r = this.row(s);
        let m = -Infinity, c = [];
        for (let i = 0; i < r.length; i++) {
            if (r[i] > m + 1e-12) {
                m = r[i];
                c = [i];
            }
            else if (Math.abs(r[i] - m) <= 1e-12)
                c.push(i);
        }
        return c[(Math.random() * c.length) | 0];
    }
    /** Epsilon-Greedy: Exploration mit Wahrscheinlichkeit epsilon, sonst Exploitation. */
    act(s, epsilon) {
        return Math.random() < epsilon ? (Math.random() * 5) | 0 : this.best(s);
    }
    /** Q(s,a) <- Q(s,a) + alpha * (r + gamma * max Q(s',a') - Q(s,a)); bei Episodenende ohne Folgewert. */
    update(s, a, r, s2, terminal) {
        const row = this.row(s);
        const future = terminal ? 0 : this.gamma * Math.max(...this.row(s2));
        row[a] += this.alpha * (r + future - row[a]);
    }
}
