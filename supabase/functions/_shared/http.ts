// Outils communs aux fonctions : CORS, réponses JSON, contrôle d'accès
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export const admin = (): SupabaseClient =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

/** Autorise : un membre du staff connecté (jeton de session) ou le robot (clé service). */
export async function authorize(req: Request): Promise<{ ok: boolean; who: "staff" | "robot" | null }> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, who: null };
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const robot = Deno.env.get("ROBOT_KEY");
  if ((svc && token === svc) || (robot && token === robot)) return { ok: true, who: "robot" };
  const { data, error } = await admin().auth.getUser(token);
  return error || !data?.user ? { ok: false, who: null } : { ok: true, who: "staff" };
}
