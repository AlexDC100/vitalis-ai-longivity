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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader! } },
    });
    // Service role client to download files from storage
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { documentId, filePath } = await req.json();

    if (!documentId || !filePath) {
      throw new Error("Missing documentId or filePath");
    }

    // Update status to processing
    await supabase.from("medical_documents").update({ status: "processing" }).eq("id", documentId).eq("user_id", user.id);

    // Download file from storage
    console.log("Downloading file from storage:", filePath);
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from("medical-documents")
      .download(filePath);

    if (downloadError || !fileData) {
      console.error("Storage download error:", downloadError);
      throw new Error("Could not download file from storage");
    }

    // Convert to base64 for vision API
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const fileBase64 = btoa(binary);
    const mimeType = fileData.type || "application/pdf";
    const fileName = filePath.split("/").pop() || "document";

    console.log("File downloaded:", fileName, "size:", arrayBuffer.byteLength, "type:", mimeType);

    // Get existing profile for context
    const { data: existingProfile } = await supabase
      .from("health_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // Use vision API to extract text from the document
    console.log("Using Vision API for document analysis...");
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
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${fileBase64}` } }
          ]
        }],
      }),
    });

    let textContent = "";
    if (visionResp.ok) {
      const visionData = await visionResp.json();
      textContent = visionData.choices?.[0]?.message?.content || "";
      console.log("Vision OCR extracted:", textContent.length, "chars");
    } else {
      const errText = await visionResp.text();
      console.error("Vision API error:", visionResp.status, errText);
    }

    if (!textContent || textContent.trim().length < 50) {
      await supabase.from("medical_documents").update({ status: "error" }).eq("id", documentId).eq("user_id", user.id);
      throw new Error("Could not extract text from document. Try a clearer scan or text-based PDF.");
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
     "category": "cardiovascular" | "metabolic" | "hormonal" | "inflammation" | "lifestyle" | "nutrition" | "medication" | "diagnostic" | "imaging"
   }

5. "medicine_stack" - Array of evidence-based supplements/medications:
   {
     "name": "<supplement/medication name>",
     "dosage": "<exact dosage with units>",
     "frequency": "<when and how to take>",
     "reason": "<why this is needed based on SPECIFIC biomarker values>",
     "priority": <1-10 importance ranking>
   }

6. "provider": lab/clinic name
7. "document_type": "Blood Work" | "Hormones" | "Imaging" | "Fitness" | "Genetics" | "General"

Be AGGRESSIVE with your analysis. Flag everything suboptimal. This person wants to live to 120+ in peak condition.

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
          { role: "system", content: "You are an elite longevity medicine AI. Return ONLY valid JSON. No markdown fences. Be thorough and aggressive in your analysis." },
          { role: "user", content: extractPrompt }
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI parse error:", aiResp.status, errText);
      await supabase.from("medical_documents").update({ status: "error" }).eq("id", documentId).eq("user_id", user.id);
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
      provider = "",
      document_type = "General"
    } = parsed;

    console.log("Extracted biomarkers:", Object.keys(biomarkers).length);
    console.log("Recommendations:", recommendations.length);
    console.log("Medicine stack:", medicine_stack.length);

    // Update medical_documents record with full analysis
    await supabase.from("medical_documents").update({
      extracted_data: {
        biomarkers,
        biomarker_analysis,
        health_scores,
      },
      recommendations,
      medicine_stack,
      provider: provider || "",
      document_type: document_type || "General",
      status: "reviewed",
    }).eq("id", documentId).eq("user_id", user.id);

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
