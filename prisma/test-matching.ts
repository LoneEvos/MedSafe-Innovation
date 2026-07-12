// Runnable check for RxCUI-based interaction matching.
//   npm run test:matching
// Exercises the real path (RxNorm + DB), so the local DB must be seeded.
import assert from "node:assert";
import { checkInteractions } from "../lib/interactions";

async function main() {
  const { interactions } = await checkInteractions([
    "warfarin",
    "aspirin",
    "ibuprofen",
  ]);

  const has = (a: string, b: string) =>
    interactions.some(
      (i) =>
        (i.drugAName === a && i.drugBName === b) ||
        (i.drugAName === b && i.drugBName === a)
    );

  // "aspirin" is stored under its DDInter name "acetylsalicylic acid" — the
  // whole point of RxCUI matching is that the aspirin input still finds these.
  assert(has("warfarin", "ibuprofen"), "missing warfarin + ibuprofen");
  assert(has("warfarin", "acetylsalicylic acid"), "missing warfarin + aspirin");
  assert(has("acetylsalicylic acid", "ibuprofen"), "missing aspirin + ibuprofen");

  console.log(`✅ all 3 pairs found (${interactions.length} total):`);
  for (const i of interactions) {
    console.log(`   ${i.severity}  ${i.drugAName} + ${i.drugBName}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
