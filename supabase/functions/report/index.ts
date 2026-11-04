// Génère un rapport et le fait rédiger par Claude (API Anthropic), puis l'enregistre dans "reports".
// { match_id, kind: "mt" | "final" }      rapport de match (données live, sinon feuille LNB du match)
// { kind: "scout", subject, match_id? }   scouting d'un adversaire (instantané du championnat)
// { kind: "season" }                      bilan d'évolution du SCABB et axes de travail
import { admin, authorize, cors, json } from "../_shared/http.ts";
import { buildPrompt, buildStats } from "../_shared/report-lib.js";
import { evolution, hydrate, scoutData, scoutPrompt, seasonPrompt } from "../_shared/league-lib.js";

const MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5";
const SCABB = "SCABB Saint-Étienne-Métropole";

function parseJson(text: string) {
  try { return JSON.parse(text); } catch { /* suite */ }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) { try { return JSON.parse(fence[1]); } catch { /* suite */ } }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(text.slice(a, b + 1));
  throw new Error("Réponse illisible");
}
async function claude(prompt: string) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return { ai: null, error: "ANTHROPIC_API_KEY non configurée : rapport chiffré sans texte." };
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body?.error?.message || `API ${r.status}`);
    const text = (body.content || []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    return { ai: parseJson(text), error: null };
  } catch (e) { return { ai: null, error: `Rédaction indisponible : ${(e as Error).message}` }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = await authorize(req);
  if (!auth.ok) return json({ error: "Connexion requise." }, 401);
  const { match_id, kind, subject } = await req.json().catch(() => ({}));
  if (!["mt", "final", "scout", "season"].includes(kind)) return json({ error: "kind invalide." }, 400);
  const db = admin();
  let stats: unknown, prompt: string;

  if (kind === "scout" || kind === "season") {
    const { data: snap } = await db.from("league_snapshot").select("data").eq("id", "e2").maybeSingle();
    const P = hydrate(snap?.data);
    if (!P) return json({ error: "Championnat pas encore chargé : lance « Mettre à jour le championnat »." }, 409);
    if (kind === "scout") {
      if (!subject) return json({ error: "subject (adversaire) requis." }, 400);
      const sd = scoutData(P, subject, SCABB);
      if (!sd) return json({ error: `Pas encore de match terminé pour ${subject}.` }, 409);
      let next = null;
      if (match_id) { const { data: m } = await db.from("matches").select("date, loc").eq("id", match_id).maybeSingle(); if (m) next = { date: m.date, home: m.loc === "Dom" }; }
      stats = { kind, subject, scout: sd }; prompt = scoutPrompt(sd, next);
    } else {
      const ed = evolution(P, SCABB);
      if (!ed) return json({ error: "Pas encore de match du SCABB analysé." }, 409);
      const { data: fin } = await db.from("reports").select("ai, created_at, match_id").eq("kind", "final").not("ai", "is", null).order("created_at", { ascending: false }).limit(12);
      const finals = (fin || []).map(r => ({ positifs: r.ai?.positifs, negatifs: r.ai?.negatifs }));
      stats = { kind, evo: ed }; prompt = seasonPrompt(ed, finals);
    }
  } else {
    if (!match_id) return json({ error: "match_id requis." }, 400);
    const { data: match } = await db.from("matches").select("*").eq("id", match_id).single();
    if (!match) return json({ error: "Match introuvable." }, 404);
    let src = (await db.from("live_state").select("box, events, us").eq("match_id", match_id).maybeSingle()).data;
    if ((!src?.box || !src?.events?.length) && match.lnb_key) {
      const { data: g } = await db.from("league_games").select("raw").eq("id", match.lnb_key).maybeSingle();
      if (g?.raw?.box) src = { box: g.raw.box, events: g.raw.events || [], us: /SCABB/i.test(g.raw.box[0].name) ? 0 : 1 };
    }
    if (!src?.box || !src?.events?.length) return json({ error: "Pas encore de données (live ou feuille LNB) pour ce match." }, 409);
    const { data: season } = await db.from("matches").select("id, date, final").eq("status", "termine").not("final", "is", null);
    stats = buildStats({ box: src.box, ev: src.events, us: src.us ?? 0, kind, match, season: season || [] });
    prompt = buildPrompt(stats as Parameters<typeof buildPrompt>[0]);
  }
  const { ai, error } = await claude(prompt);
  const { data: rep, error: insErr } = await db.from("reports").insert({ match_id: match_id || null, kind, subject: subject || null, stats, ai, model: ai ? MODEL : null, error }).select().single();
  if (insErr) return json({ error: insErr.message }, 500);
  return json(rep);
});
