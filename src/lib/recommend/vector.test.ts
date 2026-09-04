import { describe, expect, it } from "vitest";

import { applyIdf, buildIdf, cosineWithSet, l2Normalize } from "./vector";

describe("buildIdf", () => {
  it("scores a feature on every document lower than one on a few", () => {
    const idf = buildIdf([
      [1, 2],
      [1, 3],
      [1, 4],
      [1, 2],
    ]);

    // 1 is everywhere, 3 and 4 appear once each.
    expect(idf[1]).toBeLessThan(idf[2]);
    expect(idf[2]).toBeLessThan(idf[3]);
  });

  it("never returns a negative weight, even for a feature in every document", () => {
    const idf = buildIdf([[1], [1], [1]]);
    expect(idf[1]).toBeGreaterThan(0);
  });

  it("returns an empty table for no documents", () => {
    expect(buildIdf([])).toEqual({});
  });

  it("counts each document once, however many times a feature repeats in it", () => {
    const repeated = buildIdf([[1, 1, 1], [2]]);
    const single = buildIdf([[1], [2]]);
    expect(repeated[1]).toBeCloseTo(single[1], 10);
  });
});

describe("applyIdf", () => {
  it("rescales a profile so rare features dominate the cosine", () => {
    // Equal raw affinity for a ubiquitous feature (1) and a rare one (2).
    const profile = l2Normalize({ 1: 1, 2: 1 });
    const idf = buildIdf([[1], [1], [1], [1], [1, 2]]);
    const weighted = applyIdf(profile, idf);

    const matchesCommon = cosineWithSet(weighted, [1]);
    const matchesRare = cosineWithSet(weighted, [2]);

    expect(cosineWithSet(profile, [1])).toBeCloseTo(cosineWithSet(profile, [2]), 10);
    expect(matchesRare).toBeGreaterThan(matchesCommon);
  });

  it("leaves a profile untouched when the table is empty", () => {
    const profile = { 1: 0.5, 2: 0.5 };
    expect(applyIdf(profile, {})).toEqual(profile);
  });
});
