# MedSafe 💊

**Catch dangerous drug interactions before they catch you.**

MedSafe is a mobile-first educational web app that lets anyone check their medications for dangerous drug–drug interactions — by typing the names or snapping a photo of the label. It standardizes drug names, looks up every pair in a real clinical interaction database, explains the risks in plain language, and produces a one-page summary to share with a doctor.

🔗 **Live demo:** https://medsafe-innovation26.vercel.app/

> ⚕️ **MedSafe is an educational awareness tool — not a diagnosis.** It does not replace professional medical advice. Always consult your doctor or pharmacist before starting, stopping, or changing any medication.

---

## 🏆 About this project

Built for **NextGen Innovation 2026** — a global innovation hackathon (*Innovate • Collaborate • Transform*) challenging students to build AI solutions with real-world impact.

- **Theme:** AI for Social Impact
- **Tags:** Health · Machine Learning/AI · Web

The idea came from a trip with my family, watching my father take a handful of medicines for his liver and cholesterol without knowing whether they were safe together. MedSafe is my attempt to give ordinary people a way to understand what's in their own medicine cabinet.

---

## ✨ Features

- **Add medications** by typing, or by **taking / uploading a photo** of the label (AI reads the drug name for you to confirm).
- **Checks every unique pair** of drugs against the DDInter 2.0 interaction database.
- **Drug-name standardization** via RxNorm, matched by RxCUI (so "Tylenol", "acetaminophen", and misspellings all resolve to the same drug).
- **Severity-graded results** (Major / Moderate / Minor) with plain-language explanations.
- **Whole-regimen AI summary** that considers your entire medication list together.
- **Illustrative daily schedule** (Morning / Noon / Evening / Night).
- **Export a one-page PDF** to share with your doctor.
- **Safety-first design:** never invents interactions — only reports real database matches — with disclaimers throughout.

---

## 🛠️ Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase (PostgreSQL) via Prisma |
| Interaction data | DDInter 2.0 |
| Drug normalization | RxNorm API (U.S. National Library of Medicine) |
| AI | LLM via OpenRouter (label reading + plain-language explanations) |
| Hosting | Vercel |

---

## 🚀 Getting started

### Prerequisites
- Node.js 18+
- A Supabase project (free tier is fine)
- An OpenRouter API key

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/LoneEvos/MedSafe-Innovation.git
cd MedSafe-Innovation

# 2. Install dependencies
npm install

# 3. Configure environment variables (see below)
cp .env.example .env

# 4. Set up the database
npx prisma migrate deploy
npx prisma db seed

# 5. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

Create a `.env` file with:

```env
DATABASE_URL="your-supabase-postgres-connection-string"
OPENROUTER_API_KEY="your-openrouter-api-key"
```

> Use the Supabase **connection pooler** URL (port 6543) for the app, and the **direct** URL (port 5432) for migrations.

---

## 🗃️ Data sources

- **[DDInter 2.0](http://ddinter.scbdd.com/)** — a curated drug–drug interaction database (severity, mechanism, evidence).
- **[RxNorm](https://www.nlm.nih.gov/research/umls/rxnorm/)** — normalized naming for clinical drugs, from the U.S. National Library of Medicine.

---

## ⚠️ Disclaimer

MedSafe is provided for **educational and awareness purposes only**. It is not a medical device, does not provide medical advice, diagnosis, or treatment, and must not be used as a substitute for consultation with a qualified healthcare professional. "No interaction found" does **not** guarantee that a combination is safe. Always talk to your doctor or pharmacist.

---

## 📄 License

Released under the MIT License.
