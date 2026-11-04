// Pilote les robots GitHub Actions.
// { action: "live", match_id } démarre le suivi live ; { action: "stop", match_id } l'arrête ;
// { action: "league", full?: boolean } met à jour le championnat Élite 2.
import { admin, authorize, cors, json } from "../_shared/http.ts";

async function dispatch(workflow: string, inputs: Record<string, string>) {
  const repo = Deno.env.get("GH_REPO"), token = Deno.env.get("GH_TOKEN"), ref = Deno.env.get("GH_BRANCH") || "main";
  if (!repo || !token) throw new Error("Robot non configuré (GH_REPO / GH_TOKEN).");
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "scabb-analyse" },
    body: JSON.stringify({ ref, inputs }),
  });
  if (!r.ok) throw new Error(`GitHub a refusé le démarrage (${r.status}) : ${(await r.text()).slice(0, 160)}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = await authorize(req);
  if (!auth.ok) return json({ error: "Connexion requise." }, 401);
  const { action, match_id, full } = await req.json().catch(() => ({}));
  const db = admin();
  try {
    if (action === "league") {
      await db.from("league_state").upsert({ id: "e2", status: "starting", msg: "Démarrage du robot championnat…", updated_at: new Date().toISOString() });
      await dispatch("league.yml", { full: full ? "1" : "0" });
      return json({ ok: true });
    }
    if (!match_id) return json({ error: "match_id manquant." }, 400);
    if (action === "stop") {
      await db.from("live_state").update({ stop: true, worker_msg: "Arrêt demandé…" }).eq("match_id", match_id);
      return json({ ok: true });
    }
    if (action === "live") {
      const { data: m } = await db.from("matches").select("id").eq("id", match_id).single();
      if (!m) return json({ error: "Match introuvable." }, 404);
      await db.from("live_state").upsert({ match_id, stop: false, worker_status: "starting", worker_msg: "Démarrage du robot (environ 1 minute)…", updated_at: new Date().toISOString() });
      await dispatch("live.yml", { match_id });
      await db.from("matches").update({ status: "live" }).eq("id", match_id).neq("status", "termine");
      return json({ ok: true });
    }
    return json({ error: "Action inconnue." }, 400);
  } catch (e) {
    if (match_id) await db.from("live_state").update({ worker_status: "error", worker_msg: (e as Error).message }).eq("match_id", match_id);
    else await db.from("league_state").upsert({ id: "e2", status: "error", msg: (e as Error).message, updated_at: new Date().toISOString() });
    return json({ error: (e as Error).message }, 502);
  }
});
