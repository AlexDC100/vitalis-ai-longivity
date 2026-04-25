import { useState } from "react";
import { Beaker, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp, Play, Zap } from "lucide-react";

type Severity = "LOW" | "MODERATE" | "HIGH" | "URGENT";

type TriggerCondition =
  | "high-risk-biomarkers"
  | "serious-pattern"
  | "repeated-warnings"
  | "serious-symptom-question"
  | "none";

const TRIGGER_META: Record<TriggerCondition, { label: string; hint: string; tone: "danger" | "warn" | "ok" }> = {
  "high-risk-biomarkers":     { label: "High-risk biomarkers",     hint: "One or more lab values are well outside safe range.", tone: "danger" },
  "serious-pattern":          { label: "Serious health pattern",   hint: "Multiple metrics combine into a clinically concerning picture.", tone: "danger" },
  "repeated-warnings":        { label: "Repeated warning signals", hint: "Several moderate flags reinforce each other.", tone: "warn" },
  "serious-symptom-question": { label: "Serious symptom reported", hint: "User-reported symptoms suggest possible acute risk.", tone: "danger" },
  "none":                     { label: "No trigger",               hint: "Inputs look normal / low-risk — no booking card.", tone: "ok" },
};

/**
 * Predicts which booking-trigger condition the live system would fire for
 * the test inputs. This is a *preview* — the actual decision is made by
 * the AI's severity tag at runtime — but it lets us sanity-check the
 * escalation logic without sending the prompt.
 */
function predictTrigger(labs: string, biometrics: string, symptoms: string): TriggerCondition {
  const allText = `${labs}\n${biometrics}\n${symptoms}`.toLowerCase();

  // 1. Acute / serious symptoms → highest priority trigger
  const seriousSymptoms = [
    "chest pain", "chest tightness", "shortness of breath", "difficulty breathing",
    "fainting", "passed out", "stroke", "slurred speech", "numbness",
    "suicidal", "severe headache", "vision loss", "blood in stool", "coughing blood",
  ];
  if (seriousSymptoms.some(s => symptoms.toLowerCase().includes(s))) {
    return "serious-symptom-question";
  }

  // 2. High-risk biomarker thresholds (rough heuristics matching common danger zones)
  const highRiskPatterns: RegExp[] = [
    /ldl[^\d]{0,8}(1[6-9]\d|[2-9]\d{2,})/i,         // LDL ≥ 160
    /apob[^\d]{0,8}(1[3-9]\d|[2-9]\d{2,})/i,        // ApoB ≥ 130
    /lp\(?a\)?[^\d]{0,8}(1[5-9]\d|[2-9]\d{2,})/i,   // Lp(a) ≥ 150
    /hba1c[^\d]{0,8}(6\.[5-9]|[7-9]\.\d|1\d)/i,     // HbA1c ≥ 6.5
    /fasting glucose[^\d]{0,8}(1[2-9]\d|[2-9]\d{2,})/i, // ≥ 126
    /(bp|blood pressure)[^\d]{0,8}(1[5-9]\d|[2-9]\d{2,})\s*\/\s*(9[5-9]|[1-9]\d{2,})/i, // ≥150/95
    /hs[- ]?crp[^\d]{0,8}([5-9]|\d{2,})/i,          // hs-CRP ≥ 5
  ];
  const highRiskHits = highRiskPatterns.filter(r => r.test(allText)).length;
  if (highRiskHits >= 1 && labs.trim().length > 0) {
    // Multiple high-risk biomarkers stacking = serious pattern
    if (highRiskHits >= 2) return "serious-pattern";
    return "high-risk-biomarkers";
  }

  // 3. Repeated moderate warnings (count borderline flags)
  const moderatePatterns: RegExp[] = [
    /ldl[^\d]{0,8}(1[3-5]\d)/i,             // LDL 130–159
    /hba1c[^\d]{0,8}(5\.[7-9]|6\.[0-4])/i,  // HbA1c 5.7–6.4
    /(bp|blood pressure)[^\d]{0,8}(1[3-4]\d)/i,
    /resting hr[^\d]{0,8}(8\d|9\d|1\d{2,})/i, // RHR ≥ 80
    /hrv[^\d]{0,8}([1-2]?\d)\s*ms/i,          // HRV < 30
    /sleep[^\d]{0,8}([1-5])\s*h/i,            // Sleep ≤ 5h
    /vo2[^\d]{0,8}([1-2]\d|30|31|32)/i,       // VO2 ≤ 32
  ];
  const moderateHits = moderatePatterns.filter(r => r.test(allText)).length;
  if (moderateHits >= 2) return "repeated-warnings";

  return "none";
}

const REQUIRED_HEADERS = [
  { id: "summary",    label: "1. Summary",              regex: /^##\s*1\.\s*Summary/im },
  { id: "severity",   label: "2. Severity Level",       regex: /^##\s*2\.\s*Severity\s+Level/im },
  { id: "findings",   label: "3. Key Findings",         regex: /^##\s*3\.\s*Key\s+Findings/im },
  { id: "actions",    label: "4. Recommended Actions",  regex: /^##\s*4\.\s*Recommended\s+Actions/im },
  { id: "care",       label: "5. Care Recommendation",  regex: /^##\s*5\.\s*Care\s+Recommendation/im },
] as const;

const SEVERITY_TAG_REGEX = /\[\[SEVERITY:(LOW|MODERATE|HIGH|URGENT)\]\]/i;

export interface TestRunResult {
  prompt: string;
  rawResponse: string;
  headersFound: Record<string, boolean>;
  severityTag: Severity | null;
  passed: boolean;
}

interface Props {
  /**
   * Sends a prompt through the same chat pipeline as a normal message and
   * resolves with the full assistant response (including the hidden
   * `[[SEVERITY:...]]` and `[[SPECIALTY:...]]` tags). The host component
   * is responsible for using the same systemPrompt as the real chat so
   * the test reflects production behavior.
   */
  runPrompt: (prompt: string) => Promise<string>;
}

export default function AIDoctorTestMode({ runPrompt }: Props) {
  const [open, setOpen] = useState(false);
  const [labs, setLabs] = useState("");
  const [biometrics, setBiometrics] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [deviceData, setDeviceData] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestRunResult | null>(null);

  const buildPrompt = () => {
    const blocks: string[] = [
      "[TEST MODE] Treat the following as the patient's full clinical context for this turn. Respond with the mandatory 5-block structure and the [[SEVERITY:...]] / [[SPECIALTY:...]] tags exactly as instructed.",
    ];
    if (labs.trim())       blocks.push(`### Lab results\n${labs.trim()}`);
    if (biometrics.trim()) blocks.push(`### Biometrics\n${biometrics.trim()}`);
    if (symptoms.trim())   blocks.push(`### Symptoms reported by user\n${symptoms.trim()}`);
    if (deviceData.trim()) blocks.push(`### Device / wearable data\n${deviceData.trim()}`);
    blocks.push("Now produce the full structured response.");
    return blocks.join("\n\n");
  };

  const validate = (response: string): TestRunResult => {
    const headersFound: Record<string, boolean> = {};
    for (const h of REQUIRED_HEADERS) headersFound[h.id] = h.regex.test(response);
    const sevMatch = response.match(SEVERITY_TAG_REGEX);
    const severityTag = (sevMatch ? sevMatch[1].toUpperCase() : null) as Severity | null;
    const allHeaders = Object.values(headersFound).every(Boolean);
    return {
      prompt: buildPrompt(),
      rawResponse: response,
      headersFound,
      severityTag,
      passed: allHeaders && severityTag !== null,
    };
  };

  const handleRun = async () => {
    if (running) return;
    if (!labs.trim() && !biometrics.trim() && !symptoms.trim() && !deviceData.trim()) return;
    setRunning(true);
    setResult(null);
    try {
      const response = await runPrompt(buildPrompt());
      setResult(validate(response));
    } catch (e) {
      setResult({
        prompt: buildPrompt(),
        rawResponse: e instanceof Error ? e.message : "Unknown error",
        headersFound: Object.fromEntries(REQUIRED_HEADERS.map(h => [h.id, false])),
        severityTag: null,
        passed: false,
      });
    } finally {
      setRunning(false);
    }
  };

  const loadSample = () => {
    setLabs("LDL: 190 mg/dL\nApoB: 135 mg/dL\nLp(a): 210 nmol/L\nhs-CRP: 4.2 mg/L\nFasting glucose: 105 mg/dL\nHbA1c: 5.9%");
    setBiometrics("Age: 42, Sex: male\nBP: 148/94 mmHg\nResting HR: 78 bpm\nHRV: 28 ms\nVO2 max: 31 ml/kg/min\nWeight: 92 kg, Body fat: 28%");
    setSymptoms("Occasional chest tightness during exertion in the last 2 weeks. Tired in the afternoons.");
    setDeviceData("Avg sleep last 14 days: 5h 40m\nDeep sleep: 38 min/night\nStep count: ~4,200/day");
  };

  return (
    <div className="border-b border-border/50 bg-secondary/20">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Beaker className="w-3.5 h-3.5" />
          <span className="font-medium">Test mode</span>
          <span className="text-muted-foreground/70">— verify 5-block structure</span>
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-2.5 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label="Lab results"  value={labs}       onChange={setLabs}       placeholder="LDL: 190 mg/dL&#10;ApoB: 135 mg/dL" />
            <Field label="Biometrics"   value={biometrics} onChange={setBiometrics} placeholder="BP: 148/94&#10;Resting HR: 78 bpm" />
            <Field label="Symptoms"     value={symptoms}   onChange={setSymptoms}   placeholder="Chest tightness on exertion..." />
            <Field label="Device data (optional)" value={deviceData} onChange={setDeviceData} placeholder="Sleep: 5h 40m&#10;Steps: 4,200/day" />
          </div>

          {/* Live trigger-condition preview — updates as the user types */}
          <TriggerPreview trigger={predictTrigger(labs, biometrics, symptoms)} />

          <div className="flex items-center gap-2">
            <button
              onClick={handleRun}
              disabled={running}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {running ? "Running..." : "Run test"}
            </button>
            <button
              onClick={loadSample}
              disabled={running}
              className="px-3 py-1.5 rounded-lg border border-border text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Load sample
            </button>
          </div>

          {result && (
            <div className={`rounded-xl border p-3 space-y-2 ${
              result.passed ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"
            }`}>
              <div className="flex items-center gap-1.5">
                {result.passed
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  : <XCircle className="w-4 h-4 text-red-400" />}
                <span className={`text-xs font-semibold ${result.passed ? "text-emerald-400" : "text-red-400"}`}>
                  {result.passed ? "Structure valid" : "Structure invalid"}
                </span>
                {result.severityTag && (
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                    Severity: <span className="text-foreground font-semibold">{result.severityTag}</span>
                  </span>
                )}
              </div>

              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
                {REQUIRED_HEADERS.map(h => (
                  <li key={h.id} className="flex items-center gap-1.5 text-[11px]">
                    {result.headersFound[h.id]
                      ? <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                      : <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
                    <span className={result.headersFound[h.id] ? "text-foreground" : "text-muted-foreground"}>{h.label}</span>
                  </li>
                ))}
                <li className="flex items-center gap-1.5 text-[11px]">
                  {result.severityTag
                    ? <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    : <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
                  <span className={result.severityTag ? "text-foreground" : "text-muted-foreground"}>
                    [[SEVERITY:…]] tag
                  </span>
                </li>
              </ul>

              <details className="pt-1">
                <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                  View raw AI response
                </summary>
                <pre className="mt-1.5 text-[10px] leading-relaxed whitespace-pre-wrap bg-background/50 border border-border/30 rounded-lg p-2 max-h-48 overflow-auto text-muted-foreground">
                  {result.rawResponse}
                </pre>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-medium text-muted-foreground mb-1">{label}</span>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        maxLength={2000}
        className="w-full text-[11px] bg-card border border-border/50 rounded-lg px-2 py-1.5 text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 transition-colors resize-none"
      />
    </label>
  );
}