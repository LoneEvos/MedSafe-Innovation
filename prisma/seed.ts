import { PrismaClient, Severity } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// Seeds the Interaction table from the DDInter 2.0 download CSVs.
// All ddinter_downloads_code_*.csv files in /prisma/data share the same columns:
//   DDInterID_A, Drug_A, DDInterID_B, Drug_B, Level
// We concatenate every file, lowercase drug names for matching, map Level to the
// Severity enum, and deduplicate identical (unordered) drug pairs across files.

const prisma = new PrismaClient();
const DATA_DIR = join(__dirname, "data");
const BATCH = 5000;

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

type CsvRow = {
  Drug_A?: string;
  Drug_B?: string;
  Level?: string;
};

async function main() {
  const files = readdirSync(DATA_DIR)
    .filter((f) => /^ddinter_downloads_code_.*\.csv$/i.test(f))
    .sort();

  if (files.length === 0) {
    throw new Error(`No ddinter_downloads_code_*.csv files found in ${DATA_DIR}`);
  }
  console.log(`Found ${files.length} CSV file(s): ${files.join(", ")}`);

  const seenPairs = new Set<string>();
  const interactions: {
    drugAName: string;
    drugBName: string;
    severity: Severity;
  }[] = [];
  const drugNames = new Set<string>();
  let totalRows = 0;
  let skipped = 0;

  for (const file of files) {
    const content = readFileSync(join(DATA_DIR, file), "utf8");
    const rows = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as CsvRow[];

    for (const row of rows) {
      totalRows++;
      const a = (row.Drug_A ?? "").trim().toLowerCase();
      const b = (row.Drug_B ?? "").trim().toLowerCase();
      const severity = toSeverity(row.Level ?? "");

      // Skip incomplete rows or a drug interacting with itself.
      if (!a || !b || !severity || a === b) {
        skipped++;
        continue;
      }

      // Deduplicate on the unordered pair so A-B and B-A count once.
      const key = [a, b].sort().join("|");
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);

      interactions.push({ drugAName: a, drugBName: b, severity });
      drugNames.add(a);
      drugNames.add(b);
    }
    console.log(`  ${file}: read, running total unique pairs = ${interactions.length}`);
  }

  console.log(
    `\nParsed ${totalRows} rows -> ${interactions.length} unique interactions (skipped ${skipped}).`
  );

  // Idempotent: clear existing rows so re-running the seed doesn't duplicate.
  console.log("Clearing existing Interaction and Drug rows...");
  await prisma.interaction.deleteMany();
  await prisma.drug.deleteMany();

  console.log("Inserting interactions...");
  for (let i = 0; i < interactions.length; i += BATCH) {
    const chunk = interactions.slice(i, i + BATCH);
    await prisma.interaction.createMany({ data: chunk });
    console.log(`  inserted ${Math.min(i + BATCH, interactions.length)}/${interactions.length}`);
  }

  // Populate the Drug table with the unique names (rxcui filled in later pieces).
  console.log("Inserting distinct drugs...");
  const drugData = Array.from(drugNames).map((name) => ({ name }));
  for (let i = 0; i < drugData.length; i += BATCH) {
    await prisma.drug.createMany({
      data: drugData.slice(i, i + BATCH),
      skipDuplicates: true,
    });
  }

  const interactionCount = await prisma.interaction.count();
  const drugCount = await prisma.drug.count();
  console.log(`\n✅ Interaction rows inserted: ${interactionCount}`);
  console.log(`✅ Drug rows inserted: ${drugCount}`);
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
