// Mode démo : championnat fictif généré localement (aucun serveur).
// Seul le SCABB garde son nom ; les 19 autres équipes et leurs joueurs sont inventés.
import LNB from "./lnb.js";
import { buildStats } from "./report-lib.js";
import { gameDetail, profiles, scoutData, evolution, isScabb, compact, hydrate } from "./league-lib.js";

const SCABB = "SCABB Saint-Étienne-Métropole";
const US = [["9","TIMOTHÉ VERGIAT",1],["13","JUBRILE BELO",1],["12","TAVON KING",1],["15","SEAN SMITH",1],["77","PAPE DIOP",1],
  ["21","ABDOULAYE LOUM",0],["29","ROBIN DUCOTÉ",0],["84","MAËL HAMON-CRESPIN",0],["7","MAXIM EUGENE",0],["3","SÉBASTIEN CAPE",0]];
const NAMES = ["Alpha","Bravo","Charlie","Delta","Echo","Foxtrot","Golf","Hotel","India","Juliet","Kilo","Lima","Mike","November","Oscar","Papa","Quebec","Romeo","Sierra"];
const PRENOMS = ["LUCAS","HUGO","NOAH","ADAM","LÉO","JULES","THÉO","ENZO","NATHAN","TOM"];
function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const TEAMS = [{ name: SCABB, roster: US, str: 0.0 }, ...NAMES.map((n, i) => ({ name: "Démo " + n, str: ((i * 37) % 19 - 9) / 300,
  roster: PRENOMS.map((p, k) => [String(k * 3 + 4), `${p} ${n.toUpperCase()}${k}`, k < 5 ? 1 : 0]) }))];

/** Match fictif (Boxscore + Play by play) jusqu'à `upTo` secondes. */
export function demoGame(upTo = 2400, seed = 7, H = TEAMS[0], A = TEAMS[18]) {
  const R = rng(seed);
  const mk = T => ({ name: T.name.toUpperCase(), players: T.roster.map(([num, nm, st]) => ({ num, name: nm, starter: !!st, key: num + "|" + LNB.norm(nm), dnp: false })) });
  const box = [mk(H), mk(A)];
  const on = [box[0].players.filter(p => p.starter), box[1].players.filter(p => p.starter)];
  const bench = [box[0].players.filter(p => !p.starter), box[1].players.filter(p => !p.starter)];
  const ev = []; let h = 0, a = 0, t = 0, side = 0, idx = 0;
  const push = (p, type, tt) => { const per = tt < 2400 ? Math.min(4, Math.floor(tt / 600) + 1) : 5; const rem = per <= 4 ? per * 600 - tt : 2700 - tt;
    const clock = `Q${per} ${String(Math.floor(rem / 60)).padStart(2, "0")}:${String(rem % 60).padStart(2, "0")}`;
    ev.push({ per, rem, t: tt, clock, num: p ? p.num : null, name: p ? p.name : null, key: p ? p.key : null, type, h, a, idx: idx++ }); };
  let nextSub = 150; const end = Math.min(upTo, 2400);
  while (t < end) {
    t += 6 + Math.floor(R() * 12); if (t >= end) break;
    if (t >= nextSub) { for (const s of [0, 1]) { const i = Math.floor(R() * 5), j = Math.floor(R() * bench[s].length); const out = on[s][i], inn = bench[s][j];
      on[s][i] = inn; bench[s][j] = out; push(inn, "Remplacement entrant", t); push(out, "Remplacement sortant", t); } nextSub = t + 110 + Math.floor(R() * 130); }
    const p = on[side][Math.floor(R() * 5)], q = R(), bias = (side === 0 ? H.str + 0.015 : A.str);
    const addP = n => { if (side === 0) h += n; else a += n; };
    if (q < 0.15 - bias) push(p, "Balle Perdue - Mauvaise Passe", t);
    else if (q < 0.48 + bias) { const three = R() < 0.37; addP(three ? 3 : 2); push(p, three ? "3 pts Jump Shot réussi" : "2 pts Layup réussi", t);
      if (R() < 0.6) push(on[side][Math.floor(R() * 5)], "Passe Décisive", t); }
    else if (q < 0.9) { const three = R() < 0.42; push(p, three ? "3 pts Jump Shot raté" : "2 pts Jump Shot raté", t);
      if (R() < 0.28) { push(on[side][Math.floor(R() * 5)], "Rebond Offensif", t + 1); continue; } push(on[1 - side][Math.floor(R() * 5)], "Rebond Défensif", t + 1); }
    else { push(on[1 - side][Math.floor(R() * 5)], "Faute Personnelle", t); const m1 = R() < 0.74, m2 = R() < 0.74; if (m1) addP(1); push(p, `Lancer franc 1 sur 2 ${m1 ? "réussi" : "raté"}`, t); if (m2) addP(1); push(p, `Lancer franc 2 sur 2 ${m2 ? "réussi" : "raté"}`, t); }
    side = 1 - side;
  }
  if (upTo >= 2400 && h === a) { h += 2; push(on[0][0], "2 pts Layup réussi", 2399); }
  ev.sort((x, y) => x.t - y.t || x.idx - y.idx);
  // statistiques individuelles du boxscore (déduites du Play by play)
  const A2 = LNB.analyse(box, ev);
  box.forEach((tm, ti) => { tm.players.forEach(p => { const q = A2.res[ti].players.find(x => x.key === p.key); const s = (q && q.box) || {};
    Object.assign(p, { pts: s.pts || 0, f2m: (s.fgm || 0) - (s.tpm || 0), f2a: (s.fga || 0) - (s.tpa || 0), tpm: s.tpm || 0, tpa: s.tpa || 0, ftm: s.ftm || 0, fta: s.fta || 0,
      orb: 0, drb: s.reb || 0, ast: s.ast || 0, stl: s.stl || 0, blk: 0, tov: s.tov || 0, pf: s.fouls || 0, pm: q ? q.pm : 0, eval: (s.pts || 0) + (s.reb || 0) + (s.ast || 0) - (s.tov || 0), bmin: q ? q.min : 0 }); });
    const T = A2.res[ti].team; tm.total = { pts: T.pf, fgm: T.fgm, fga: T.fga, tpm: T.tpm, tpa: T.tpa, ftm: T.ftm, fta: T.fta, orb: T.orb, drb: T.drb, ast: T.ast, tov: T.tov, stl: T.stl, blk: T.blk, pf: T.fouls }; });
  const fin = upTo >= 2400;
  return { box, events: ev, us: isScabb(H.name) ? 0 : 1, meta: { status: fin ? "TERMINÉ" : `QT${ev.length ? ev[ev.length - 1].per : 1}`, final: fin, date: null, comp: "ÉLITE 2" } };
}
/** Calendrier aller-retour (méthode du cercle) : 38 journées */
function schedule() {
  const n = TEAMS.length, idx = [...Array(n).keys()], rounds = [];
  for (let r = 0; r < n - 1; r++) { const pairs = []; for (let i = 0; i < n / 2; i++) { const a = idx[i], b = idx[n - 1 - i]; pairs.push(r % 2 ? [b, a] : [a, b]); } rounds.push(pairs); idx.splice(1, 0, idx.pop()); }
  return [...rounds, ...rounds.map(r => r.map(([a, b]) => [b, a]))];
}
const addDays = (iso, d) => { const x = new Date(iso + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
function buildLeague() {
  const games = [];
  schedule().forEach((pairs, r) => {
    const date = addDays("2026-09-25", r * 7);
    pairs.forEach(([a, b], k) => {
      const H = TEAMS[a], A = TEAMS[b];
      const g = { id: `demo-J${r + 1}-${k}`, journee: r + 1, date, time: "20:00", home: H.name, away: A.name, status: "prevu", home_pts: null, away_pts: null, detail: null };
      if (date < today()) { const G = demoGame(2400, (r + 1) * 1000 + k * 7 + 3, H, A); g.detail = gameDetail(G.box, G.events); g._raw = G;
        g.home_pts = G.events[G.events.length - 1].h; g.away_pts = G.events[G.events.length - 1].a; g.status = "termine"; }
      games.push(g);
    });
  });
  return games;
}
const AI = {
  mt: { resume: "Texte d'exemple : dans l'application réelle, Claude rédige ici la synthèse de la 1re mi-temps à partir des chiffres.", qt1: "Lecture du 1er QT (exemple).", qt2: "Lecture du 2e QT (exemple).",
    positifs: ["Point positif chiffré (exemple)", "Point positif chiffré (exemple)", "Point positif chiffré (exemple)"], negatifs: ["Point à corriger (exemple)", "Point à corriger (exemple)", "Point à corriger (exemple)"],
    lineups: "Cinq à privilégier / à éviter (exemple).", ajustements: ["Ajustement 2e mi-temps (exemple)", "Ajustement (exemple)", "Ajustement (exemple)"] },
  final: { resume: "Texte d'exemple : dans l'application réelle, Claude rédige ici la synthèse du match.", qt: { Q1: "Lecture QT1 (exemple).", Q2: "Lecture QT2 (exemple).", Q3: "Lecture QT3 (exemple).", Q4: "Lecture QT4 (exemple)." },
    positifs: ["Point positif (exemple)", "Point positif (exemple)", "Point positif (exemple)"], negatifs: ["Point négatif (exemple)", "Point négatif (exemple)", "Point négatif (exemple)"], lineups: "Cinq à retenir / à éviter (exemple).",
    axes: ["Axe d'amélioration (exemple)", "Axe (exemple)", "Axe (exemple)"], entrainement: [{ theme: "Protection de balle", exercice: "3c2 tout-terrain avec trappe (exemple)", objectif: "< 13 % de pertes", duree: "15 min" }],
    joueurs: [{ joueur: "#9 Vergiat", note: "Note joueur (exemple)." }] },
  scout: { resume: "Texte d'exemple : Claude décrit ici l'identité de jeu de l'adversaire à partir de ses chiffres et de ses rangs.", forces: ["Force chiffrée (exemple)", "Force (exemple)"], faiblesses: ["Faiblesse à exploiter (exemple)", "Faiblesse (exemple)"],
    joueurs_cles: [{ joueur: "#4 Joueur clé", profil: "Profil chiffré (exemple)", consigne: "Consigne défensive (exemple)" }], plan_defensif: ["Consigne défensive (exemple)"], plan_offensif: ["Consigne offensive (exemple)"],
    cles_du_match: ["Objectif chiffré (exemple)"], entrainement: [{ theme: "Défense pick-and-roll", exercice: "2c2 + aides (exemple)", objectif: "Contester 100 % des tirs", duree: "15 min" }] },
  season: { resume: "Texte d'exemple : Claude analyse ici la trajectoire du SCABB depuis le début de saison.", positifs: ["Point positif durable (exemple)"], negatifs: ["Point négatif récurrent (exemple)"], tendances: ["Tendance récente (exemple)"],
    joueurs: [{ joueur: "#9 Vergiat", bilan: "Bilan chiffré (exemple)", axe: "Axe individuel (exemple)" }], lineups: "Cinq à installer / à éviter (exemple).", axes_staff: ["Axe de travail staff (exemple)"],
    plan_semaine: [{ seance: "Mardi", contenu: "Contenu de séance (exemple)", objectif: "Objectif mesurable (exemple)" }] }
};

export function demoApi() {
  const league = buildLeague();
  const matches = league.filter(g => isScabb(g.home) || isScabb(g.away)).map(g => ({ id: "m-" + g.id, lnb_key: g.id, journee: g.journee, date: g.date, time: g.time,
    opp: isScabb(g.home) ? g.away : g.home, loc: isScabb(g.home) ? "Dom" : "Ext", comp: "Élite 2", status: g.status,
    final: g.detail ? { us: g.detail.teams[isScabb(g.home) ? 0 : 1].total, op: g.detail.teams[isScabb(g.home) ? 1 : 0].total } : null }));
  const next = matches.filter(m => m.status !== "termine").sort((a, b) => a.date.localeCompare(b.date))[0];
  const live = {};
  if (next) { const g = league.find(x => x.id === next.lnb_key); const H = TEAMS.find(t => t.name === g.home), A = TEAMS.find(t => t.name === g.away);
    next.status = "live"; live[next.id] = { match_id: next.id, ...demoGame(1500, 99, H, A), worker_status: "ok", worker_msg: "Démo : match fictif en cours (3e QT)", updated_at: new Date().toISOString() }; }
  const reports = []; const subs = new Set(); const ping = w => subs.forEach(f => f(w));
  const strip = g => { const { _raw, ...rest } = g; return rest; };
  return {
    demo: true,
    async session() { return { user: { email: "demo" } }; }, async login() {}, async logout() {},
    async matches() { return matches.slice().sort((x, y) => y.date.localeCompare(x.date)); },
    async league() { return league.map(strip); },
    async snapshot() { return this._snap || (this._snap = compact(profiles(league))); },
    async leagueState() { return { status: "ok", msg: "Démo : championnat fictif (19 équipes inventées + SCABB)", updated_at: new Date().toISOString() }; },
    async live(id) { return live[id] || null; },
    async reports(id) { return reports.filter(r => r.match_id === id).sort((x, y) => y.created_at.localeCompare(x.created_at)); },
    async teamReports(kind, subject) { return reports.filter(r => r.kind === kind && (!subject || r.subject === subject)).sort((x, y) => y.created_at.localeCompare(x.created_at)); },
    async startLive(id) { const m = matches.find(x => x.id === id); const g = league.find(x => x.id === m.lnb_key); const H = TEAMS.find(t => t.name === g.home), A = TEAMS.find(t => t.name === g.away);
      live[id] = { match_id: id, ...demoGame(900 + Math.floor(Math.random() * 1400), Math.floor(Math.random() * 9999), H, A), worker_status: "ok", worker_msg: "Démo : données fictives", updated_at: new Date().toISOString() }; m.status = "live"; ping("live"); },
    async stopLive(id) { if (live[id]) { live[id].worker_status = "stopped"; live[id].worker_msg = "Suivi arrêté."; } ping("live"); },
    async syncLeague() { return { ok: true, demo: true }; },
    async makeReport(id, kind, subject) {
      let stats;
      if (kind === "scout") stats = { kind, scout: scoutData(hydrate(await this.snapshot()), subject, SCABB), subject };
      else if (kind === "season") stats = { kind, evo: evolution(hydrate(await this.snapshot()), SCABB) };
      else { const m = matches.find(x => x.id === id); const g = league.find(x => x.id === m.lnb_key);
        const src = live[id] || g._raw; if (!src) throw new Error("Pas encore de données pour ce match.");
        stats = buildStats({ box: src.box, ev: src.events, us: src.us, kind, match: m, season: matches.filter(x => x.status === "termine" && x.final && x.date < m.date) }); }
      const r = { id: "r" + Date.now(), match_id: id || null, kind, subject: subject || null, stats, ai: AI[kind], model: "démo", error: null, created_at: new Date().toISOString() };
      reports.push(r); ping("reports"); return r;
    },
    subscribe(id, cb) { subs.add(cb); return () => subs.delete(cb); }
  };
}
