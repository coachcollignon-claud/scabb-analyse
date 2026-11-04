/* Calculs des rapports (mi-temps / fin de match) et de la saison.
   Utilisé par l'app (web), le robot (worker) et la fonction Supabase "report".
   Source unique : shared/report-lib.js (copiée par tools/sync.sh). */
import LNB from "./lnb.js";

const KEYS = ["pts","fgm","fga","tpm","tpa","ftm","fta","orb","drb","ast","tov","stl","blk","pf"];
const r3 = v => v == null || !isFinite(v) ? null : Math.round(v * 1000) / 1000;
const r1 = v => v == null || !isFinite(v) ? null : Math.round(v * 10) / 10;

export const WINDOWS = {
  Q1: { label: "1er quart-temps", a: 0, b: 600 },
  Q2: { label: "2e quart-temps", a: 600, b: 1200 },
  Q3: { label: "3e quart-temps", a: 1200, b: 1800 },
  Q4: { label: "4e quart-temps", a: 1800, b: 2400 },
  OT: { label: "Prolongation(s)", a: 2400, b: Infinity },
  H1: { label: "1re mi-temps", a: 0, b: 1200 },
  H2: { label: "2e mi-temps", a: 1200, b: Infinity },
  ALL: { label: "Match complet", a: 0, b: Infinity }
};

function teamSummary(t) {
  return { pts: t.pf, pa: t.pa, poss: r1(t.poss), ortg: r1(t.ortg), drtg: r1(t.drtg), net: r1(t.net),
    efg: r3(t.efg), ts: r3(t.ts), tovp: r3(t.tovp), orbp: r3(t.orbp), drbp: r3(t.drbp), ftr: r3(t.ftr), p3: r3(t.p3), ftp: r3(t.ftp),
    fgm: t.fgm, fga: t.fga, tpm: t.tpm, tpa: t.tpa, ftm: t.ftm, fta: t.fta, orb: t.orb, drb: t.drb, ast: t.ast, tov: t.tov, stl: t.stl, blk: t.blk, fouls: t.fouls,
    o_efg: r3(t.oefg), o_tovp: r3(t.otovp) };
}
function unitSummary(u) {
  return { players: u.players.map(LNB.pName), min: r1(u.min), pf: u.pf, pa: u.pa, pm: u.pm, poss: r1(u.poss), net: u.poss >= 5 ? r1(u.net) : null,
    efg: r3(u.efg), oefg: r3(u.oefg), tov: u.tov, orb: u.orb, current: !!u.current };
}
function playerSummary(p) {
  const s = p.box || {};
  return { name: LNB.pName(p.info), min: r1(p.min), pts: s.pts || 0, fgm: s.fgm || 0, fga: s.fga || 0, tpm: s.tpm || 0, tpa: s.tpa || 0, ftm: s.ftm || 0, fta: s.fta || 0,
    reb: s.reb || 0, ast: s.ast || 0, tov: s.tov || 0, stl: s.stl || 0, fouls: s.fouls || 0, pm: p.pm };
}
/* Lineups : meilleurs / moins bons cinq sur une fenêtre (min. 2 minutes) */
export function lineups(A, us, minSec = 120) {
  const units = A.res[us].units.filter(u => u.sec >= minSec);
  const score = u => u.pm * 100 + (u.poss >= 5 ? u.net : 0) / 10;
  const sorted = units.slice().sort((x, y) => score(y) - score(x));
  const best = sorted.filter(u => u.pm > 0 || (u.pm === 0 && u.net > 0)).slice(0, 3);
  const worst = sorted.slice().reverse().filter(u => u.pm < 0 || (u.pm === 0 && u.net < 0)).slice(0, 3);
  const byMin = units.slice().sort((x, y) => y.sec - x.sec).slice(0, 8);
  return { best: best.map(unitSummary), worst: worst.map(unitSummary), most: byMin.map(unitSummary) };
}
export function windowStats(box, ev, us, key) {
  const w = WINDOWS[key]; const A = LNB.analyse(box, ev, w.a, w.b);
  const U = A.res[us], O = A.res[1 - us];
  if (U.team.sec <= 0) return null;
  return { key, label: w.label, us: teamSummary(U.team), op: teamSummary(O.team), min: r1(U.team.sec / 60) };
}
/* Totaux d'un match (format "matches.final") depuis le Play by play */
export function finalFromLive(box, ev, us) {
  const A = LNB.analyse(box, ev), U = A.res[us], O = A.res[1 - us];
  const conv = t => ({ pts: t.pf, fgm: t.fgm, fga: t.fga, tpm: t.tpm, tpa: t.tpa, ftm: t.ftm, fta: t.fta, orb: t.orb, drb: t.drb, ast: t.ast, tov: t.tov, stl: t.stl, blk: t.blk, pf: t.fouls });
  return { us: conv(U.team), op: conv(O.team), periods: LNB.periods(ev),
    players: U.players.filter(p => p.info).map(p => ({ num: p.info.num, nom: LNB.lastName(p.info.name), min: r1(p.min), pts: p.box.pts || 0, reb: p.box.reb || 0, pd: p.box.ast || 0, bp: p.box.tov || 0, pm: p.pm })) };
}
/* ---- Saison (matchs terminés, format final {us, op}) ---- */
const poss = t => t.fga + 0.44 * t.fta - t.orb + t.tov;
export function seasonAgg(list) {
  if (!list.length) return null;
  const S = side => { const o = {}; KEYS.forEach(k => o[k] = list.reduce((s, m) => s + (+m.final[side][k] || 0), 0)); return o; };
  const u = S("us"), o = S("op"), n = list.length; const p = (poss(u) + poss(o)) / 2;
  const f = (a, b, pp) => ({ efg: r3((a.fgm + .5 * a.tpm) / a.fga), ts: r3(a.pts / (2 * (a.fga + .44 * a.fta))), tovp: r3(a.tov / pp), orbp: r3(a.orb / (a.orb + b.drb)), drbp: r3(a.drb / (a.drb + b.orb)),
    ftr: r3(a.ftm / a.fga), p3: r3(a.tpm / a.tpa), ftp: r3(a.ftm / a.fta) });
  return { n, wins: list.filter(m => m.final.us.pts > m.final.op.pts).length, pts: r1(u.pts / n), pa: r1(o.pts / n), poss: r1(p / n),
    ortg: r1(100 * u.pts / p), drtg: r1(100 * o.pts / p), net: r1(100 * (u.pts - o.pts) / p), us: f(u, o, poss(u)), op: f(o, u, poss(o)),
    ast: r1(u.ast / n), tov: r1(u.tov / n), stl: r1(u.stl / n), fouls: r1(u.pf / n) };
}
/* ---- Statistiques complètes d'un rapport ---- */
export function buildStats({ box, ev, us, kind, match, season }) {
  const keys = kind === "mt" ? ["Q1", "Q2", "H1"] : ["Q1", "Q2", "Q3", "Q4", "OT", "H1", "H2", "ALL"];
  const windows = {}; keys.forEach(k => { const w = windowStats(box, ev, us, k); if (w) windows[k] = w; });
  const main = kind === "mt" ? "H1" : "ALL"; const mw = WINDOWS[main];
  const A = LNB.analyse(box, ev, mw.a, mw.b);
  const full = LNB.analyse(box, ev);
  const last = ev[ev.length - 1] || {};
  const lu = lineups(A, us);
  const players = A.res[us].players.filter(p => p.info && p.sec > 0).sort((x, y) => y.sec - x.sec).map(playerSummary);
  const opPlayers = A.res[1 - us].players.filter(p => p.info && p.sec > 0).sort((x, y) => (y.box.pts || 0) - (x.box.pts || 0)).slice(0, 5).map(playerSummary);
  const prev = (season || []).filter(m => m.final && m.final.us && m.final.op && (!match || m.id !== match.id) && (!match || !match.date || m.date < match.date));
  return {
    kind, generatedAt: new Date().toISOString(),
    match: match ? { id: match.id, date: match.date, opp: match.opp, loc: match.loc, comp: match.comp } : null,
    teams: { us: box[us].name, op: box[1 - us].name, usShort: LNB.shortTeam(box[us].name), opShort: LNB.shortTeam(box[1 - us].name), home: us === 0 ? "us" : "op" },
    score: { us: full.score[us], op: full.score[1 - us], clock: last.clock || "", periods: LNB.periods(ev).map(p => ({ per: p.per, us: us === 0 ? p.h : p.a, op: us === 0 ? p.a : p.h })) },
    windows, mainWindow: main, lineups: lu, players, opPlayers,
    onCourt: full.res[us].onNow.map(LNB.pName),
    season: seasonAgg(prev)
  };
}
/* ---- Prompt pour Claude ---- */
export function buildPrompt(stats) {
  const s = stats, mt = s.kind === "mt";
  const ctx = `Tu es l'analyste vidéo/statistique du staff de ${s.teams.usShort} (basket, championnat ${s.match && s.match.comp || "Élite 2"}, France). Le préparateur physique et coach du staff lira ton rapport sur son téléphone ${mt ? "pendant la mi-temps" : "juste après le match"}.
Match : ${s.teams.us} contre ${s.teams.op} (${s.teams.home === "us" ? "à domicile" : "à l'extérieur"}). Score : ${s.score.us}-${s.score.op} (${s.score.clock}).
Scores par période (nous-adversaire) : ${s.score.periods.map(p => `P${p.per} ${p.us}-${p.op}`).join(", ")}.
Statistiques par période (us = nous, op = adversaire ; efg, ts, tovp, orbp, drbp, ftr, p3, ftp en proportions ; ortg/drtg/net pour 100 possessions) :
${JSON.stringify(s.windows)}
Cinq les plus efficaces (${mt ? "1re mi-temps" : "match"}) : ${JSON.stringify(s.lineups.best)}
Cinq les moins efficaces : ${JSON.stringify(s.lineups.worst)}
Cinq les plus utilisés : ${JSON.stringify(s.lineups.most)}
Nos joueurs : ${JSON.stringify(s.players)}
Joueurs adverses les plus dangereux : ${JSON.stringify(s.opPlayers)}
${s.season ? `Nos moyennes sur les ${s.season.n} matchs précédents de la saison (${s.season.wins} victoires) : ${JSON.stringify(s.season)}` : "Pas encore de moyennes de saison."}
Repères Élite 2 : eFG% ≥ 52 %, TOV% ≤ 13 %, ORB% ≥ 32 %, DRB% ≥ 74 %, FTr ≥ 0,25.`;
  const rules = `Règles : français, ton direct de staff, phrases de 20 mots maximum, chaque point appuyé sur au moins un chiffre précis tiré des données (cite le quart-temps ou le cinq concerné). Pas de généralités. N'invente aucun chiffre.`;
  const shape = mt
    ? `Réponds UNIQUEMENT avec ce JSON :
{"resume":"2 phrases sur la 1re mi-temps","qt1":"1 phrase de lecture du 1er QT","qt2":"1 phrase de lecture du 2e QT","positifs":["3 points"],"negatifs":["3 points"],"lineups":"1 phrase : quel cinq privilégier et lequel éviter","ajustements":["3 ajustements concrets pour la 2e mi-temps (défense, rythme, cinq, fautes, joueur adverse à cibler)"]}`
    : `Réponds UNIQUEMENT avec ce JSON :
{"resume":"3 phrases de synthèse du match","qt":{"Q1":"1 phrase","Q2":"1 phrase","Q3":"1 phrase","Q4":"1 phrase"},"positifs":["4 points"],"negatifs":["4 points"],"lineups":"1 à 2 phrases sur les cinq à retenir et à éviter","axes":["3 à 4 axes d'amélioration pour le prochain match"],"entrainement":[{"theme":"thème","exercice":"exercice précis (format, opposition, contraintes)","objectif":"objectif mesurable","duree":"minutes"}],"joueurs":[{"joueur":"#num Nom","note":"1 phrase"}]}
"entrainement" : 4 à 5 contenus pour les séances de la semaine, liés aux faiblesses chiffrées (basket et, si la fin de match baisse, contenu physique/condition). "joueurs" : 3 joueurs à mettre en avant ou à accompagner.`;
  return `${ctx}\n\n${rules}\n\n${shape}`;
}
