import { describe, expect, it } from "vitest";
import { createHistoryEntry, pushHistoryEntry, replaceHistoryEntry } from "./history";
import type { TextDocument } from "./types";

function makeDocument(url: string, title = "Page"): TextDocument {
  return {
    url,
    title,
    statusCode: 200,
    blocks: [],
    links: [],
    forms: [],
    outline: [],
    metadata: {
      contentType: "text/html",
      loadTimeMs: 12,
      redirected: false,
      redirectChain: [],
    },
    pageNotice: null,
  };
}

describe("history helpers", () => {
  it("pushes a new entry and truncates forward history", () => {
    const entries = [
      createHistoryEntry(makeDocument("https://example.com")),
      createHistoryEntry(makeDocument("https://example.com/docs")),
    ];

    const next = pushHistoryEntry(entries, 0, makeDocument("https://example.com/blog"));

    expect(next.currentIndex).toBe(1);
    expect(next.entries).toHaveLength(2);
    expect(next.entries[1].document.url).toBe("https://example.com/blog");
  });

  it("replaces the current entry", () => {
    const entries = [createHistoryEntry(makeDocument("https://example.com"))];
    const next = replaceHistoryEntry(entries, 0, createHistoryEntry(makeDocument("https://example.com/new"), 24));

    expect(next[0].document.url).toBe("https://example.com/new");
    expect(next[0].scrollTop).toBe(24);
  });
});
