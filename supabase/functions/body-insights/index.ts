import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { profile, longevityScore, biologicalAge, chronologicalAge, systemScores, completedFixes } =
      await req.json();

    if (!profile) {
      return new Response(JSON.stringify({ error: "profile is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are an elite longevity medicine AI advisor (Peter Attia / Andrew Huberman / David Sinclair caliber).
Analyze the patient's data and return ONE primary issue with the highest impact on lifespan, plus 3 prioritized actions.
Be direct, specific, and reference actual values. Do NOT hedge. The patient wants to live to 120+.
Severity scale: critical | high | moderate | low.
Each action must be concrete (verb-led, ≤12 words) with a one-sentence "why".
Categories for actions: nutrition | exercise | sleep | recovery | medication | testing | lifestyle.
Urgency: now | this-week | this-month.`;

    const userContent = `Patient data:
${JSON.stringify(profile, null, 2)}

Computed:
- Longevity score: ${longevityScore}/100
- Biological age: ${biologicalAge}, Chronological: ${chronologicalAge}
- System risk scores (higher = worse): ${JSON.stringify(systemScores)}
- Recently completed fixes (avoid repeating): ${JSON.stringify(completedFixes ?? [])}

Identify the single most critical issue and 3 prioritized actions.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_insights",
              description: "Return the primary health issue and prioritized actions.",
              parameters: {
                type: "object",
                properties: {
                  main_issue: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "Short title, ≤6 words" },
                      explanation: { type: "string", description: "1–2 sentences citing actual values" },
                      severity: { type: "string", enum: ["critical", "high", "moderate", "low"] },
                      life_impact: { type: "string", description: "How this affects lifespan/healthspan" },
                      category: { type: "string" },
                    },
                    required: ["title", "explanation", "severity", "life_impact", "category"],
                    additionalProperties: false,
                  },
                  actions: {
                    type: "array",
                    minItems: 3,
                    maxItems: 3,
                    items: {
                      type: "object",
                      properties: {
                        action: { type: "string", description: "Concrete verb-led action ≤12 words" },
                        why: { type: "string", description: "One sentence rationale with values when possible" },
                        impact: { type: "string", description: "Expected impact" },
                        category: {
                          type: "string",
                          enum: ["nutrition", "exercise", "sleep", "recovery", "medication", "testing", "lifestyle"],
                        },
                        urgency: { type: "string", enum: ["now", "this-week", "this-month"] },
                      },
                      required: ["action", "why", "impact", "category", "urgency"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["main_issue", "actions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_insights" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call returned", JSON.stringify(data));
      return new Response(JSON.stringify({ error: "AI did not return structured insights" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      return new Response(JSON.stringify({ error: "Failed to parse AI output" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("body-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
