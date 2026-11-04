// Mise en page des rapports (aperçu + PDF A4 aux couleurs du SCABB)
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fr = (v, d = 1) => v == null || !isFinite(v) ? "–" : Number(v).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = v => v == null || !isFinite(v) ? "–" : fr(v * 100, 1) + " %";
const sg = v => v == null || !isFinite(v) ? "–" : (v > 0 ? "+" : "") + fr(v, v % 1 ? 1 : 0);
const dFR = iso => iso ? iso.split("-").reverse().join("/") : "";
const li = arr => (arr && arr.length) ? `<ul>${arr.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="pg-note">—</p>`;

export function footHTML() {
  const d = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  return `<div class="pg-foot"><b>Réalisé par Maxence Collignon</b><span>SCABB · Analyse statistique · ${d}</span></div>`;
}
function head(rep, eyebrow, logo) {
  const s = rep.stats, m = s.match || {};
  const title = s.teams.home === "us" ? `${esc(s.teams.usShort)} – ${esc(s.teams.opShort)}` : `${esc(s.teams.opShort)} – ${esc(s.teams.usShort)}`;
  const per = s.score.periods.map(p => `${p.per <= 4 ? "QT" + p.per : "P" + (p.per - 4)} ${p.us}-${p.op}`).join(" · ");
  return `<div class="pg-head"><div class="pg-logo">${logo ? `<img src="${esc(logo)}" alt="">` : "<span>SCABB</span>"}</div>
  <div class="pg-titles"><div class="pg-eyebrow">${esc(eyebrow)}</div><div class="pg-title">${title}</div>
  <div class="pg-meta">${esc(m.comp || "")}${m.date ? " · " + dFR(m.date) : ""} · ${s.teams.home === "us" ? "Domicile" : "Extérieur"} · ${per}</div></div>
  <div class="pg-score"><div class="big">${s.score.us} – ${s.score.op}</div><div class="sub">SCABB · ${esc(s.score.clock)}</div></div></div>`;
}
const ROWS = [
  ["Points", w => `${w.us.pts}-${w.op.pts}`],
  ["Net / 100 poss.", w => sg(w.us.net), w => w.us.net],
  ["Possessions", w => fr(w.us.poss, 0)],
  ["eFG%", w => pct(w.us.efg), w => w.us.efg - (w.op.efg ?? 0)],
  ["TS%", w => pct(w.us.ts)],
  ["3 pts", w => `${w.us.tpm}/${w.us.tpa}`],
  ["LF", w => `${w.us.ftm}/${w.us.fta}`],
  ["TOV%", w => pct(w.us.tovp), w => (w.op.tovp ?? 0) - w.us.tovp],
  ["ORB%", w => pct(w.us.orbp), w => w.us.orbp - (w.op.orbp ?? 0)],
  ["DRB%", w => pct(w.us.drbp)],
  ["FTr", w => fr(w.us.ftr, 2)],
  ["Passes déc.", w => w.us.ast],
  ["Balles perdues", w => `${w.us.tov} (adv. ${w.op.tov})`],
  ["eFG% adverse", w => pct(w.op.efg), w => (w.us.efg ?? 0) - w.op.efg]];
function windowsTable(s, keys) {
  const ws = keys.map(k => s.windows[k]).filter(Boolean);
  return `<table class="pg-tbl live"><thead><tr><th></th>${ws.map(w => `<th>${esc(w.key === "ALL" ? "Match" : w.key === "H1" ? "1re MT" : w.key === "H2" ? "2e MT" : w.key === "OT" ? "Prol." : "QT" + w.key.slice(1))}</th>`).join("")}</tr></thead>
  <tbody>${ROWS.map(([lab, f, good]) => `<tr><td>${lab}</td>${ws.map(w => { const g = good ? good(w) : null; return `<td class="${g == null || !isFinite(g) || Math.abs(g) < 1e-9 ? "" : g > 0 ? "pos" : "neg"}">${f(w)}</td>`; }).join("")}</tr>`).join("")}</tbody></table>`;
}
function ffTable(s, key) {
  const w = s.windows[key]; if (!w) return "";
  const se = s.season;
  const row = (lab, a, b, c, dir) => { let cls = ""; if (dir && a != null && c != null && Math.abs(a - c) > 0.015) cls = (a - c) * dir > 0 ? "pos" : "neg"; return `<tr><td>${lab}</td><td class="us ${cls}">${pct(a)}</td><td>${pct(b)}</td>${se ? `<td>${pct(c)}</td>` : ""}</tr>`; };
  return `<table class="pg-tbl live"><thead><tr><th>Four Factors</th><th>SCABB</th><th>Adv.</th>${se ? `<th>Moy. saison (${se.n} m.)</th>` : ""}</tr></thead><tbody>
  ${row("eFG% (adresse effective)", w.us.efg, w.op.efg, se && se.us.efg, 1)}
  ${row("TS% (adresse réelle)", w.us.ts, w.op.ts, se && se.us.ts, 1)}
  ${row("TOV% (pertes / poss.)", w.us.tovp, w.op.tovp, se && se.us.tovp, -1)}
  ${row("ORB% (rebond offensif)", w.us.orbp, w.op.orbp, se && se.us.orbp, 1)}
  ${row("DRB% (rebond défensif)", w.us.drbp, w.op.drbp, se && se.us.drbp, 1)}
  ${row("3 pts %", w.us.p3, w.op.p3, se && se.us.p3, 1)}
  ${row("LF %", w.us.ftp, w.op.ftp, se && se.us.ftp, 1)}
  </tbody></table>
  <p class="pg-note" style="margin-top:4px">ORtg ${fr(w.us.ortg)} · DRtg ${fr(w.us.drtg)} · Net ${sg(w.us.net)} · ${fr(w.us.poss, 0)} possessions${se ? ` · saison : ORtg ${fr(se.ortg)}, DRtg ${fr(se.drtg)}, Net ${sg(se.net)}` : ""}</p>`;
}
function unitsTable(list, title, cls) {
  if (!list || !list.length) return `<div class="pg-sec"><h4>${title}</h4><p class="pg-note">Aucun cinq qualifié (2 min minimum).</p></div>`;
  return `<div class="pg-sec"><h4>${title}</h4><table class="pg-tbl live"><thead><tr><th style="text-align:left">Cinq</th><th>Min</th><th>Score</th><th>+/-</th><th>Net/100</th><th>eFG%</th></tr></thead><tbody>
  ${list.map(u => `<tr><td style="text-align:left">${u.players.map(esc).join(", ")}</td><td>${fr(u.min)}</td><td>${u.pf}-${u.pa}</td><td class="${cls || (u.pm > 0 ? "pos" : u.pm < 0 ? "neg" : "")}">${sg(u.pm)}</td><td>${u.net == null ? "–" : sg(Math.round(u.net))}</td><td>${pct(u.efg)}</td></tr>`).join("")}</tbody></table></div>`;
}
function playersTable(ps) {
  return `<table class="pg-tbl live"><thead><tr><th>Joueur</th><th>Min</th><th>Pts</th><th>Tirs</th><th>3 pts</th><th>LF</th><th>Reb</th><th>PD</th><th>BP</th><th>F</th><th>+/-</th></tr></thead><tbody>
  ${ps.map(p => `<tr><td>${esc(p.name)}</td><td>${fr(p.min)}</td><td class="us">${p.pts}</td><td>${p.fgm}/${p.fga}</td><td>${p.tpm}/${p.tpa}</td><td>${p.ftm}/${p.fta}</td><td>${p.reb}</td><td>${p.ast}</td><td>${p.tov}</td><td>${p.fouls}</td><td class="${p.pm > 0 ? "pos" : p.pm < 0 ? "neg" : ""}">${sg(p.pm)}</td></tr>`).join("")}</tbody></table>`;
}
const noAi = rep => rep.error ? `<p class="pg-note">${esc(rep.error)}</p>` : "";

export function reportPages(rep, logo) {
  const s = rep.stats, ai = rep.ai || {};
  if (s.kind === "mt") {
    return `<div class="page">${head(rep, "Rapport mi-temps · 1/2", logo)}<div class="pg-body">
      ${ai.resume ? `<div class="pg-box cons"><h5>Synthèse de la 1re mi-temps</h5><p style="margin:0">${esc(ai.resume)}</p></div>` : noAi(rep)}
      <div class="pg-sec"><h4>1er QT · 2e QT · 1re mi-temps</h4>${windowsTable(s, ["Q1", "Q2", "H1"])}</div>
      ${ai.qt1 || ai.qt2 ? `<div class="pg-cols"><div class="pg-box cons"><h5>Lecture QT1</h5><p style="margin:0">${esc(ai.qt1 || "")}</p></div><div class="pg-box cons"><h5>Lecture QT2</h5><p style="margin:0">${esc(ai.qt2 || "")}</p></div></div>` : ""}
      <div class="pg-sec"><h4>Bilan 1re mi-temps · Four Factors</h4>${ffTable(s, "H1")}</div>
    </div>${footHTML()}</div>
    <div class="page">${head(rep, "Rapport mi-temps · 2/2", logo)}<div class="pg-body">
      <div class="pg-cols"><div class="pg-box pos"><h5>Points positifs</h5>${li(ai.positifs)}</div><div class="pg-box neg"><h5>Points négatifs</h5>${li(ai.negatifs)}</div></div>
      ${unitsTable(s.lineups.best, "Cinq les plus efficaces", "pos")}
      ${unitsTable(s.lineups.worst, "Cinq les moins efficaces", "neg")}
      ${ai.lineups ? `<p class="pg-note" style="font-size:12px;color:#132037">${esc(ai.lineups)}</p>` : ""}
      <div class="pg-sec"><h4>Joueurs · 1re mi-temps</h4>${playersTable(s.players)}</div>
      <div class="pg-box cons"><h5>Ajustements pour la 2e mi-temps</h5>${li(ai.ajustements)}</div>
    </div>${footHTML()}</div>`;
  }
  const qt = ai.qt || {};
  const qtLines = ["Q1", "Q2", "Q3", "Q4"].filter(k => qt[k]).map(k => `<li><b>QT${k.slice(1)}</b> · ${esc(qt[k])}</li>`).join("");
  const tr = (ai.entrainement || []).map(e => `<tr><td style="text-align:left"><b>${esc(e.theme)}</b></td><td style="text-align:left">${esc(e.exercice)}</td><td style="text-align:left">${esc(e.objectif)}</td><td>${esc(e.duree)}</td></tr>`).join("");
  return `<div class="page">${head(rep, "Compte rendu fin de match · 1/3", logo)}<div class="pg-body">
      ${ai.resume ? `<div class="pg-box cons"><h5>Synthèse du match</h5><p style="margin:0">${esc(ai.resume)}</p></div>` : noAi(rep)}
      <div class="pg-sec"><h4>Quart-temps par quart-temps</h4>${windowsTable(s, ["Q1", "Q2", "Q3", "Q4", "OT"])}</div>
      ${qtLines ? `<div class="pg-box cons"><h5>Lecture des quart-temps</h5><ul>${qtLines}</ul></div>` : ""}
      <div class="pg-sec"><h4>Mi-temps et match complet</h4>${windowsTable(s, ["H1", "H2", "ALL"])}</div>
    </div>${footHTML()}</div>
    <div class="page">${head(rep, "Compte rendu fin de match · 2/3", logo)}<div class="pg-body">
      <div class="pg-sec"><h4>Bilan du match · vs adversaire et vs nos moyennes</h4>${ffTable(s, "ALL")}</div>
      ${unitsTable(s.lineups.best, "Cinq les plus efficaces", "pos")}
      ${unitsTable(s.lineups.worst, "Cinq les moins efficaces", "neg")}
      ${ai.lineups ? `<p class="pg-note" style="font-size:12px;color:#132037">${esc(ai.lineups)}</p>` : ""}
      <div class="pg-sec"><h4>Joueurs</h4>${playersTable(s.players)}</div>
    </div>${footHTML()}</div>
    <div class="page">${head(rep, "Compte rendu fin de match · 3/3", logo)}<div class="pg-body">
      <div class="pg-cols"><div class="pg-box pos"><h5>Points positifs</h5>${li(ai.positifs)}</div><div class="pg-box neg"><h5>Points négatifs</h5>${li(ai.negatifs)}</div></div>
      <div class="pg-box cons"><h5>Axes d'amélioration pour le prochain match</h5>${li(ai.axes)}</div>
      <div class="pg-sec"><h4>Contenus d'entraînement de la semaine</h4>${tr ? `<table class="pg-tbl live"><thead><tr><th style="text-align:left">Thème</th><th style="text-align:left">Exercice</th><th style="text-align:left">Objectif</th><th>Durée</th></tr></thead><tbody>${tr}</tbody></table>` : `<p class="pg-note">—</p>`}</div>
      ${(ai.joueurs || []).length ? `<div class="pg-sec"><h4>Joueurs à suivre</h4><ul style="margin:0;padding-left:16px">${ai.joueurs.map(j => `<li><b>${esc(j.joueur)}</b> · ${esc(j.note)}</li>`).join("")}</ul></div>` : ""}
    </div>${footHTML()}</div>`;
}
/* ---------- Scouting adversaire et bilan saison ---------- */
const FMT = (v, f) => v == null || !isFinite(v) ? "–" : f === "p" ? pct(v) : f === "d2" ? fr(v, 2) : f === "s1" ? sg(Math.round(v * 10) / 10) : fr(v, 1);
const rk = r => r == null ? "" : `<span class="rk ${r <= 5 ? "g" : r >= 16 ? "b" : ""}">${r}e</span>`;
function simpleHead(eyebrow, title, meta, big, sub, logo) {
  return `<div class="pg-head"><div class="pg-logo">${logo ? `<img src="${esc(logo)}" alt="">` : "<span>SCABB</span>"}</div>
  <div class="pg-titles"><div class="pg-eyebrow">${esc(eyebrow)}</div><div class="pg-title">${esc(title)}</div><div class="pg-meta">${esc(meta)}</div></div>
  <div class="pg-score"><div class="big">${esc(big)}</div><div class="sub">${esc(sub)}</div></div></div>`;
}
const KEYM = [["net","Net rating","s1"],["ortg","Offensive rating","d1"],["drtg","Defensive rating","d1"],["pace","Rythme","d1"],["efg","eFG%","p"],["tovp","TOV%","p"],["orbp","ORB%","p"],["ftr","FTr","d2"],["p3","3 pts %","p"],["o_efg","eFG% adverse","p"],["o_tovp","Pertes provoquées","p"],["drbp","DRB%","p"]];
function metricsTable(sd, withUs) {
  return `<table class="pg-tbl live"><thead><tr><th>Indicateur</th><th>${esc(withUs ? sd.team : "Valeur")}</th><th>Rang</th>${withUs && sd.us ? "<th>SCABB</th><th>Rang</th>" : ""}<th>Moy. Élite 2</th></tr></thead><tbody>
  ${KEYM.map(([k, l, f]) => `<tr><td>${l}</td><td class="us">${FMT(sd.m[k], f)}</td><td>${sd.rank && sd.rank[k] ? sd.rank[k] + "e" : "–"}</td>${withUs && sd.us ? `<td>${FMT(sd.us.m[k], f)}</td><td>${sd.us.rank && sd.us.rank[k] ? sd.us.rank[k] + "e" : "–"}</td>` : ""}<td>${FMT(sd.league && sd.league[k], f)}</td></tr>`).join("")}</tbody></table>`;
}
function playersSeason(ps, n = 9) {
  return `<table class="pg-tbl live"><thead><tr><th>Joueur</th><th>MJ</th><th>Min</th><th>Pts</th><th>Reb</th><th>PD</th><th>BP</th><th>3 pts</th><th>TS%</th><th>Usage</th><th>Éval</th><th>Net</th></tr></thead><tbody>
  ${ps.slice(0, n).map(p => `<tr><td>${esc(p.label)}</td><td>${p.gp}</td><td>${fr(p.min)}</td><td class="us">${fr(p.pts)}</td><td>${fr(p.reb)}</td><td>${fr(p.ast)}</td><td>${fr(p.tov)}</td><td>${pct(p.p3)}</td><td>${pct(p.ts)}</td><td>${pct(p.usg)}</td><td>${fr(p.eval)}</td><td class="${p.onNet > 0 ? "pos" : p.onNet < 0 ? "neg" : ""}">${p.onNet == null ? "–" : sg(p.onNet)}</td></tr>`).join("")}</tbody></table>`;
}
function unitsSeason(list, title, cls) {
  if (!list || !list.length) return "";
  return `<div class="pg-sec"><h4>${title}</h4><table class="pg-tbl live"><thead><tr><th style="text-align:left">Cinq</th><th>Matchs</th><th>Min</th><th>Score</th><th>+/-</th><th>Net/100</th></tr></thead><tbody>
  ${list.map(u => `<tr><td style="text-align:left">${u.p.map(esc).join(", ")}</td><td>${u.games}</td><td>${fr(u.min)}</td><td>${u.pf}-${u.pa}</td><td class="${cls || (u.pm > 0 ? "pos" : u.pm < 0 ? "neg" : "")}">${sg(u.pm)}</td><td>${u.net == null ? "–" : sg(Math.round(u.net))}</td></tr>`).join("")}</tbody></table></div>`;
}
export function scoutPages(rep, logo) {
  const sd = rep.stats.scout, ai = rep.ai || {};
  const meta = `${sd.pos}e d'Élite 2 · ${sd.record} · domicile ${sd.home} · extérieur ${sd.away} · forme ${sd.form.join("")}`;
  const H = n => simpleHead(`Scouting adversaire · ${n}`, sd.team, meta, `${sd.pos}e`, sd.record, logo);
  const duel = (sd.matchup || []).map(m => `<tr><td>${esc(m.lab)}</td><td>${FMT(m.a, m.fmt)}</td><td>${FMT(m.b, m.fmt)}</td><td>${FMT(m.lg, m.fmt)}</td><td class="${m.read === "g" ? "pos" : m.read === "b" ? "neg" : ""}">${m.read === "g" ? "Avantage SCABB" : m.read === "b" ? "Avantage adverse" : "Équilibré"}</td></tr>`).join("");
  const jk = (ai.joueurs_cles || []).map(j => `<tr><td style="text-align:left"><b>${esc(j.joueur)}</b></td><td style="text-align:left">${esc(j.profil)}</td><td style="text-align:left">${esc(j.consigne)}</td></tr>`).join("");
  const tr = (ai.entrainement || []).map(e => `<tr><td style="text-align:left"><b>${esc(e.theme)}</b></td><td style="text-align:left">${esc(e.exercice)}</td><td style="text-align:left">${esc(e.objectif)}</td><td>${esc(e.duree)}</td></tr>`).join("");
  return `<div class="page">${H("1/3")}<div class="pg-body">
    ${ai.resume ? `<div class="pg-box cons"><h5>Identité de jeu</h5><p style="margin:0">${esc(ai.resume)}</p></div>` : (rep.error ? `<p class="pg-note">${esc(rep.error)}</p>` : "")}
    <div class="pg-sec"><h4>Indicateurs et rangs (sur ${sd.nTeams} équipes)</h4>${metricsTable(sd, true)}</div>
    <div class="pg-sec"><h4>Duels attaque / défense</h4><table class="pg-tbl live"><thead><tr><th>Duel</th><th>Équipe</th><th>Ce que l'autre concède</th><th>Moy. Élite 2</th><th>Lecture</th></tr></thead><tbody>${duel}</tbody></table></div>
    </div>${footHTML()}</div>
  <div class="page">${H("2/3")}<div class="pg-body">
    <div class="pg-cols"><div class="pg-box pos"><h5>Forces adverses</h5>${li(ai.forces || (sd.forces || []).map(f => `${f.lab} : ${FMT(f.v, f.fmt)} (${f.rank}e)`))}</div><div class="pg-box neg"><h5>Faiblesses à exploiter</h5>${li(ai.faiblesses || (sd.faiblesses || []).map(f => `${f.lab} : ${FMT(f.v, f.fmt)} (${f.rank}e)`))}</div></div>
    <div class="pg-sec"><h4>Joueurs adverses · moyennes de la saison</h4>${playersSeason(sd.players)}</div>
    ${jk ? `<div class="pg-sec"><h4>Joueurs clés et consignes</h4><table class="pg-tbl live"><thead><tr><th style="text-align:left">Joueur</th><th style="text-align:left">Profil</th><th style="text-align:left">Consigne</th></tr></thead><tbody>${jk}</tbody></table></div>` : ""}
    ${unitsSeason(sd.lineupsMost, "Cinq adverses les plus utilisés")}
    </div>${footHTML()}</div>
  <div class="page">${H("3/3")}<div class="pg-body">
    <div class="pg-cols"><div class="pg-box cons"><h5>Plan défensif</h5>${li(ai.plan_defensif)}</div><div class="pg-box cons"><h5>Plan offensif</h5>${li(ai.plan_offensif)}</div></div>
    <div class="pg-box pos"><h5>Clés du match</h5>${li(ai.cles_du_match)}</div>
    <div class="pg-sec"><h4>Préparation à l'entraînement</h4>${tr ? `<table class="pg-tbl live"><thead><tr><th style="text-align:left">Thème</th><th style="text-align:left">Exercice</th><th style="text-align:left">Objectif</th><th>Durée</th></tr></thead><tbody>${tr}</tbody></table>` : `<p class="pg-note">—</p>`}</div>
    <div class="pg-sec"><h4>Derniers résultats</h4><table class="pg-tbl live"><thead><tr><th>Date</th><th style="text-align:left">Adversaire</th><th>Score</th><th></th></tr></thead><tbody>${sd.results.slice(-8).reverse().map(g => `<tr><td>${dFR(g.date)}</td><td style="text-align:left">${g.home ? "vs" : "@"} ${esc(g.opp)}</td><td>${g.pts}-${g.opts}</td><td class="${g.win ? "pos" : "neg"}">${g.win ? "V" : "D"}</td></tr>`).join("")}</tbody></table></div>
    </div>${footHTML()}</div>`;
}
export function seasonPages(rep, logo) {
  const ed = rep.stats.evo, ai = rep.ai || {};
  const meta = `${ed.pos}e d'Élite 2 · domicile ${ed.home} · extérieur ${ed.away} · forme ${ed.form.join("")}`;
  const H = n => simpleHead(`Évolution & axes de travail · ${n}`, "SCABB · Bilan de saison", meta, ed.record, `${ed.pos}e`, logo);
  const rows = ed.rows.map((r, i) => `<tr><td>${dFR(r.date)}</td><td style="text-align:left">${r.home ? "vs" : "@"} ${esc(r.opp)}</td><td class="${r.win ? "pos" : "neg"}">${r.pts}-${r.opts}</td><td>${FMT(r.m.net, "s1")}</td><td>${FMT(r.m.efg, "p")}</td><td>${FMT(r.m.tovp, "p")}</td><td>${FMT(r.m.orbp, "p")}</td><td>${FMT(r.m.drbp, "p")}</td><td>${FMT(r.m.o_efg, "p")}</td><td class="pos">${ed.flags[i].pos.length}</td><td class="neg">${ed.flags[i].neg.length}</td></tr>`).join("");
  const js = (ai.joueurs || []).map(j => `<tr><td style="text-align:left"><b>${esc(j.joueur)}</b></td><td style="text-align:left">${esc(j.bilan)}</td><td style="text-align:left">${esc(j.axe)}</td></tr>`).join("");
  const plan = (ai.plan_semaine || []).map(e => `<tr><td style="text-align:left"><b>${esc(e.seance)}</b></td><td style="text-align:left">${esc(e.contenu)}</td><td style="text-align:left">${esc(e.objectif)}</td></tr>`).join("");
  return `<div class="page">${H("1/3")}<div class="pg-body">
    ${ai.resume ? `<div class="pg-box cons"><h5>Trajectoire</h5><p style="margin:0">${esc(ai.resume)}</p></div>` : (rep.error ? `<p class="pg-note">${esc(rep.error)}</p>` : "")}
    <div class="pg-sec"><h4>Indicateurs de la saison et rangs (sur ${ed.nTeams} équipes)</h4>${metricsTable({ team: "SCABB", m: ed.season, rank: ed.rank, league: ed.league }, false)}</div>
    <div class="pg-sec"><h4>Match par match</h4><table class="pg-tbl live"><thead><tr><th>Date</th><th style="text-align:left">Adversaire</th><th>Score</th><th>Net</th><th>eFG%</th><th>TOV%</th><th>ORB%</th><th>DRB%</th><th>eFG% adv</th><th>+</th><th>−</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="pg-note">+ / − : nombre d'indicateurs nettement au-dessus / en dessous de nos moyennes ce soir-là.</p></div>
    </div>${footHTML()}</div>
  <div class="page">${H("2/3")}<div class="pg-body">
    <div class="pg-cols"><div class="pg-box pos"><h5>Points positifs</h5>${li(ai.positifs)}</div><div class="pg-box neg"><h5>Points négatifs</h5>${li(ai.negatifs)}</div></div>
    ${ai.tendances ? `<div class="pg-box cons"><h5>Tendances récentes</h5>${li(ai.tendances)}</div>` : ""}
    <div class="pg-sec"><h4>Joueurs · moyennes de la saison</h4>${playersSeason(ed.players, 12)}</div>
    ${js ? `<div class="pg-sec"><h4>Bilans individuels</h4><table class="pg-tbl live"><thead><tr><th style="text-align:left">Joueur</th><th style="text-align:left">Bilan</th><th style="text-align:left">Axe de travail</th></tr></thead><tbody>${js}</tbody></table></div>` : ""}
    </div>${footHTML()}</div>
  <div class="page">${H("3/3")}<div class="pg-body">
    ${unitsSeason(ed.lineupsBest, "Cinq les plus efficaces de la saison", "pos")}
    ${unitsSeason(ed.lineupsWorst, "Cinq les moins efficaces de la saison", "neg")}
    ${ai.lineups ? `<p class="pg-note" style="font-size:12px;color:#132037">${esc(ai.lineups)}</p>` : ""}
    <div class="pg-box cons"><h5>Axes de travail pour le staff</h5>${li(ai.axes_staff)}</div>
    <div class="pg-sec"><h4>Plan de la semaine</h4>${plan ? `<table class="pg-tbl live"><thead><tr><th style="text-align:left">Séance</th><th style="text-align:left">Contenu</th><th style="text-align:left">Objectif</th></tr></thead><tbody>${plan}</tbody></table>` : `<p class="pg-note">—</p>`}</div>
    </div>${footHTML()}</div>`;
}
export function anyPages(rep, logo) { return rep.kind === "scout" ? scoutPages(rep, logo) : rep.kind === "season" ? seasonPages(rep, logo) : reportPages(rep, logo); }
/** Export PDF (html2canvas + jsPDF chargés dans index.html) */
export async function exportPDF(html, filename) {
  const off = document.getElementById("offscreen"); off.innerHTML = html;
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const pdf = new window.jspdf.jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pages = [...off.querySelectorAll(".page")];
    for (let i = 0; i < pages.length; i++) {
      const c = await window.html2canvas(pages[i], { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
      if (i) pdf.addPage();
      pdf.addImage(c.toDataURL("image/jpeg", .92), "JPEG", 0, 0, 210, 297);
    }
    pdf.save(filename);
  } finally { off.innerHTML = ""; }
}
