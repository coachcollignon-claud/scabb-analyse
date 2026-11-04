// SCABB Analyse — application (téléphone, tablette, ordinateur)
import LNB from "./lnb.js";
import { seasonAgg } from "./report-lib.js";
import { hydrate, scoutData, evolution, findTeam, isScabb, METRICS } from "./league-lib.js";
import { anyPages, exportPDF } from "./report-view.js";
import { demoApi } from "./demo.js";

const C = window.SCABB_CONFIG || {};
const DEMO = !C.SUPABASE_URL || !C.SUPABASE_ANON_KEY;
const SCABB = "SCABB Saint-Étienne-Métropole";
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fr = (v, d = 1) => v == null || !isFinite(v) ? "–" : Number(v).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = v => v == null || !isFinite(v) ? "–" : fr(v * 100, 1) + " %";
const sg = v => v == null || !isFinite(v) ? "–" : (v > 0 ? "+" : "") + fr(v, Number.isInteger(v) ? 0 : 1);
const FMT = (v, f) => v == null || !isFinite(v) ? "–" : f === "p" ? pct(v) : f === "d2" ? fr(v, 2) : f === "s1" ? sg(Math.round(v * 10) / 10) : fr(v, 1);
const dFR = iso => iso ? iso.split("-").reverse().join("/") : "";
const dLong = iso => iso ? new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "";
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const slug = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
const pmHTML = v => v == null ? "–" : `<span class="pm ${v > 0 ? "pos" : v < 0 ? "neg" : ""}">${v > 0 ? "+" : ""}${Number.isInteger(v) ? v : fr(v, 1)}</span>`;
const rk = r => r == null ? "" : `<span class="rk ${r <= 5 ? "g" : r >= 16 ? "b" : ""}">${r}<sup>e</sup></span>`;
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
const logo = () => lsGet("scabb-logo") || "";
const enc = s => encodeURIComponent(s), dec = s => decodeURIComponent(s || "");
function status(el, msg, kind) { if (!el) return; el.hidden = !msg; el.className = "status" + (kind ? " " + kind : ""); el.innerHTML = msg || ""; }

/* ================= Données ================= */
function supaApi() {
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
  const must = ({ data, error }) => { if (error) throw error; return data; };
  const fnErr = async e => { try { const b = await e.context.json(); return new Error(b.error || e.message); } catch (_) { return e; } };
  const invoke = async (name, body) => { const { data, error } = await sb.functions.invoke(name, { body }); if (error) throw await fnErr(error); return data; };
  return {
    demo: false,
    async session() { return (await sb.auth.getSession()).data.session; },
    async login(email, password) { must(await sb.auth.signInWithPassword({ email, password })); },
    async logout() { await sb.auth.signOut(); },
    async matches() { return must(await sb.from("matches").select("*").order("date", { ascending: false })); },
    async snapshot() { const r = must(await sb.from("league_snapshot").select("data").eq("id", "e2").maybeSingle()); return r ? r.data : null; },
    async leagueState() { return must(await sb.from("league_state").select("*").eq("id", "e2").maybeSingle()); },
    async live(id) { return must(await sb.from("live_state").select("*").eq("match_id", id).maybeSingle()); },
    async reports(id) { return must(await sb.from("reports").select("*").eq("match_id", id).order("created_at", { ascending: false })); },
    async teamReports(kind, subject) { let q = sb.from("reports").select("*").eq("kind", kind); if (subject) q = q.eq("subject", subject); return must(await q.order("created_at", { ascending: false }).limit(20)); },
    async report(id) { return must(await sb.from("reports").select("*").eq("id", id).single()); },
    async startLive(id) { return invoke("robot", { action: "live", match_id: id }); },
    async stopLive(id) { return invoke("robot", { action: "stop", match_id: id }); },
    async syncLeague(full) { return invoke("robot", { action: "league", full: !!full }); },
    async makeReport(id, kind, subject) { return invoke("report", { match_id: id || null, kind, subject: subject || null }); },
    subscribe(id, cb) {
      const ch = sb.channel("m-" + id)
        .on("postgres_changes", { event: "*", schema: "public", table: "live_state", filter: `match_id=eq.${id}` }, () => cb("live"))
        .on("postgres_changes", { event: "*", schema: "public", table: "reports", filter: `match_id=eq.${id}` }, () => cb("reports")).subscribe();
      return () => sb.removeChannel(ch);
    }
  };
}
const api = DEMO ? demoApi() : supaApi();
if (DEMO) api.report = async id => { for (const k of ["scout", "season"]) { const r = (await api.teamReports(k)).find(x => x.id === id); if (r) return r; } const ms = await api.matches(); for (const m of ms) { const r = (await api.reports(m.id)).find(x => x.id === id); if (r) return r; } throw new Error("Rapport introuvable."); };

const S = { matches: [], P: null, snapAt: null, match: null, live: null, reports: [], tab: "live", win: "all", showAll: false, unsub: null, poll: null, sort: "pos", evoMetric: "net" };
async function loadLeague(force) { if (!S.P || force) { const snap = await api.snapshot(); S.P = hydrate(snap); S.snapAt = snap && snap.at; } return S.P; }
async function loadMatches() { S.matches = await api.matches(); return S.matches; }
const nextMatch = () => S.matches.filter(m => m.status !== "termine").sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")))[0];
const route = () => { const [v, a, b] = location.hash.replace(/^#/, "").split("/"); return { v: v || "matchs", a, b }; };
const go = h => { if (location.hash === "#" + h) render(); else location.hash = h; };
window.addEventListener("hashchange", render);
document.addEventListener("click", e => { const b = e.target.closest("[data-go]"); if (b) { e.preventDefault(); go(b.dataset.go); } });

function shell(active, body) {
  const nav = [["matchs", "Matchs"], ["adversaire", "Adversaire"], ["championnat", "Championnat"], ["evolution", "Évolution"], ["reglages", "Réglages"]];
  return `<header class="top"><div class="top-in gut"><div class="logo-slot">${logo() ? `<img src="${esc(logo())}" alt="">` : "<span>SCABB</span>"}</div>
    <div class="brand"><b>SCABB <i>·</i> Analyse</b><small>Élite 2 · Saison ${esc(C.SEASON || "2026-2027")}</small></div>${DEMO ? '<span class="save-pill">Mode démo</span>' : ""}</div>
    <nav class="tabs gut">${nav.map(([k, l]) => `<button data-go="${k}" aria-selected="${active === k}">${l}</button>`).join("")}</nav></header>
    <main class="gut">${body}</main><div id="offscreen" aria-hidden="true"></div>`;
}
const emptyLeague = () => `<section class="card"><h2>Championnat pas encore chargé</h2><p class="muted">Le robot championnat récupère chaque nuit les matchs d'Élite 2 sur le site LNB. Lance-le maintenant pour la première fois (15 à 30 minutes).</p>
  <button class="btn primary" id="syncNow">Mettre à jour le championnat</button><div class="status" id="syncSt" hidden></div></section>`;
function bindSync() { const b = $("#syncNow"); if (b) b.onclick = async () => { b.disabled = true; try { await api.syncLeague(); status($("#syncSt"), "Robot championnat lancé. Les données arrivent dans 15 à 30 minutes (5 minutes les fois suivantes).", "ok"); } catch (e) { status($("#syncSt"), esc(e.message), "err"); b.disabled = false; } }; }

async function render() {
  const r = route();
  if (S.unsub && r.v !== "match") { S.unsub(); S.unsub = null; }
  if (S.poll && r.v !== "match") { clearInterval(S.poll); S.poll = null; }
  const sess = await api.session().catch(() => null);
  if (!sess) return renderLogin();
  try {
    if (r.v === "match" && r.a) return await renderMatch(r.a, r.b);
    if (r.v === "rapport" && r.a) return await renderReport(r.a);
    if (r.v === "adversaire") return await renderOpponent(r.a ? dec(r.a) : null);
    if (r.v === "equipe" && r.a) return await renderOpponent(dec(r.a), true);
    if (r.v === "championnat") return await renderLeague();
    if (r.v === "evolution") return await renderEvolution();
    if (r.v === "reglages") return renderSettings();
    return await renderMatches();
  } catch (e) { $("#app").innerHTML = shell("", `<section class="card"><p class="status err">${esc(e.message || e)}</p><button class="btn" data-go="matchs">Retour</button></section>`); }
  window.scrollTo(0, 0);
}

/* ================= Connexion ================= */
function renderLogin() {
  $("#app").innerHTML = `<main class="gut login"><section class="card"><div class="logo-slot big">${logo() ? `<img src="${esc(logo())}" alt="">` : "<span>SCABB</span>"}</div>
    <h2>SCABB Analyse</h2><p class="muted">Connexion du staff</p>
    <form id="loginF" class="grid1"><label class="f">E-mail<input id="lgEmail" type="email" autocomplete="username" required></label>
    <label class="f">Mot de passe<input id="lgPw" type="password" autocomplete="current-password" required></label>
    <button class="btn primary">Se connecter</button><div class="status" id="lgSt" hidden></div></form></section></main>`;
  $("#loginF").onsubmit = async e => { e.preventDefault(); try { await api.login($("#lgEmail").value.trim(), $("#lgPw").value); render(); } catch (err) { status($("#lgSt"), "Connexion refusée : vérifie l'e-mail et le mot de passe.", "err"); } };
}

/* ================= Matchs ================= */
async function renderMatches() {
  await Promise.all([loadMatches(), loadLeague(true)]); const ls = await api.leagueState().catch(() => null);
  const nx = nextMatch(), live = S.matches.filter(m => m.status === "live");
  const done = S.matches.filter(m => m.status === "termine"), upcoming = S.matches.filter(m => m.status === "prevu").sort((a, b) => a.date.localeCompare(b.date));
  const opp = nx && S.P ? findTeam(S.P, nx.opp) : null;
  const row = m => { const f = m.final, w = f && f.us.pts > f.op.pts;
    return `<button class="mitem" data-go="match/${m.id}"><div><div class="t">${m.loc === "Ext" ? "@ " : "vs "}${esc(m.opp)}</div><div class="s">${m.journee ? "J" + m.journee + " · " : ""}${dFR(m.date)}${m.time ? " · " + esc(m.time) : ""}</div></div>
      <div class="right">${m.status === "live" ? '<span class="lv-pill on">Live</span>' : f ? `<span class="res ${w ? "w" : "l"}">${f.us.pts} – ${f.op.pts}</span>` : '<span class="chip">À venir</span>'}</div></button>`; };
  $("#app").innerHTML = shell("matchs", `
    ${nx ? `<section class="card next"><div class="eyebrow">Prochain match${nx.journee ? " · J" + nx.journee : ""}</div>
      <h2>SCABB ${nx.loc === "Ext" ? "@" : "vs"} ${esc(nx.opp)}</h2><p class="muted">${esc(dLong(nx.date))}${nx.time ? " · " + esc(nx.time) : ""} · ${nx.loc === "Ext" ? "à l'extérieur" : "à domicile"}${opp ? ` · ${opp.pos}<sup>e</sup>, ${opp.w}V-${opp.l}D` : ""}</p>
      <div class="row"><button class="btn primary" data-go="match/${nx.id}" style="flex:1">${nx.status === "live" ? "Suivre en direct" : "Page du match / live"}</button><button class="btn navy" data-go="adversaire/${nx.id}" style="flex:1">Analyse de ${esc(nx.opp)}</button></div></section>` : ""}
    ${live.length && !(nx && live.length === 1 && live[0].id === nx.id) ? `<section class="card"><h2>En direct</h2><div class="mlist">${live.map(row).join("")}</div></section>` : ""}
    ${S.matches.length ? `<section class="card"><h2>Résultats</h2><div class="mlist">${done.map(row).join("") || '<p class="muted">Aucun match terminé.</p>'}</div></section>
    <section class="card"><h2>À venir</h2><div class="mlist">${upcoming.slice(0, 6).map(row).join("") || '<p class="muted">Aucun match à venir.</p>'}</div>
      ${upcoming.length > 6 ? `<details><summary>Voir les ${upcoming.length - 6} autres</summary><div class="mlist" style="margin-top:8px">${upcoming.slice(6).map(row).join("")}</div></details>` : ""}</section>` : emptyLeague()}
    <section class="card"><div class="row" style="justify-content:space-between"><h3>Données LNB</h3><button class="btn small" id="syncNow">Mettre à jour</button></div>
      <p class="hint">${ls ? esc(ls.msg || "") + (ls.updated_at ? " · " + new Date(ls.updated_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "") : "Mise à jour automatique chaque nuit."}</p><div class="status" id="syncSt" hidden></div></section>`);
  bindSync();
}

/* ================= Page match (Live / Rapports / Bilan) ================= */
async function loadMatch(id) { await loadMatches(); S.match = S.matches.find(m => m.id === id); if (!S.match) throw new Error("Match introuvable."); [S.live, S.reports] = await Promise.all([api.live(id), api.reports(id)]); }
async function renderMatch(id, sub) {
  if (!S.match || S.match.id !== id || !S.unsub) {
    if (S.unsub) S.unsub();
    S.unsub = api.subscribe(id, async what => { if (route().a !== id) return; if (what === "live") S.live = await api.live(id); else S.reports = await api.reports(id); await loadMatches(); S.match = S.matches.find(m => m.id === id) || S.match; paintMatch(); });
    if (S.poll) clearInterval(S.poll);
    S.poll = setInterval(async () => { if (route().v === "match" && S.match && S.match.status === "live") { S.live = await api.live(id); paintMatch(); } }, 30000);
  }
  S.tab = sub || (S.match && S.match.id === id ? S.tab : "live"); await loadMatch(id); paintMatch();
}
function paintMatch() {
  const m = S.match; if (!m) return; const f = m.final;
  const tabs = [["live", "Live"], ["rotations", "Rotations"], ["rapports", "Rapports"], ["bilan", "Bilan"]];
  $("#app").innerHTML = shell("matchs", `<section class="card match-head"><div class="row" style="justify-content:space-between;align-items:flex-start">
      <div><div class="eyebrow">${m.journee ? "J" + m.journee + " · " : ""}${dFR(m.date)}${m.time ? " · " + esc(m.time) : ""} · ${m.loc === "Ext" ? "Extérieur" : "Domicile"}</div><h2>SCABB ${m.loc === "Ext" ? "@" : "vs"} ${esc(m.opp)}</h2></div>
      ${m.status === "live" ? '<span class="lv-pill on">Live</span>' : f ? `<span class="res ${f.us.pts > f.op.pts ? "w" : "l"}">${f.us.pts} – ${f.op.pts}</span>` : ""}</div>
      <div class="seg4">${tabs.map(([k, l]) => `<button data-tab="${k}" aria-pressed="${S.tab === k}">${l}</button>`).join("")}</div>
      ${m.status !== "termine" ? `<button class="btn small ghost" data-go="adversaire/${m.id}" style="justify-self:start">Analyse de ${esc(m.opp)} ›</button>` : ""}</section>
    <div style="display:grid;gap:16px">${S.tab === "rapports" ? reportsTab() : S.tab === "bilan" ? bilanTab() : S.tab === "rotations" ? rotationsTab() : liveTab()}</div>`);
  document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { S.tab = b.dataset.tab; history.replaceState(null, "", `#match/${m.id}/${S.tab}`); paintMatch(); });
  bindMatch();
}
const TEAM_ROWS = [["Points", "pf", "int", 1], ["Possessions", "poss", "int0", 0], ["Pts / 100 poss.", "ortg", "dec1", 1], ["eFG%", "efg", "pct", 1], ["TS%", "ts", "pct", 1],
  ["Tirs", "fg", "frac", 0], ["3 pts", "tp", "frac", 0], ["Lancers francs", "ft", "frac", 0], ["TOV% (pertes / poss.)", "tovp", "pct", -1], ["ORB% (rebond off.)", "orbp", "pct", 1],
  ["DRB% (rebond déf.)", "drbp", "pct", 1], ["FTr", "ftr", "dec2", 1], ["Passes déc.", "ast", "int", 1], ["Balles perdues", "tov", "int", -1], ["Interceptions", "stl", "int", 1], ["Fautes", "fouls", "int", -1]];
function cell(t, k, f) { if (f === "frac") { const [a, b] = k === "fg" ? [t.fgm, t.fga] : k === "tp" ? [t.tpm, t.tpa] : [t.ftm, t.fta]; return `${a}/${b}` + (b ? ` · ${fr(100 * a / b, 0)} %` : ""); }
  const v = t[k]; if (v == null) return "–"; return f === "pct" ? pct(v) : f === "dec1" ? fr(v, 1) : f === "dec2" ? fr(v, 2) : f === "int0" ? fr(v, 0) : String(v); }
function winRange(ev) { const lastT = ev.length ? ev[ev.length - 1].t : 0;
  if (S.win === "all") return [0, Infinity]; if (S.win === "last5") return [Math.max(0, lastT - 300), Infinity]; if (S.win === "H1") return [0, 1200]; if (S.win === "H2") return [1200, Infinity];
  const p = +S.win.slice(1); const a = p <= 4 ? (p - 1) * 600 : 2400 + (p - 5) * 300; return [a, a + (p <= 4 ? 600 : 300)]; }
function robotCard() {
  const L = S.live, st = L && L.worker_status, running = st === "starting" || st === "ok";
  const when = L && L.updated_at ? new Date(L.updated_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
  const label = { starting: "Démarrage", ok: "Suivi en cours", error: "Problème", stopped: "Arrêté", done: "Terminé" }[st] || "Inactif";
  if (S.match.status === "termine" && !running) return "";
  return `<section class="card"><div class="row" style="justify-content:space-between"><h2>Suivi live LNB</h2><span class="lv-pill ${running ? "on" : ""}">${label}</span></div>
    <p class="hint">${L && L.worker_msg ? esc(L.worker_msg) + (when ? ` · ${when}` : "") : "Le robot lit le Play by play officiel toutes les 40 secondes. Lance-le environ 10 minutes avant l'entre-deux."}</p>
    <div class="row">${running ? `<button class="btn" id="stopLive" style="flex:1">Arrêter le suivi</button>` : `<button class="btn primary" id="startLive" style="flex:1">Démarrer le suivi live</button>`}
    <button class="btn ghost" id="refreshLive">Actualiser</button></div><div class="status" id="robotSt" hidden></div></section>`;
}
const noLive = () => `<section class="card"><p class="muted">${S.match.status === "termine" ? "Ce match n'a pas été suivi en direct. Les rapports peuvent quand même être générés depuis la feuille LNB (onglet Rapports)." : "Les données apparaîtront ici dès que le robot aura lu le premier Play by play."}</p></section>`;
function liveTab() {
  const L = S.live;
  if (!L || !L.box || !L.events || !L.events.length) return robotCard() + noLive();
  const box = L.box, ev = L.events, us = L.us ?? 0, op = 1 - us;
  const [a, b] = winRange(ev); const A = LNB.analyse(box, ev, a, b), full = LNB.analyse(box, ev);
  const U = A.res[us], O = A.res[op], sc = full.score, per = LNB.periods(ev), run = LNB.runs(ev), last = ev[ev.length - 1];
  const wins = [["all", "Match"], ...per.map(p => ["Q" + p.per, p.per <= 4 ? "QT" + p.per : "Prol." + (p.per - 4)]), ["H1", "1re MT"], ...(per.some(p => p.per >= 3) ? [["H2", "2e MT"]] : []), ["last5", "5 dern. min"]];
  const rows = TEAM_ROWS.map(([lab, k, f, dir]) => { let c = ""; if (dir && f !== "frac") { const va = U.team[k], vb = O.team[k]; if (va != null && vb != null && va !== vb) c = (dir > 0 ? va > vb : va < vb) ? "better" : "worse"; } return `<tr><td>${lab}</td><td class="${c}">${cell(U.team, k, f)}</td><td>${cell(O.team, k, f)}</td></tr>`; }).join("");
  const cur = full.res[us].units.find(u => u.current);
  const units = U.units.slice().sort((x, y) => y.sec - x.sec), shown = S.showAll ? units : units.filter(u => u.sec >= 30).slice(0, 10);
  const uRows = shown.map(u => `<tr class="${u.current && S.win === "all" ? "cur" : ""}"><td class="unit">${u.players.map(p => esc(LNB.pName(p))).join(", ")}</td><td>${fr(u.min)}</td><td>${u.pf}-${u.pa}</td><td>${pmHTML(u.pm)}</td><td>${u.poss >= 5 ? pmHTML(Math.round(u.net)) : "–"}</td><td>${u.efg != null ? pct(u.efg) : "–"}</td><td>${u.tov}</td></tr>`).join("");
  const pRows = U.players.filter(p => p.info).sort((x, y) => y.sec - x.sec).map(p => { const s = p.box || {};
    return `<tr><td>${esc(LNB.pName(p.info))}</td><td>${fr(p.min)}</td><td><b>${s.pts || 0}</b></td><td>${s.fgm || 0}/${s.fga || 0}</td><td>${s.tpm || 0}/${s.tpa || 0}</td><td>${s.ftm || 0}/${s.fta || 0}</td><td>${s.reb || 0}</td><td>${s.ast || 0}</td><td>${s.tov || 0}</td><td class="${(s.fouls || 0) >= 4 ? "worse" : ""}">${s.fouls || 0}</td><td>${pmHTML(p.pm)}</td></tr>`; }).join("");
  const sh = n => esc(LNB.shortTeam(n));
  return robotCard() + `
  <section class="card"><div class="lv-score"><div class="tn ${us === 0 ? "us" : ""}">${sh(box[0].name)}</div><div class="sc">${sc[0]} – ${sc[1]}</div><div class="tn ${us === 1 ? "us" : ""}">${sh(box[1].name)}</div></div>
    <div class="lv-meta">${per.map(p => `<span class="lv-chip">${p.per <= 4 ? "QT" + p.per : "P" + (p.per - 4)} <b>${p.h}-${p.a}</b></span>`).join("")}<span class="lv-chip">${esc(last.clock)}</span></div>
    ${run.side != null ? `<div class="lv-meta"><span class="lv-run ${run.side === us ? "good" : "bad"}">Série ${run.pts}-0 ${run.side === us ? "SCABB" : "adverse"} depuis ${esc(run.since)}</span></div>` : ""}</section>
  <section class="card"><div class="row" style="justify-content:space-between"><h2>Sur le terrain</h2>${cur ? `<span class="hint">ce cinq : ${fr(cur.min)} min · ${pmHTML(cur.pm)}</span>` : ""}</div>
    <div class="lv-five">${full.res[us].onNow.map(p => `<span>${esc(LNB.pName(p))}</span>`).join("")}</div></section>
  <div class="lv-win">${wins.map(([k, l]) => `<button data-win="${k}" aria-pressed="${S.win === k}">${l}</button>`).join("")}</div>
  <div class="cols2">
  <section class="card"><h2>Statistiques avancées</h2><div class="tablewrap"><table class="st"><thead><tr><th></th><th>${sh(U.name)}</th><th>${sh(O.name)}</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="hint">Vert : meilleur que l'adversaire · rouge : moins bon.</p></section>
  <section class="card"><div class="row" style="justify-content:space-between"><h2>Cinq utilisés</h2><button class="btn small ghost" id="allU">${S.showAll ? "Masquer les courts" : "Tout afficher (" + units.length + ")"}</button></div>
    <div class="tablewrap"><table class="st"><thead><tr><th>Cinq</th><th>Min</th><th>Score</th><th>+/-</th><th>Net/100</th><th>eFG%</th><th>BP</th></tr></thead><tbody>${uRows || '<tr><td colspan="7" class="muted">Aucun cinq sur cette période.</td></tr>'}</tbody></table></div>
    <p class="hint">Net/100 à partir de 5 possessions. Ligne surlignée : cinq sur le terrain.</p></section></div>
  <section class="card"><h2>Joueurs</h2><div class="tablewrap"><table class="st"><thead><tr><th>Joueur</th><th>Min</th><th>Pts</th><th>Tirs</th><th>3 pts</th><th>LF</th><th>Reb</th><th>PD</th><th>BP</th><th>F</th><th>+/-</th></tr></thead><tbody>${pRows}</tbody></table></div></section>
  <section class="card"><div class="row"><button class="btn navy" data-mk="mt" style="flex:1">Rapport mi-temps</button><button class="btn primary" data-mk="final" style="flex:1">Rapport fin de match</button></div><div class="status" id="mkSt" hidden></div></section>`;
}
function rotationsTab() {
  const L = S.live;
  if (!L || !L.box || !L.events || !L.events.length) return robotCard() + noLive();
  const us = L.us ?? 0, st = LNB.stints(L.box, L.events, us);
  const total = L.events[L.events.length - 1].t || 1;
  const bars = st.map(s => `<div class="rot" style="flex:${Math.max(s.sec, 8)}" title="${esc(s.from)} → ${esc(s.to)} : ${s.pf}-${s.pa}"><span class="${s.pm > 0 ? "pos" : s.pm < 0 ? "neg" : "neu"}"></span></div>`).join("");
  const rows = st.slice().reverse().map(s => `<tr class="${s.current ? "cur" : ""}"><td>${esc(s.from)} → ${esc(s.to)}</td><td class="unit">${s.players.map(p => esc(LNB.pName(p))).join(", ")}</td><td>${fr(s.sec / 60)}</td><td>${s.pf}-${s.pa}</td><td>${pmHTML(s.pm)}</td></tr>`).join("");
  return robotCard() + `<section class="card"><h2>Rotations SCABB</h2><p class="hint">Chaque bloc = un cinq resté sur le terrain, largeur = durée (${fr(total / 60, 0)} min jouées). Vert : séquence gagnée, rouge : perdue.</p>
    <div class="rotbar">${bars}</div>
    <div class="tablewrap"><table class="st"><thead><tr><th>Moment</th><th>Cinq</th><th>Min</th><th>Score</th><th>+/-</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}
function reportsTab() {
  const list = S.reports.map(r => `<button class="mitem" data-go="rapport/${r.id}"><div><div class="t">${r.kind === "mt" ? "Rapport mi-temps" : "Compte rendu fin de match"}</div>
    <div class="s">${new Date(r.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${r.stats.score.us}-${r.stats.score.op} (${esc(r.stats.score.clock)})${r.error ? " · sans texte" : ""}</div></div><div class="right"><span class="chip on">Ouvrir</span></div></button>`).join("");
  return `<section class="card"><h2>Générer un rapport</h2><p class="hint">Créés automatiquement à la mi-temps et au buzzer final quand le match est suivi en live. Pour un match terminé non suivi, le rapport utilise la feuille LNB.</p>
    <div class="row"><button class="btn navy" data-mk="mt" style="flex:1">Rapport mi-temps</button><button class="btn primary" data-mk="final" style="flex:1">Rapport fin de match</button></div><div class="status" id="mkSt" hidden></div></section>
    <section class="card"><h2>Rapports du match</h2><div class="mlist">${list || '<p class="muted">Aucun rapport pour l\'instant.</p>'}</div></section>`;
}
const CMP = [["Points marqués", s => s.pts, "d", 1], ["Points encaissés", s => s.pa, "d", -1], ["Possessions", s => s.poss, "d", 0], ["Offensive rating", s => s.ortg, "d", 1], ["Defensive rating", s => s.drtg, "d", -1],
  ["Net rating", s => s.net, "d", 1], ["eFG%", s => s.us.efg, "p", 1], ["TS%", s => s.us.ts, "p", 1], ["3 pts %", s => s.us.p3, "p", 1], ["LF %", s => s.us.ftp, "p", 1], ["FTr", s => s.us.ftr, "d2", 1],
  ["TOV%", s => s.us.tovp, "p", -1], ["ORB%", s => s.us.orbp, "p", 1], ["DRB%", s => s.us.drbp, "p", 1], ["Passes déc.", s => s.ast, "d", 1], ["Balles perdues", s => s.tov, "d", -1],
  ["eFG% adverse", s => s.op.efg, "p", -1], ["3 pts % adverse", s => s.op.p3, "p", -1], ["TOV% adverse", s => s.op.tovp, "p", 1]];
const cf = (v, f) => v == null || !isFinite(v) ? "–" : f === "p" ? pct(v) : f === "d2" ? fr(v, 2) : fr(v, 1);
const cd = (d, f) => d == null || !isFinite(d) ? "–" : f === "p" ? (d >= 0 ? "+" : "") + fr(d * 100, 1) + " pt" : (d >= 0 ? "+" : "") + fr(d, f === "d2" ? 2 : 1);
const tol = f => f === "p" ? .015 : f === "d2" ? .03 : 1.5;
function curFinal() {
  const m = S.match; if (m.final && m.status === "termine") return { final: m.final, k: 1 };
  const L = S.live; if (!L || !L.events || !L.events.length) return null;
  const A = LNB.analyse(L.box, L.events), U = A.res[L.us ?? 0].team, O = A.res[1 - (L.us ?? 0)].team, el = Math.max(300, L.events[L.events.length - 1].t), k = 2400 / el;
  const conv = t => ({ pts: t.pf * k, fgm: t.fgm * k, fga: t.fga * k, tpm: t.tpm * k, tpa: t.tpa * k, ftm: t.ftm * k, fta: t.fta * k, orb: t.orb * k, drb: t.drb * k, ast: t.ast * k, tov: t.tov * k, stl: t.stl * k, blk: t.blk * k, pf: t.fouls * k });
  return { final: { us: conv(U), op: conv(O) }, k };
}
function bilanTab() {
  const m = S.match, cur = curFinal();
  if (!cur) return `<section class="card"><p class="muted">Pas encore de chiffres pour ce match.</p></section>`;
  const prev = S.matches.filter(x => x.id !== m.id && x.status === "termine" && x.final && x.date < m.date);
  if (!prev.length) return `<section class="card"><p class="muted">Aucun match précédent pour comparer.</p></section>`;
  const C1 = seasonAgg([{ final: cur.final }]), P = seasonAgg(prev), N = seasonAgg([...prev, { final: cur.final }]);
  const rows = CMP.map(([lab, fn, f, dir]) => { const c = fn(C1), p = fn(P), n = fn(N), d = c - p; return { lab, f, dir, c, p, n, d, read: dir && Math.abs(d) > tol(f) ? (d * dir > 0 ? "g" : "b") : "n" }; });
  const pill = r => r.read === "g" ? '<span class="st-pill g">Mieux</span>' : r.read === "b" ? '<span class="st-pill b">Moins bien</span>' : '<span class="st-pill n">Proche</span>';
  const evo = ["Points marqués", "Points encaissés", "Net rating", "eFG%", "3 pts %", "TOV%", "ORB%", "DRB%", "eFG% adverse"];
  return `<section class="card"><h2>Ce match vs moyenne des ${prev.length} précédents</h2><p class="hint">Bilan avant ce match : ${P.wins}V – ${P.n - P.wins}D.${cur.k !== 1 ? ` Match en cours : totaux projetés sur 40 min (× ${fr(cur.k, 2)}), pourcentages réels.` : ""}</p>
    <div class="tablewrap"><table class="st"><thead><tr><th>Indicateur</th><th>Ce match</th><th>Moy. avant</th><th>Écart</th><th>Lecture</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${r.lab}</td><td><b>${cf(r.c, r.f)}</b></td><td>${cf(r.p, r.f)}</td><td>${cd(r.d, r.f)}</td><td>${r.dir ? pill(r) : "–"}</td></tr>`).join("")}</tbody></table></div></section>
    <section class="card"><h2>${cur.k !== 1 ? "Moyennes saison si le match finit sur ce rythme" : "Évolution des moyennes de la saison"}</h2>
    <div class="tablewrap"><table class="st"><thead><tr><th>Indicateur</th><th>Avant</th><th>Avec ce match</th><th>Variation</th></tr></thead><tbody>
    ${rows.filter(r => evo.includes(r.lab)).map(r => { const dd = r.n - r.p, g = r.dir && Math.abs(dd) > 1e-9 ? dd * r.dir > 0 : null; return `<tr><td>${r.lab}</td><td>${cf(r.p, r.f)}</td><td><b>${cf(r.n, r.f)}</b></td><td class="${g === true ? "better" : g === false ? "worse" : ""}">${cd(dd, r.f)}</td></tr>`; }).join("")}</tbody></table></div></section>`;
}
function bindMatch() {
  const id = S.match.id, on = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };
  on("#startLive", async () => { status($("#robotSt"), '<span class="spin"></span> Démarrage du robot…'); try { await api.startLive(id); S.live = await api.live(id); await loadMatches(); S.match = S.matches.find(m => m.id === id); paintMatch(); } catch (e) { status($("#robotSt"), "Démarrage impossible : " + esc(e.message), "err"); } });
  on("#stopLive", async () => { try { await api.stopLive(id); S.live = await api.live(id); paintMatch(); } catch (e) { status($("#robotSt"), esc(e.message), "err"); } });
  on("#refreshLive", async () => { S.live = await api.live(id); S.reports = await api.reports(id); paintMatch(); });
  on("#allU", () => { S.showAll = !S.showAll; paintMatch(); });
  document.querySelectorAll("[data-win]").forEach(b => b.onclick = () => { S.win = b.dataset.win; paintMatch(); });
  bindMake(kind => api.makeReport(id, kind));
}
function bindMake(fn) {
  document.querySelectorAll("[data-mk]").forEach(b => b.onclick = async () => {
    const box = $("#mkSt"); document.querySelectorAll("[data-mk]").forEach(x => x.disabled = true);
    status(box, '<span class="spin"></span> Calcul et rédaction du rapport (20 à 60 s)…');
    try { const r = await fn(b.dataset.mk); go(`rapport/${r.id}`); }
    catch (e) { status(box, "Rapport impossible : " + esc(e.message), "err"); document.querySelectorAll("[data-mk]").forEach(x => x.disabled = false); }
  });
}

/* ================= Rapport (tous types) ================= */
async function renderReport(id) {
  const rep = await api.report(id); const ai = rep.ai || {}, s = rep.stats;
  const title = rep.kind === "mt" ? "Rapport mi-temps" : rep.kind === "final" ? "Compte rendu fin de match" : rep.kind === "scout" ? `Scouting · ${rep.subject}` : "Évolution & axes de travail";
  const back = rep.kind === "scout" ? (rep.match_id ? `adversaire/${rep.match_id}` : `equipe/${enc(rep.subject)}`) : rep.kind === "season" ? "evolution" : `match/${rep.match_id}/rapports`;
  const sub = s.score ? ` · ${s.score.us}-${s.score.op}` : "";
  const m = rep.match_id ? (await loadMatches()).find(x => x.id === rep.match_id) : null;
  const fname = `SCABB_${{ mt: "mi-temps", final: "compte-rendu", scout: "scouting", season: "evolution" }[rep.kind]}_${slug(rep.subject || (m && m.opp) || "saison")}_${(m && m.date) || todayISO()}.pdf`;
  const ul = (t, a, cls) => a && a.length ? `<section class="card ${cls || ""}"><h3>${t}</h3><ul>${a.map(x => `<li>${esc(typeof x === "string" ? x : x.joueur ? `${x.joueur} · ${x.consigne || x.axe || x.note || ""}` : x.theme ? `${x.theme} · ${x.exercice} (${x.objectif})` : x.seance ? `${x.seance} · ${x.contenu}` : JSON.stringify(x))}</li>`).join("")}</ul></section>` : "";
  $("#app").innerHTML = shell(rep.kind === "scout" ? "adversaire" : rep.kind === "season" ? "evolution" : "matchs", `
    <section class="card"><button class="btn small ghost" data-go="${back}" style="justify-self:start">‹ Retour</button><h2>${esc(title)}${sub}</h2>
      ${ai.resume ? `<p>${esc(ai.resume)}</p>` : rep.error ? `<p class="status warn">${esc(rep.error)}</p>` : ""}
      <button class="btn primary wide" id="pdfBtn">Télécharger le PDF</button><div class="status" id="pdfSt" hidden></div></section>
    <div class="cols2">${ul("Points positifs", ai.positifs || ai.forces, "cmp-pos")}${ul(rep.kind === "scout" ? "Faiblesses à exploiter" : "Points négatifs", ai.negatifs || ai.faiblesses, "cmp-neg")}</div>
    ${ul("Ajustements 2e mi-temps", ai.ajustements)}${ul("Clés du match", ai.cles_du_match)}${ul("Plan défensif", ai.plan_defensif)}${ul("Plan offensif", ai.plan_offensif)}
    ${ul("Axes d'amélioration", ai.axes)}${ul("Axes de travail du staff", ai.axes_staff)}${ul("Contenus d'entraînement", ai.entrainement)}${ul("Plan de la semaine", ai.plan_semaine)}
    <section class="card"><h3>Aperçu de la fiche</h3><div id="preview"></div></section>`);
  mountPreview($("#preview"), anyPages(rep, logo()));
  $("#pdfBtn").onclick = async () => { status($("#pdfSt"), '<span class="spin"></span> Création du PDF…'); try { await exportPDF(anyPages(rep, logo()), fname); status($("#pdfSt"), "PDF prêt : " + esc(fname), "ok"); } catch (e) { status($("#pdfSt"), "PDF impossible : " + esc(e.message), "err"); } };
}
function mountPreview(host, html) {
  const tmp = document.createElement("div"); tmp.innerHTML = html; const w = Math.max(240, Math.min(host.clientWidth || 320, 640)), sc = w / 794;
  host.innerHTML = ""; const wrap = document.createElement("div"); wrap.className = "previews"; host.appendChild(wrap);
  [...tmp.querySelectorAll(".page")].forEach(p => { const box = document.createElement("div"); box.className = "preview"; box.style.width = w + "px"; box.style.height = (1123 * sc) + "px";
    const s = document.createElement("div"); s.className = "scaler"; s.style.transform = `scale(${sc})`; s.appendChild(p); box.appendChild(s); wrap.appendChild(box); });
}

/* ================= Adversaire / fiche équipe ================= */
const KEY_METRICS = ["net", "ortg", "drtg", "pace", "efg", "tovp", "orbp", "ftr", "p3", "o_efg", "o_tovp", "drbp", "o_p3", "astr"];
const M = Object.fromEntries(METRICS.map(([k, l, f, d]) => [k, { l, f, d }]));
function metricGrid(t, us, league) {
  return `<div class="mgrid">${KEY_METRICS.map(k => { const r = t.rank && t.rank[k]; return `<div class="mcell"><div class="k">${esc(M[k].l)}</div><div class="v">${FMT(t.m[k], M[k].f)} ${rk(r)}</div>
    <div class="o">${us && us !== t ? `SCABB ${FMT(us.m[k], M[k].f)} · ` : ""}moy. ${FMT(league && league[k], M[k].f)}</div></div>`; }).join("")}</div>`;
}
function unitsList(list, title) {
  if (!list || !list.length) return "";
  return `<h3>${title}</h3><div class="tablewrap"><table class="st"><thead><tr><th>Cinq</th><th>M</th><th>Min</th><th>Score</th><th>+/-</th><th>Net/100</th></tr></thead><tbody>
  ${list.map(u => `<tr><td class="unit">${u.p.map(esc).join(", ")}</td><td>${u.games}</td><td>${fr(u.min)}</td><td>${u.pf}-${u.pa}</td><td>${pmHTML(u.pm)}</td><td>${u.net == null ? "–" : pmHTML(Math.round(u.net))}</td></tr>`).join("")}</tbody></table></div>`;
}
function playersTable(ps) {
  return `<div class="tablewrap"><table class="st"><thead><tr><th>Joueur</th><th>MJ</th><th>Min</th><th>Pts</th><th>Reb</th><th>PD</th><th>BP</th><th>Int</th><th>Tirs</th><th>3 pts</th><th>LF</th><th>TS%</th><th>Usage</th><th>Éval</th><th>Net</th></tr></thead><tbody>
  ${ps.map(p => `<tr><td>${esc(p.label)}</td><td>${p.gp}${p.gs ? `<small class="muted"> (${p.gs})</small>` : ""}</td><td>${fr(p.min)}</td><td><b>${fr(p.pts)}</b></td><td>${fr(p.reb)}</td><td>${fr(p.ast)}</td><td>${fr(p.tov)}</td><td>${fr(p.stl)}</td><td>${pct(p.fgp)}</td><td>${pct(p.p3)} <small class="muted">${fr(p.tpa)}/m</small></td><td>${pct(p.ftp)}</td><td>${pct(p.ts)}</td><td>${pct(p.usg)}</td><td>${fr(p.eval)}</td><td>${p.onNet == null ? "–" : pmHTML(p.onNet)}</td></tr>`).join("")}</tbody></table></div>
  <p class="hint">MJ (titularisations) · Usage = part des possessions utilisées · Net = écart pour 100 possessions quand le joueur est sur le terrain.</p>`;
}
async function renderOpponent(name, teamMode) {
  await Promise.all([loadMatches(), loadLeague()]);
  if (!S.P) { $("#app").innerHTML = shell(teamMode ? "championnat" : "adversaire", emptyLeague()); bindSync(); return; }
  const fixtures = S.matches.filter(m => m.status !== "termine").sort((a, b) => a.date.localeCompare(b.date));
  const byId = name && fixtures.find(m => m.id === name);
  const fx = teamMode ? null : (byId || (name ? fixtures.find(m => m.opp === name) : fixtures[0]));
  const target = teamMode ? name : (fx ? fx.opp : name);
  const sd = target ? scoutData(S.P, target, SCABB) : null;
  const opts = fixtures.map(m => `<option value="${esc(m.id)}" ${fx && m.id === fx.id ? "selected" : ""}>${m.journee ? "J" + m.journee + " · " : ""}${dFR(m.date)} · ${m.loc === "Ext" ? "@" : "vs"} ${esc(m.opp)}</option>`).join("");
  const head = `<section class="card"><h2>${teamMode ? "Fiche équipe" : "Analyse de l'adversaire"}</h2>
    ${!teamMode && fixtures.length ? `<label class="f">Match à préparer<select id="oppSel">${opts}</select></label>` : ""}
    ${teamMode ? `<button class="btn small ghost" data-go="championnat" style="justify-self:start">‹ Classement</button>` : ""}</section>`;
  if (!sd) { $("#app").innerHTML = shell(teamMode ? "championnat" : "adversaire", head + `<section class="card"><p class="muted">${target ? `Pas encore de match terminé pour ${esc(target)}.` : "Aucun match à venir."}</p></section>`); bindOpp(); return; }
  const t = findTeam(S.P, sd.team), us = findTeam(S.P, SCABB);
  const reps = await api.teamReports("scout", sd.team).catch(() => []);
  const chip = f => `<span class="fchip ${f.rank <= 5 ? "g" : "b"}">${esc(f.lab)} · ${FMT(f.v, f.fmt)} (${f.rank}<sup>e</sup>)</span>`;
  $("#app").innerHTML = shell(teamMode ? "championnat" : "adversaire", head + `
    <section class="card"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><div class="eyebrow">${sd.pos}<sup>e</sup> d'Élite 2${fx ? ` · ${dLong(fx.date)}${fx.loc === "Ext" ? " · à l'extérieur" : " · à domicile"}` : ""}</div><h2>${esc(sd.team)}</h2></div><span class="big-num sm">${sd.record}</span></div>
      <div class="lv-meta" style="justify-content:flex-start">Domicile ${sd.home} · Extérieur ${sd.away} · Matchs serrés ${sd.clutch.w}/${sd.clutch.n} · Forme ${sd.form.map(f => `<span class="cmp-form ${f === "V" ? "w" : "l"}">${f}</span>`).join("")}</div>
      ${isScabb(sd.team) ? "" : `<div class="row"><button class="btn primary" id="scoutBtn" style="flex:1">Rapport de scouting (Claude)</button></div><div class="status" id="mkSt" hidden></div>
      ${reps.length ? `<div class="mlist">${reps.slice(0, 3).map(r => `<button class="mitem" data-go="rapport/${r.id}"><div><div class="t">Scouting ${esc(r.subject)}</div><div class="s">${new Date(r.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div></div><div class="right"><span class="chip on">Ouvrir</span></div></button>`).join("")}</div>` : ""}`}</section>
    <section class="card"><h2>Indicateurs et rangs</h2><p class="hint">Rang sur ${sd.nTeams} équipes (vert : top 5, rouge : 5 derniers).</p>${metricGrid(t, us, S.P.league)}</section>
    <div class="cols2"><section class="card cmp-pos"><h3>Forces</h3><div class="fchips">${sd.forces.map(chip).join("") || '<span class="muted">Aucune dans le top 5.</span>'}</div></section>
    <section class="card cmp-neg"><h3>Faiblesses</h3><div class="fchips">${sd.faiblesses.map(chip).join("") || '<span class="muted">Aucune dans les 5 derniers.</span>'}</div></section></div>
    ${!isScabb(sd.team) && sd.matchup.length ? `<section class="card"><h2>Duels avec le SCABB</h2><div class="tablewrap"><table class="st"><thead><tr><th>Duel</th><th>Équipe</th><th>Ce que l'autre concède</th><th>Moy.</th><th>Lecture</th></tr></thead><tbody>
      ${sd.matchup.map(m => `<tr><td>${esc(m.lab)}<br><small class="muted">${esc(m.help)}</small></td><td>${FMT(m.a, m.fmt)}</td><td>${FMT(m.b, m.fmt)}</td><td>${FMT(m.lg, m.fmt)}</td><td>${m.read === "g" ? '<span class="st-pill g">SCABB</span>' : m.read === "b" ? '<span class="st-pill b">Adversaire</span>' : '<span class="st-pill n">Équilibré</span>'}</td></tr>`).join("")}</tbody></table></div></section>` : ""}
    <section class="card"><h2>Joueurs</h2>${playersTable(t.playerList)}</section>
    <section class="card"><h2>Cinq</h2>${unitsList(sd.lineupsMost, "Les plus utilisés")}${unitsList(sd.lineupsBest, "Les plus efficaces (8 min min.)")}${unitsList(sd.lineupsWorst, "Les moins efficaces")}</section>
    <section class="card"><h2>Résultats</h2><div class="mlist">${sd.results.slice().reverse().map(g => `<div class="mitem"><div><div class="t">${g.home ? "vs" : "@"} ${esc(g.opp)}</div><div class="s">J${g.j} · ${dFR(g.date)}</div></div><div class="right"><span class="res ${g.win ? "w" : "l"}">${g.pts} – ${g.opts}</span></div></div>`).join("")}</div>
      ${sd.h2h.length ? `<p class="hint">Déjà joué contre le SCABB : ${sd.h2h.map(g => `${dFR(g.date)} ${g.pts}-${g.opts}`).join(" · ")}</p>` : ""}</section>`);
  bindOpp();
  const sb = $("#scoutBtn"); if (sb) sb.onclick = async () => { sb.disabled = true; status($("#mkSt"), '<span class="spin"></span> Rédaction du scouting (30 à 60 s)…'); try { const r = await api.makeReport(fx ? fx.id : null, "scout", sd.team); go(`rapport/${r.id}`); } catch (e) { status($("#mkSt"), "Rapport impossible : " + esc(e.message), "err"); sb.disabled = false; } };
}
function bindOpp() { const s = $("#oppSel"); if (s) s.onchange = () => go("adversaire/" + s.value); bindSync(); }

/* ================= Championnat ================= */
const COLS = [["pos", "Pos", null, -1], ["rec", "V-D", null, 0], ["net", "Net", "s1", 1], ["ortg", "ORtg", "d1", 1], ["drtg", "DRtg", "d1", -1], ["pace", "Rythme", "d1", 0], ["efg", "eFG%", "p", 1], ["tovp", "TOV%", "p", -1],
  ["orbp", "ORB%", "p", 1], ["drbp", "DRB%", "p", 1], ["ftr", "FTr", "d2", 1], ["p3", "3 pts", "p", 1], ["o_efg", "eFG adv", "p", -1], ["o_tovp", "Pertes prov.", "p", 1]];
async function renderLeague() {
  await loadLeague();
  if (!S.P) { $("#app").innerHTML = shell("championnat", emptyLeague()); bindSync(); return; }
  const P = S.P, k = S.sort, c = COLS.find(x => x[0] === k) || COLS[0];
  const list = P.standings.slice().sort((a, b) => k === "pos" || k === "rec" ? a.pos - b.pos : c[3] < 0 ? a.m[k] - b.m[k] : b.m[k] - a.m[k]);
  const lg = P.league;
  const tierCls = (t, key) => { const r = t.rank && t.rank[key]; const d = M[key] && M[key].d; if (!r || !d) return ""; return r <= 5 ? "better" : r >= P.count - 4 ? "worse" : ""; };
  // nuage ORtg / DRtg
  const xs = P.teams.map(t => t.m.ortg), ys = P.teams.map(t => t.m.drtg);
  const x0 = Math.min(...xs) - 2, x1 = Math.max(...xs) + 2, y0 = Math.min(...ys) - 2, y1 = Math.max(...ys) + 2, W = 640, H = 380, pad = 40;
  const X = v => pad + (v - x0) / (x1 - x0) * (W - 2 * pad), Y = v => pad + (v - y0) / (y1 - y0) * (H - 2 * pad); // DRtg bas = mieux → en haut
  const dots = P.teams.map(t => `<g><circle cx="${X(t.m.ortg).toFixed(1)}" cy="${Y(t.m.drtg).toFixed(1)}" r="${isScabb(t.name) ? 7 : 5}" class="${isScabb(t.name) ? "dot-us" : "dot"}"/><text x="${(X(t.m.ortg) + 8).toFixed(1)}" y="${(Y(t.m.drtg) + 4).toFixed(1)}" class="dlab">${esc(isScabb(t.name) ? "SCABB" : t.name.replace(/^Démo /, ""))}</text></g>`).join("");
  $("#app").innerHTML = shell("championnat", `
    <section class="card"><h2>Classement avancé Élite 2</h2><p class="hint">Calculé depuis les feuilles LNB (${P.teams.reduce((a, t) => a + t.games.length, 0) / 2} matchs). Touchez un en-tête pour trier, une équipe pour sa fiche. Vert : top 5, rouge : 5 derniers.</p>
    <div class="tablewrap"><table class="st league"><thead><tr><th></th>${COLS.map(([key, l]) => `<th><button class="sortb ${k === key ? "on" : ""}" data-sort="${key}">${l}</button></th>`).join("")}</tr></thead><tbody>
    ${list.map(t => `<tr class="${isScabb(t.name) ? "cur" : ""}"><td class="team"><button class="linkb" data-go="equipe/${enc(t.name)}">${esc(isScabb(t.name) ? "SCABB" : t.name)}</button></td>${COLS.map(([key, , f]) => key === "pos" ? `<td>${t.pos}</td>` : key === "rec" ? `<td>${t.w}-${t.l}</td>` : `<td class="${tierCls(t, key)}">${FMT(t.m[key], f)}</td>`).join("")}</tr>`).join("")}
    <tr class="avg"><td>Moyenne</td><td></td><td></td>${COLS.slice(2).map(([key, , f]) => `<td>${FMT(lg[key], f)}</td>`).join("")}</tr></tbody></table></div></section>
    <section class="card"><h2>Attaque / défense</h2><p class="hint">À droite : meilleure attaque · en haut : meilleure défense (points encaissés pour 100 possessions).</p>
      <div class="chartwrap"><svg viewBox="0 0 ${W} ${H}" class="scatter" role="img" aria-label="Nuage offensive rating / defensive rating">
      <line x1="${X(lg.ortg)}" x2="${X(lg.ortg)}" y1="${pad}" y2="${H - pad}" class="axis"/><line y1="${Y(lg.drtg)}" y2="${Y(lg.drtg)}" x1="${pad}" x2="${W - pad}" class="axis"/>
      <text x="${W - pad}" y="${H - 10}" text-anchor="end" class="alab">Offensive rating →</text><text x="12" y="${pad - 14}" class="alab">↑ Meilleure défense</text>${dots}</svg></div></section>`);
  document.querySelectorAll("[data-sort]").forEach(b => b.onclick = () => { S.sort = b.dataset.sort; renderLeague(); });
}

/* ================= Évolution du SCABB ================= */
const EVO_M = [["net", "Net rating", "s1", 1], ["efg", "eFG%", "p", 1], ["tovp", "TOV%", "p", -1], ["orbp", "ORB%", "p", 1], ["drbp", "DRB%", "p", 1], ["ftr", "FTr", "d2", 1], ["o_efg", "eFG% adverse", "p", -1], ["o_tovp", "Pertes provoquées", "p", 1]];
function lineChart(vals, avg, f, dir, labels) {
  const W = 640, H = 200, pad = 34; const v = vals.filter(x => x != null); if (!v.length) return "";
  let lo = Math.min(...v, avg ?? Infinity), hi = Math.max(...v, avg ?? -Infinity); if (hi === lo) { hi += 1; lo -= 1; } const m = (hi - lo) * .12; lo -= m; hi += m;
  const X = i => pad + (vals.length === 1 ? (W - 2 * pad) / 2 : i * (W - 2 * pad) / (vals.length - 1)), Y = x => H - pad - (x - lo) / (hi - lo) * (H - 2 * pad);
  const pts = vals.map((x, i) => x == null ? null : [X(i), Y(x)]).filter(Boolean);
  const good = x => avg == null ? "" : (x - avg) * dir > 0 ? "g" : "b";
  return `<svg viewBox="0 0 ${W} ${H}" class="line" role="img" aria-label="Évolution">
    ${avg != null ? `<line x1="${pad}" x2="${W - pad}" y1="${Y(avg)}" y2="${Y(avg)}" class="avgl"/><text x="${pad}" y="${Y(avg) - 6}" text-anchor="start" class="alab">moy. ${esc(FMT(avg, f))}</text>` : ""}
    <polyline points="${pts.map(p => p.map(n => n.toFixed(1)).join(",")).join(" ")}" class="pl"/>
    ${vals.map((x, i) => x == null ? "" : `<circle cx="${X(i).toFixed(1)}" cy="${Y(x).toFixed(1)}" r="${i === vals.length - 1 ? 6 : 4}" class="pt ${good(x)}"/>`).join("")}
    ${labels.map((l, i) => `<text x="${X(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="xlab">${esc(l)}</text>`).join("")}</svg>`;
}
async function renderEvolution() {
  await Promise.all([loadMatches(), loadLeague()]);
  if (!S.P) { $("#app").innerHTML = shell("evolution", emptyLeague()); bindSync(); return; }
  const ed = evolution(S.P, SCABB);
  if (!ed || !ed.rows.length) { $("#app").innerHTML = shell("evolution", `<section class="card"><p class="muted">Aucun match du SCABB analysé pour l'instant.</p></section>`); return; }
  const finals = await Promise.all(S.matches.filter(m => m.status === "termine").slice(0, 10).map(async m => ({ m, r: (await api.reports(m.id)).find(r => r.kind === "final" && r.ai) })));
  const reps = await api.teamReports("season").catch(() => []);
  const mk = EVO_M.find(x => x[0] === S.evoMetric) || EVO_M[0];
  const labels = ed.rows.map(r => "J" + r.j);
  const cellCls = (r, k, dir) => { const v = r.m[k], s = ed.season[k]; if (v == null || s == null || !dir) return ""; const d = (v - s) * dir; const t = M[k].f === "p" ? .03 : M[k].f === "d2" ? .05 : 5; return d > t ? "better" : d < -t ? "worse" : ""; };
  const unitTbl = (list, t) => list && list.length ? `<h3>${t}</h3><div class="tablewrap"><table class="st"><thead><tr><th>Cinq</th><th>M</th><th>Min</th><th>Score</th><th>+/-</th><th>Net/100</th></tr></thead><tbody>${list.map(u => `<tr><td class="unit">${u.p.map(esc).join(", ")}</td><td>${u.games}</td><td>${fr(u.min)}</td><td>${u.pf}-${u.pa}</td><td>${pmHTML(u.pm)}</td><td>${u.net == null ? "–" : pmHTML(Math.round(u.net))}</td></tr>`).join("")}</tbody></table></div>` : "";
  $("#app").innerHTML = shell("evolution", `
    <section class="card"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><div class="eyebrow">${ed.pos}<sup>e</sup> d'Élite 2 · domicile ${ed.home} · extérieur ${ed.away}</div><h2>Évolution du SCABB</h2></div><span class="big-num sm">${ed.record}</span></div>
      <div class="lv-meta" style="justify-content:flex-start">Forme ${ed.form.map(f => `<span class="cmp-form ${f === "V" ? "w" : "l"}">${f}</span>`).join("")} · série ${esc(ed.streak)} · matchs serrés ${ed.clutch.w}/${ed.clutch.n}</div>
      <div class="row"><button class="btn primary" id="seasonBtn" style="flex:1">Bilan & axes de travail (Claude)</button></div><div class="status" id="mkSt" hidden></div>
      ${reps.length ? `<div class="mlist">${reps.slice(0, 3).map(r => `<button class="mitem" data-go="rapport/${r.id}"><div><div class="t">Évolution & axes de travail</div><div class="s">${new Date(r.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div></div><div class="right"><span class="chip on">Ouvrir</span></div></button>`).join("")}</div>` : ""}</section>
    <section class="card"><h2>Courbe match par match</h2><div class="lv-win">${EVO_M.map(([k, l]) => `<button data-evo="${k}" aria-pressed="${k === mk[0]}">${l}</button>`).join("")}</div>
      <div class="chartwrap">${lineChart(ed.rows.map(r => r.m[mk[0]]), ed.season[mk[0]], mk[2], mk[3], labels)}</div><p class="hint">Point vert : au-dessus de notre moyenne de saison (dans le bon sens) · rouge : en dessous. Dernier match en gros point.</p></section>
    <section class="card"><h2>Match par match</h2><div class="tablewrap"><table class="st"><thead><tr><th>Match</th><th>Score</th>${EVO_M.map(([, l]) => `<th>${l}</th>`).join("")}</tr></thead><tbody>
      ${ed.rows.slice().reverse().map(r => `<tr><td>J${r.j} ${r.home ? "vs" : "@"} ${esc(r.opp)}</td><td><span class="res ${r.win ? "w" : "l"}">${r.pts}-${r.opts}</span></td>${EVO_M.map(([k, , f, d]) => `<td class="${cellCls(r, k, d)}">${FMT(r.m[k], f)}</td>`).join("")}</tr>`).join("")}
      <tr class="avg"><td>Saison</td><td></td>${EVO_M.map(([k, , f]) => `<td>${FMT(ed.season[k], f)}</td>`).join("")}</tr>${ed.last3 ? `<tr class="avg"><td>3 derniers</td><td></td>${EVO_M.map(([k, , f]) => `<td>${FMT(ed.last3[k], f)}</td>`).join("")}</tr>` : ""}</tbody></table></div></section>
    <div class="cols2">
    <section class="card"><h2>Points positifs / négatifs</h2><p class="hint">Nombre de matchs où l'indicateur était nettement au-dessus (vert) ou en dessous (rouge) de notre moyenne.</p>
      <div class="tally">${ed.tally.map(t => `<div class="trow"><span class="tl">${esc(t.lab)}</span><span class="tb"><i class="g" style="width:${t.pos / ed.rows.length * 100}%"></i></span><b class="g">${t.pos}</b><span class="tb"><i class="b" style="width:${t.neg / ed.rows.length * 100}%"></i></span><b class="b">${t.neg}</b></div>`).join("")}</div>
      <h3>Rangs dans le championnat</h3><div class="fchips">${ed.forces.map(f => `<span class="fchip g">${esc(f.lab)} (${f.rank}<sup>e</sup>)</span>`).join("")}${ed.faiblesses.map(f => `<span class="fchip b">${esc(f.lab)} (${f.rank}<sup>e</sup>)</span>`).join("")}</div></section>
    <section class="card"><h2>Par quart-temps</h2><div class="tablewrap"><table class="st"><thead><tr><th></th><th>Marqués</th><th>Encaissés</th><th>Écart</th><th>Gagnés</th></tr></thead><tbody>
      ${ed.quarters.map(q => `<tr><td>QT${q.q}</td><td>${fr(q.pf)}</td><td>${fr(q.pa)}</td><td>${pmHTML(Math.round((q.pf - q.pa) * 10) / 10)}</td><td>${q.won}/${q.n}</td></tr>`).join("")}</tbody></table></div>
      ${finals.some(x => x.r) ? `<h3>Relevé des comptes rendus</h3><div class="mlist">${finals.filter(x => x.r).slice(0, 5).map(({ m, r }) => `<button class="mitem" data-go="rapport/${r.id}"><div><div class="t">${m.loc === "Ext" ? "@" : "vs"} ${esc(m.opp)}</div><div class="s"><span class="good">+ ${esc((r.ai.positifs || [])[0] || "")}</span><br><span class="bad">− ${esc((r.ai.negatifs || [])[0] || "")}</span></div></div></button>`).join("")}</div>` : ""}</section></div>
    <section class="card"><h2>Joueurs · saison</h2>${playersTable(ed.players)}</section>
    <section class="card"><h2>Cinq de la saison</h2>${unitTbl(ed.lineupsBest, "Les plus efficaces (8 min min.)")}${unitTbl(ed.lineupsWorst, "Les moins efficaces")}${unitTbl(ed.lineupsMost, "Les plus utilisés")}</section>`);
  document.querySelectorAll("[data-evo]").forEach(b => b.onclick = () => { S.evoMetric = b.dataset.evo; renderEvolution(); });
  const sb = $("#seasonBtn"); sb.onclick = async () => { sb.disabled = true; status($("#mkSt"), '<span class="spin"></span> Rédaction du bilan (30 à 60 s)…'); try { const r = await api.makeReport(null, "season"); go(`rapport/${r.id}`); } catch (e) { status($("#mkSt"), "Rapport impossible : " + esc(e.message), "err"); sb.disabled = false; } };
}

/* ================= Réglages ================= */
function renderSettings() {
  $("#app").innerHTML = shell("reglages", `
    <section class="card"><h2>Logo du club</h2><p class="hint">Apparaît dans l'application et sur les PDF (enregistré sur cet appareil).</p>
      <input type="file" id="logoIn" accept="image/png,image/jpeg,image/webp"><div class="row"><div class="logo-slot big">${logo() ? `<img src="${esc(logo())}" alt="">` : "<span>SCABB</span>"}</div><button class="btn small ghost" id="logoClr">Retirer</button></div></section>
    <section class="card"><h2>Données du championnat</h2><p class="hint">Le robot relit le calendrier et les feuilles LNB chaque nuit. « Tout relire » repasse sur les 38 journées (plus long).</p>
      <div class="row"><button class="btn" id="syncNow">Mettre à jour maintenant</button><button class="btn ghost" id="syncFull">Tout relire</button></div><div class="status" id="syncSt" hidden></div></section>
    <section class="card"><h2>Installer l'application</h2><p>iPhone / iPad : Safari → Partager → « Sur l'écran d'accueil ». Android : Chrome → ⋮ → « Ajouter à l'écran d'accueil ». Ordinateur : Chrome / Edge → icône d'installation dans la barre d'adresse.</p></section>
    <section class="card"><h2>Compte</h2>${DEMO ? '<p class="hint">Mode démo : renseigne config.js (Supabase) pour activer les vraies données.</p>' : '<button class="btn" id="logout">Se déconnecter</button>'}</section>`);
  $("#logoIn").onchange = async e => { const f = e.target.files[0]; if (!f) return; const img = new Image(); img.src = URL.createObjectURL(f); await img.decode();
    const s = Math.min(1, 200 / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = img.width * s; c.height = img.height * s; c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    lsSet("scabb-logo", c.toDataURL("image/png")); renderSettings(); };
  $("#logoClr").onclick = () => { lsSet("scabb-logo", null); renderSettings(); };
  bindSync(); const sf = $("#syncFull"); sf.onclick = async () => { sf.disabled = true; try { await api.syncLeague(true); status($("#syncSt"), "Relecture complète lancée (20 à 40 minutes).", "ok"); } catch (e) { status($("#syncSt"), esc(e.message), "err"); sf.disabled = false; } };
  const lo = $("#logout"); if (lo) lo.onclick = async () => { await api.logout(); render(); };
}

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
render();
