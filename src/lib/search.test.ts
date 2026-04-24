import { describe, expect, it } from "vitest";
import { countMatchesInDocument } from "./search";
import type { TextDocument } from "./types";

const documentFixture: TextDocument = {
  url: "https://example.com",
  title: "Fixture",
  statusCode: 200,
  blocks: [
    {
      kind: "heading",
      id: "heading-1",
      level: 1,
      inlines: [{ kind: "text", text: "txb" }],
    },
    {
      kind: "paragraph",
      id: "paragraph-1",
      inlines: [{ kind: "text", text: "A txb build focused on plain text and forms." }],
    },
  ],
  links: [],
  forms: [],
  outline: [],
  metadata: {
    contentType: "text/html",
    loadTimeMs: 18,
    redirected: false,
    redirectChain: [],
  },
};

describe("countMatchesInDocument", () => {
  it("counts occurrences across blocks", () => {
    expect(countMatchesInDocument(documentFixture.blocks, "txb")).toBe(2);
  });

  it("returns zero for empty queries", () => {
    expect(countMatchesInDocument(documentFixture.blocks, "")).toBe(0);
  });
});
