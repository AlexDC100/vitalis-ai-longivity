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

const OPTIMAL_RANGES: Record<string, { min: number; max: number; unit: string; label: string }> = {
  fasting_glucose: { min: 72, max: 90, unit: "mg/dL", label: "Fasting Glucose" },
  hba1c: { min: 4.0, max: 5.2, unit: "%", label: "HbA1c" },
  fasting_insulin: { min: 2, max: 6, unit: "µIU/mL", label: "Fasting Insulin" },
  total_cholesterol: { min: 150, max: 200, unit: "mg/dL", label: "Total Cholesterol" },
  ldl: { min: 50, max: 100, unit: "mg/dL", label: "LDL" },
  hdl: { min: 60, max: 100, unit: "mg/dL", label: "HDL" },
  triglycerides: { min: 40, max: 80, unit: "mg/dL", label: "Triglycerides" },
  apob: { min: 40, max: 80, unit: "mg/dL", label: "ApoB" },
  hscrp: { min: 0, max: 0.5, unit: "mg/L", label: "hs-CRP" },
  homocysteine: { min: 5, max: 8, unit: "µmol/L", label: "Homocysteine" },
  vitamin_d: { min: 50, max: 80, unit: "ng/mL", label: "Vitamin D" },
  testosterone: { min: 600, max: 900, unit: "ng/dL", label: "Testosterone" },
  free_t: { min: 15, max: 25, unit: "pg/mL", label: "Free Testosterone" },
  cortisol: { min: 6, max: 15, unit: "µg/dL", label: "Cortisol" },
  tsh: { min: 0.5, max: 2.0, unit: "mIU/L", label: "TSH" },
  free_t3: { min: 3.0, max: 4.0, unit: "pg/mL", label: "Free T3" },
  free_t4: { min: 1.0, max: 1.5, unit: "ng/dL", label: "Free T4" },
  bp_systolic: { min: 100, max: 120, unit: "mmHg", label: "Systolic BP" },
  bp_diastolic: { min: 60, max: 80, unit: "mmHg", label: "Diastolic BP" },
  resting_hr: { min: 50, max: 60, unit: "bpm", label: "Resting HR" },
  hrv_ms: { min: 50, max: 100, unit: "ms", label: "HRV" },
  vo2_max: { min: 45, max: 60, unit: "mL/kg/min", label: "VO2 Max" },
  avg_sleep_hours: { min: 7.0, max: 9.0, unit: "hours", label: "Sleep Duration" },
  sleep_quality: { min: 80, max: 100, unit: "/100", label: "Sleep Quality" },
  body_fat_pct: { min: 10, max: 18, unit: "%", label: "Body Fat" },
  waist_cm: { min: 70, max: 85, unit: "cm", label: "Waist" },
  igf1: { min: 100, max: 200, unit: "ng/mL", label: "IGF-1" },
  dhea_s: { min: 300, max: 500, unit: "µg/dL", label: "DHEA-S" },
  estradiol: { min: 20, max: 35, unit: "pg/mL", label: "Estradiol" },
  lpa: { min: 0, max: 30, unit: "nmol/L", label: "Lp(a)" },
  fev1_pct: { min: 90, max: 110, unit: "%", label: "FEV1" },
};

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

    const { documentId, fileContent, fileName, fileBase64, mimeType } = await req.json();

    // Get existing profile for context
    const { data: existingProfile } = await supabase
      .from("health_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // Determine text content - use vision API for scanned PDFs
    let textContent = fileContent || "";
    const isTextPoor = !textContent || textContent.trim().length < 200 || (textContent.match(/[a-zA-Z]/g) || []).length < 100;

    if (isTextPoor && fileBase64 && mimeType === "application/pdf") {
      console.log("Native text extraction poor, using Vision API for OCR...");
      const visionResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: "Extract ALL text from this medical/lab document. Include every number, lab value, reference range, and annotation. Return only the extracted text, no commentary." },
              { type: "image_url", image_url: { url: `data:application/pdf;base64,${fileBase64}` } }
            ]
          }],
        }),
      });
      if (visionResp.ok) {
        const visionData = await visionResp.json();
        textContent = visionData.choices?.[0]?.message?.content || textContent;
        console.log("Vision OCR extracted:", textContent.length, "chars");
      }
    }

    if (!textContent || textContent.trim().length < 50) {
      throw new Error("Could not extract text from document. Try a text-based file or a clearer scan.");
    }

    // Build profile context for AI
    const profileContext = existingProfile ? `
Patient context:
- Weight: ${existingProfile.weight_kg || "unknown"} kg
- Height: ${existingProfile.height_cm || "unknown"} cm
- Age: ${existingProfile.date_of_birth ? Math.floor((Date.now() - new Date(existingProfile.date_of_birth).getTime()) / 31557600000) : "unknown"}
- Sex: ${existingProfile.sex || "unknown"}
- Current VO2 Max: ${existingProfile.vo2_max || "unknown"}
- Current HRV: ${existingProfile.hrv_ms || "unknown"}ms
- Current Sleep: ${existingProfile.avg_sleep_hours || "unknown"}h
- Body Fat: ${existingProfile.body_fat_pct || "unknown"}%
` : "";

    const extractPrompt = `You are an elite longevity medicine physician combining the expertise of Dr. Peter Attia, Dr. Andrew Huberman, and Dr. David Sinclair. Analyze this health document with surgical precision.

${profileContext}

Return a JSON object with:

1. "biomarkers" - Extract ALL numeric values matching these keys: ${BIOMARKER_KEYS.join(", ")}
   Rules: numeric values only, glucose in mg/dL, cholesterol in mg/dL, vitamin_d in ng/mL

2. "biomarker_analysis" - Array of objects for EVERY extracted biomarker:
   {
     "key": "<biomarker_key>",
     "value": <number>,
     "status": "optimal" | "suboptimal" | "warning" | "critical",
     "optimal_range": "<min>-<max>",
     "interpretation": "<2-3 sentence clinical interpretation explaining what this means for longevity>",
     "longevity_impact": <1-10 score of impact on lifespan>,
     "improvement_potential": "<specific actionable improvement>"
   }

3. "health_scores" - Object with:
   {
     "overall_longevity": <0-100>,
     "metabolic_health": <0-100>,
     "cardiovascular_risk": <0-100 where 100=lowest risk>,
     "hormonal_balance": <0-100>,
     "inflammation_index": <0-100 where 100=lowest inflammation>,
     "biological_age_estimate": <number>,
     "projected_healthspan_years": <number>,
     "top_risk_factors": ["<risk1>", "<risk2>", "<risk3>"]
   }

4. "recommendations" - Array of 8-12 highly specific, actionable recommendations:
   {
     "title": "<concise title>",
     "description": "<detailed 3-4 sentence recommendation with specific protocols, dosages, and timelines>",
     "priority": "critical" | "high" | "medium" | "low",
     "category": "Metabolic" | "Cardiovascular" | "Hormonal" | "Inflammation" | "Sleep" | "Fitness" | "Nutrition" | "Supplementation" | "Stress",
     "expected_impact": "<quantified expected improvement>",
     "timeline": "<when to expect results>",
     "evidence_level": "strong" | "moderate" | "emerging"
   }

5. "medicine_stack" - Array of 6-10 evidence-based supplements/medications:
   {
     "name": "<supplement/medication name>",
     "dosage": "<exact dosage with units>",
     "frequency": "<when and how to take>",
     "reason": "<why this is needed based on SPECIFIC biomarker values>",
     "evidence_level": "strong" | "moderate" | "emerging",
     "expected_effect": "<what biomarkers this will improve and by how much>",
     "interactions": "<any interactions or contraindications>",
     "priority": <1-10 importance ranking>
   }

6. "lifestyle_protocol" - Object with daily protocol:
   {
     "morning_routine": ["<specific action 1>", "<specific action 2>"],
     "exercise_protocol": {"type": "<modality>", "frequency": "<per week>", "duration": "<minutes>", "intensity": "<zone/level>"},
     "nutrition_guidelines": ["<specific guideline 1>", "<specific guideline 2>"],
     "sleep_protocol": ["<specific action 1>", "<specific action 2>"],
     "stress_management": ["<specific action 1>", "<specific action 2>"]
   }

7. "provider": lab/clinic name
8. "document_type": "Blood Work" | "Hormones" | "Imaging" | "Fitness" | "Genetics" | "General"

Be AGGRESSIVE with your analysis. Flag everything suboptimal. This person wants to live to 120+ in peak condition. Every biomarker matters. Reference specific values and optimal longevity ranges.

Document:
${textContent}`;

    console.log("Sending comprehensive analysis request for:", fileName);

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are an elite longevity medicine AI. Return ONLY valid JSON. No markdown fences. Be thorough and aggressive in your analysis — this person is optimizing for maximum healthspan." },
          { role: "user", content: extractPrompt }
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI parse error:", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI analysis failed: ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const rawContent = aiData.choices?.[0]?.message?.content;
    if (!rawContent) throw new Error("No content from AI");

    let jsonStr = rawContent.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr);
    const {
      biomarkers = {},
      biomarker_analysis = [],
      health_scores = {},
      recommendations = [],
      medicine_stack = [],
      lifestyle_protocol = {},
      provider = "",
      document_type = "General"
    } = parsed;

    console.log("Extracted biomarkers:", Object.keys(biomarkers).length);
    console.log("Biomarker analyses:", biomarker_analysis.length);
    console.log("Recommendations:", recommendations.length);
    console.log("Medicine stack:", medicine_stack.length);
    console.log("Health scores:", JSON.stringify(health_scores));

    // Update medical_documents record with full analysis
    if (documentId) {
      await supabase.from("medical_documents").update({
        extracted_data: {
          biomarkers,
          biomarker_analysis,
          health_scores,
          lifestyle_protocol,
        },
        recommendations,
        medicine_stack,
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
        console.log("Updating health profile with:", Object.keys(validBiomarkers).length, "biomarkers");
        await supabase.from("health_profiles")
          .update(validBiomarkers)
          .eq("user_id", user.id);
      }
    }

    return new Response(JSON.stringify({
      biomarkers,
      biomarker_analysis,
      health_scores,
      recommendations,
      medicine_stack,
      lifestyle_protocol,
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
