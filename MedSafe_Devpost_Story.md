## Inspiration

The idea for MedSafe started on a trip with my parents. I noticed how many different medicines my father has to take — some for his liver, some for his cholesterol. I used to be a biology student, and one thought kept nagging at me: *is it actually safe to take all of these together?*

What worried me more was that my father didn't know either. He was simply trusting his doctor's advice, taking each pill without really knowing what any of them do or how they might interact. And he's not alone — a lot of people, especially older patients on many medications, are in exactly the same position.

Fast forward to one day when I was browsing Devpost and found a hackathon asking people to build something with AI that could make a real impact on society. It just clicked. That worry from my trip finally had somewhere to go: an app where you can type in your medicines — or simply take a photo of the label — and get a clear, trustworthy answer about whether they interact.

Before committing, I wanted to make sure this wasn't just a nice idea but a genuinely useful one. A research review on how AI can support pharmaceutical care and clinical pharmacy ([ScienceDirect](https://www.sciencedirect.com/science/article/pii/S2949866X26000250)) helped confirm that this is a real problem AI can meaningfully help with — and that grounding the tool in a trusted interaction database was the responsible way to do it.

## What it does

MedSafe lets anyone check their medications for dangerous drug–drug interactions in plain language.

- **Add your medicines** by typing them, or by taking/uploading a photo of the label — an AI reads the drug name for you to confirm.
- **Every pair is checked** against DDInter 2.0, a real clinical interaction database. Drug names are standardized through RxNorm, so "Tylenol" and "acetaminophen" are treated as the same drug.
- **You get a clear result:** each interaction is shown with its severity (Major, Moderate, Minor) and a plain-language explanation, plus a whole-regimen summary that looks at your entire medication list together.
- **A daily schedule and a one-page PDF** you can bring to your doctor.

Rather than only checking a few obvious combinations, MedSafe checks *every* unique pair. For a list of \( n \) medications, that means evaluating

$$ \text{pairs} = \binom{n}{2} = \frac{n(n-1)}{2} $$

interactions — so a patient on 8 medicines has 28 pairs quietly working against each other, far more than anyone can track in their head.

Most importantly, MedSafe never invents interactions — it only reports what's in the trusted database — and it always reminds you that it's an educational tool, not a diagnosis. Always talk to your doctor or pharmacist.

## Who it's for and design choices

I deliberately built MedSafe as a **mobile-first educational tool for everyday people** — patients and caregivers like my father — not as a professional, pharmacist-grade system. That focus shaped every decision: a phone-friendly layout, the option to just snap a photo of a label, plain-language explanations instead of clinical jargon, and constant reminders to consult a real professional. The goal isn't to replace a pharmacist's judgment, but to help ordinary people ask better questions and understand what's in their own medicine cabinet. A clinically validated, pharmacist-facing version is a natural next step — but starting from awareness felt like the right and responsible place to begin.

## Challenges I ran into

This was my **first hackathon**, so almost everything was new to me. Choosing the tech stack and figuring out the design was genuinely hard — I didn't know what tools to pick or how to make it look like a real product. Working through those decisions step by step (with a lot of help from my AI assistant, Claude) is what finally let me turn the idea from my trip into something real.

A tricky technical challenge was drug-name matching: the database stores aspirin as "acetylsalicylic acid," so when someone typed "aspirin" it wasn't finding the interaction. Fixing that meant matching drugs by their RxNorm ID instead of their name — a small change that made the whole tool actually reliable.

And the challenge I honestly didn't expect: **editing the demo video**. Building the app was one thing, but presenting it clearly in a short video turned out to be its own skill.

## What I learned

I learned that a real problem plus the right tools can take you surprisingly far, even solo and even as a first-timer. On the technical side, I learned how messy real-world medical data is — the same drug can have many names — and why standardizing it (RxNorm, RxCUI) matters so much for trust.

But the biggest lesson was about responsibility. Building something in health means clarity and safety matter more than flashy features: grounding every answer in a trusted source, being honest about limitations, and always pointing people back to their doctor. I also learned to scope realistically — to ship a focused, working tool instead of chasing everything at once.

Most of all, I learned that the small worry I had on a trip with my father was worth acting on. If MedSafe helps even one person understand what's in their medicine cabinet a little better, it was worth building.

## What's next for MedSafe

- Expanding beyond drug–drug interactions to drug–food and drug–condition warnings.
- Support for more languages so it can help families everywhere.
- A saved medication profile so patients (and their caregivers) can track changes over time.
- Partnering with pharmacists to review and strengthen the guidance.
