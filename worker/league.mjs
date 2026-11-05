// Robot « championnat » : récupère le calendrier Élite 2 (J1 à J38) et le détail de chaque match terminé
// (Boxscore + Play by play), met à jour les matchs du SCABB et l'instantané des 20 équipes.
// Lancé chaque nuit par GitHub Actions, ou à la demande depuis l'application.
import { createClient } from "@supabase/supabase-js";
import LNB from "./lnb.js";
import { gameDetail, profiles, compact, isScabb, teamSlug } from "./league-lib.js";
import { launch, openCalendar, openGame, readBox, readPbp } from "./browser.mjs";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const FULL = process.env.FULL === "1";                   // relire toutes les journées
const MAX_GAMES = +(process.env.MAX_GAMES || 120);        // matchs détaillés au maximum par passage
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error("Variables Supabase manquantes"); process.exit(1); }
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const log = (...a) => console.log(new Date().toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris" }), ...a);
const today = new Date(Date.now() + 3600e3).toISOString().slice(0, 10);
const gid = g => `J${g.journee}-${teamSlug(g.home)}-${teamSlug(g.away)}`;

async function setState(status, msg) { await db.from("league_state").upsert({ id: "e2", status, msg, updated_at: new Date().toISOString() }); }

const { data: existing, error } = await db.from("league_games").select("id, journee, date, status, has_detail");
if (error) { console.error(error); process.exit(1); }
const known = Object.fromEntries((existing || []).map(g => [g.id, g]));
const { browser, page } = await launch();
await setState("running", "Lecture du calendrier…");
let detailed = 0, failures = 0, consecutive = 0, firstError = null;
try {
  // 1) Calendrier : journées à (re)lire
  const doneJ = new Set();
  if (!FULL && existing && existing.length) {
    const byJ = {}; existing.forEach(g => (byJ[g.journee] = byJ[g.journee] || []).push(g));
    Object.entries(byJ).forEach(([j, gs]) => { if (gs.every(g => g.status === "termine" && g.has_detail) && gs.length >= 10) doneJ.add(+j); });
  }
  const rows = [];
  for (let j = 1; j <= 38; j++) {
    if (doneJ.has(j)) continue;
    try {
      const txt = await openCalendar(page, j);
      const games = LNB.parseCalendar(txt).filter(g => g.journee === j);
      games.forEach(g => rows.push({ id: gid(g), ...g, updated_at: new Date().toISOString() }));
      log(`J${j} : ${games.length} matchs`);
    } catch (e) {
      log(`J${j} : échec (${e.message})`); failures++; consecutive++;
      if (!firstError) { firstError = e.message; await setState("running", "Diagnostic : " + e.message.slice(0, 900)); }
      if (consecutive >= 3) throw new Error("Arrêt après 3 journées illisibles. " + firstError.slice(0, 900));
      continue;
    }
    consecutive = 0;
  }
  if (rows.length) {
    for (let i = 0; i < rows.length; i += 100) { const { error: e } = await db.from("league_games").upsert(rows.slice(i, i + 100), { onConflict: "id" }); if (e) throw e; }
  }
  // 2) Détail des matchs terminés non encore lus
  const { data: all } = await db.from("league_games").select("id, journee, date, home, away, status, has_detail").order("date");
  const todo = (all || []).filter(g => g.status === "termine" && !g.has_detail).slice(0, MAX_GAMES);
  await setState("running", `Lecture de ${todo.length} feuille(s) de match…`);
  for (const g of todo) {
    try {
      await openGame(page, g.journee, g.home, g.away);
      const box = LNB.parseBox(await readBox(page));
      if (box.length < 2) throw new Error("Boxscore illisible");
      const ev = LNB.parsePbp(await readPbp(page));
      const detail = gameDetail(box, ev);
      await db.from("league_games").update({ detail, raw: { box, events: ev }, has_detail: true, updated_at: new Date().toISOString() }).eq("id", g.id);
      detailed++; log(`Détail ${g.id} (${ev.length} actions)`);
    } catch (e) { failures++; log(`Détail ${g.id} : échec (${e.message})`); }
  }
  // 3) Matchs du SCABB (table matches)
  const { data: all2 } = await db.from("league_games").select("id, journee, date, time, home, away, status, home_pts, away_pts, detail").or("home.ilike.%SCABB%,away.ilike.%SCABB%");
  const { data: mrows } = await db.from("matches").select("id, date, lnb_key, status, final");
  for (const g of all2 || []) {
    const home = isScabb(g.home), us = home ? 0 : 1;
    const row = { lnb_key: g.id, journee: g.journee, date: g.date, time: g.time, opp: home ? g.away : g.home, loc: home ? "Dom" : "Ext", comp: "Élite 2", lnb_comp: "e2" };
    if (g.status === "termine" && g.detail) {
      const me = g.detail.teams[us], op = g.detail.teams[1 - us];
      row.status = "termine";
      row.final = { us: me.total, op: op.total, periods: (g.detail.periods || []).map(p => ({ per: p.per, us: us === 0 ? p.h : p.a, op: us === 0 ? p.a : p.h })),
        players: me.players.map(p => ({ num: p.num, nom: LNB.lastName(p.name), min: p.min, pts: p.pts, reb: p.orb + p.drb, pd: p.ast, bp: p.tov, pm: p.pm, eval: p.eval })) };
    }
    const ex = (mrows || []).find(m => m.lnb_key === g.id) || (mrows || []).find(m => !m.lnb_key && m.date === g.date);
    if (ex) { if (ex.status === "live" && !row.status) delete row.status; await db.from("matches").update(row).eq("id", ex.id); }
    else await db.from("matches").insert({ ...row, status: row.status || "prevu" });
  }
  // 4) Instantané des 20 équipes
  const { data: det } = await db.from("league_games").select("id, journee, date, home, away, status, home_pts, away_pts, detail").eq("has_detail", true);
  const snap = compact(profiles(det || []));
  await db.from("league_snapshot").upsert({ id: "e2", data: snap, updated_at: new Date().toISOString() });
  await setState("ok", `À jour : ${(det || []).length} matchs analysés${failures ? ` · ${failures} échec(s), nouvelle tentative au prochain passage` : ""}.`);
  log("Terminé :", detailed, "nouveaux matchs détaillés,", failures, "échecs");
} catch (e) {
  log("Erreur :", e.message); await setState("error", e.message);
  process.exitCode = 1;
} finally { await browser.close(); }
