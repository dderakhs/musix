/**
 * Search matching.
 *
 * Two different keys, because music names break naive matching in two ways:
 * spacing is unreliable ("juicewrld" vs "Juice WRLD", "Tyler, The Creator")
 * and punctuation is decorative ("A$AP", "P!nk", "Ke$ha"). The compact key
 * throws away everything but letters and digits so those all collapse together;
 * the token key keeps word boundaries so prefix matches still mean something.
 */

/**
 * Symbols people type as letters. Stage names lean on these heavily — A$AP,
 * Ke$ha, P!nk — and someone searching types the letter, so folding them is the
 * difference between finding the artist and finding nothing at all.
 */
const SYMBOL_FOLD: Record<string, string> = {
  $: 's', '\u00a7': 's', '!': 'i', '\u00a1': 'i', '@': 'a', '&': 'and',
  '+': 't', '\u20ac': 'e', '\u00a3': 'l', '\u00a5': 'y', '\u00d7': 'x',
};

function foldSymbols(value: string): string {
  return value.replace(
    /[$\u00a7!\u00a1@&+\u20ac\u00a3\u00a5\u00d7]/g,
    (ch) => SYMBOL_FOLD[ch] ?? ch,
  );
}

/** Lowercase, de-accented, symbol-folded, letters and digits only — no spaces. */
export function compactKey(value: string): string {
  return foldSymbols(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Lowercase words, punctuation dropped, order preserved. */
export function tokens(value: string): string[] {
  return foldSymbols(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * How well `candidate` answers `query`, 0 (no match) to 1000 (exact).
 *
 * The ladder is deliberate: an exact name always beats a longer name that merely
 * contains it, so "juice" ranks Juice WRLD above "Juice Newton feat. …", and a
 * prefix beats a match buried in the middle. Ties are broken by the caller on
 * popularity, which is what makes the well-known artist surface first.
 */
export function matchScore(candidate: string, query: string): number {
  const c = compactKey(candidate);
  const q = compactKey(query);
  if (!c || !q) return 0;

  if (c === q) return 1000;
  if (c.startsWith(q)) return 850 - Math.min(100, c.length - q.length);

  const candidateTokens = tokens(candidate);
  const queryTokens = tokens(query);

  // Every query word begins one of the candidate's words, in order-free fashion:
  // "juice wrld" against "Juice WRLD", "post malone" against "Post Malone".
  const allTokensPrefix = queryTokens.every((qt) =>
    candidateTokens.some((ct) => ct.startsWith(qt)),
  );
  if (allTokensPrefix) return 700 - Math.min(100, candidateTokens.length * 5);

  if (c.includes(q)) return 500 - Math.min(100, c.length - q.length);

  // Partial word overlap, the weakest signal worth keeping.
  const overlap = queryTokens.filter((qt) =>
    candidateTokens.some((ct) => ct.includes(qt)),
  ).length;
  if (overlap > 0) return Math.round((overlap / queryTokens.length) * 300);

  return 0;
}

/** Popularity as a small tiebreaker that can never outrank a better name match. */
export function rankValue(matchPoints: number, popularity: number): number {
  return matchPoints * 1000 + Math.min(999, Math.round(Math.log10(Math.max(1, popularity)) * 100));
}
