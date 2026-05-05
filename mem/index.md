# Project Memory

## Core
Longevity AI is a consumer-facing personal longevity & healthspan platform — for individuals who want to live longer, healthier lives. NOT a B2B hospital/clinic product.
Tagline: "Intelligence for longer, healthier lives." Premium dark theme (deep navy + teal/cyan gradient). Apple-inspired minimalism, smooth, calm, premium feel.
Three core screens: AI Doctor (chat) → Body (biomarkers) → Diagnosis (longevity report). Bottom pill nav. No duplicate CTAs for the same action.
Always show disclaimer: "Educational summary only — not a substitute for medical advice." Use safe wording (possible finding, suggested review, requires clinician confirmation). Never claim final diagnosis.
Supabase (DB/Storage) + Gemini 2.5 Flash via edge functions. Auth via Google/Apple/Email. No guest/demo mode.
Logo: circular ring with DNA helix + neural branch in teal/cyan gradient. Available at src/assets/longevity-ai-logo.png. Use the shared <Logo /> component.

## Memories
- [Diagnostic Workflow](mem://features/diagnostic-workflow) — Upload → AI pre-review → triage → doctor-ready report → queue
- [Safety Language](mem://features/safety-language) — Required disclaimer + banned phrases (no "diagnosis", "doctor replacement")
- [Auth Enforced Access](mem://auth/enforced-access) — No guest mode. Google/Apple/Email only
- [System Architecture](mem://tech/architecture) — Supabase DB/Storage + Gemini 2.5 Flash via edge functions
