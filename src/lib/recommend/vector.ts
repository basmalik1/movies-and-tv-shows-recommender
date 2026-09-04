/** Sparse feature vector keyed by TMDB id. */
export type SparseVector = Record<number, number>;

export function addTo(vector: SparseVector, id: number, amount: number): void {
  vector[id] = (vector[id] ?? 0) + amount;
}

export function magnitude(vector: SparseVector): number {
  let sum = 0;
  for (const value of Object.values(vector)) sum += value * value;
  return Math.sqrt(sum);
}

export function l2Normalize(vector: SparseVector): SparseVector {
  const norm = magnitude(vector);
  if (norm === 0) return {};
  const out: SparseVector = {};
  for (const [id, value] of Object.entries(vector)) out[Number(id)] = value / norm;
  return out;
}

/**
 * Cosine similarity where the candidate side is a plain set of ids (a title
 * either has a keyword or it does not), so the candidate vector is implicitly
 * binary with magnitude sqrt(|ids|).
 */
export function cosineWithSet(profile: SparseVector, ids: number[]): number {
  if (ids.length === 0) return 0;
  const profileNorm = magnitude(profile);
  if (profileNorm === 0) return 0;

  let dot = 0;
  for (const id of ids) dot += profile[id] ?? 0;

  return dot / (profileNorm * Math.sqrt(ids.length));
}

/** Per-feature contributions to a cosine score, strongest first. */
export function contributions(
  profile: SparseVector,
  ids: number[],
): { id: number; value: number }[] {
  return ids
    .map((id) => ({ id, value: profile[id] ?? 0 }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function topEntries(vector: SparseVector, count: number): { id: number; value: number }[] {
  return Object.entries(vector)
    .map(([id, value]) => ({ id: Number(id), value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, count);
}

/**
 * Smoothed inverse document frequency over a set of feature lists.
 *
 * Without this, breadth beats precision: "Drama" sits on almost every candidate
 * and "workplace" on a great many, so they dominate a cosine that treats every
 * feature as equally informative. IDF pushes weight toward the features that
 * actually separate one candidate from another.
 */
export function buildIdf(documents: number[][]): SparseVector {
  const total = documents.length;
  if (total === 0) return {};

  const frequency = new Map<number, number>();
  for (const document of documents) {
    for (const id of new Set(document)) {
      frequency.set(id, (frequency.get(id) ?? 0) + 1);
    }
  }

  const idf: SparseVector = {};
  for (const [id, count] of frequency) {
    idf[id] = Math.log((total + 1) / (count + 0.5));
  }
  return idf;
}

/** Scale a profile vector by IDF, so common features stop drowning out rare ones. */
export function applyIdf(profile: SparseVector, idf: SparseVector, fallback = 1): SparseVector {
  const out: SparseVector = {};
  for (const [key, value] of Object.entries(profile)) {
    const id = Number(key);
    out[id] = value * (idf[id] ?? fallback);
  }
  return out;
}
