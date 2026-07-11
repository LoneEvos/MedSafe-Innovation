# MedSafe

Educational web app that checks a user's medication list for drug–drug interactions,
builds a daily dosing schedule, and exports a PDF summary for their doctor.
NOT a diagnostic tool — every screen must remind users to consult a doctor/pharmacist.

## Tech stack
- Next.js 14 (App Router) + TypeScript + Tailwind
- Prisma + Supabase Postgres (seeded from DDInter 2.0)
- RxNorm REST API for drug-name normalization
- LLM API for plain-language interaction explanations

## Key conventions
- All backend logic lives in Next.js API routes under /app/api
- Reusable logic in /lib (rxnorm.ts, interactions.ts, llm.ts)
- Drug names are always normalized to an RxCUI before any interaction lookup
- Never invent interaction data — only return what's in the seeded DB

## File structure
- /app         routes + pages
- /app/api     backend endpoints
- /lib         rxnorm, interactions, llm, pdf helpers
- /prisma      schema.prisma + seed.ts + ddinter CSV
- /components  React UI components
