import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a clinical triage assistant for a hospital backlog dashboard.
You DO NOT diagnose. You provide an "AI-assisted insight" and a "suggested review".

Given a medical document (lab report, imaging report, scan, or note), return:
- case_type: one of "MRI" | "CT" | "X-Ray" | "Ultrasound" | "Blood Test" | "Pathology" | "Clinical Note" | "Other"
- priority: "high" | "medium" | "low" — based on findings urgency
- urgency_label: a short urgency phrase (e.g. "Same-day review", "Within 48h", "Routine")
- insight: ONE concise main finding (max 140 chars). Never call it a diagnosis.
- explanation: 2–4 short sentences explaining the finding in clinical language.
- recommendation: ONE concrete suggested next step for the reviewing clinician.

Be conservative. If the document lacks signal, return priority "low" with a clear note.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { text, fileName, base64, mimeType } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const userContent: any[] = [];
    if (text && typeof text === "string" && text.trim().length > 0) {
      userContent.push({
        type: "text",
        text: `File name: ${fileName ?? "unknown"}\n\nDocument text:\n${text.slice(0, 30000)}`,
      });
    } else if (base64 && mimeType) {
      userContent.push({
        type: "text",
        text: `File name: ${fileName ?? "unknown"}. Analyze the attached document.`,
      });
      userContent.push({
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${base64}` },
      });
    } else {
      userContent.push({
        type: "text",
        text: `File name: ${fileName ?? "unknown"}. No extractable content. Return low priority with a note that manual review is required.`,
      });
    }

    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "submit_triage",
            description: "Return structured triage result.",
            parameters: {
              type: "object",
              properties: {
                case_type: { type: "string" },
                priority: { type: "string", enum: ["high", "medium", "low"] },
                urgency_label: { type: "string" },
                insight: { type: "string" },
                explanation: { type: "string" },
                recommendation: { type: "string" },
              },
              required: [
                "case_type",
                "priority",
                "urgency_label",
                "insight",
                "explanation",
                "recommendation",
              ],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "submit_triage" } },
    };

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (resp.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit reached, please try again shortly." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (resp.status === 402) {
      return new Response(
        JSON.stringify({ error: "AI credits exhausted. Add credits to continue." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error", resp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    const args = call?.function?.arguments;
    if (!args) {
      return new Response(JSON.stringify({ error: "No structured output" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let parsed: any;
    try {
      parsed = JSON.parse(args);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid AI output" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("clinic-triage error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});