// Shared drug-name display helper.
//
// When the term the user actually entered differs from the canonical name that
// RxNorm resolved it to, show BOTH as "Entered (canonical)" — e.g.
// "Paracetamol (acetaminophen)". When they're effectively the same, show just
// the single name. This is the single source of truth used everywhere a drug
// name is rendered (result cards, the Recognized line, the schedule, the PDF)
// and when building the whole-regimen LLM prompt.

export function titleCase(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

// `entered` is the raw term the user typed; `canonical` is the normalized
// standard name (stored lowercase). The canonical is shown lowercase inside the
// parentheses so it reads as an annotation, not a second title.
export function displayName(
  entered: string | null | undefined,
  canonical: string
): string {
  const enteredTrimmed = entered?.trim() ?? "";
  if (!enteredTrimmed) return titleCase(canonical);
  if (enteredTrimmed.toLowerCase() === canonical.trim().toLowerCase()) {
    return titleCase(enteredTrimmed);
  }
  return `${titleCase(enteredTrimmed)} (${canonical})`;
}
