// Deletes the calling user's data + auth record.
// Requires the user's JWT in the Authorization header.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Identify the caller from their JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // Service-role client for cascade + auth delete
    const admin = createClient(supabaseUrl, serviceKey);

    // Best-effort: remove any uploaded medical documents from storage
    try {
      const { data: docs } = await admin
        .from("medical_documents")
        .select("file_path")
        .eq("user_id", userId);
      const paths = (docs ?? [])
        .map((d: { file_path: string | null }) => d.file_path)
        .filter((p): p is string => !!p);
      if (paths.length) {
        await admin.storage.from("medical-documents").remove(paths);
      }
    } catch (_) {
      /* non-fatal */
    }

    const tables = [
      "medical_documents",
      "user_substances",
      "user_family_history",
      "health_snapshots",
      "intake_sessions",
      "action_completions",
      "health_profiles",
      "user_privacy_settings",
    ];
    for (const t of tables) {
      await admin.from(t).delete().eq("user_id", userId);
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      return new Response(
        JSON.stringify({ error: delErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
});
