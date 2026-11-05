import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Stage } from './components/Stage.js';
import { Progress, SaveList, Sidebar } from './components/Panels.js';
import { ROAD_W, RoadMask, buildCenterline, buildPath, validate } from './core/track.js';
import { Trainer } from './core/trainer.js';
import { deleteSave, downloadSave, listSaves, newId, putSave, validateSave } from './core/storage.js';
const DEF = { alpha: 0.15, gamma: 0.95, epsilon: 1, decay: 0.995, speed: 5, episodes: 1000 };
export default function App() {
    const sim = useRef({ mode: 'draw', raw: [], center: null, si: 0, gi: 0, mask: null, trainer: null, replay: null, drag: null, onTick: () => { } }).current;
    const meta = useRef({ id: '', name: '' });
    const [screen, setScreen] = useState('start');
    const [settings, setSettings] = useState(DEF);
    const [stats, setStats] = useState(null);
    const [rep, setRep] = useState(false);
    const [msg, setMsg] = useState('');
    const [saves, setSaves] = useState([]);
    const [showSaves, setShowSaves] = useState(false);
    const [, force] = useState(0);
    const fileRef = useRef(null);
    sim.mode = screen === 'draw' ? 'draw' : 'work';
    const refreshSaves = async () => {
        try {
            setSaves((await listSaves()).sort((a, b) => b.updatedAt - a.updatedAt));
        }
        catch {
            setMsg('Die Browser-Datenbank (IndexedDB) ist nicht verfügbar.');
        }
    };
    useEffect(() => { refreshSaves(); }, []);
    const toSave = () => {
        const t = sim.trainer;
        return {
            version: 1, id: meta.current.id, name: meta.current.name, updatedAt: Date.now(),
            center: sim.center, roadWidth: ROAD_W, si: sim.si, gi: sim.gi,
            car: t ? { ...t.env.car } : { x: 0, y: 0, a: 0 },
            settings: t ? { ...t.settings } : { ...settings },
            episode: t?.episode ?? 0, epsilon: t?.epsilon ?? settings.epsilon,
            successes: t?.successes ?? 0, failures: t?.failures ?? 0, outcomes: t ? t.outcomes.slice() : [],
            bestRun: t?.bestRun ?? null, bestProgress: t?.bestProgress ?? 0, lastReward: t?.lastReward ?? 0,
            status: t?.status ?? 'idle', q: t ? Object.fromEntries(t.agent.q) : {},
        };
    };
    const persist = async (name) => {
        if (!sim.center)
            return;
        if (!meta.current.id)
            meta.current.id = newId();
        if (name)
            meta.current.name = name;
        if (!meta.current.name)
            meta.current.name = 'Auto-Speicherstand ' + new Date().toLocaleString('de-DE');
        try {
            await putSave(toSave());
            refreshSaves();
        }
        catch {
            setMsg('Speichern fehlgeschlagen.');
        }
    };
    sim.onTick = () => {
        const t = sim.trainer;
        setStats(t ? t.getStats() : null);
        setRep(!!sim.replay);
        if (t && t.needsSave) {
            t.needsSave = false;
            persist();
        }
    };
    const newTrack = () => {
        Object.assign(sim, { raw: [], center: null, mask: null, trainer: null, replay: null, drag: null });
        meta.current = { id: '', name: '' };
        setStats(null);
        setMsg('');
        setScreen('draw');
    };
    const onStroke = (raw) => {
        const c = buildCenterline(raw);
        if (!c) {
            setMsg('Die Linie ist zu kurz – bitte neu zeichnen.');
            sim.raw = [];
            return;
        }
        sim.center = c;
        setMsg('');
    };
    const finishDraw = () => {
        if (!sim.center) {
            setMsg('Bitte zeichne zuerst eine Strecke (linke Maustaste gedrückt halten).');
            return;
        }
        sim.si = Math.floor(sim.center.length * 0.06);
        sim.gi = Math.floor(sim.center.length * 0.94);
        const err = validate(sim.center, sim.si, sim.gi);
        if (err) {
            setMsg(err);
            return;
        }
        sim.mask = new RoadMask(sim.center);
        setMsg('');
        setScreen('work');
    };
    const start = () => {
        const err = validate(sim.center, sim.si, sim.gi);
        if (err || !sim.mask || !sim.center) {
            setMsg(err ?? 'Keine Strecke.');
            return;
        }
        const t = new Trainer(sim.mask, buildPath(sim.center, sim.si, sim.gi), settings);
        t.status = 'running';
        sim.trainer = t;
        setMsg('');
        force(n => n + 1);
    };
    const withT = (f) => () => { if (sim.trainer) {
        f(sim.trainer);
        sim.onTick();
    } };
    const replay = () => { const t = sim.trainer; if (t?.bestRun)
        sim.replay = { frames: t.bestRun, i: 0 }; };
    const load = (sd, mode) => {
        const err = validate(sd.center, sd.si, sd.gi);
        if (err) {
            setMsg(err);
            return;
        }
        sim.center = sd.center;
        sim.si = sd.si;
        sim.gi = sd.gi;
        sim.mask = new RoadMask(sd.center);
        sim.raw = [];
        sim.replay = null;
        sim.drag = null;
        if (mode === 'new' || sd.episode === 0) {
            sim.trainer = null;
            setSettings({ ...sd.settings });
            meta.current = { id: '', name: mode === 'new' ? sd.name + ' (neues Training)' : sd.name };
            if (mode !== 'new')
                meta.current.id = sd.id;
        }
        else {
            const t = new Trainer(sim.mask, buildPath(sd.center, sd.si, sd.gi), sd.settings, sd);
            t.status = sd.episode >= sd.settings.episodes ? 'finished' : mode === 'resume' ? 'running' : 'paused';
            sim.trainer = t;
            setSettings({ ...sd.settings });
            meta.current = { id: sd.id, name: sd.name };
        }
        setStats(sim.trainer ? sim.trainer.getStats() : null);
        setMsg('');
        setScreen('work');
    };
    const rename = async (s) => {
        const n = window.prompt('Neuer Name:', s.name);
        if (n && n.trim()) {
            await putSave({ ...s, name: n.trim() });
            if (meta.current.id === s.id)
                meta.current.name = n.trim();
            refreshSaves();
        }
    };
    const remove = async (s) => { if (window.confirm(`„${s.name}“ wirklich löschen?`)) {
        await deleteSave(s.id);
        refreshSaves();
    } };
    const doImport = async (f) => {
        try {
            const sd = validateSave(JSON.parse(await f.text()));
            sd.id = newId();
            sd.updatedAt = Date.now();
            await putSave(sd);
            await refreshSaves();
            setMsg(`„${sd.name}“ importiert.`);
        }
        catch (e) {
            setMsg(e instanceof Error ? e.message : 'Import fehlgeschlagen.');
        }
    };
    const manualSave = () => {
        const n = window.prompt('Name des Speicherstands:', meta.current.name || 'Rennstrecke 1 – Erste Versuche');
        if (n && n.trim())
            persist(n.trim());
    };
    const exportCurrent = () => { if (!sim.center)
        return; if (!meta.current.name)
        meta.current.name = 'Rennstrecke'; downloadSave({ ...toSave(), id: meta.current.id || newId() }); };
    const home = () => { sim.trainer?.pause(); if (sim.trainer)
        persist(); sim.trainer = null; setScreen('start'); refreshSaves(); };
    const newTraining = () => {
        if (!sim.trainer)
            return;
        const s = { ...sim.trainer.settings };
        sim.trainer = null;
        sim.replay = null;
        meta.current = { id: '', name: '' };
        setSettings(s);
        setStats(null);
    };
    const latest = saves.find(s => s.episode > 0);
    const listProps = { saves, onOpen: (s) => load(s, 'open'), onResume: (s) => load(s, 'resume'), onNew: (s) => load(s, 'new'), onRename: rename, onExport: downloadSave, onDelete: remove };
    if (screen === 'start')
        return (_jsxs("div", { className: "start", children: [_jsx("h1", { children: "Q-Learning Rennstrecke" }), _jsx("p", { children: "Zeichne eine Strecke und sieh zu, wie ein Auto per Q-Learning selbst fahren lernt." }), _jsxs("div", { className: "btns", children: [_jsx("button", { className: "primary big", onClick: newTrack, children: "Neue Strecke zeichnen" }), _jsx("button", { onClick: () => setShowSaves(!showSaves), children: "Gespeicherten Speicherstand laden" }), _jsx("button", { disabled: !latest, onClick: () => latest && load(latest, 'resume'), children: "Vorhandenes Training fortsetzen" }), _jsx("button", { onClick: () => fileRef.current?.click(), children: "JSON importieren" }), _jsx("input", { ref: fileRef, type: "file", accept: "application/json,.json", hidden: true, onChange: e => { const f = e.target.files?.[0]; if (f)
                                doImport(f); e.target.value = ''; } })] }), msg && _jsx("div", { className: "msg inline", children: msg }), showSaves && _jsx(SaveList, { ...listProps })] }));
    return (_jsxs("div", { className: "work", children: [screen === 'work' && (_jsx(Sidebar, { settings: settings, set: setSettings, status: sim.trainer?.status ?? 'idle', hasBest: !!sim.trainer?.bestRun, replaying: rep, hasTrainer: !!sim.trainer, a: { start, pause: withT(t => t.pause()), resume: withT(t => t.resume()), stop: withT(t => t.finish()), replay, save: manualSave, exportSave: exportCurrent, newTraining, home } })), _jsxs("div", { className: "stagewrap", children: [_jsxs("div", { className: "stage", children: [_jsx(Stage, { sim: sim, onStroke: onStroke }), screen === 'draw' && _jsxs(_Fragment, { children: [_jsx("button", { className: "finish primary", onClick: finishDraw, children: "Zeichnen beenden" }), !sim.center && _jsx("div", { className: "hint", children: "Linke Maustaste gedr\u00FCckt halten und die Strecke zeichnen" }), sim.center && _jsx("div", { className: "hint", children: "Stra\u00DFe erstellt \u2013 neu zeichnen oder \u201EZeichnen beenden\u201C klicken" })] }), screen === 'work' && _jsx(Progress, { stats: stats, total: settings.episodes }), screen === 'work' && !sim.trainer && _jsx("div", { className: "hint", children: "Start (gr\u00FCn) und Ziel (rot) per Drag-and-drop auf die Stra\u00DFe ziehen" }), msg && _jsx("div", { className: "msg", onClick: () => setMsg(''), children: msg })] }), screen === 'draw' && _jsx("button", { className: "ghost homebtn", onClick: () => setScreen('start'), children: "Hauptmen\u00FC" })] })] }));
}
