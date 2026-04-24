const ABSOLUTE_SCHEME = /^[a-z][a-z0-9+\-.]*:/i;

export function normalizeLocationInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "https://example.com";
  }

  if (ABSOLUTE_SCHEME.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.includes(" ") || (!trimmed.includes(".") && !trimmed.includes("/"))) {
    return `https://duckduckgo.com/html/?q=${encodeURIComponent(trimmed)}`;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  return `https://${trimmed}`;
}

export function extractHash(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hash ? parsed.hash.slice(1) : null;
  } catch {
    return null;
  }
}

export function isSameDocumentNavigation(currentUrl: string, nextUrl: string): boolean {
  try {
    const current = new URL(currentUrl);
    const next = new URL(nextUrl, currentUrl);
    return (
      current.origin === next.origin &&
      current.pathname === next.pathname &&
      current.search === next.search &&
      current.hash !== next.hash
    );
  } catch {
    return false;
  }
}
