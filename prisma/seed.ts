import { PrismaClient, Severity } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { normalizeDrugName } from "../lib/rxnorm";

// Seeds the Interaction table from two sources:
//   1. DDInter 2.0 download CSVs (ddinter_downloads_code_*.csv):
//        DDInterID_A, Drug_A, DDInterID_B, Drug_B, Level
//   2. A curated high-risk supplement (curated_high_risk.csv):
//        drug_a, drug_b, severity, mechanism, description
//      — vetted, sourced pairs (e.g. opioid + benzodiazepine) that DDInter
//        under-covers. Curated rows OVERRIDE DDInter for the same pair.
//
// Names are lowercased for matching, pairs deduplicated (unordered, A-B == B-A).

const prisma = new PrismaClient();
const DATA_DIR = join(__dirname, "data");
const CURATED_FILE = "curated_high_risk.csv";
const BATCH = 5000;

type InteractionRow = {
  drugAName: string;
  drugBName: string;
  severity: Severity;
  mechanism: string | null;
  description: string | null;
  source: string;
  rxcuiA: string | null;
  rxcuiB: string | null;
};

// Resolve every unique drug name to an RxCUI via RxNorm, in parallel batches.
// Uses the SAME normalizeDrugName as lookup so both sides map identically.
async function buildRxcuiMap(names: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const CONC = 12;
  for (let i = 0; i < names.length; i += CONC) {
    const batch = names.slice(i, i + CONC);
    const res = await Promise.all(batch.map((n) => normalizeDrugName(n)));
    batch.forEach((n, j) => map.set(n, res[j]?.rxcui ?? null));
    if (i % 300 === 0 || i + CONC >= names.length) {
      console.log(`  RxCUI ${Math.min(i + CONC, names.length)}/${names.length}`);
    }
  }
  return map;
}

function toSeverity(level: string): Severity | null {
  switch (level.trim().toLowerCase()) {
    case "major":
      return Severity.Major;
    case "moderate":
      return Severity.Moderate;
    case "minor":
      return Severity.Minor;
    default:
      return null;
  }
}

const pairKey = (a: string, b: string) => [a, b].sort().join("|");

async function main() {
  const files = readdirSync(DATA_DIR)
    .filter((f) => /^ddinter_downloads_code_.*\.csv$/i.test(f))
    .sort();

  if (files.length === 0) {
    throw new Error(`No ddinter_downloads_code_*.csv files found in ${DATA_DIR}`);
  }
  console.log(`Found ${files.length} DDInter CSV file(s): ${files.join(", ")}`);

  // Unordered pair key -> chosen interaction row.
  const byPair = new Map<string, InteractionRow>();
  const drugNames = new Set<string>();
  let ddinterRows = 0;
  let skipped = 0;

  // --- 1. DDInter (keep first occurrence per pair) ---
  for (const file of files) {
    const content = readFileSync(join(DATA_DIR, file), "utf8");
    const rows = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as { Drug_A?: string; Drug_B?: string; Level?: string }[];

    for (const row of rows) {
      ddinterRows++;
      const a = (row.Drug_A ?? "").trim().toLowerCase();
      const b = (row.Drug_B ?? "").trim().toLowerCase();
      const severity = toSeverity(row.Level ?? "");
      if (!a || !b || !severity || a === b) {
        skipped++;
        continue;
      }
      const key = pairKey(a, b);
      if (byPair.has(key)) continue;
      byPair.set(key, {
        drugAName: a,
        drugBName: b,
        severity,
        mechanism: null,
        description: null,
        source: "DDInter",
        rxcuiA: null,
        rxcuiB: null,
      });
      drugNames.add(a);
      drugNames.add(b);
    }
  }
  console.log(
    `DDInter: ${ddinterRows} rows -> ${byPair.size} unique pairs (skipped ${skipped}).`
  );

  // --- 2. Curated high-risk supplement (overrides DDInter for its pairs) ---
  let curatedAdded = 0;
  let curatedOverrode = 0;
  const curatedPath = join(DATA_DIR, CURATED_FILE);
  if (existsSync(curatedPath)) {
    const rows = parse(readFileSync(curatedPath, "utf8"), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as {
      drug_a?: string;
      drug_b?: string;
      severity?: string;
      mechanism?: string;
      description?: string;
    }[];

    for (const row of rows) {
      const a = (row.drug_a ?? "").trim().toLowerCase();
      const b = (row.drug_b ?? "").trim().toLowerCase();
      const severity = toSeverity(row.severity ?? "");
      if (!a || !b || !severity || a === b) continue;
      const key = pairKey(a, b);
      if (byPair.has(key)) curatedOverrode++;
      else curatedAdded++;
      byPair.set(key, {
        drugAName: a,
        drugBName: b,
        severity,
        mechanism: row.mechanism?.trim() || null,
        description: row.description?.trim() || null,
        source: "Curated",
        rxcuiA: null,
        rxcuiB: null,
      });
      drugNames.add(a);
      drugNames.add(b);
    }
    console.log(
      `Curated: added ${curatedAdded} new pairs, overrode ${curatedOverrode} existing.`
    );
  } else {
    console.log(`Curated: ${CURATED_FILE} not found, skipping.`);
  }

  const interactions = Array.from(byPair.values());
  console.log(`\nTotal unique interactions to insert: ${interactions.length}`);

  // Resolve RxCUIs so lookup can match on stable IDs, not name forms
  // (e.g. "aspirin" and "acetylsalicylic acid" both -> 1191).
  console.log(`Resolving RxCUIs for ${drugNames.size} drug names via RxNorm...`);
  const rxcui = await buildRxcuiMap(Array.from(drugNames));
  for (const row of interactions) {
    row.rxcuiA = rxcui.get(row.drugAName) ?? null;
    row.rxcuiB = rxcui.get(row.drugBName) ?? null;
  }
  const resolved = Array.from(rxcui.values()).filter(Boolean).length;
  console.log(`  resolved ${resolved}/${drugNames.size} names to an RxCUI.`);

  // Idempotent: clear existing rows so re-running doesn't duplicate.
  console.log("Clearing existing Interaction and Drug rows...");
  await prisma.interaction.deleteMany();
  await prisma.drug.deleteMany();

  console.log("Inserting interactions...");
  for (let i = 0; i < interactions.length; i += BATCH) {
    await prisma.interaction.createMany({ data: interactions.slice(i, i + BATCH) });
    console.log(`  inserted ${Math.min(i + BATCH, interactions.length)}/${interactions.length}`);
  }

  console.log("Inserting distinct drugs...");
  const drugData = Array.from(drugNames).map((name) => ({
    name,
    rxcui: rxcui.get(name) ?? null,
  }));
  for (let i = 0; i < drugData.length; i += BATCH) {
    await prisma.drug.createMany({
      data: drugData.slice(i, i + BATCH),
      skipDuplicates: true,
    });
  }

  const interactionCount = await prisma.interaction.count();
  const curatedCount = await prisma.interaction.count({
    where: { source: "Curated" },
  });
  const drugCount = await prisma.drug.count();
  console.log(`\n✅ Interaction rows: ${interactionCount} (of which curated: ${curatedCount})`);
  console.log(`✅ Drug rows: ${drugCount}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
