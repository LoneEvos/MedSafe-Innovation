# MedSafe — 28-Day Solo Build Plan (v2, Claude Code / Cursor)

**Theme:** AI for Social Impact (also fits AI & Intelligent Systems).
**Tags:** Health · ML/AI · Web.

**What you're building:** A web app where a user enters their medications — by typing OR by
photographing a pill-bottle label — and gets back:
1. Dangerous drug–drug interactions, grounded in a real dataset, with plain-language explanations.
2. A **whole-regimen risk summary** — AI reasoning over the *entire* med list (cumulative sedation,
   duplicate drug classes, timing conflicts), not just isolated pairs.
3. A daily morning/noon/night schedule.
4. A shareable PDF summary for their doctor.

**Why this version:** two of the six judging criteria are Innovation and Technical Excellence,
and the judge is an AI Engineer. A plain "look up a pair in a table" app reads as a thin wrapper.
So the AI does real work here — **vision label-reading** and **whole-regimen reasoning** — while
the downloaded dataset keeps the hard interaction facts accurate. Text input stays as the
always-works path so your live demo can never break.

**Framing everywhere:** educational awareness tool, "always talk to your doctor/pharmacist" —
never diagnosis. This is on every screen and in the pitch.

---

## Locked-in stack
- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend:** Next.js API routes (one repo, no separate server)
- **Database:** Supabase (hosted Postgres) via Prisma — seeded from DDInter 2.0
- **Drug name matching:** RxNorm REST API (free, live)
- **AI:** a vision-capable LLM API (label reading + regimen reasoning) — use your hackathon credits
- **PDF:** react-pdf (client) or pdfkit (server)

---

## The safety rule that keeps the AI honest
The **database is the source of truth for interactions** — the LLM may never invent an interaction
that isn't a DB hit. The LLM's job is two things only: (a) rephrase real DB hits in plain language,
and (b) give *general educational context* about the overall regimen (e.g. "three of these can
cause drowsiness — combined they may make you sleepier"), clearly labeled as awareness, not a
diagnosis. This distinction is what makes it both innovative AND responsible — say it out loud in your demo.

---

## How to use this document
Each **PIECE** is one prompt. Paste into Claude Code, let it finish, test, commit, next.
Start every session by pointing Claude Code at `CLAUDE.md` (Piece 0). Do them in order.

---

## PIECE 0 — Project scaffold + CLAUDE.md

> Create a new Next.js 14 app (App Router) called `medsafe` with TypeScript, Tailwind CSS,
> and Prisma configured for a Supabase Postgres database. Read the Postgres connection string
> from a `DATABASE_URL` env var (I'll paste my Supabase string into `.env`). Folder structure:
> `/app` routes, `/app/api` endpoints, `/lib` helpers, `/prisma` schema, `/components` UI.
> Add a health-check route `/api/ping` returning `{ ok: true }`. Create `CLAUDE.md` at the repo
> root with exactly this content:
>
> ```markdown
> # MedSafe
>
> Educational web app that checks a user's medication list for drug–drug interactions,
> reasons about whole-regimen risk, builds a daily schedule, and exports a PDF for their doctor.
> NOT a diagnostic tool — every screen must remind users to consult a doctor/pharmacist.
>
> ## Tech stack
> - Next.js 14 (App Router) + TypeScript + Tailwind
> - Prisma + Supabase Postgres (seeded from DDInter 2.0)
> - RxNorm REST API for drug-name normalization
> - Vision-capable LLM API for label reading + plain-language regimen reasoning
>
> ## Key conventions
> - All backend logic lives in Next.js API routes under /app/api
> - Reusable logic in /lib (rxnorm.ts, interactions.ts, llm.ts, vision.ts)
> - Drug names are always normalized to an RxCUI before any interaction lookup
> - The DB is the ONLY source of interaction facts — the LLM never invents interactions
> - LLM regimen reasoning is general educational context, always labeled "not medical advice"
>
> ## File structure
> - /app         routes + pages
> - /app/api     backend endpoints
> - /lib         rxnorm, interactions, llm, vision, pdf helpers
> - /prisma      schema.prisma + seed.ts + ddinter CSV
> - /components  React UI components
> ```
>
> Then run the dev server and confirm `/api/ping` works.

---

## PIECE 1 — Supabase DB schema + DDInter seed

**Before this piece:** (1) create a free Supabase project; copy its Postgres connection string
into `.env` as `DATABASE_URL` (use the pooler URL, port 6543, for the app and the direct URL,
port 5432, for migrations). (2) download DDInter 2.0 CSV (search "DDInter 2.0 download"); put it
in `/prisma/data/ddinter.csv`. If blocked, have Claude Code generate a 60-row sample of well-known
interactions so you're unblocked.

> Using Prisma against my Supabase Postgres (DATABASE_URL in `.env`), define:
> - `Drug` (id, rxcui string nullable, name, unique on name)
> - `Interaction` (id, drugAName, drugBName, severity enum [Minor/Moderate/Major],
>   mechanism text nullable, description text nullable)
>
> Write `/prisma/seed.ts` that reads `/prisma/data/ddinter.csv` into `Interaction`, lowercasing
> names for matching, with an index on (drugAName, drugBName). Run migrate + seed, print the row
> count, and confirm rows appear in the Supabase table editor.

---

## PIECE 2 — RxNorm normalization service

> Create `/lib/rxnorm.ts` with `normalizeDrugName(input)` calling the RxNorm REST API
> (`findRxcuiByString`, falling back to `getApproximateMatch`). Return `{ rxcui, standardName }`
> or null. Handle brand→generic (e.g. "Tylenol" → "acetaminophen"). Cache in memory.
> Add `/api/normalize?name=...` to test in the browser.

---

## PIECE 3 — Interaction-check engine (DB truth)

> Create `/lib/interactions.ts` with `checkInteractions(drugNames[])`. Normalize each name, then
> for every unique pair query `Interaction` in either order (A-B or B-A). Return found interactions
> (severity, both names, mechanism, description) and a list of unrecognized drugs. Never fabricate
> interactions — DB matches only. Add POST `/api/check` accepting `{ drugs: string[] }`.

---

## PIECE 4 — AI regimen-reasoning engine (the differentiator)

> Create `/lib/llm.ts` with two functions:
> 1. `explainInteraction(hit)` — turns one DB interaction into 2 plain-English sentences, no jargon,
>    ending "Ask your doctor or pharmacist before changing anything."
> 2. `analyzeRegimen(drugs, dbHits)` — sends the FULL medication list plus the confirmed DB
>    interaction hits to the LLM and returns a short "whole-regimen risk summary": cumulative effects
>    (e.g. combined drowsiness, serotonin/anticholinergic burden), duplicate drug classes, and timing
>    conflicts. STRICT RULE in the prompt: it may only treat the provided DB hits as confirmed
>    interactions and must frame everything else as general educational awareness, not new interaction
>    claims or diagnosis. Read the API key from an env var; graceful fallback text on failure.
>
> Wire both into `/api/check` so the response includes per-interaction `explanation` plus a
> top-level `regimenSummary`.

---

## PIECE 5 — Frontend: input + results

> Build `/app/page.tsx`: a large, accessible form to add meds one at a time (removable chips) and a
> prominent "Check my medications" button hitting `/api/check`. Show the **regimen risk summary** at
> the top (this is the headline). Below it, interaction cards grouped by severity: Major (red),
> Moderate (amber), Minor (grey) — each with the two drugs, plain-language explanation, and severity.
> Unrecognized drugs listed separately with a gentle note. Big fonts, high contrast, mobile-first.
> Persistent banner: "Educational tool only — not medical advice."

---

## PIECE 6 — Photo label reading (core AI, not stretch)

> Add an image-upload option beside the text input. On upload, POST the image to a new
> `/api/scan` route that calls a vision-capable LLM (`/lib/vision.ts`) to extract medication
> name(s) and dose from the label. Return the extracted names to the UI as editable chips for the
> user to CONFIRM before checking — then feed them into the existing `/api/check` flow. Keep text
> input as the default path; photo is an enhancement layered on top, never a replacement.

---

## PIECE 7 — Daily schedule + PDF export

> Add `/lib/schedule.ts` bucketing each med into Morning/Noon/Evening/Night by typical frequency
> (sensible defaults; illustrative, not prescriptive). Render a clean visual timetable under the
> results. Add "Export PDF for my doctor" generating a one-page PDF: full med list, all flagged
> interactions with severity, the regimen summary, the schedule, a timestamp, and the disclaimer.

---

## PIECE 8 — Polish, accessibility, deploy

> Polish: loading/empty/error states, keyboard nav, ARIA labels (accessibility is a scoring point
> for a health app). Add a "How it works" section and an "About / Safety" page naming the data
> sources (DDInter 2.0, RxNorm) and the not-a-diagnosis limitation. Prepare for Vercel deploy and
> give me the steps.

---

## Suggested 28-day timeline (solo)
- **Days 1–3:** Pieces 0–1 (scaffold + Supabase seeded and verified)
- **Days 4–7:** Pieces 2–3 (normalization + interaction engine end to end)
- **Days 8–12:** Piece 4–5 (regimen reasoning + usable frontend) — your core is now demoable
- **Days 13–16:** Piece 6 (photo label reading) — the "wow" AI moment
- **Days 17–19:** Piece 7 (schedule + PDF)
- **Days 20–23:** Piece 8 (polish, accessibility, deploy live) + bug hardening
- **Days 24–26:** Record demo video, write Devpost description, build slide deck
- **Days 27–28:** Buffer + submit early (deadline Aug 8, 7:30pm GMT+8 — don't submit in the last hour)

**If you fall behind:** Pieces 0–5 alone are a complete, submittable app. Photo (6) is the first
thing to cut, then PDF (7). Never cut the regimen summary — that's your innovation story.

---

## Submission checklist (from the rules)
Project Description · Demo Video · GitHub (public) · Presentation deck (optional) · Team/solo details ·
Theme = **AI for Social Impact** · Live demo link (Vercel URL)
⚠️ Confirm the solo option on the submission form — written rules say teams of 2–4.

## Demo video outline (2–3 min)
1. Problem: patients on many meds, no one reviews the full list; cite your pharmacist study (10s).
2. Live text demo: enter 4 real meds with a known dangerous pair → red Major warning + regimen summary.
3. Photo demo: snap a pill-bottle label → name auto-extracted → confirm → checked. (Your AI moment.)
4. Show the daily schedule + Export PDF → doctor-ready summary.
5. Close on: DB = facts, AI = plain-language + whole-regimen reasoning, and "not a diagnosis." 20s, confident.
