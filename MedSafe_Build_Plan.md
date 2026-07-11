# MedSafe — 28-Day Solo Build Plan (Claude Code / Cursor)

**What you're building:** A web app where a user enters their medications and gets back
(1) dangerous drug–drug interactions with plain-language explanations, (2) a daily
morning/noon/night schedule, and (3) a shareable PDF summary for their doctor.

**Approach:** Text-first MVP. Photo/OCR is a stretch piece at the end.
**Framing everywhere:** educational awareness tool, "always talk to your doctor/pharmacist" —
never diagnosis. Put this disclaimer in the UI and the pitch.

---

## Locked-in stack
- **Frontend:** Next.js (React) + Tailwind CSS
- **Backend:** Next.js API routes (one codebase, no separate server)
- **Database:** Supabase (hosted Postgres) via Prisma — seeded from DDInter 2.0
- **Drug name matching:** RxNorm REST API (free, live)
- **Plain-language explanations:** an LLM API (use your hackathon credits)
- **PDF:** client-side (react-pdf) or server-side (pdfkit)

Why this stack: one repo, no DevOps, deploys to Vercel in minutes, and Supabase gives you a
real hosted database (plus a dashboard to inspect your data, and free auth/storage if you later
add accounts or photo upload). Free tier is plenty for a hackathon.

---

## How to use this document
Each **PIECE** below is one prompt. Paste it into Claude Code, let it finish, test it,
commit, then move to the next. Do them in order — later pieces assume earlier ones exist.
Start each new session by pointing Claude Code at `CLAUDE.md` (Piece 0).

---

## PIECE 0 — Project scaffold + CLAUDE.md

> Create a new Next.js 14 app (App Router) called `medsafe` with TypeScript, Tailwind CSS,
> and Prisma configured for a Supabase Postgres database. Read the Postgres connection string
> from a `DATABASE_URL` env var (I'll paste my Supabase connection string into `.env`). Set up a
> clean folder structure: `/app` for routes, `/lib` for helpers, `/prisma` for schema. Add a
> health-check API route at `/api/ping` that returns `{ ok: true }`. Create a `CLAUDE.md` file at
> the repo root with exactly this content:
>
> ```markdown
> # MedSafe
>
> Educational web app that checks a user's medication list for drug–drug interactions,
> builds a daily dosing schedule, and exports a PDF summary for their doctor.
> NOT a diagnostic tool — every screen must remind users to consult a doctor/pharmacist.
>
> ## Tech stack
> - Next.js 14 (App Router) + TypeScript + Tailwind
> - Prisma + Supabase Postgres (seeded from DDInter 2.0)
> - RxNorm REST API for drug-name normalization
> - LLM API for plain-language interaction explanations
>
> ## Key conventions
> - All backend logic lives in Next.js API routes under /app/api
> - Reusable logic in /lib (rxnorm.ts, interactions.ts, llm.ts)
> - Drug names are always normalized to an RxCUI before any interaction lookup
> - Never invent interaction data — only return what's in the seeded DB
>
> ## File structure
> - /app         routes + pages
> - /app/api     backend endpoints
> - /lib         rxnorm, interactions, llm, pdf helpers
> - /prisma      schema.prisma + seed.ts + ddinter CSV
> - /components  React UI components
> ```
>
> Then run the dev server and confirm `/api/ping` works.

---

## PIECE 1 — Database schema + DDInter seed

**Before this piece:** (1) create a free Supabase project and copy its Postgres connection
string into `.env` as `DATABASE_URL`. (2) download DDInter 2.0 CSV files (search "DDInter 2.0
download"). Put the main interaction CSV in `/prisma/data/ddinter.csv`. If you can't get it fast,
tell Claude Code to generate a 60-row sample CSV of well-known interactions so you're unblocked.

> Using Prisma against my Supabase Postgres database (DATABASE_URL is set in `.env`), define a
> schema with two tables:
> - `Drug` (id, rxcui string nullable, name, unique on name)
> - `Interaction` (id, drugAName, drugBName, severity enum [Minor/Moderate/Major],
>   mechanism text nullable, description text nullable)
>
> Write a seed script `/prisma/seed.ts` that reads `/prisma/data/ddinter.csv` and populates
> the `Interaction` table. Normalize drug names to lowercase for matching. Add an index on
> (drugAName, drugBName). Run `prisma migrate` against Supabase and seed, then print how many
> interaction rows were inserted. Confirm the rows appear in the Supabase table editor.

---

## PIECE 2 — RxNorm normalization service

> Create `/lib/rxnorm.ts` with a function `normalizeDrugName(input: string)` that calls the
> RxNorm REST API (`findRxcuiByString`, and fall back to `getApproximateMatch` if no exact
> hit) and returns `{ rxcui, standardName }` or null if not found. Handle brand→generic
> (e.g. "Tylenol" → "acetaminophen"). Cache results in memory to avoid repeat calls.
> Add an API route `/api/normalize?name=...` that returns the result so I can test it in the browser.

---

## PIECE 3 — Interaction-check engine

> Create `/lib/interactions.ts` with `checkInteractions(drugNames: string[])`. For every
> unique pair of drugs, normalize both names, then query the `Interaction` table for a match
> in either order (A-B or B-A). Return a list of found interactions with severity, the two
> drug names, mechanism, and description. Also return a list of drugs it couldn't recognize.
> Add a POST API route `/api/check` that accepts `{ drugs: string[] }` and returns the result JSON.
> Do not fabricate interactions — only return DB matches.

---

## PIECE 4 — LLM plain-language explainer

> Create `/lib/llm.ts` with `explainInteraction(interaction)` that sends the DB interaction
> record to the LLM API and returns a short, plain-English explanation a patient can understand
> (2 sentences max, no medical jargon, always ending with "Ask your doctor or pharmacist before
> changing anything."). Read the API key from an env var. Wire this into `/api/check` so each
> returned interaction includes an `explanation` field. Add graceful fallback text if the LLM call fails.

---

## PIECE 5 — Frontend: input + results

> Build the main page at `/app/page.tsx`. A large, accessible form where the user adds
> medications one at a time (chip/tag list, easy to remove). A prominent "Check my medications"
> button calls `/api/check`. Render results as cards grouped by severity: Major (red), Moderate
> (amber), Minor (grey), each showing the two drugs, the plain-language explanation, and severity.
> Show unrecognized drugs separately with a gentle "we couldn't find this one" note. Big fonts,
> high contrast, mobile-friendly. Put a persistent disclaimer banner: "Educational tool only —
> not medical advice."

---

## PIECE 6 — Daily schedule + PDF export

> Add a `/lib/schedule.ts` helper that takes the medication list and buckets each into
> Morning / Noon / Evening / Night based on typical dosing frequency (default sensible times;
> this is illustrative, not prescriptive). Render it as a clean visual timetable below the results.
> Add an "Export PDF for my doctor" button that generates a one-page PDF containing: the full
> medication list, all flagged interactions with severity, the daily schedule, a timestamp, and
> the disclaimer. Use react-pdf or pdfkit.

---

## PIECE 7 — Polish, accessibility, deploy

> Polish the whole app: loading states, empty states, error handling, keyboard navigation,
> and ARIA labels for screen readers (this is a health-accessibility app, so accessibility is
> a scoring point). Add a short "How it works" section and an "About / Safety" page explaining
> the data sources (DDInter 2.0, RxNorm) and the not-a-diagnosis limitation. Prepare it for
> Vercel deployment and give me the deploy steps.

---

## PIECE 8 — STRETCH: photo/OCR (only if Pieces 0–7 are done)

> Add an image-upload option on the main page. When a user uploads a photo of a medication
> label, send it to a vision-capable LLM API and extract the drug name(s), then feed them into
> the existing `/api/check` flow. Show the extracted names for the user to confirm/edit before
> checking. Keep the text-input path as the default; this is an enhancement, not a replacement.

---

## Suggested 28-day timeline (solo)
- **Days 1–3:** Pieces 0–1 (scaffold + DB seeded and verified)
- **Days 4–7:** Pieces 2–3 (normalization + interaction engine working end to end via API)
- **Days 8–11:** Piece 4–5 (LLM explanations + usable frontend)
- **Days 12–15:** Piece 6 (schedule + PDF)
- **Days 16–19:** Piece 7 (polish, accessibility, deploy live)
- **Days 20–23:** Piece 8 if time allows; otherwise harden and fix bugs
- **Days 24–26:** Record demo video, write Devpost description, build slide deck
- **Days 27–28:** Buffer + final submission (don't leave submission to the last hour — deadline is Aug 8, 7:30pm GMT+8)

---

## Submission checklist (from the rules)
Project Description · Demo Video · GitHub repo (public) · Presentation deck · Team/solo details ·
Theme = **AI for Social Impact** (or AI & Intelligent Systems) · Live demo link (Vercel URL)

## Demo video outline (2–3 min)
1. The problem: patients on many meds, no one checks the full list (10s, one stat).
2. Live: type in 4 real meds including a known dangerous pair → red Major warning appears.
3. Show the plain-language explanation + the daily schedule.
4. Click Export PDF → show the doctor-ready summary.
5. Close on data sources + the "not a diagnosis" responsibility. Confident, 20s.
