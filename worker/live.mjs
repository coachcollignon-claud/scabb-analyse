// Robot de suivi live : ouvre le Match Center du match (calendrier Élite 2 → journée → match),
// lit Boxscore + Play by play toutes les INTERVAL secondes et écrit l'état dans Supabase.
// Rapport mi-temps puis rapport final automatiques, enregistrement du match, mise à jour du championnat.
import { createClient } from "@supabase/supabase-js";
import LNB from "./lnb.js";
import { finalFromLive } from "./report-lib.js";
import { isScabb } from "./league-lib.js";
import { launch, openCalendar, openGame, readBox, readPbp } from "./browser.mjs";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MATCH_ID } = process.env;
const INTERVAL = +(process.env.INTERVAL_S || 40) * 1000;
const MAX_MS = +(process.env.MAX_MIN || 210) * 60 * 1000;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !MATCH_ID) { console.error("Variables manquantes"); process.exit(1); }
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris" }), ...a);
const now = () => new Date().toISOString();
const KEY = process.env.ROBOT_KEY || SUPABASE_SERVICE_ROLE_KEY;
async function status(worker_status, worker_msg, extra = {}) { await db.from("live_state").upsert({ match_id: MATCH_ID, worker_status, worker_msg, updated_at: now(), ...extra }); }
async function fn(name, body) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, { method: "POST", headers: { Authorization: `Bearer ${KEY}`, apikey: process.env.SUPABASE_ANON_KEY || "", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  log(name, JSON.stringify(body), r.status); return r.ok;
}

const { data: match, error } = await db.from("matches").select("*").eq("id", MATCH_ID).single();
if (error || !match) { console.error("Match introuvable", error); process.exit(1); }
let home = match.loc === "Ext" ? match.opp : "SCABB Saint-Étienne-Métropole", away = match.loc === "Ext" ? "SCABB Saint-Étienne-Métropole" : match.opp, journee = match.journee;
if (match.lnb_key) { const { data: g } = await db.from("league_games").select("home, away, journee").eq("id", match.lnb_key).maybeSingle(); if (g) ({ home, away, journee } = g); }
log("Match :", match.date, home, "–", away, "J" + journee);

/** Sans journée connue : chercher la carte SCABB + adversaire dans la vue par défaut du calendrier */
async function openFallback(page) {
  await openCalendar(page, null);
  const games = LNB.parseCalendar(await page.evaluate(() => document.body.innerText));
  const g = games.find(x => (isScabb(x.home) || isScabb(x.away)) && LNB.norm(x.home + " " + x.away).includes(LNB.norm(match.opp).split(" ")[0]));
  if (!g) throw new Error(`Match SCABB – ${match.opp} introuvable dans le calendrier`);
  journee = g.journee; home = g.home; away = g.away;
  await openGame(page, journee, home, away);
}
const hasReport = async kind => { const { count } = await db.from("reports").select("id", { count: "exact", head: true }).eq("match_id", MATCH_ID).eq("kind", kind); return (count || 0) > 0; };

const { browser, page } = await launch();
const t0 = Date.now(); let fails = 0, mtDone = await hasReport("mt"), opened = false, lastCount = -1;
await status("starting", "Ouverture du calendrier LNB…", { stop: false });
try {
  while (Date.now() - t0 < MAX_MS) {
    const { data: st } = await db.from("live_state").select("stop").eq("match_id", MATCH_ID).single();
    if (st?.stop) { await status("stopped", "Suivi arrêté."); break; }
    try {
      if (!opened) { if (journee) await openGame(page, journee, home, away); else await openFallback(page); opened = true; log("Match Center ouvert"); }
      const box = LNB.parseBox(await readBox(page));
      const pbpTxt = await readPbp(page); const ev = LNB.parsePbp(pbpTxt), meta = LNB.parseMeta(pbpTxt);
      if (box.length < 2) throw new Error("Boxscore illisible");
      const us = LNB.detectUs(box), last = ev[ev.length - 1];
      await status("ok", ev.length ? `${ev.length} actions · ${last.clock} · ${meta.status || ""}`.trim() : `En attente du coup d'envoi · ${meta.status || ""}`, { box, events: ev, meta, us });
      if (ev.length !== lastCount) { log(ev.length, "actions", last ? last.clock : "", meta.status); lastCount = ev.length; }
      if (ev.length) await db.from("matches").update({ status: "live" }).eq("id", MATCH_ID).eq("status", "prevu");
      if (!mtDone && ev.length && (meta.half || last.per >= 3 || (last.per === 2 && last.rem === 0))) mtDone = await fn("report", { match_id: MATCH_ID, kind: "mt" });
      if (meta.final && ev.length) {
        const final = finalFromLive(box, ev, us);
        await db.from("matches").update({ status: "termine", final }).eq("id", MATCH_ID);
        if (!(await hasReport("final"))) await fn("report", { match_id: MATCH_ID, kind: "final" });
        await status("done", `Match terminé ${final.us.pts}-${final.op.pts} · enregistré. Mise à jour du championnat lancée.`);
        await fn("robot", { action: "league" });
        break;
      }
      fails = 0;
    } catch (e) {
      fails++; if (fails % 3 === 0) opened = false;
      log("Erreur :", e.message); await status(fails >= 3 ? "error" : "ok", `Lecture en échec (${fails}) : ${e.message}`);
    }
    await sleep(INTERVAL);
  }
} finally { await browser.close(); }
log("Fin du robot.");
