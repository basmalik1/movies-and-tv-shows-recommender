/**
 * TMDB keywords mix genuine thematic tags ("dystopia", "corporate greed") with
 * bookkeeping that says nothing about taste: production trivia, source-material
 * notes, and place names. Feeding the latter into the recommender produces
 * matches like "shares themes you gravitate to: los angeles, california".
 *
 * Everything filtered here is dropped before a title's features are stored.
 */

/** Production and release metadata — describes how a title was made, not what it is about. */
const PRODUCTION_NOISE = new Set([
  "sequel",
  "prequel",
  "remake",
  "reboot",
  "spin off",
  "spinoff",
  "crossover",
  "shared universe",
  "live action",
  "live action remake",
  "duringcreditsstinger",
  "aftercreditsstinger",
  "post credits scene",
  "3d",
  "imax",
  "woman director",
  "female protagonist",
  "male protagonist",
  "ensemble cast",
  "no dialogue",
  "silent film",
  "black and white",
  "short film",
  "independent film",
  "cult film",
  "b movie",
  "made for tv",
  "miniseries",
  "limited series",
  "tv special",
  "pilot",
  "reality tv",
]);

/** Whole-string place tags with no comma. */
const PLACE_NOISE = new Set([
  "usa",
  "u.s.a.",
  "america",
  "united states",
  "new york city",
  "new york",
  "los angeles",
  "chicago",
  "san francisco",
  "london",
  "paris",
  "tokyo",
  "berlin",
  "rome",
  "moscow",
  "hong kong",
  "seoul",
]);

/**
 * TMDB writes locations as a single "city, region" string — "los angeles,
 * california", "chicago, illinois", "paris, france". Rather than enumerate
 * every city on earth, treat a comma-tagged keyword as a place whenever its
 * final segment is a known state or country.
 */
const PLACE_TAILS = new Set([
  // US states and territories
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
  "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
  "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
  "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
  "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
  "new mexico", "new york", "north carolina", "north dakota", "ohio",
  "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina",
  "south dakota", "tennessee", "texas", "utah", "vermont", "virginia",
  "washington", "west virginia", "wisconsin", "wyoming", "washington d.c.",
  "d.c.",
  // Countries and nations commonly used as tags
  "usa", "u.s.a.", "united states", "canada", "mexico", "brazil", "argentina",
  "england", "scotland", "wales", "ireland", "united kingdom", "uk", "france",
  "germany", "italy", "spain", "portugal", "netherlands", "belgium", "sweden",
  "norway", "denmark", "finland", "poland", "russia", "ukraine", "greece",
  "turkey", "israel", "egypt", "south africa", "nigeria", "kenya", "india",
  "china", "japan", "south korea", "korea", "thailand", "vietnam",
  "indonesia", "philippines", "australia", "new zealand",
]);

/** Prefixes that reliably mark a non-thematic tag regardless of the rest of the string. */
const NOISE_PREFIXES = ["based on", "adapted from", "remake of", "sequel to", "part of"];

/** Collapse the whitespace TMDB sometimes leaves on its tags ("family business "). */
export function normalizeKeywordName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/**
 * True when a keyword is worth learning from.
 *
 * Exported so the filter can be tested directly and extended by contributors
 * who notice a tag polluting their own recommendations.
 */
export function isSignalKeyword(name: string): boolean {
  const normalized = normalizeKeywordName(name).toLowerCase();
  if (normalized.length === 0) return false;
  if (PRODUCTION_NOISE.has(normalized)) return false;
  if (PLACE_NOISE.has(normalized)) return false;
  if (NOISE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return false;

  // Bare years and decades ("1970s", "2020") describe setting, not theme.
  if (/^\d{4}s?$/.test(normalized)) return false;

  if (normalized.includes(",")) {
    const segments = normalized.split(",").map((segment) => segment.trim());
    const tail = segments[segments.length - 1];
    if (PLACE_TAILS.has(tail)) return false;
    if (segments.every((segment) => PLACE_NOISE.has(segment) || PLACE_TAILS.has(segment))) {
      return false;
    }
  }

  return true;
}
