import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DocumentRenderer } from "./components/DocumentRenderer";
import { FindBar } from "./components/FindBar";
import { OutlinePanel } from "./components/OutlinePanel";
import { createHistoryEntry, pushHistoryEntry, replaceHistoryEntry } from "./lib/history";
import { countMatchesInDocument } from "./lib/search";
import type { HistoryEntry, SubmitFormRequest, TextDocument } from "./lib/types";
import { extractHash, isSameDocumentNavigation, normalizeLocationInput } from "./lib/url";

function createWelcomeDocument(): TextDocument {
  return {
    url: "txb://start",
    title: "txb",
    statusCode: 200,
    blocks: [
      {
        kind: "heading",
        id: "welcome-heading",
        level: 1,
        anchor: "welcome",
        inlines: [{ kind: "text", text: "txb" }],
      },
      {
        kind: "paragraph",
        id: "welcome-paragraph",
        inlines: [
          {
            kind: "text",
            text: "Plain-text browser. Enter a URL or a search query in the location bar.",
          },
        ],
      },
      {
        kind: "notice",
        id: "welcome-notice",
        tone: "info",
        message: "JavaScript is disabled. Traditional HTML pages and forms work best.",
      },
      {
        kind: "list",
        id: "welcome-list",
        ordered: false,
        items: [
          {
            blocks: [
              {
                kind: "paragraph",
                id: "welcome-item-1",
                inlines: [{ kind: "text", text: "Use the location bar to open URLs or search with DuckDuckGo." }],
              },
            ],
          },
          {
            blocks: [
              {
                kind: "paragraph",
                id: "welcome-item-2",
                inlines: [{ kind: "text", text: "Click numbered links in the document view." }],
              },
            ],
          },
          {
            blocks: [
              {
                kind: "paragraph",
                id: "welcome-item-3",
                inlines: [{ kind: "text", text: "Use Find to jump between matches on the current page." }],
              },
            ],
          },
        ],
      },
    ],
    links: [],
    forms: [],
    outline: [{ id: "welcome-outline", level: 1, title: "txb", anchor: "welcome" }],
    metadata: {
      contentType: "application/x-txb-start",
      loadTimeMs: 0,
      redirected: false,
      redirectChain: [],
    },
    pageNotice: null,
  };
}

export default function App() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestSequence = useRef(0);
  const cancelledThrough = useRef(0);
  const [history, setHistory] = useState<HistoryEntry[]>(() => [createHistoryEntry(createWelcomeDocument())]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [addressValue, setAddressValue] = useState("https://example.com");
  const [findVisible, setFindVisible] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const [hoverUrl, setHoverUrl] = useState<string | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentEntry = history[currentIndex];
  const currentDocument = currentEntry.document;
  const matchCount = useMemo(
    () => countMatchesInDocument(currentDocument.blocks, findQuery),
    [currentDocument.blocks, findQuery],
  );

  useEffect(() => {
    setAddressValue(currentDocument.url.startsWith("txb://") ? "" : currentDocument.url);
    const targetScroll = currentEntry.scrollTop;
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: targetScroll, behavior: "auto" });
      }
    });
  }, [currentDocument.url, currentEntry.scrollTop]);

  useEffect(() => {
    if (matchCount === 0) {
      setActiveMatch(0);
    } else if (activeMatch >= matchCount) {
      setActiveMatch(matchCount - 1);
    }
  }, [activeMatch, matchCount]);

  function snapshotScroll() {
    const nextScrollTop = scrollRef.current?.scrollTop ?? 0;
    setHistory((entries) => replaceHistoryEntry(entries, currentIndex, { ...entries[currentIndex], scrollTop: nextScrollTop }));
  }

  function applyDocument(document: TextDocument, mode: "push" | "replace") {
    setHistory((entries) => {
      if (mode === "replace") {
        return replaceHistoryEntry(entries, currentIndex, createHistoryEntry(document));
      }
      return pushHistoryEntry(entries, currentIndex, document).entries;
    });
    setCurrentIndex((index) => (mode === "replace" ? index : index + 1));
    setError(null);
    setPendingAnchor(extractHash(document.url));
  }

  async function fetchDocument(input: string, mode: "push" | "replace") {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const document = await invoke<TextDocument>("open_location", {
        input,
      });

      if (requestId <= cancelledThrough.current) {
        return;
      }
      applyDocument(document, mode);
    } catch (fetchError) {
      if (requestId <= cancelledThrough.current) {
        return;
      }
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      if (requestId > cancelledThrough.current) {
        setLoading(false);
      }
    }
  }

  async function navigateTo(target: string, mode: "push" | "replace" = "push") {
    if (!target) {
      return;
    }

    if (
      !currentDocument.url.startsWith("txb://") &&
      isSameDocumentNavigation(currentDocument.url, target)
    ) {
      snapshotScroll();
      setPendingAnchor(extractHash(target));
      setHistory((entries) =>
        replaceHistoryEntry(entries, currentIndex, {
          ...entries[currentIndex],
          document: { ...entries[currentIndex].document, url: target },
        }),
      );
      return;
    }

    snapshotScroll();
    await fetchDocument(target, mode);
  }

  async function handleAddressSubmit(event: FormEvent) {
    event.preventDefault();
    const nextTarget = normalizeLocationInput(addressValue);
    await navigateTo(nextTarget);
  }

  async function handleFormSubmit(request: SubmitFormRequest) {
    snapshotScroll();
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const document = await invoke<TextDocument>("submit_form", { request });
      if (requestId <= cancelledThrough.current) {
        return;
      }
      applyDocument(document, "push");
    } catch (submissionError) {
      if (requestId <= cancelledThrough.current) {
        return;
      }
      setError(submissionError instanceof Error ? submissionError.message : String(submissionError));
    } finally {
      if (requestId > cancelledThrough.current) {
        setLoading(false);
      }
    }
  }

  function handleStop() {
    cancelledThrough.current = requestSequence.current;
    setLoading(false);
  }

  function goToHistory(index: number) {
    if (index < 0 || index >= history.length || index === currentIndex) {
      return;
    }
    snapshotScroll();
    setCurrentIndex(index);
    setError(null);
    setPendingAnchor(extractHash(history[index].document.url));
  }

  return (
    <div className="app-shell">
      <header className="app-chrome">
        <div className="app-chrome__nav">
          <button
            type="button"
            className="chrome-button"
            onClick={() => goToHistory(currentIndex - 1)}
            disabled={currentIndex === 0}
          >
            Back
          </button>
          <button
            type="button"
            className="chrome-button"
            onClick={() => goToHistory(currentIndex + 1)}
            disabled={currentIndex >= history.length - 1}
          >
            Forward
          </button>
          <button
            type="button"
            className="chrome-button"
            onClick={() => void navigateTo(currentDocument.url, "replace")}
            disabled={loading || currentDocument.url.startsWith("txb://")}
          >
            Reload
          </button>
          <button type="button" className="chrome-button chrome-button--ghost" onClick={handleStop} disabled={!loading}>
            Stop
          </button>
        </div>
        <form className="app-chrome__address" onSubmit={(event) => void handleAddressSubmit(event)}>
          <label className="sr-only" htmlFor="address-bar">
            Address
          </label>
          <input
            id="address-bar"
            className="address-input"
            type="text"
            value={addressValue}
            placeholder="Enter a URL or search query"
            onChange={(event) => setAddressValue(event.target.value)}
          />
          <button type="submit" className="chrome-button chrome-button--accent">
            Open
          </button>
        </form>
        <div className="app-chrome__title">
          <span className="app-chrome__title-text">{currentDocument.title}</span>
          <span className="app-chrome__status">
            {loading ? "Loading..." : `${currentDocument.statusCode} ${currentDocument.metadata.contentType}`}
          </span>
        </div>
      </header>

      <div className="workspace">
        <OutlinePanel outline={currentDocument.outline} onSelect={(anchor) => setPendingAnchor(anchor)} />

        <main className="reader-stage">
          <div className="reader-toolbar">
            <button
              type="button"
              className="chrome-button chrome-button--ghost"
              onClick={() => setFindVisible((visible) => !visible)}
            >
              {findVisible ? "Hide Find" : "Find"}
            </button>
            <span className="reader-toolbar__meta">
              {currentDocument.metadata.loadTimeMs} ms
              {currentDocument.metadata.redirected ? " · redirected" : ""}
            </span>
            <span className="reader-toolbar__meta">{currentDocument.links.length} links</span>
          </div>

          {findVisible ? (
            <FindBar
              query={findQuery}
              matchCount={matchCount}
              activeMatch={matchCount === 0 ? 0 : activeMatch}
              onQueryChange={(value) => {
                setFindQuery(value);
                setActiveMatch(0);
              }}
              onPrevious={() => setActiveMatch((current) => (matchCount === 0 ? 0 : (current - 1 + matchCount) % matchCount))}
              onNext={() => setActiveMatch((current) => (matchCount === 0 ? 0 : (current + 1) % matchCount))}
              onClose={() => {
                setFindVisible(false);
                setFindQuery("");
              }}
            />
          ) : null}

          {error ? <div className="error-banner">{error}</div> : null}

          <section className="reader-surface-wrap">
            <div ref={scrollRef} className="reader-surface">
              <DocumentRenderer
                document={currentDocument}
                query={findQuery}
                activeMatch={matchCount === 0 ? -1 : activeMatch}
                anchorToReveal={pendingAnchor}
                scrollRoot={scrollRef.current}
                onAnchorHandled={() => setPendingAnchor(null)}
                onLinkNavigate={(url) => void navigateTo(url)}
                onHoverUrl={setHoverUrl}
                onSubmitForm={handleFormSubmit}
              />
            </div>
          </section>

          <footer className="status-bar">
            <span className="status-bar__item">{hoverUrl ?? currentDocument.url}</span>
            <span className="status-bar__item">
              {currentDocument.metadata.redirectChain.length > 0
                ? currentDocument.metadata.redirectChain.join(" -> ")
                : "Direct response"}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
