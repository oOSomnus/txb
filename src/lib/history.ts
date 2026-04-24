import type { HistoryEntry, TextDocument } from "./types";

export function createHistoryEntry(document: TextDocument, scrollTop = 0): HistoryEntry {
  return { document, scrollTop };
}

export function pushHistoryEntry(
  entries: HistoryEntry[],
  currentIndex: number,
  nextDocument: TextDocument,
): { entries: HistoryEntry[]; currentIndex: number } {
  const nextEntries = entries.slice(0, currentIndex + 1);
  nextEntries.push(createHistoryEntry(nextDocument));
  return { entries: nextEntries, currentIndex: nextEntries.length - 1 };
}

export function replaceHistoryEntry(
  entries: HistoryEntry[],
  currentIndex: number,
  nextEntry: HistoryEntry,
): HistoryEntry[] {
  return entries.map((entry, index) => (index === currentIndex ? nextEntry : entry));
}
