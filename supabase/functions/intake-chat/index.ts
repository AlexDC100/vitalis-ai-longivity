import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Section = "basics" | "cardio" | "lipids" | "metabolic" | "lifestyle";

const SECTION_PROMPTS: Record<Section, { intro: string; fields: string[]; goal: string }> = {
  basics: {
    intro:
      "We're starting the longevity intake with the basics: name, date of birth, biological sex, height, weight.",
    fields: ["full_name", "date_of_birth", "sex", "height_cm", "weight_kg", "body_fat_pct", "waist_cm"],
    goal:
      "Collect identity + body composition. Ask warmly, one or two items at a time, accept any unit and convert (e.g. 5'10\" -> cm, 180 lb -> kg).",
  },
  cardio: {
    intro: "Now cardiovascular markers.",
    fields: ["bp_systolic", "bp_diastolic", "resting_hr", "hrv_ms", "vo2_max"],
    goal: "Ask for blood pressure, resting HR, HRV (if known from a wearable), and VO2 max.",
  },
  lipids: {
    intro: "Lipids and inflammation panel.",
    fields: ["total_cholesterol", "ldl", "hdl", "triglycerides", "apob", "lpa", "hscrp", "homocysteine"],
    goal:
      "Ask if they have a recent lipid panel. Walk through values one cluster at a time. Accept mmol/L and convert to mg/dL where appropriate.",
  },
  metabolic: {
    intro: "Metabolic and hormonal markers.",
    fields: [
      "fasting_glucose",
      "hba1c",
      "fasting_insulin",
      "vitamin_d",
      "tsh",
      "free_t3",
      "free_t4",
      "testosterone",
      "free_t",
      "estradiol",
      "dhea_s",
      "cortisol",
      "igf1",
    ],
    goal: "Ask for available metabolic + hormone values. Skip items they don't have without making them feel bad.",
  },
  lifestyle: {
    intro: "Last section — sleep and recovery.",
    fields: ["avg_sleep_hours", "sleep_quality", "fev1_pct"],
    goal:
      "Ask about average nightly sleep, subjective sleep quality 0-100, and lung function (FEV1 % predicted) if known.",
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, section } = (await req.json()) as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      section: Section;
    };

    if (!section || !SECTION_PROMPTS[section]) {
      return new Response(JSON.stringify({ error: "Invalid section" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cfg = SECTION_PROMPTS[section];

    const systemPrompt = `You are Vitalis, a calm, warm longevity-medicine intake assistant.
You are conducting the "${section}" section of a 5-part intake.
${cfg.intro}
Goal: ${cfg.goal}

Rules:
- Speak in short, conversational messages (1-3 sentences). Never lecture.
- Ask for one or two values at a time. Never list every field at once.
- If the user says they don't know a value, accept it and move on — never push.
- Convert units silently (imperial -> metric, mmol/L -> mg/dL where standard).
- After each user reply, ALWAYS call the "record_intake" tool with:
    - "extracted": an object with the fields you just learned (only the ones that changed; use the exact field keys from the schema; numeric fields must be numbers).
    - "reply": your next short conversational message to the user.
    - "section_complete": true ONLY when you have asked about every field in this section (or the user has explicitly skipped them) AND you are wrapping up.
- When section_complete is true, your "reply" should be a one-line confirmation like "Perfect, moving on." — do not ask another question.
- Never invent values. If the user didn't say it, don't extract it.`;

    const fieldProperties: Record<string, unknown> = {};
    for (const f of cfg.fields) {
      if (f === "full_name" || f === "sex" || f === "date_of_birth") {
        fieldProperties[f] = { type: "string" };
      } else {
        fieldProperties[f] = { type: "number" };
      }
    }

    const tools = [
      {
        type: "function",
        function: {
          name: "record_intake",
          description: "Record extracted intake fields and reply to the user.",
          parameters: {
            type: "object",
            properties: {
              extracted: {
                type: "object",
                properties: fieldProperties,
                additionalProperties: false,
              },
              reply: { type: "string", description: "Next conversational message to the user." },
              section_complete: { type: "boolean" },
            },
            required: ["extracted", "reply", "section_complete"],
            additionalProperties: false,
          },
        },
      },
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        tools,
        tool_choice: { type: "function", function: { name: "record_intake" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add funds to your Lovable AI workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("intake-chat AI error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("intake-chat: missing tool call", JSON.stringify(data).slice(0, 800));
      return new Response(
        JSON.stringify({
          extracted: {},
          reply: "Sorry — I lost my train of thought. Could you say that again?",
          section_complete: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let parsed: { extracted: Record<string, unknown>; reply: string; section_complete: boolean };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (err) {
      console.error("intake-chat: bad JSON from tool", toolCall.function.arguments);
      return new Response(
        JSON.stringify({
          extracted: {},
          reply: "Could you repeat that one more time?",
          section_complete: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Whitelist extracted fields against the section schema to be safe.
    const safeExtracted: Record<string, unknown> = {};
    for (const key of cfg.fields) {
      if (parsed.extracted && key in parsed.extracted) {
        safeExtracted[key] = parsed.extracted[key];
      }
    }

    return new Response(
      JSON.stringify({
        extracted: safeExtracted,
        reply: typeof parsed.reply === "string" ? parsed.reply : "",
        section_complete: !!parsed.section_complete,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("intake-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});