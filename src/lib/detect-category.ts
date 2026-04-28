/**
 * Lightweight, synchronous detection of the document category from the file
 * itself (mime type + filename). Used to give the clinician immediate
 * feedback on what was uploaded BEFORE the AI triage completes.
 *
 * Returns a short, human-readable label aligned with the categories the
 * AI triage may later refine (MRI, CT, X-Ray, ECG, Lab Report, …).
 */
export type DetectedCategory =
  | "PDF Lab Results"
  | "CT Scan"
  | "MRI Scan"
  | "X-Ray"
  | "Ultrasound"
  | "ECG"
  | "Pathology"
  | "Clinical Note"
  | "Medical Image"
  | "Document";

export function detectCategory(file: File): DetectedCategory {
  const name = file.name.toLowerCase();
  const mime = (file.type || "").toLowerCase();

  const has = (...needles: string[]) => needles.some((n) => name.includes(n));

  if (has("ecg", "ekg")) return "ECG";
  if (has("ct-", "ct_", "ctscan", "ct ")) return "CT Scan";
  if (has("mri")) return "MRI Scan";
  if (has("xray", "x-ray", "xr-", "xr_")) return "X-Ray";
  if (has("ultrasound", "us-", "us_", "sono")) return "Ultrasound";
  if (has("path", "biopsy", "histology")) return "Pathology";
  if (has("note", "discharge", "letter", "summary")) return "Clinical Note";
  if (has("lab", "blood", "panel", "cbc", "lipid", "metabolic", "results")) {
    return mime === "application/pdf" ? "PDF Lab Results" : "Lab Report" as DetectedCategory;
  }

  if (mime === "application/pdf") return "PDF Lab Results";
  if (mime.startsWith("image/")) return "Medical Image";
  return "Document";
}
