import { describe, expect, it } from "vitest";

import { isSignalKeyword, normalizeKeywordName } from "./keywords";

describe("isSignalKeyword", () => {
  it("keeps genuine thematic tags", () => {
    for (const keyword of [
      "dystopia",
      "corporate greed",
      "artificial intelligence (a.i.)",
      "workplace",
      "memory",
      "bounty hunter",
      "grief",
    ]) {
      expect(isSignalKeyword(keyword), keyword).toBe(true);
    }
  });

  it("drops production and format trivia", () => {
    for (const keyword of [
      "sequel",
      "prequel",
      "remake",
      "duringcreditsstinger",
      "woman director",
      "live action",
      "imax",
      "miniseries",
    ]) {
      expect(isSignalKeyword(keyword), keyword).toBe(false);
    }
  });

  it("drops source-material notes by prefix", () => {
    expect(isSignalKeyword("based on novel or book")).toBe(false);
    expect(isSignalKeyword("based on some obscure webcomic")).toBe(false);
    expect(isSignalKeyword("adapted from a stage play")).toBe(false);
  });

  it("drops place names that describe setting rather than taste", () => {
    for (const keyword of ["los angeles", "new york city", "tokyo", "usa"]) {
      expect(isSignalKeyword(keyword), keyword).toBe(false);
    }
  });

  it("drops bare years and decades", () => {
    expect(isSignalKeyword("1970s")).toBe(false);
    expect(isSignalKeyword("2020")).toBe(false);
    // A year embedded in a real phrase is still meaningful.
    expect(isSignalKeyword("summer of 1984")).toBe(true);
  });

  it("is case and whitespace insensitive, and rejects blanks", () => {
    expect(isSignalKeyword("  Los Angeles  ")).toBe(false);
    expect(isSignalKeyword("SEQUEL")).toBe(false);
    expect(isSignalKeyword("   ")).toBe(false);
  });
});

describe("isSignalKeyword — combined location tags", () => {
  it("drops TMDB's 'city, region' strings, which is how it really stores places", () => {
    for (const keyword of [
      "los angeles, california",
      "chicago, illinois",
      "brooklyn, new york",
      "austin, texas",
      "paris, france",
      "tokyo, japan",
      "glasgow, scotland",
    ]) {
      expect(isSignalKeyword(keyword), keyword).toBe(false);
    }
  });

  it("keeps thematic tags that merely happen to contain a comma", () => {
    expect(isSignalKeyword("sex, drugs and rock and roll")).toBe(true);
    expect(isSignalKeyword("man, woman, relationship")).toBe(true);
  });
});

describe("normalizeKeywordName", () => {
  it("strips the stray whitespace TMDB leaves on some tags", () => {
    expect(normalizeKeywordName("family business ")).toBe("family business");
    expect(normalizeKeywordName("  office   politics  ")).toBe("office politics");
  });
});
