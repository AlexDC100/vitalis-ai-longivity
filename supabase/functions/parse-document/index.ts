import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BIOMARKER_KEYS = [
  "height_cm","weight_kg","body_fat_pct","waist_cm","bp_systolic","bp_diastolic",
  "hrv_ms","resting_hr","vo2_max","avg_sleep_hours","sleep_quality","fev1_pct",
  "fasting_glucose","hba1c","fasting_insulin","total_cholesterol","ldl","hdl",
  "triglycerides","apob","lpa","hscrp","homocysteine","vitamin_d","testosterone",
  "free_t","estradiol","dhea_s","cortisol","tsh","free_t3","free_t4","igf1"
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader! } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { documentId, fileContent, fileName } = await req.json();

    const extractPrompt = `You are a medical document parser. Extract ALL biomarker values from this health/lab report.

Return a JSON object with exactly these keys (only include keys where you find a value):
${BIOMARKER_KEYS.join(", ")}

Also return:
- "recommendations": an array of objects with {title, description, priority, category} for health recommendations based on the results
- "medicine_stack": an array of objects with {name, dosage, frequency, reason, evidence_level} for supplements/medications that could help based on the results
- "provider": the lab/clinic name if found
- "document_type": one of "Blood Work", "Hormones", "Imaging", "Fitness", "Genetics", "General"

Rules:
- Use numeric values only for biomarkers (no units)
- Convert units to match: glucose in mg/dL, cholesterol in mg/dL, vitamin_d in ng/mL
- Priority: "high", "medium", "low"
- evidence_level: "strong", "moderate", "emerging"
- Be thorough with recommendations - explain WHY based on specific values

Document content:
${fileContent}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: extractPrompt }],
        tools: [{
          type: "function",
          function: {
            name: "extract_health_data",
            description: "Extract biomarkers, recommendations, and medicine stack from a health document",
            parameters: {
              type: "object",
              properties: {
                biomarkers: {
                  type: "object",
                  description: "Extracted biomarker values as numbers",
                },
                recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      priority: { type: "string", enum: ["high", "medium", "low"] },
                      category: { type: "string" },
                    },
                    required: ["title", "description", "priority", "category"],
                  },
                },
                medicine_stack: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      dosage: { type: "string" },
                      frequency: { type: "string" },
                      reason: { type: "string" },
                      evidence_level: { type: "string", enum: ["strong", "moderate", "emerging"] },
                    },
                    required: ["name", "dosage", "frequency", "reason", "evidence_level"],
                  },
                },
                provider: { type: "string" },
                document_type: { type: "string" },
              },
              required: ["biomarkers", "recommendations", "medicine_stack"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_health_data" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI parse error:", aiResp.status, errText);
      throw new Error(`AI parsing failed: ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No structured output from AI");

    const parsed = JSON.parse(toolCall.function.arguments);
    const { biomarkers, recommendations, medicine_stack, provider, document_type } = parsed;

    // Update the medical_documents record
    if (documentId) {
      await supabase.from("medical_documents").update({
        extracted_data: biomarkers || {},
        recommendations: recommendations || [],
        medicine_stack: medicine_stack || [],
        provider: provider || "",
        document_type: document_type || "General",
        status: "reviewed",
      }).eq("id", documentId).eq("user_id", user.id);
    }

    // Update health profile with extracted biomarkers
    if (biomarkers && Object.keys(biomarkers).length > 0) {
      const validBiomarkers: Record<string, number> = {};
      for (const [key, val] of Object.entries(biomarkers)) {
        if (BIOMARKER_KEYS.includes(key) && typeof val === "number" && val > 0) {
          validBiomarkers[key] = val;
        }
      }
      if (Object.keys(validBiomarkers).length > 0) {
        await supabase.from("health_profiles")
          .update(validBiomarkers)
          .eq("user_id", user.id);
      }
    }

    return new Response(JSON.stringify({
      biomarkers: biomarkers || {},
      recommendations: recommendations || [],
      medicine_stack: medicine_stack || [],
      provider: provider || "",
      document_type: document_type || "General",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Parse document error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
