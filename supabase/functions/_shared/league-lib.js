/* Analyses du championnat Élite 2 : résumé de match, profils des 20 équipes, rangs,
   classement, joueurs et cinq de la saison, fiche adversaire, évolution du SCABB.
   Source unique : shared/league-lib.js (copiée par tools/sync.sh). */
import LNB from "./lnb.js";

const KEYS = ["pts","fgm","fga","tpm","tpa","ftm","fta","orb","drb","ast","tov","stl","blk","pf"];
const zero = () => Object.fromEntries(KEYS.map(k => [k, 0]));
const add = (a, b) => { KEYS.forEach(k => a[k] += +(b && b[k]) || 0); return a; };
const r1 = v => v == null || !isFinite(v) ? null : Math.round(v * 10) / 10;
const r3 = v => v == null || !isFinite(v) ? null : Math.round(v * 1000) / 1000;
const div = (a, b) => b > 0 ? a / b : null;
export const isScabb = n => /SCABB/i.test(String(n || ""));
export const teamSlug = n => LNB.norm(n).replace(/\s+/g, "-").toLowerCase();
export const short = n => isScabb(n) ? "SCABB" : n;

/* ---------- Résumé d'un match (stocké dans league_games.detail) ---------- */
export function gameDetail(box, ev) {
  const hasEv = !!(ev && ev.length);
  const A = hasEv ? LNB.analyse(box, ev) : null;
  return {
    periods: hasEv ? LNB.periods(ev) : [],
    teams: box.map((tm, ti) => {
      const R = A ? A.res[ti] : null;
      const players = tm.players.filter(p => !p.dnp).map(p => {
        const q = R ? R.players.find(x => x.key === p.key) : null;
        return { key: p.key, num: p.num, name: p.name, starter: p.starter, min: r1(q ? q.min : p.bmin),
          pts: p.pts, fgm: p.f2m + p.tpm, fga: p.f2a + p.tpa, tpm: p.tpm, tpa: p.tpa, ftm: p.ftm, fta: p.fta,
          orb: p.orb, drb: p.drb, ast: p.ast, stl: p.stl, blk: p.blk, tov: p.tov, pf: p.pf, pm: p.pm, eval: p.eval,
          on: q ? { pf: q.pf, pa: q.pa, poss: r1(q.poss) } : null };
      });
      const total = tm.total || players.reduce((a, p) => add(a, p), zero());
      const units = R ? R.units.map(u => ({ k: u.key, p: u.players.map(LNB.pName), sec: Math.round(u.sec), pf: u.pf, pa: u.pa,
        fga: u.fga, fta: u.fta, orb: u.orb, tov: u.tov, fgm: u.fgm, tpm: u.tpm, o_fga: u.o_fga, o_fta: u.o_fta, o_orb: u.o_orb, o_tov: u.o_tov, o_fgm: u.o_fgm, o_tpm: u.o_tpm })) : [];
      return { box_name: tm.name, total, players, units };
    })
  };
}

/* ---------- Indicateurs ---------- */
const poss = t => t.fga + 0.44 * t.fta - t.orb + t.tov;
export function metrics(T, O, n) {
  const pU = poss(T), pO = poss(O), p = (pU + pO) / 2;
  return {
    n, ppg: r1(T.pts / n), oppg: r1(O.pts / n), pace: r1(p / n),
    ortg: r1(div(100 * T.pts, p)), drtg: r1(div(100 * O.pts, p)), net: r1(div(100 * (T.pts - O.pts), p)),
    efg: r3(div(T.fgm + .5 * T.tpm, T.fga)), ts: r3(div(T.pts, 2 * (T.fga + .44 * T.fta))), tovp: r3(div(T.tov, pU)),
    orbp: r3(div(T.orb, T.orb + O.drb)), drbp: r3(div(T.drb, T.drb + O.orb)), ftr: r3(div(T.ftm, T.fga)),
    p3: r3(div(T.tpm, T.tpa)), p3r: r3(div(T.tpa, T.fga)), ftp: r3(div(T.ftm, T.fta)), astr: r3(div(T.ast, T.fgm)),
    stl: r1(T.stl / n), blk: r1(T.blk / n), ast: r1(T.ast / n), tov: r1(T.tov / n), fouls: r1(T.pf / n),
    o_efg: r3(div(O.fgm + .5 * O.tpm, O.fga)), o_tovp: r3(div(O.tov, pO)), o_ftr: r3(div(O.ftm, O.fga)), o_p3: r3(div(O.tpm, O.tpa)), o_p3r: r3(div(O.tpa, O.fga))
  };
}
/* [clé, libellé, format, sens (1 = plus haut c'est mieux, -1 = plus bas, 0 = neutre), groupe] */
export const METRICS = [
  ["net", "Net rating", "s1", 1, "g"], ["ortg", "Offensive rating", "d1", 1, "o"], ["drtg", "Defensive rating", "d1", -1, "d"], ["pace", "Rythme (poss./match)", "d1", 0, "g"],
  ["ppg", "Points marqués", "d1", 1, "o"], ["oppg", "Points encaissés", "d1", -1, "d"],
  ["efg", "eFG%", "p", 1, "o"], ["ts", "TS%", "p", 1, "o"], ["tovp", "TOV% (pertes)", "p", -1, "o"], ["orbp", "ORB% (rebond off.)", "p", 1, "o"],
  ["ftr", "FTr (LF / tir)", "d2", 1, "o"], ["p3", "3 pts %", "p", 1, "o"], ["p3r", "Part des tirs à 3", "p", 0, "o"], ["ftp", "LF %", "p", 1, "o"], ["astr", "Passes déc. / panier", "d2", 1, "o"],
  ["o_efg", "eFG% adverse", "p", -1, "d"], ["o_tovp", "Pertes provoquées (TOV% adv.)", "p", 1, "d"], ["drbp", "DRB% (rebond déf.)", "p", 1, "d"], ["o_ftr", "FTr adverse", "d2", -1, "d"],
  ["o_p3", "3 pts % adverse", "p", -1, "d"], ["stl", "Interceptions", "d1", 1, "d"], ["blk", "Contres", "d1", 1, "d"]
];
export const finished = games => (games || []).filter(g => g.status === "termine" && g.detail && g.detail.teams && g.detail.teams.length === 2);

/* ---------- Profils des équipes ---------- */
export function profiles(games) {
  const G = finished(games).slice().sort((a, b) => (a.date + a.journee).localeCompare(b.date + b.journee));
  const teams = {};
  const T = name => teams[name] = teams[name] || { name, games: [], w: 0, l: 0, hw: 0, hl: 0, aw: 0, al: 0, pf: 0, pa: 0, tot: zero(), opp: zero(), players: {}, units: {} };
  for (const g of G) {
    [0, 1].forEach(side => {
      const name = side === 0 ? g.home : g.away, oname = side === 0 ? g.away : g.home, t = T(name);
      const me = g.detail.teams[side], op = g.detail.teams[1 - side];
      const pts = side === 0 ? g.home_pts : g.away_pts, opts = side === 0 ? g.away_pts : g.home_pts, win = pts > opts;
      t.games.push({ id: g.id, date: g.date, journee: g.journee, opp: oname, home: side === 0, pts, opts, win, tot: me.total, otot: op.total, periods: (g.detail.periods || []).map(p => side === 0 ? [p.h, p.a] : [p.a, p.h]) });
      if (win) { t.w++; side === 0 ? t.hw++ : t.aw++; } else { t.l++; side === 0 ? t.hl++ : t.al++; }
      t.pf += pts; t.pa += opts; add(t.tot, me.total); add(t.opp, op.total);
      me.players.forEach(p => {
        const a = t.players[p.key] = t.players[p.key] || Object.assign(zero(), { key: p.key, num: p.num, name: p.name, gp: 0, gs: 0, min: 0, minG: 0, pm: 0, eval: 0, on_pf: 0, on_pa: 0, on_poss: 0, last: [] });
        a.gp++; if (p.starter) a.gs++; if (p.min != null) { a.min += p.min; a.minG++; }
        add(a, p); a.pm += +p.pm || 0; a.eval += +p.eval || 0; a.num = p.num;
        if (p.on) { a.on_pf += p.on.pf; a.on_pa += p.on.pa; a.on_poss += p.on.poss || 0; }
        a.last.push({ date: g.date, opp: oname, pts: p.pts, eval: p.eval, min: p.min });
      });
      me.units.forEach(u => {
        const a = t.units[u.k] = t.units[u.k] || { k: u.k, p: u.p, games: 0, sec: 0, pf: 0, pa: 0, fga: 0, fta: 0, orb: 0, tov: 0, fgm: 0, tpm: 0, o_fga: 0, o_fta: 0, o_orb: 0, o_tov: 0, o_fgm: 0, o_tpm: 0 };
        a.games++; ["sec","pf","pa","fga","fta","orb","tov","fgm","tpm","o_fga","o_fta","o_orb","o_tov","o_fgm","o_tpm"].forEach(f => a[f] += +u[f] || 0);
      });
    });
  }
  const list = Object.values(teams).map(t => {
    const n = t.games.length;
    t.m = metrics(t.tot, t.opp, n);
    t.form = t.games.slice(-5).map(g => g.win ? "V" : "D");
    let s = 0; for (let i = t.games.length - 1; i >= 0 && t.games[i].win === t.games[t.games.length - 1].win; i--) s++;
    t.streak = n ? (t.games[n - 1].win ? "V" : "D") + s : "";
    t.playerList = Object.values(t.players).map(a => {
      const g = a.gp; const ru = x => r1(x / g);
      return { key: a.key, num: a.num, name: a.name, label: LNB.pName(a), gp: g, gs: a.gs, min: a.minG ? r1(a.min / a.minG) : null,
        pts: ru(a.pts), reb: ru(a.orb + a.drb), orb: ru(a.orb), ast: ru(a.ast), tov: ru(a.tov), stl: ru(a.stl), blk: ru(a.blk), pf: ru(a.pf), eval: ru(a.eval), pm: ru(a.pm),
        fgp: r3(div(a.fgm, a.fga)), p3: r3(div(a.tpm, a.tpa)), tpa: ru(a.tpa), ftp: r3(div(a.ftm, a.fta)), fta: ru(a.fta),
        efg: r3(div(a.fgm + .5 * a.tpm, a.fga)), ts: r3(div(a.pts, 2 * (a.fga + .44 * a.fta))),
        usg: r3(div(a.fga + .44 * a.fta + a.tov, t.tot.fga + .44 * t.tot.fta + t.tot.tov)),
        onNet: a.on_poss >= 20 ? r1(100 * (a.on_pf - a.on_pa) / a.on_poss) : null, last: a.last.slice(-5) };
    }).sort((x, y) => (y.min || 0) - (x.min || 0));
    t.unitList = Object.values(t.units).map(u => {
      const p1 = u.fga + .44 * u.fta - u.orb + u.tov, p2 = u.o_fga + .44 * u.o_fta - u.o_orb + u.o_tov, pp = (p1 + p2) / 2;
      return { k: u.k, p: u.p, games: u.games, min: r1(u.sec / 60), pf: u.pf, pa: u.pa, pm: u.pf - u.pa, poss: r1(pp), net: pp >= 10 ? r1(100 * (u.pf - u.pa) / pp) : null,
        efg: r3(div(u.fgm + .5 * u.tpm, u.fga)), oefg: r3(div(u.o_fgm + .5 * u.o_tpm, u.o_fga)) };
    }).sort((x, y) => y.min - x.min);
    return t;
  });
  // rangs (1 = meilleur ; pour les indicateurs neutres : 1 = plus élevé)
  METRICS.forEach(([k, , , dir]) => {
    const vals = list.filter(t => t.m[k] != null).sort((a, b) => dir < 0 ? a.m[k] - b.m[k] : b.m[k] - a.m[k]);
    vals.forEach((t, i) => { t.rank = t.rank || {}; t.rank[k] = i + 1; });
  });
  const LT = list.reduce((a, t) => add(a, t.tot), zero()), LO = list.reduce((a, t) => add(a, t.opp), zero());
  const nG = list.reduce((a, t) => a + t.games.length, 0);
  const league = nG ? metrics(LT, LO, nG) : null;
  const standings = list.slice().sort((a, b) => b.w - a.w || (b.pf - b.pa) - (a.pf - a.pa) || b.pf - a.pf);
  standings.forEach((t, i) => t.pos = i + 1);
  const byName = Object.fromEntries(list.map(t => [t.name, t]));
  return { teams: list, standings, byName, league, count: list.length };
}
export const findTeam = (P, name) => P.byName[name] || P.teams.find(t => teamSlug(t.name) === teamSlug(name)) || P.teams.find(t => LNB.norm(t.name).includes(LNB.norm(name)) || LNB.norm(name).includes(LNB.norm(t.name)));

/* ---------- Lecture automatique forces / faiblesses (rangs) ---------- */
export function strengths(t, nTeams) {
  const top = Math.max(3, Math.round(nTeams * 0.25)), bottom = nTeams - top + 1;
  const f = [], w = [];
  METRICS.forEach(([k, lab, fmt, dir]) => { if (!dir || !t.rank) return; const r = t.rank[k]; if (r == null) return;
    if (r <= top) f.push({ k, lab, v: t.m[k], fmt, rank: r }); else if (r >= bottom) w.push({ k, lab, v: t.m[k], fmt, rank: r }); });
  return { forces: f.sort((a, b) => a.rank - b.rank), faiblesses: w.sort((a, b) => b.rank - a.rank) };
}
/* ---------- Duels : notre attaque vs leur défense, et inversement ---------- */
export function matchup(us, op, league) {
  const pairs = [
    ["Adresse (eFG%)", us.m.efg, op.m.o_efg, league && league.efg, 1, "p", "Notre eFG% vs eFG% qu'ils concèdent"],
    ["Pertes de balle", us.m.tovp, op.m.o_tovp, league && league.tovp, -1, "p", "Nos pertes vs pertes qu'ils provoquent"],
    ["Rebond offensif", us.m.orbp, 1 - (op.m.drbp ?? 0), league && league.orbp, 1, "p", "Notre ORB% vs ORB% qu'ils concèdent"],
    ["Lancers (FTr)", us.m.ftr, op.m.o_ftr, league && league.ftr, 1, "d2", "Notre FTr vs FTr qu'ils concèdent"],
    ["Leur adresse", op.m.efg, us.m.o_efg, league && league.efg, -1, "p", "Leur eFG% vs eFG% que nous concédons"],
    ["Leurs pertes", op.m.tovp, us.m.o_tovp, league && league.tovp, 1, "p", "Leurs pertes vs pertes que nous provoquons"],
    ["Leur rebond offensif", op.m.orbp, 1 - (us.m.drbp ?? 0), league && league.orbp, -1, "p", "Leur ORB% vs ORB% que nous concédons"],
    ["Leurs lancers (FTr)", op.m.ftr, us.m.o_ftr, league && league.ftr, -1, "d2", "Leur FTr vs FTr que nous concédons"]
  ];
  return pairs.map(([lab, a, b, lg, dir, fmt, help]) => {
    // projection simple : moyenne des deux tendances ; avantage si la projection est meilleure que la moyenne du championnat
    const proj = a != null && b != null ? (a + b) / 2 : null;
    const edge = proj != null && lg != null ? (proj - lg) * dir : null;
    return { lab, a, b, lg, proj, fmt, help, side: lab.startsWith("Leur") ? "def" : "off", edge, read: edge == null ? "n" : edge > (fmt === "p" ? .01 : .02) ? "g" : edge < -(fmt === "p" ? .01 : .02) ? "b" : "n" };
  });
}
/* ---------- Fiche adversaire complète (UI + consigne Claude) ---------- */
export function scoutData(P, oppName, usName) {
  const op = findTeam(P, oppName), us = findTeam(P, usName || "SCABB");
  if (!op) return null;
  const st = strengths(op, P.count);
  const h2h = op.games.filter(g => isScabb(g.opp));
  return {
    team: op.name, pos: op.pos, record: `${op.w}V-${op.l}D`, home: `${op.hw}V-${op.hl}D`, away: `${op.aw}V-${op.al}D`, form: op.form, streak: op.streak,
    m: op.m, rank: op.rank, league: P.league, us: us ? { name: us.name, pos: us.pos, record: `${us.w}V-${us.l}D`, m: us.m, rank: us.rank } : null,
    forces: st.forces, faiblesses: st.faiblesses, matchup: us ? matchup(us, op, P.league) : [],
    players: op.playerList.slice(0, 9), lineupsMost: op.unitList.slice(0, 5), lineupsBest: op.unitList.filter(u => u.min >= 8 && u.net != null).sort((a, b) => b.net - a.net).slice(0, 3),
    lineupsWorst: op.unitList.filter(u => u.min >= 8 && u.net != null).sort((a, b) => a.net - b.net).slice(0, 2),
    results: op.games.map(g => ({ date: g.date, j: g.journee, opp: short(g.opp), home: g.home, pts: g.pts, opts: g.opts, win: g.win, q4: g.periods[3] || null })),
    clutch: closeGames(op), h2h: h2h.map(g => ({ date: g.date, home: g.home, pts: g.pts, opts: g.opts })), nTeams: P.count
  };
}
function closeGames(t) { const c = t.games.filter(g => Math.abs(g.pts - g.opts) <= 6); return { n: c.length, w: c.filter(g => g.win).length }; }

/* ---------- Évolution du SCABB match par match ---------- */
export function evolution(P, usName = "SCABB") {
  const us = findTeam(P, usName); if (!us) return null;
  const rows = us.games.map((g, i) => {
    const m = metrics(g.tot, g.otot, 1);
    const prev = us.games.slice(0, i); const pm = prev.length ? metrics(prev.reduce((a, x) => add(a, x.tot), zero()), prev.reduce((a, x) => add(a, x.otot), zero()), prev.length) : null;
    return { date: g.date, j: g.journee, opp: g.opp, home: g.home, pts: g.pts, opts: g.opts, win: g.win, m, before: pm };
  });
  const season = us.m;
  const flags = rows.map(r => {
    const pos = [], neg = [];
    METRICS.filter(([k, , , dir]) => dir && ["net","efg","tovp","orbp","drbp","ftr","p3","o_efg","o_tovp","astr"].includes(k)).forEach(([k, lab, fmt, dir]) => {
      const v = r.m[k], s = season[k]; if (v == null || s == null) return; const d = (v - s) * dir; const tol = fmt === "p" ? .03 : fmt === "d2" ? .05 : 5;
      if (d > tol) pos.push({ k, lab, v, s, fmt }); else if (d < -tol) neg.push({ k, lab, v, s, fmt });
    });
    return { pos, neg };
  });
  const count = {}; flags.forEach(f => { f.pos.forEach(x => (count[x.lab] = count[x.lab] || { lab: x.lab, pos: 0, neg: 0 }).pos++); f.neg.forEach(x => (count[x.lab] = count[x.lab] || { lab: x.lab, pos: 0, neg: 0 }).neg++); });
  const last3 = us.games.slice(-3);
  const l3 = last3.length ? metrics(last3.reduce((a, x) => add(a, x.tot), zero()), last3.reduce((a, x) => add(a, x.otot), zero()), last3.length) : null;
  const st = strengths(us, P.count);
  return {
    team: us.name, pos: us.pos, record: `${us.w}V-${us.l}D`, home: `${us.hw}V-${us.hl}D`, away: `${us.aw}V-${us.al}D`, form: us.form, streak: us.streak,
    season, rank: us.rank, league: P.league, last3: l3, rows, flags, tally: Object.values(count).sort((a, b) => (b.pos - b.neg) - (a.pos - a.neg)),
    forces: st.forces, faiblesses: st.faiblesses, players: us.playerList,
    lineupsMost: us.unitList.slice(0, 6), lineupsBest: us.unitList.filter(u => u.min >= 8 && u.net != null).sort((a, b) => b.net - a.net).slice(0, 4),
    lineupsWorst: us.unitList.filter(u => u.min >= 8 && u.net != null).sort((a, b) => a.net - b.net).slice(0, 4),
    quarters: [0, 1, 2, 3].map(q => { const v = us.games.map(g => g.periods[q]).filter(Boolean); return v.length ? { q: q + 1, pf: r1(v.reduce((a, x) => a + x[0], 0) / v.length), pa: r1(v.reduce((a, x) => a + x[1], 0) / v.length), won: v.filter(x => x[0] > x[1]).length, n: v.length } : null; }).filter(Boolean),
    clutch: closeGames(us), nTeams: P.count
  };
}

/* ---------- Consignes Claude ---------- */
const RULES = "Règles : français, ton direct de staff professionnel, phrases de 22 mots maximum, chaque point appuyé sur au moins un chiffre précis des données (rang /20, pourcentage, joueur, cinq). N'invente aucun chiffre ni aucun joueur.";
export function scoutPrompt(sd, nextMatch) {
  return `Tu es l'analyste du staff du SCABB (basket, Élite 2, France). Prépare le rapport de scouting de notre prochain adversaire : ${sd.team}${nextMatch ? `, match le ${nextMatch.date} ${nextMatch.home ? "à domicile" : "à l'extérieur"}` : ""}.
Données saison de l'adversaire (rangs sur ${sd.nTeams} équipes, 1 = meilleur) :
${JSON.stringify({ classement: sd.pos, bilan: sd.record, domicile: sd.home, exterieur: sd.away, forme: sd.form, serie: sd.streak, indicateurs: sd.m, rangs: sd.rank, matchs_serres: sd.clutch })}
Moyennes du championnat : ${JSON.stringify(sd.league)}
SCABB (nous) : ${JSON.stringify(sd.us)}
Duels attaque/défense (a = équipe concernée, b = ce que l'autre concède, lg = moyenne championnat) : ${JSON.stringify(sd.matchup)}
Joueurs clés adverses (moyennes par match ; usg = part des possessions utilisées ; onNet = net quand il est sur le terrain) : ${JSON.stringify(sd.players)}
Cinq adverses les plus utilisés : ${JSON.stringify(sd.lineupsMost)} ; les plus efficaces : ${JSON.stringify(sd.lineupsBest)}
Résultats : ${JSON.stringify(sd.results)} ; confrontations déjà jouées contre nous : ${JSON.stringify(sd.h2h)}
Repères Élite 2 : eFG% 52 %, TOV% 13-17 %, ORB% 28-32 %.

${RULES}

Réponds UNIQUEMENT avec ce JSON :
{"resume":"3 phrases : identité de jeu de l'adversaire et enjeu du match","forces":["4 forces chiffrées"],"faiblesses":["4 faiblesses chiffrées à exploiter"],"joueurs_cles":[{"joueur":"#num Nom","profil":"1 phrase chiffrée","consigne":"consigne défensive précise"}],"plan_defensif":["4 consignes défensives"],"plan_offensif":["4 consignes offensives"],"cles_du_match":["3 objectifs chiffrés pour gagner (ex. moins de 14 pertes)"],"entrainement":[{"theme":"thème","exercice":"exercice précis de préparation du match","objectif":"objectif mesurable","duree":"minutes"}]}
"joueurs_cles" : 4 joueurs. "entrainement" : 4 contenus pour la semaine.`;
}
export function seasonPrompt(ed, finals) {
  return `Tu es l'analyste du staff du SCABB (basket, Élite 2, France). Fais le point sur l'évolution de NOTRE équipe depuis le début de saison, pour orienter le travail du staff à l'entraînement.
Bilan : ${JSON.stringify({ classement: ed.pos, bilan: ed.record, domicile: ed.home, exterieur: ed.away, forme: ed.form, serie: ed.streak, matchs_serres: ed.clutch })}
Indicateurs saison (rangs sur ${ed.nTeams} équipes) : ${JSON.stringify({ indicateurs: ed.season, rangs: ed.rank })}
Moyennes du championnat : ${JSON.stringify(ed.league)}
3 derniers matchs : ${JSON.stringify(ed.last3)}
Match par match : ${JSON.stringify(ed.rows.map(r => ({ date: r.date, adv: r.opp, dom: r.home, score: `${r.pts}-${r.opts}`, net: r.m.net, efg: r.m.efg, tovp: r.m.tovp, orbp: r.m.orbp, drbp: r.m.drbp, ftr: r.m.ftr, o_efg: r.m.o_efg })))}
Fréquence au-dessus / en dessous de nos moyennes : ${JSON.stringify(ed.tally)}
Moyennes par quart-temps : ${JSON.stringify(ed.quarters)}
Joueurs (moyennes par match, onNet = net quand il est sur le terrain) : ${JSON.stringify(ed.players)}
Cinq les plus utilisés : ${JSON.stringify(ed.lineupsMost)} ; plus efficaces : ${JSON.stringify(ed.lineupsBest)} ; moins efficaces : ${JSON.stringify(ed.lineupsWorst)}
Points relevés dans les comptes rendus de match : ${JSON.stringify(finals || [])}

${RULES}

Réponds UNIQUEMENT avec ce JSON :
{"resume":"3 phrases sur la trajectoire de l'équipe","positifs":["4 points positifs durables"],"negatifs":["4 points négatifs récurrents"],"tendances":["3 évolutions récentes (3 derniers matchs vs saison)"],"joueurs":[{"joueur":"#num Nom","bilan":"1 phrase chiffrée","axe":"axe de travail individuel"}],"lineups":"2 phrases : cinq à installer, cinq à éviter","axes_staff":["4 axes de travail prioritaires pour le staff"],"plan_semaine":[{"seance":"ex. Mardi","contenu":"contenu précis (basket + physique si pertinent)","objectif":"objectif mesurable"}]}
"joueurs" : 5 joueurs. "plan_semaine" : 4 séances.`;
}

/* ---------- Instantané compact (calculé par le robot, lu par l'application) ---------- */
export function compact(P) {
  return {
    v: 1, at: new Date().toISOString(), league: P.league, count: P.count,
    teams: P.standings.map(t => ({ name: t.name, pos: t.pos, w: t.w, l: t.l, hw: t.hw, hl: t.hl, aw: t.aw, al: t.al, pf: t.pf, pa: t.pa,
      m: t.m, rank: t.rank, form: t.form, streak: t.streak,
      games: t.games.map(g => Object.assign({ date: g.date, journee: g.journee, opp: g.opp, home: g.home, pts: g.pts, opts: g.opts, win: g.win, periods: g.periods }, isScabb(t.name) ? { tot: g.tot, otot: g.otot } : {})),
      playerList: t.playerList, unitList: t.unitList.slice(0, 30) }))
  };
}
export function hydrate(snap) {
  if (!snap || !snap.teams) return null;
  const teams = snap.teams.map(t => Object.assign({}, t));
  return { teams, standings: teams.slice().sort((a, b) => a.pos - b.pos), byName: Object.fromEntries(teams.map(t => [t.name, t])), league: snap.league, count: snap.count, at: snap.at };
}
