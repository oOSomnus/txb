import { describe, expect, it } from "vitest";
import { extractHash, isSameDocumentNavigation, normalizeLocationInput } from "./url";

describe("normalizeLocationInput", () => {
  it("keeps absolute URLs", () => {
    expect(normalizeLocationInput("https://example.com/docs")).toBe("https://example.com/docs");
  });

  it("treats plain queries as DuckDuckGo searches", () => {
    expect(normalizeLocationInput("w3m mouse browser")).toBe(
      "https://duckduckgo.com/html/?q=w3m%20mouse%20browser",
    );
  });

  it("adds https to host-like input", () => {
    expect(normalizeLocationInput("example.com")).toBe("https://example.com");
  });
});

describe("hash helpers", () => {
  it("detects same-document hash navigation", () => {
    expect(
      isSameDocumentNavigation("https://example.com/docs?page=1", "https://example.com/docs?page=1#intro"),
    ).toBe(true);
  });

  it("extracts hashes", () => {
    expect(extractHash("https://example.com/docs#intro")).toBe("intro");
  });
});
