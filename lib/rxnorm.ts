// RxNorm drug-name normalization via the RxNav REST API.
//
// normalizeDrugName(input):
//   1. findRxcuiByString  (normalized string search)  -> rxcui
//   2. getApproximateMatch (fuzzy fallback)            -> rxcui
//   3. resolve that rxcui to its generic ingredient so brand names map to the
//      generic (e.g. "Tylenol" -> "acetaminophen").
// Returns { rxcui, standardName } or null. Results are cached in memory.
//
// Docs: https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html

export type NormalizedDrug = { rxcui: string; standardName: string };

const BASE = "https://rxnav.nlm.nih.gov/REST";
const TIMEOUT_MS = 8000;

// Term types that are already a base generic ingredient — nothing to resolve.
// IN = ingredient, MIN = multiple ingredients.
// NOTE: PIN (precise ingredient, e.g. "ranitidine hydrochloride") is deliberately
// excluded so salt forms get resolved down to their base IN ("ranitidine"),
// which is how DDInter names drugs.
const INGREDIENT_TTYS = new Set(["IN", "MIN"]);

// Cache keyed by the lowercased/trimmed input. Stores null misses too so we
// don't hammer the API for names we already know aren't found.
const cache = new Map<string, NormalizedDrug | null>();

async function rxnavGet(path: string): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // Network error, timeout, or bad JSON — treat as "no data".
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Exact/normalized string match. search=1 normalizes case and spacing.
async function findRxcuiByString(name: string): Promise<string | null> {
  const data = await rxnavGet(
    `/rxcui.json?name=${encodeURIComponent(name)}&search=1`
  );
  const id = data?.idGroup?.rxnormId?.[0];
  return typeof id === "string" ? id : null;
}

// Fuzzy fallback for typos / partial names.
async function getApproximateMatch(name: string): Promise<string | null> {
  const data = await rxnavGet(
    `/approximateTerm.json?term=${encodeURIComponent(name)}&maxEntries=1`
  );
  const rxcui = data?.approximateGroup?.candidate?.[0]?.rxcui;
  return typeof rxcui === "string" ? rxcui : null;
}

async function getProperties(
  rxcui: string
): Promise<{ name: string; tty: string } | null> {
  const data = await rxnavGet(`/rxcui/${rxcui}/properties.json`);
  const p = data?.properties;
  if (!p?.name) return null;
  return { name: p.name, tty: p.tty ?? "" };
}

// Map a brand/product rxcui to its generic ingredient concept.
async function getIngredient(
  rxcui: string
): Promise<NormalizedDrug | null> {
  // The literal "+" separates term types in RxNav — do not URL-encode it.
  const data = await rxnavGet(`/rxcui/${rxcui}/related.json?tty=IN+MIN`);
  const groups = data?.relatedGroup?.conceptGroup;
  if (!Array.isArray(groups)) return null;

  // Prefer a single ingredient (IN), then a multi-ingredient concept (MIN).
  for (const tty of ["IN", "MIN"]) {
    const group = groups.find(
      (g: any) =>
        g.tty === tty &&
        Array.isArray(g.conceptProperties) &&
        g.conceptProperties.length > 0
    );
    if (group) {
      const c = group.conceptProperties[0];
      if (c?.rxcui && c?.name) {
        return { rxcui: c.rxcui, standardName: c.name };
      }
    }
  }
  return null;
}

export async function normalizeDrugName(
  input: string
): Promise<NormalizedDrug | null> {
  const key = input.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;

  // Step 1 + 2: resolve to some rxcui.
  let rxcui = await findRxcuiByString(key);
  if (!rxcui) rxcui = await getApproximateMatch(key);
  if (!rxcui) {
    cache.set(key, null);
    return null;
  }

  // Step 3: normalize to the generic ingredient where possible.
  const props = await getProperties(rxcui);

  let result: NormalizedDrug;
  if (props && INGREDIENT_TTYS.has(props.tty)) {
    result = { rxcui, standardName: props.name };
  } else {
    const ingredient = await getIngredient(rxcui);
    result =
      ingredient ?? { rxcui, standardName: props?.name ?? key };
  }

  cache.set(key, result);
  return result;
}
